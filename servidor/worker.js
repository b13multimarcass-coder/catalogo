// Servidor de frete e pagamento do catálogo B13 (Cloudflare Worker, plano grátis).
//
// Faz três coisas que não podem ficar no site, porque usam chaves secretas:
//   POST /frete      cota o frete no Melhor Envio (e soma retirada / entrega na cidade)
//   POST /pagar      confere preços e estoque, grava o pedido e cria o link de pagamento da InfinitePay
//   POST /confirmar  o site chama quando o cliente volta do pagamento
//   POST /webhook    a InfinitePay chama quando o pagamento é aprovado
// Pagamento aprovado: o pedido vira "pago", o estoque baixa e a venda entra no painel.
//
// Variáveis (Cloudflare > Worker > Settings > Variables and Secrets). Passo a passo em servidor/LEIA-ME.md.
//   SITE_URL               endereço do catálogo, ex.: https://b13multimarcas.com.br/
//   FIREBASE_PROJECT_ID    id do projeto Firebase
//   FIREBASE_CLIENT_EMAIL  da chave da conta de serviço (secreto)
//   FIREBASE_PRIVATE_KEY   da chave da conta de serviço (secreto)
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
      if (url.pathname === '/pagar') return json(await pagar(env, b, url.origin), 200, cors);
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

// Lê a sacola com os preços e o estoque de verdade (nunca confia no que o navegador mandou)
async function lerSacola(env, itens) {
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
    linhas.push({ id: p.id, nome: p.data.nome, categoria: p.data.categoria, tam: i.tam, qtd, preco: precoAtual(p.data) });
  }
  return linhas;
}

async function cotar(env, b, linhas) {
  const cep = soDigitos(b.cep);
  if (cep.length !== 8) throw falha('CEP inválido');
  const cfg = (await fsGet(env, 'config/loja'))?.data || {};
  linhas = linhas || (await lerSacola(env, b.itens));
  const subtotal = linhas.reduce((t, i) => t + i.preco * i.qtd, 0);
  const opcoes = opcoesLocais(cfg, cep, subtotal);

  const origem = soDigitos(cfg.cepOrigem);
  if (origem.length === 8 && env.MELHOR_ENVIO_TOKEN) {
    const emb = { ...EMBALAGENS, ...(cfg.embalagens || {}) };
    const produtos = linhas.map((l) => {
      const e = emb[l.categoria] || emb.camisa;
      return { id: `${l.id}-${l.tam}`, width: e.largura, height: e.altura, length: e.comprimento, weight: e.peso, insurance_value: Math.round(l.preco * 100) / 100, quantity: l.qtd };
    });
    const r = await fetch(`${env.MELHOR_ENVIO_URL || 'https://melhorenvio.com.br'}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json',
        'User-Agent': `Catalogo B13 (${env.MELHOR_ENVIO_EMAIL || 'contato'})`
      },
      body: JSON.stringify({ from: { postal_code: origem }, to: { postal_code: cep }, products: produtos })
    });
    if (!r.ok) console.error('melhor envio', r.status, await r.text());
    else {
      const servicos = (await r.json()).filter((s) => !s.error && s.custom_price);
      const transp = servicos.map((s) => ({
        id: `me-${s.id}`, tipo: 'transportadora', servicoId: s.id, nome: s.name, empresa: s.company?.name || '',
        logo: s.company?.picture || '', preco: Number(s.custom_price), prazo: s.custom_delivery_time
      })).sort((a, b) => a.preco - b.preco);
      if (transp.length && Number(cfg.freteGratisAcima) > 0 && subtotal >= Number(cfg.freteGratisAcima)) transp[0].preco = 0;
      opcoes.push(...transp);
    }
  }
  if (!opcoes.length) throw falha('Não achamos entrega para esse CEP. Chame a loja no WhatsApp.');
  return { cep, subtotal, opcoes };
}

/* ---------------- pagamento ---------------- */
async function pagar(env, b, workerUrl) {
  const linhas = await lerSacola(env, b.itens);
  const { cep, subtotal, opcoes } = await cotar(env, b, linhas);
  const frete = opcoes.find((o) => o.id === b.freteId);
  if (!frete) throw falha('Escolha a entrega de novo: o valor do frete mudou');

  const nome = String(b.cliente?.nome || '').trim().slice(0, 80);
  const tel = soDigitos(b.cliente?.telefone);
  if (nome.length < 3) throw falha('Informe seu nome');
  if (tel.length < 10) throw falha('Informe seu WhatsApp com DDD');
  const telefone = tel.length <= 11 ? '55' + tel : tel;
  let endereco = null;
  if (frete.tipo !== 'retirada') {
    const e = b.endereco || {};
    endereco = { cep, rua: txt(e.rua), numero: txt(e.numero, 12), complemento: txt(e.complemento), bairro: txt(e.bairro), cidade: txt(e.cidade), uf: txt(e.uf, 2).toUpperCase() };
    if (!endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade || !endereco.uf) throw falha('Complete o endereço de entrega');
  }

  const id = 'B13-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
  const total = Math.round((subtotal + frete.preco) * 100) / 100;
  const pedido = {
    id, criadoEm: Date.now(), status: 'aguardando',
    itens: linhas.map(({ id, nome, tam, qtd, preco }) => ({ id, nome, tam, qtd, preco })),
    subtotal, frete: { id: frete.id, tipo: frete.tipo, nome: frete.nome, empresa: frete.empresa || '', preco: frete.preco, prazo: frete.prazo || null },
    total, cliente: { nome, telefone }, endereco, pagamento: {}
  };
  await fsSet(env, `pedidos/${id}`, pedido, { novo: true });

  const cfg = (await fsGet(env, 'config/loja'))?.data || {};
  const site = env.SITE_URL.replace(/[#?].*$/, '');
  const corpo = {
    handle: env.INFINITEPAY_HANDLE,
    order_nsu: id,
    items: [
      ...linhas.map((l) => ({ description: `${l.nome} (${l.tam})`, price: Math.round(l.preco * 100), quantity: l.qtd })),
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
    pagamento: { metodo: c.capture_method || '', parcelas: c.installments || 1, valorPago: (c.paid_amount || c.amount) / 100, transacao: String(transacao), slug: String(slug), recibo: reciboSeguro(recibo) }
  };
  // a condição updateTime garante que só um (webhook ou volta do cliente) faça a baixa
  const ok = await fsSet(env, `pedidos/${id}`, pago, { campos: ['status', 'pagoEm', 'pagamento'], updateTime: doc.updateTime, tolerante: true });
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
    if (await fsSet(env, `produtos/${produtoId}`, { variacoes }, { campos: ['variacoes'], updateTime: d.updateTime, tolerante: true })) return;
  }
  console.error('estoque não baixou', produtoId, tam);
}
// O que o cliente pode ver do pedido
const publico = (p) => ({
  pedido: p.id, status: p.status, pago: ['pago', 'enviado', 'entregue'].includes(p.status),
  itens: p.itens, subtotal: p.subtotal, frete: p.frete, total: p.total, recibo: p.pagamento?.recibo || '', metodo: p.pagamento?.metodo || ''
});

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
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
