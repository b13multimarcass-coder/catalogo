// Frete e pagamento: fala com o servidor (servidor/worker.js) ou simula tudo no modo demonstração.
import { SERVIDOR_URL } from './config.js';
import { modo, opcoesLocais, precoAtual, soDigitos } from './data.js';

export const real = !!SERVIDOR_URL && modo === 'firebase';

async function chamar(caminho, corpo) {
  const r = await fetch(SERVIDOR_URL.replace(/\/$/, '') + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Não deu para falar com o servidor. Tente de novo.');
  return d;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function criar(api, loja, produtos) {
  const porId = (id) => produtos.find((p) => p.id === id);
  const linhas = (itens) => itens.map((i) => { const p = porId(i.id); return { id: p.id, nome: p.nome, categoria: p.categoria, tam: i.tam, qtd: i.qtd, preco: precoAtual(p) }; });

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

    // devolve { pedido, url }: url é a página de pagamento da InfinitePay (ou a simulação)
    async pagar(dados) {
      if (real) return chamar('/pagar', dados);
      await espera(500);
      const { opcoes, subtotal } = cotarDemo(soDigitos(dados.cep), dados.itens);
      const frete = opcoes.find((o) => o.id === dados.freteId);
      if (!frete) throw new Error('Escolha a entrega');
      const id = 'B13-' + Date.now().toString(36).toUpperCase().slice(-6);
      const tel = soDigitos(dados.cliente.telefone);
      await api.salvarPedido({
        id, criadoEm: Date.now(), status: 'aguardando',
        itens: linhas(dados.itens).map(({ id, nome, tam, qtd, preco }) => ({ id, nome, tam, qtd, preco })),
        subtotal, frete: { id: frete.id, tipo: frete.tipo, nome: frete.nome, empresa: frete.empresa || '', preco: frete.preco, prazo: frete.prazo || null },
        total: Math.round((subtotal + frete.preco) * 100) / 100,
        cliente: { nome: dados.cliente.nome.trim(), telefone: tel.length <= 11 ? '55' + tel : tel },
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
      return { pedido: p.id, status: p.status, pago: ['pago', 'enviado', 'entregue'].includes(p.status), itens: p.itens, subtotal: p.subtotal, frete: p.frete, total: p.total, recibo: p.pagamento?.recibo || '', metodo: p.pagamento?.metodo || '' };
    }
  };
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
