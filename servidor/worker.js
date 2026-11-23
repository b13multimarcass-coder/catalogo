// Servidor de frete e pagamento do catálogo B13 (Cloudflare Worker, plano grátis).
//
// Faz três coisas que não podem ficar no site, porque usam chaves secretas:
//   POST /frete      cota o frete no Melhor Envio (e soma retirada / entrega na cidade)
//   POST /cupom      confere um cupom de desconto (coleção cupons, criada no painel)
//   POST /pagar      confere preços, cupom e estoque, grava o pedido e cria o link de pagamento da InfinitePay
//   POST /confirmar  o site chama quando o cliente volta do pagamento
//   POST /webhook    a InfinitePay chama quando o pagamento é aprovado
//   POST /etiqueta   o painel chama (só lojista): compra e gera a etiqueta no Melhor Envio
// Pagamento aprovado: o pedido vira "pago", o estoque baixa e a venda entra no painel.
//
// Variáveis (Cloudflare > Worker > Settings > Variables and Secrets). Passo a passo em servidor/LEIA-ME.md.
//   SITE_URL               endereço do catálogo, ex.: https://b13multimarcas.com.br/
//   FIREBASE_PROJECT_ID    id do projeto Firebase
//   FIREBASE_CLIENT_EMAIL  da chave da conta de serviço (secreto)
//   FIREBASE_PRIVATE_KEY   da chave da conta de serviço (secreto)
//   FIREBASE_API_KEY       apiKey do app Web (a mesma de assets/config.js); confere o login do painel
//   INFINITEPAY_HANDLE     InfiniteTag da loja, sem o $
//   INFINITEPAY_API_KEY    opcional (secreto); libera "parcelas sem juros"
//   MELHOR_ENVIO_TOKEN     token do Melhor Envio (secreto)
//   MELHOR_ENVIO_EMAIL     e-mail de contato exigido pelo Melhor Envio
//   MELHOR_ENVIO_URL       opcional; https://sandbox.melhorenvio.com.br para testes

const IP_API = 'https://api.checkout.infinitepay.io';

// Embalagem padrão por categoria (cm e kg). Pode ser trocada em config/loja.embalagens.
const EMBALAGENS = {
  camisa: { largura: 25, altura: 4, comprimento: 30, peso: 0.3 },
  chuteira: { largura: 20, altura: 12, comprimento: 33, peso: 1.0 },
  tenis: { largura: 22, altura: 13, comprimento: 34, peso: 1.1 }
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, servico: 'B13 frete e pagamento' }, 200, cors);
    if (req.method !== 'POST') return json({ erro: 'Método não aceito' }, 405, cors);

    // webhook: responde rápido e confere em segundo plano
    if (url.pathname === '/webhook') {
      const b = await req.json().catch(() => ({}));
      if (b.order_nsu && b.transaction_nsu && b.invoice_slug)
        ctx.waitUntil(verificar(env, b.order_nsu, b.transaction_nsu, b.invoice_slug, b.receipt_url).catch((e) => console.error('webhook', e)));
      return json({ ok: true }, 200);
    }

    try {
      const b = await req.json();
      if (url.pathname === '/frete') return json(await cotar(env, b), 200, cors);
      if (url.pathname === '/cupom') return json(await lerCupom(env, b.codigo), 200, cors);
      if (url.pathname === '/pagar') return json(await pagar(env, b, url.origin), 200, cors);
      if (url.pathname === '/etiqueta') return json(await etiqueta(env, b, req), 200, cors);
      if (url.pathname === '/confirmar') {
        if (!b.pedido) throw falha('Pedido não informado');
        return json(await verificar(env, b.pedido, b.transaction_nsu, b.slug, b.receipt_url), 200, cors);
      }
      return json({ erro: 'Caminho não encontrado' }, 404, cors);
    } catch (e) {
      console.error(e);
      return json({ erro: e.publico ? e.message : 'Algo deu errado. Tente de novo em instantes.' }, e.publico ? 400 : 500, cors);
    }
  }
};

