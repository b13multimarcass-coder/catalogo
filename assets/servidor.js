// Frete e pagamento: fala com o servidor (servidor/worker.js) ou simula tudo no modo demonstração.
import { SERVIDOR_URL } from './config.js';
import { modo, opcoesLocais, precoAtual, soDigitos, codigoCupom, calcularPedido, persDe } from './data.js';

export const real = !!SERVIDOR_URL && modo === 'firebase';

async function chamar(caminho, corpo, extras = {}) {
  const r = await fetch(SERVIDOR_URL.replace(/\/$/, '') + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extras }, body: JSON.stringify(corpo)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Não deu para falar com o servidor. Tente de novo.');
  return d;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function criar(api, loja, produtos) {
  const porId = (id) => produtos.find((p) => p.id === id);
  // preço da linha já com a personalização (mesma regra do servidor)
  const linhas = (itens) => itens.map((i) => {
    const p = porId(i.id);
    const extra = i.pers ? Number(persDe(loja).preco) || 0 : 0;
    return { id: p.id, nome: p.nome, categoria: p.categoria, tam: i.tam, qtd: i.qtd, preco: Math.round((precoAtual(p) + extra) * 100) / 100, ...(i.pers ? { pers: i.pers } : {}) };
  });

  // ---------- simulação ----------
  function cotarDemo(cep, itens) {
    const ls = linhas(itens);
    const subtotal = ls.reduce((t, i) => t + i.preco * i.qtd, 0);
    const ops = opcoesLocais(loja, cep, subtotal);
    const pecas = ls.reduce((t, i) => t + i.qtd, 0);
    const longe = Math.abs(Number(cep[0]) - Number(soDigitos(loja.cepOrigem || '45600000')[0] || 4));
    const pac = 19.9 + longe * 4.5 + (pecas - 1) * 3;
    const t = [
      { id: 'me-1', servicoId: 1, nome: 'PAC', empresa: 'Correios', preco: pac, prazo: 4 + longe * 2 },
      { id: 'me-2', servicoId: 2, nome: 'SEDEX', empresa: 'Correios', preco: pac * 1.75, prazo: 1 + Math.ceil(longe / 2) },
      { id: 'me-3', servicoId: 3, nome: '.Package', empresa: 'Jadlog', preco: pac * 0.92, prazo: 5 + longe * 2 }
    ].map((o) => ({ ...o, tipo: 'transportadora', preco: Math.round(o.preco * 10) / 10 - 0.01 })).sort((a, b) => a.preco - b.preco);
    if (Number(loja.freteGratisAcima) > 0 && subtotal >= Number(loja.freteGratisAcima)) t[0].preco = 0;
    return { cep, subtotal, opcoes: [...ops, ...t], simulado: true };
  }

  return {
    real,
    async cotar(cep, itens) {
      cep = soDigitos(cep);
      if (cep.length !== 8) throw new Error('Digite o CEP com 8 números');
      if (real) return chamar('/frete', { cep, itens });
      await espera(450);
      return cotarDemo(cep, itens);
    },

    // confere o cupom: devolve { codigo, pct } ou dá erro
    async cupom(codigo) {
      codigo = codigoCupom(codigo);
      if (!codigo) throw new Error('Digite o cupom');
      if (real) return chamar('/cupom', { codigo });
      await espera(300);
      const c = (await api.cupons()).find((x) => x.codigo === codigo);
      if (!c || c.ativo === false) throw new Error('Cupom inválido ou encerrado');
      return { codigo, pct: c.pct };
    },

    // devolve { pedido, url }: url é a página de pagamento da InfinitePay (ou a simulação)
    async pagar(dados) {
      if (real) return chamar('/pagar', dados);
      await espera(500);
      const { opcoes, subtotal } = cotarDemo(soDigitos(dados.cep), dados.itens);
      const frete = opcoes.find((o) => o.id === dados.freteId);
      if (!frete) throw new Error('Escolha a entrega');
      const cupom = dados.cupom ? await this.cupom(dados.cupom) : null;
      const metodo = dados.metodo === 'pix' ? 'pix' : 'cartao';
      const conta = calcularPedido(loja, linhas(dados.itens), cupom, metodo);
      const itens = conta.itens.map(({ id, nome, tam, qtd, final, cheio, pers }) => ({ id, nome, tam, qtd, preco: final, cheio, ...(pers ? { pers } : {}) }));
      const id = 'B13-' + Date.now().toString(36).toUpperCase().slice(-6);
      const tel = soDigitos(dados.cliente.telefone);
      await api.salvarPedido({
        id, criadoEm: Date.now(), status: 'aguardando',
        itens, subtotal: conta.bruto, metodo,
        ...(conta.regra ? { regra: conta.regra, desconto: conta.desconto } : {}), ...(conta.cupom ? { cupom: conta.cupom } : {}),
        ...(conta.descontoPix ? { descontoPix: conta.descontoPix } : {}), frete: { id: frete.id, tipo: frete.tipo, servicoId: frete.servicoId || null, nome: frete.nome, empresa: frete.empresa || '', preco: frete.preco, prazo: frete.prazo || null },
        total: Math.round((conta.total + frete.preco) * 100) / 100,
        cliente: { nome: dados.cliente.nome.trim(), telefone: tel.length <= 11 ? '55' + tel : tel, ...(dados.cliente.cpf ? { cpf: soDigitos(dados.cliente.cpf) } : {}) },
        endereco: frete.tipo === 'retirada' ? null : { cep: soDigitos(dados.cep), ...dados.endereco }, pagamento: {}
      });
      return { pedido: id, url: `${location.pathname}?pedido=${id}&demo=pagar` };
    },

    // confere o pagamento quando o cliente volta da InfinitePay
    async confirmar(q) {
      if (real) return chamar('/confirmar', { pedido: q.pedido, transaction_nsu: q.transaction_nsu, slug: q.slug, receipt_url: q.receipt_url });
      await espera(500);
      const p = (await api.pedidos()).find((x) => x.id === q.pedido);
      if (!p) throw new Error('Pedido não encontrado');
      if (p.status === 'aguardando' && q.transaction_nsu) {
        const priv = await api.privados();
        for (const i of p.itens)
          await api.registrar({ produtoId: i.id, nome: i.nome, tam: i.tam, tipo: 'venda', qtd: i.qtd, preco: i.preco, custo: priv[i.id]?.custo || 0, data: Date.now(), obs: `Pedido ${p.id} pelo site` });
        Object.assign(p, { status: 'pago', pagoEm: Date.now(), pagamento: { metodo: q.capture_method || 'pix', parcelas: 1, recibo: '' } });
        await api.atualizarPedido(p.id, { status: p.status, pagoEm: p.pagoEm, pagamento: p.pagamento });
      }
      return { pedido: p.id, status: p.status, pago: ['pago', 'enviado', 'entregue'].includes(p.status), itens: p.itens, subtotal: p.subtotal, cupom: p.cupom || null, regra: p.regra || '', desconto: p.desconto || 0, descontoPix: p.descontoPix || 0, frete: p.frete, total: p.total, recibo: p.pagamento?.recibo || '', metodo: p.pagamento?.metodo || '' };
    }
  };
}

// Etiqueta do Melhor Envio (painel). O servidor compra com o saldo da carteira, gera e devolve o PDF e o rastreio.
export async function gerarEtiqueta(api, pedido) {
  if (real) return chamar('/etiqueta', { pedido }, { Authorization: `Bearer ${await api.token()}` });
  await espera(900);
  const et = { status: 'gerada', meId: 'demo', demo: true, url: '', rastreio: 'ME' + Math.random().toString().slice(2, 11) + 'BR', em: Date.now() };
  await api.atualizarPedido(pedido, { etiqueta: et });
  return et;
}

// Endereço pelo CEP (ViaCEP, serviço público e gratuito)
export async function buscarEndereco(cep) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${soDigitos(cep)}/json/`);
    const d = await r.json();
    if (d.erro) return null;
    return { rua: d.logradouro || '', bairro: d.bairro || '', cidade: d.localidade || '', uf: d.uf || '' };
  } catch { return null; }
}