/* ---------------- frete ---------------- */
const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const precoAtual = (p) => (p.promo && p.promo < p.preco ? p.promo : p.preco);
const falha = (m) => Object.assign(new Error(m), { publico: true });

// Mesma regra de assets/data.js (opcoesLocais): mude nos dois lugares.
function opcoesLocais(cfg, cep, subtotal) {
  const ops = [];
  const gratis = Number(cfg.freteGratisAcima) > 0 && subtotal >= Number(cfg.freteGratisAcima);
  if (cfg.retirada) ops.push({ id: 'retirada', tipo: 'retirada', nome: 'Retirar na loja', preco: 0, detalhe: cfg.enderecoRetirada || 'Combine o horário pelo WhatsApp' });
  const prefixos = String(cfg.cepsLocais || '').split(',').map(soDigitos).filter(Boolean);
  if (cfg.entregaLocal && prefixos.some((p) => soDigitos(cep).startsWith(p)))
    ops.push({ id: 'local', tipo: 'local', nome: `Entrega em ${cfg.cidade || 'sua cidade'}`, preco: gratis ? 0 : Number(cfg.valorEntregaLocal) || 0, detalhe: 'Entrega da própria loja' });
  return ops;
}

// Regras de preço do pedido. A MESMA função está em assets/data.js e em servidor/worker.js: mude nos dois.
// linhas: [{ preco (já com promoção e personalização), qtd }]. Ordem: maior entre cupom e desconto
// progressivo (não somam) e, por cima, o desconto do Pix.
function faixaProgressiva(cfg, pecas) {
  const p = cfg.progressivo;
  if (!p?.ativo) return null;
  return (p.faixas || []).filter((f) => f.qtd > 1 && f.pct > 0 && pecas >= f.qtd).sort((a, b) => b.pct - a.pct)[0] || null;
}
function calcularPedido(cfg, linhas, cupom, metodo) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const pecas = linhas.reduce((t, l) => t + l.qtd, 0);
  const faixa = faixaProgressiva(cfg, pecas);
  const pctCupom = Number(cupom?.pct) || 0, pctFaixa = Number(faixa?.pct) || 0;
  const pct = Math.max(pctCupom, pctFaixa);
  const regra = !pct ? '' : pctCupom >= pctFaixa ? 'cupom' : 'progressivo';
  const pix = metodo === 'pix' ? Math.min(30, Math.max(0, Number(cfg.pixDesconto) || 0)) : 0;
  const itens = linhas.map((l) => ({ ...l, cheio: r2(l.preco), semPix: Math.round(l.preco * (100 - pct)) / 100, final: Math.round(l.preco * (100 - pct) * (100 - pix) / 100) / 100 }));
  const soma = (k) => r2(itens.reduce((t, i) => t + i[k] * i.qtd, 0));
  const bruto = soma('cheio'), aposDesc = soma('semPix'), total = soma('final');
  return { itens, pecas, bruto, pct, regra, faixa, cupom: regra === 'cupom' ? cupom : null, desconto: r2(bruto - aposDesc), pix, descontoPix: r2(aposDesc - total), total };
}

// Lê a sacola com os preços e o estoque de verdade (nunca confia no que o navegador mandou)
async function lerSacola(env, itens, cfg) {
  const pers = { ativo: false, preco: 30, maxNome: 12, ...(cfg.pers || {}) };
  if (!Array.isArray(itens) || !itens.length || itens.length > 30) throw falha('Sacola vazia ou grande demais');
  const linhas = [];
  for (const i of itens) {
    const qtd = Math.floor(Number(i.qtd));
    if (!(qtd >= 1 && qtd <= 20)) throw falha('Quantidade inválida');
    const p = await fsGet(env, `produtos/${encodeURIComponent(String(i.id))}`);
    if (!p || p.data.visivel === false) throw falha('Um produto da sacola não está mais disponível');
    const v = (p.data.variacoes || []).find((x) => x.tam === i.tam);
    const estoque = p.data.esgotadoManual ? 0 : v?.qtd || 0;
    if (estoque < qtd) throw falha(`${p.data.nome} (${i.tam}) tem só ${Math.max(0, estoque)} em estoque`);
    const l = { id: p.id, nome: p.data.nome, categoria: p.data.categoria, tam: i.tam, qtd, preco: precoAtual(p.data) };
    if (i.pers) {
      if (!pers.ativo || p.data.categoria !== 'camisa') throw falha('A personalização não está disponível agora');
      const nome = String(i.pers.nome || '').toUpperCase().replace(/[^A-ZÀ-Ú .'-]/g, '').trim().slice(0, Number(pers.maxNome) || 12);
      const numero = String(i.pers.numero || '').replace(/\D/g, '').slice(0, 2);
      if (!nome && !numero) throw falha('Preencha o nome ou o número da personalização');
      l.pers = { nome, numero };
      l.preco = Math.round((l.preco + (Number(pers.preco) || 0)) * 100) / 100;
    }
    linhas.push(l);
  }
  return linhas;
}

// Embalagem de cada peça para o Melhor Envio (ele junta tudo nas caixas)
function produtosME(cfg, linhas) {
  const emb = { ...EMBALAGENS, ...(cfg.embalagens || {}) };
  return linhas.map((l) => {
    const e = emb[l.categoria] || emb.camisa;
    return { id: `${l.id}-${l.tam}`, width: e.largura, height: e.altura, length: e.comprimento, weight: e.peso, insurance_value: Math.round(l.preco * 100) / 100, quantity: l.qtd };
  });
}

async function cotar(env, b, linhas) {
  const cep = soDigitos(b.cep);
  if (cep.length !== 8) throw falha('CEP inválido');
  const cfg = (await fsGet(env, 'config/loja'))?.data || {};
  linhas = linhas || (await lerSacola(env, b.itens, cfg));
  const subtotal = linhas.reduce((t, i) => t + i.preco * i.qtd, 0);
  const opcoes = opcoesLocais(cfg, cep, subtotal);

  const origem = soDigitos(cfg.cepOrigem);
  if (origem.length === 8 && env.MELHOR_ENVIO_TOKEN) {
    try {
      const servicos = (await me(env, '/shipment/calculate', { from: { postal_code: origem }, to: { postal_code: cep }, products: produtosME(cfg, linhas) }))
        .filter((s) => !s.error && s.custom_price);
      const transp = servicos.map((s) => ({
        id: `me-${s.id}`, tipo: 'transportadora', servicoId: s.id, nome: s.name, empresa: s.company?.name || '',
        logo: s.company?.picture || '', preco: Number(s.custom_price), prazo: s.custom_delivery_time
      })).sort((a, b) => a.preco - b.preco);
      if (transp.length && Number(cfg.freteGratisAcima) > 0 && subtotal >= Number(cfg.freteGratisAcima)) transp[0].preco = 0;
      opcoes.push(...transp);
    } catch (e) { console.error('cotação melhor envio', e.message); }
  }
  if (!opcoes.length) throw falha('Não achamos entrega para esse CEP. Chame a loja no WhatsApp.');
  return { cep, subtotal, opcoes };
}

/* ---------------- cupom ---------------- */
// Desconto em % sobre os produtos (o frete não entra). Só o servidor aplica: o navegador só mostra.
async function lerCupom(env, codigo) {
  const c = String(codigo || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
  if (!c) throw falha('Digite o cupom');
  const d = (await fsGet(env, `cupons/${c}`))?.data;
  const pct = Number(d?.pct);
  if (!d || d.ativo === false || !(pct > 0 && pct <= 90)) throw falha('Cupom inválido ou encerrado');
  return { codigo: c, pct };
}

/* ---------------- pagamento ---------------- */
async function pagar(env, b, workerUrl) {
  const cfg = (await fsGet(env, 'config/loja'))?.data || {};
  const linhas = await lerSacola(env, b.itens, cfg);
  const { cep, opcoes } = await cotar(env, b, linhas);
  const frete = opcoes.find((o) => o.id === b.freteId);
  if (!frete) throw falha('Escolha a entrega de novo: o valor do frete mudou');
  const cupom = b.cupom ? await lerCupom(env, b.cupom) : null;
  const metodo = b.metodo === 'pix' ? 'pix' : 'cartao';
  // preço de cada peça já com os descontos (é o que vai para a InfinitePay e para o lucro no painel)
  const conta = calcularPedido(cfg, linhas, cupom, metodo);

  const nome = String(b.cliente?.nome || '').trim().slice(0, 80);
  const tel = soDigitos(b.cliente?.telefone);
  if (nome.length < 3) throw falha('Informe seu nome');
  if (tel.length < 10) throw falha('Informe seu WhatsApp com DDD');
  const telefone = tel.length <= 11 ? '55' + tel : tel;
  const cpf = soDigitos(b.cliente?.cpf);
  if (frete.tipo === 'transportadora' && !cpfValido(cpf)) throw falha('Informe um CPF válido (ele vai na etiqueta de envio)');
  let endereco = null;
  if (frete.tipo !== 'retirada') {
    const e = b.endereco || {};
    endereco = { cep, rua: txt(e.rua), numero: txt(e.numero, 12), complemento: txt(e.complemento), bairro: txt(e.bairro), cidade: txt(e.cidade), uf: txt(e.uf, 2).toUpperCase() };
    if (!endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade || !endereco.uf) throw falha('Complete o endereço de entrega');
  }

  const id = 'B13-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
  const total = Math.round((conta.total + frete.preco) * 100) / 100;
  const pedido = {
    id, criadoEm: Date.now(), status: 'aguardando',
    itens: conta.itens.map(({ id, nome, tam, qtd, final, cheio, pers }) => ({ id, nome, tam, qtd, preco: final, cheio, ...(pers ? { pers } : {}) })),
    subtotal: conta.bruto, metodo,
    ...(conta.regra ? { regra: conta.regra, desconto: conta.desconto } : {}), ...(conta.cupom ? { cupom: conta.cupom } : {}),
    ...(conta.descontoPix ? { descontoPix: conta.descontoPix } : {}),
    frete: { id: frete.id, tipo: frete.tipo, servicoId: frete.servicoId || null, nome: frete.nome, empresa: frete.empresa || '', preco: frete.preco, prazo: frete.prazo || null },
    total, cliente: { nome, telefone, ...(cpf ? { cpf } : {}) }, endereco, pagamento: {}
  };
  await fsSet(env, `pedidos/${id}`, pedido, { novo: true });

  const site = env.SITE_URL.replace(/[#?].*$/, '');
  const corpo = {
    handle: env.INFINITEPAY_HANDLE,
    order_nsu: id,
    items: [
      ...conta.itens.map((l) => ({ description: `${l.nome} (${l.tam})${l.pers ? ` ${l.pers.nome} ${l.pers.numero}`.trimEnd() : ''}`, price: Math.round(l.final * 100), quantity: l.qtd })),
      ...(frete.preco > 0 ? [{ description: `Frete ${frete.nome}`, price: Math.round(frete.preco * 100), quantity: 1 }] : [])
    ],
    redirect_url: `${site}?pedido=${id}`,
    webhook_url: `${workerUrl}/webhook`,
    customer: { name: nome, phone_number: '+' + telefone }
  };
  if (endereco) corpo.address = { cep, street: endereco.rua, number: endereco.numero, neighborhood: endereco.bairro, city: endereco.cidade, state: endereco.uf, complement: endereco.complemento };
  const headers = { 'Content-Type': 'application/json' };
  if (env.INFINITEPAY_API_KEY) {
    headers['X-Api-Key'] = env.INFINITEPAY_API_KEY;
    const n = Math.min(12, Math.max(0, Math.floor(Number(cfg.parcelasSemJuros) || 0)));
    if (n) corpo.options = { assured_installments: n };
  }
  const r = await fetch(`${IP_API}/links`, { method: 'POST', headers, body: JSON.stringify(corpo) });
  const resp = await r.json().catch(() => ({}));
  if (!r.ok || !resp.url) {
    console.error('infinitepay links', r.status, JSON.stringify(resp));
    await fsSet(env, `pedidos/${id}`, { status: 'cancelado', obs: 'Falha ao criar o pagamento' }, { campos: ['status', 'obs'] });
    throw falha('Não deu para abrir o pagamento agora. Tente de novo ou peça pelo WhatsApp.');
  }
  await fsSet(env, `pedidos/${id}`, { linkPagamento: resp.url }, { campos: ['linkPagamento'] });
  return { pedido: id, url: resp.url };
}
// só aceita comprovante hospedado pela própria InfinitePay
function reciboSeguro(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)infinitepay\.(io|com\.br)$/.test(x.hostname) ? x.href : ''; } catch { return ''; }
}
const txt = (v, max = 80) => String(v || '').trim().slice(0, max);

// Confere o pagamento na InfinitePay. Se aprovado: marca pago, baixa estoque e lança a venda (uma vez só).
async function verificar(env, id, transacao, slug, recibo) {
  const doc = await fsGet(env, `pedidos/${encodeURIComponent(id)}`);
  if (!doc) throw falha('Pedido não encontrado');
  const p = doc.data;
  if (p.status !== 'aguardando' || !transacao || !slug) return publico(p);

  const r = await fetch(`${IP_API}/payment_check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: env.INFINITEPAY_HANDLE, order_nsu: id, transaction_nsu: String(transacao), slug: String(slug) })
  });
  const c = await r.json().catch(() => ({}));
  if (!(c.success && c.paid && Number(c.amount) >= Math.round(p.total * 100))) return publico(p);

  const pago = {
    status: 'pago', pagoEm: Date.now(),
    ...(p.metodo === 'pix' && c.capture_method && c.capture_method !== 'pix' ? { obs: 'Escolheu Pix (com desconto) no site, mas pagou no cartão' } : {}),
    pagamento: { metodo: c.capture_method || '', parcelas: c.installments || 1, valorPago: (c.paid_amount || c.amount) / 100, transacao: String(transacao), slug: String(slug), recibo: reciboSeguro(recibo) }
  };
  // a condição updateTime garante que só um (webhook ou volta do cliente) faça a baixa
  const ok = await fsSet(env, `pedidos/${id}`, pago, { campos: ['status', 'pagoEm', 'pagamento', ...(pago.obs ? ['obs'] : [])], updateTime: doc.updateTime, tolerante: true });
  if (!ok) return publico((await fsGet(env, `pedidos/${id}`)).data);

  for (const i of p.itens) {
    await baixarEstoque(env, i.id, i.tam, i.qtd);
    const priv = await fsGet(env, `priv/${i.id}`);
    await fsCriar(env, 'movimentos', {
      produtoId: i.id, nome: i.nome, tam: i.tam, tipo: 'venda', qtd: i.qtd, preco: i.preco,
      custo: priv?.data?.custo || 0, data: Date.now(), obs: `Pedido ${id} pelo site`
    });
  }
  return publico({ ...p, ...pago });
}
async function baixarEstoque(env, produtoId, tam, qtd) {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const d = await fsGet(env, `produtos/${produtoId}`);
    if (!d) return;
    const variacoes = d.data.variacoes.map((v) => (v.tam === tam ? { ...v, qtd: v.qtd - qtd } : v));
    const vendidos = (Number(d.data.vendidos) || 0) + qtd;
    if (await fsSet(env, `produtos/${produtoId}`, { variacoes, vendidos }, { campos: ['variacoes', 'vendidos'], updateTime: d.updateTime, tolerante: true })) return;
  }
  console.error('estoque não baixou', produtoId, tam);
}
// O que o cliente pode ver do pedido
const publico = (p) => ({
  pedido: p.id, status: p.status, pago: ['pago', 'enviado', 'entregue'].includes(p.status),
  itens: p.itens, subtotal: p.subtotal, cupom: p.cupom || null, regra: p.regra || '', desconto: p.desconto || 0, descontoPix: p.descontoPix || 0, frete: p.frete, total: p.total, recibo: p.pagamento?.recibo || '', metodo: p.pagamento?.metodo || ''
});

/* ---------------- etiqueta (Melhor Envio) ---------------- */
// Etapas: carrinho > pagar com o saldo da carteira > gerar > imprimir. Cada etapa fica salva no pedido
// (campo etiqueta), então se algo falhar no meio, chamar de novo continua de onde parou sem comprar duas vezes.
async function etiqueta(env, b, req) {
  await exigirAdmin(env, req);
  if (!env.MELHOR_ENVIO_TOKEN) throw falha('O token do Melhor Envio não está configurado no servidor');
  const id = String(b.pedido || '');
  const caminho = `pedidos/${encodeURIComponent(id)}`;
  const doc = await fsGet(env, caminho);
  if (!doc) throw falha('Pedido não encontrado');
  const p = doc.data;
  if (p.frete?.tipo !== 'transportadora' || !p.endereco) throw falha('Esse pedido não vai por transportadora');
  if (!['pago', 'enviado'].includes(p.status)) throw falha('A etiqueta só sai depois do pagamento aprovado');
  let et = p.etiqueta || {};
  const salvar = () => fsSet(env, caminho, { etiqueta: et, ...(et.rastreio && !p.rastreio ? { rastreio: et.rastreio } : {}) }, { campos: et.rastreio && !p.rastreio ? ['etiqueta', 'rastreio'] : ['etiqueta'] });

  // 1. carrinho: a trava do updateTime impede que dois cliques comprem duas etiquetas
  if (!et.meId) {
    if (et.status === 'criando' && Date.now() - (et.em || 0) < 120000) throw falha('A etiqueta já está sendo gerada. Espere um minuto e abra o pedido de novo.');
    const livre = await fsSet(env, caminho, { etiqueta: { status: 'criando', em: Date.now() } }, { campos: ['etiqueta'], updateTime: doc.updateTime, tolerante: true });
    if (!livre) throw falha('A etiqueta já está sendo gerada. Espere um minuto e abra o pedido de novo.');
    try {
      const c = await me(env, '/cart', await montarCarrinho(env, p));
      et = { status: 'carrinho', meId: c.id, em: Date.now() };
    } catch (e) {
      et = { status: 'erro', em: Date.now() };
      await salvar();
      throw erroME(e);
    }
    await salvar();
  }
  // 2. paga com o saldo da carteira do Melhor Envio
  if (et.status === 'carrinho') {
    const c = await me(env, '/shipment/checkout', { orders: [et.meId] }).catch((e) => { throw erroME(e, 'checkout'); });
    et = { ...et, status: 'paga', custo: Number(c.purchase?.total) || null, compra: c.purchase?.protocol || '' };
    await salvar();
  }
  // 3. gera a etiqueta
  if (et.status === 'paga') {
    await me(env, '/shipment/generate', { orders: [et.meId] }).catch((e) => { throw erroME(e); });
    et = { ...et, status: 'gerada' };
    await salvar();
  }
  // 4. link do PDF e rastreio
  if (!et.url) {
    const pr = await me(env, '/shipment/print', { mode: 'public', orders: [et.meId] }).catch((e) => { throw erroME(e); });
    et.url = pr.url || '';
  }
  if (!et.rastreio) {
    const o = await me(env, `/orders/${encodeURIComponent(et.meId)}`, null, 'GET').catch(() => ({}));
    et.rastreio = o.tracking || o.self_tracking || '';
    et.protocolo = o.protocol || '';
  }
  await salvar();
  return et;
}

async function montarCarrinho(env, p) {
  const rem = (await fsGet(env, 'interno/remetente'))?.data || {};
  const cfg = (await fsGet(env, 'config/loja'))?.data || {};
  const docRem = soDigitos(rem.documento);
  const cepRem = soDigitos(rem.cep || cfg.cepOrigem);
  if (!rem.nome || ![11, 14].includes(docRem.length) || !rem.rua || !rem.numero || !rem.cidade || cepRem.length !== 8)
    throw falha('Preencha os dados do remetente no painel: aba Loja, parte Etiquetas');

  // mesma conta da cotação, só com o serviço escolhido, para pegar as caixas (volumes)
  const servico = Number(p.frete.servicoId || String(p.frete.id).replace('me-', ''));
  const linhas = [];
  for (const i of p.itens) linhas.push({ ...i, categoria: (await fsGet(env, `produtos/${encodeURIComponent(i.id)}`))?.data?.categoria || 'camisa' });
  const cot = await me(env, '/shipment/calculate', { from: { postal_code: cepRem }, to: { postal_code: soDigitos(p.endereco.cep) }, products: produtosME(cfg, linhas), services: String(servico) });
  const s = Array.isArray(cot) ? cot.find((x) => Number(x.id) === servico) : cot;
  if (!s || s.error || !s.packages?.length) throw falha(`${p.frete.nome} não atende mais esse CEP${s?.error ? ` (${s.error})` : ''}. Gere a etiqueta no site do Melhor Envio.`);

  const tel = (t) => { const d = soDigitos(t); return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d; };
  const from = {
    name: rem.nome, phone: tel(rem.telefone), email: rem.email || env.MELHOR_ENVIO_EMAIL || undefined,
    address: rem.rua, complement: rem.complemento || '', number: rem.numero, district: rem.bairro || '',
    city: rem.cidade, state_abbr: String(rem.uf || '').toUpperCase(), country_id: 'BR', postal_code: cepRem
  };
  if (docRem.length === 14) Object.assign(from, { company_document: docRem, state_register: rem.ie || '' });
  else from.document = docRem;
  const e = p.endereco;
  const to = {
    name: p.cliente.nome, phone: tel(p.cliente.telefone), document: p.cliente.cpf || undefined,
    address: e.rua, complement: e.complemento || '', number: e.numero, district: e.bairro,
    city: e.cidade, state_abbr: e.uf, country_id: 'BR', postal_code: soDigitos(e.cep)
  };
  return {
    service: servico, from, to,
    products: p.itens.map((i) => ({ name: `${i.nome} (${i.tam})`, quantity: i.qtd, unitary_value: i.preco })),
    volumes: s.packages.map((k) => ({ height: Number(k.dimensions.height), width: Number(k.dimensions.width), length: Number(k.dimensions.length), weight: Number(k.weight) })),
    // sem nota fiscal: vai com declaração de conteúdo
    options: { insurance_value: Math.round(p.subtotal * 100) / 100, receipt: false, own_hand: false, reverse: false, non_commercial: true, platform: 'Catalogo B13', tags: [{ tag: p.id }] }
  };
}

// Chamada à API do Melhor Envio. Em erro, guarda a resposta em e.me para erroME explicar.
async function me(env, caminho, corpo, metodo = 'POST') {
  const r = await fetch(`${env.MELHOR_ENVIO_URL || 'https://melhorenvio.com.br'}/api/v2/me${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json',
      'User-Agent': `Catalogo B13 (${env.MELHOR_ENVIO_EMAIL || 'contato'})`
    },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('melhor envio', caminho, r.status, JSON.stringify(d));
    throw Object.assign(new Error(`melhor envio ${caminho} ${r.status}`), { me: d, status: r.status });
  }
  return d;
}
function erroME(e, etapa) {
  if (e.publico || !e.me) return e;
  const d = e.me;
  let m = (d.errors && Object.values(d.errors).flat()[0]) || d.message || d.error || `erro ${e.status}`;
  if (e.status === 401 || e.status === 403) m = 'o token venceu ou não tem todas as permissões. Gere um novo (servidor/LEIA-ME.md)';
  return falha(`Melhor Envio: ${m}${etapa === 'checkout' ? '. Confira se tem saldo na carteira do Melhor Envio.' : ''}`);
}

// Só o lojista: confere o login do Firebase e se a conta está em admins/
async function exigirAdmin(env, req) {
  const tk = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.FIREBASE_API_KEY) throw falha('Falta a variável FIREBASE_API_KEY no servidor');
  if (!tk) throw falha('Entre no painel de novo');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: tk })
  });
  const uid = (await r.json().catch(() => ({}))).users?.[0]?.localId;
  if (!uid) throw falha('Login vencido. Saia e entre no painel de novo.');
  if (!(await fsGet(env, `admins/${encodeURIComponent(uid)}`))) throw falha('Essa conta não tem acesso ao painel');
}

// Mesma regra de assets/data.js (cpfValido)
function cpfValido(c) {
  c = soDigitos(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/* ---------------- Firestore (REST, com a conta de serviço) ---------------- */
const fsBase = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
async function fsGet(env, caminho) {
  const r = await fetch(`${fsBase(env)}/${caminho}`, { headers: { Authorization: `Bearer ${await tokenGoogle(env)}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`firestore get ${caminho} ${r.status} ${await r.text()}`);
  const d = await r.json();
  return { id: d.name.split('/').pop(), data: deCampos(d.fields || {}), updateTime: d.updateTime };
}
// novo: só cria; campos: atualiza só esses; updateTime: só se ninguém mexeu antes; tolerante: devolve false em conflito
async function fsSet(env, caminho, obj, { novo, campos, updateTime, tolerante } = {}) {
  const q = new URLSearchParams();
  (campos || []).forEach((c) => q.append('updateMask.fieldPaths', c));
  if (novo) q.set('currentDocument.exists', 'false');
  if (updateTime) q.set('currentDocument.updateTime', updateTime);
  const r = await fetch(`${fsBase(env)}/${caminho}?${q}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: paraCampos(obj) })
  });
  if (r.ok) return true;
  if (tolerante && (r.status === 400 || r.status === 409 || r.status === 412)) return false;
  throw new Error(`firestore set ${caminho} ${r.status} ${await r.text()}`);
}
async function fsCriar(env, colecao, obj) {
  const r = await fetch(`${fsBase(env)}/${colecao}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: paraCampos(obj) })
  });
  if (!r.ok) throw new Error(`firestore create ${colecao} ${r.status} ${await r.text()}`);
}
function paraValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(paraValor) } };
  return { mapValue: { fields: paraCampos(v) } };
}
const paraCampos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, paraValor(v)]));
function deValor(v) {
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(deValor);
  if ('mapValue' in v) return deCampos(v.mapValue.fields || {});
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}
const deCampos = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, deValor(v)]));

// Token do Google a partir da chave da conta de serviço (JWT assinado com RS256)
let tokenCache = { valor: '', expira: 0 };
async function tokenGoogle(env) {
  if (tokenCache.valor && tokenCache.expira > Date.now() + 60000) return tokenCache.valor;
  const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: env.FIREBASE_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600
  })}`;
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const chave = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(corpo)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${corpo}.${b64u(assinatura)}` })
  });
  const t = await r.json();
  if (!t.access_token) throw new Error('token google: ' + JSON.stringify(t));
  tokenCache = { valor: t.access_token, expira: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

/* ---------------- utilidades ---------------- */
function corsHeaders(req, env) {
  const origem = req.headers.get('Origin') || '';
  let permitida = '';
  try { permitida = new URL(env.SITE_URL).origin; } catch {}
  const extras = String(env.ORIGENS_EXTRAS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': origem && (origem === permitida || extras.includes(origem)) ? origem : permitida,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin'
  };
}
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
