import { abrir, esgotado, totalEstoque, precoAtual, brl, esc, ico, icoWhats, comprimir, CATEGORIAS, TAMANHOS, STATUS_PEDIDO, soDigitos } from './data.js';
import { real as pagamentoReal } from './servidor.js';

const $ = (s, r = document) => r.querySelector(s);
const api = await abrir();
const DIA = 86400000;
const S = { aba: 'painel', periodo: '30', filtroProd: 'todos', filtroPed: 'pago', busca: '', loja: null, produtos: [], priv: {}, stats: {}, movs: [], pedidos: [] };
const catalogo = new URL('./', location.href).href;
const linkProduto = (id) => catalogo + '#p/' + id;

function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 2000);
}
async function copiar(t, msg) {
  try { await navigator.clipboard.writeText(t); } catch {
    const a = document.createElement('textarea'); a.value = t; document.body.append(a); a.select(); document.execCommand('copy'); a.remove();
  }
  toast(msg);
}
const num = (v) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmtNum = (n) => (n ? String(n.toFixed(2)).replace('.', ',') : '');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const custoDe = (id) => S.priv[id]?.custo || 0;
const lucroPeca = (p) => precoAtual(p) - custoDe(p.id);

/* ---------- login ---------- */
api.onAuth(async (user) => {
  if (!user) return telaLogin();
  try { await carregar(); } catch (e) {
    console.error(e);
    return telaLogin('Essa conta não tem acesso ao painel. Peça para liberar o seu e-mail.');
  }
  desenhar();
});

function telaLogin(erro = '') {
  $('#app').innerHTML = `
    <div class="login">
      <img src="assets/marca/logo-azul.png" alt="B13 Multimarcas" style="width:170px">
      <p>Painel da loja. Produtos, estoque e vendas.</p>
      ${api.modo === 'demo' ? `
        <button class="btn" id="lDemo">Entrar na demonstração</button>
        <p style="font-size:13px;margin:14px 0 0">Modo demonstração: os dados ficam só neste navegador. O login de verdade liga quando o Firebase for configurado.</p>` : `
        <label class="campo"><span>E-mail</span><input class="in" id="lEmail" type="email" autocomplete="username"></label>
        <label class="campo"><span>Senha</span><input class="in" id="lSenha" type="password" autocomplete="current-password"></label>
        <button class="btn" id="lEntrar">Entrar</button>
        <button class="btn sec" id="lGoogle">Entrar com Google</button>`}
      <div class="erro" id="lErro">${esc(erro)}</div>
      <a href="./" style="margin-top:28px;font-size:14px;text-decoration:underline;color:var(--tx2)">Ver o catálogo</a>
    </div>`;
  const falha = (e) => ($('#lErro').textContent = /invalid|wrong|user-not-found/i.test(e.code || '') ? 'E-mail ou senha incorretos.' : 'Não deu para entrar. Tente de novo.');
  $('#lDemo') && ($('#lDemo').onclick = () => api.entrar());
  $('#lEntrar') && ($('#lEntrar').onclick = () => api.entrar($('#lEmail').value.trim(), $('#lSenha').value).catch(falha));
  $('#lGoogle') && ($('#lGoogle').onclick = () => api.entrarGoogle().catch(falha));
}

async function carregar() {
  const [loja, produtos, priv, stats, movs, pedidos] = await Promise.all([api.config(), api.produtos(), api.privados(), api.stats(), api.movimentos(), api.pedidos()]);
  Object.assign(S, { loja, produtos, priv, stats, movs, pedidos });
  S.produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
async function recarregar() { await carregar(); desenhar(); }

/* ---------- casca ---------- */
const ABAS = [
  { id: 'painel', nome: 'Resumo', ic: 'painel' },
  { id: 'pedidos', nome: 'Pedidos', ic: 'sacola' },
  { id: 'produtos', nome: 'Produtos', ic: 'caixa' },
  { id: 'movs', nome: 'Estoque', ic: 'setas' },
  { id: 'loja', nome: 'Loja', ic: 'loja' }
];
function desenhar() {
  const corpo = { painel: telaPainel, pedidos: telaPedidos, produtos: telaProdutos, movs: telaMovs, loja: telaLoja }[S.aba]();
  const aEnviar = S.pedidos.filter((p) => p.status === 'pago').length;
  $('#app').innerHTML = `
    <div class="adm">${api.modo === 'demo' ? '<div class="demo-aviso" style="padding-top:10px">Modo demonstração, com produtos de exemplo</div>' : ''}${corpo}</div>
    <nav class="tabs">${ABAS.map((a) => `<button class="${S.aba === a.id ? 'on' : ''}" data-aba="${a.id}">${ico(a.ic)}${a.nome}${a.id === 'pedidos' && aEnviar ? `<span class="tb-n">${aEnviar}</span>` : ''}</button>`).join('')}</nav>`;
  $('.tabs').onclick = (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b) return;
    S.aba = b.dataset.aba;
    desenhar();
    scrollTo(0, 0);
  };
  ligar();
}

// delegação de cliques da tela atual
function ligar() {
  $('#app .adm').onclick = (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const { acao, v } = b.dataset;
    if (acao === 'periodo') { S.periodo = v; desenhar(); }
    else if (acao === 'filtroProd') { S.filtroProd = v; desenhar(); }
    else if (acao === 'editar') editor(v);
    else if (acao === 'novo') editor(null);
    else if (acao === 'mov') formMov(v);
    else if (acao === 'vendaDe') formMov('venda', v);
    else if (acao === 'desfazer') desfazer(v);
    else if (acao === 'pedido') abrirPedido(v);
    else if (acao === 'filtroPed') { S.filtroPed = v; desenhar(); }
    else if (acao === 'irPedidos') { S.aba = 'pedidos'; S.filtroPed = 'pago'; desenhar(); scrollTo(0, 0); }
    else if (acao === 'irProdutos') { S.aba = 'produtos'; S.filtroProd = v; desenhar(); scrollTo(0, 0); }
  };
  const busca = $('#bProd');
  if (busca) busca.oninput = (e) => { S.busca = e.target.value; $('#listaProd').innerHTML = listaProdutos(); };
}

/* ---------- período ---------- */
function inicioPeriodo() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (S.periodo === 'hoje') return hoje.getTime();
  if (S.periodo === 'mes') return new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime();
  if (S.periodo === 'tudo') return 0;
  return hoje.getTime() - (Number(S.periodo) - 1) * DIA;
}
const PERIODOS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['tudo', 'Tudo']];
const chipsPeriodo = () => `<div class="chips" style="padding-top:4px">${PERIODOS.map(([v, n]) => `<button class="chip ${S.periodo === v ? 'on' : ''}" data-acao="periodo" data-v="${v}">${n}</button>`).join('')}</div>`;

/* ---------- resumo ---------- */
function telaPainel() {
  const ini = inicioPeriodo();
  const vendas = S.movs.filter((m) => m.tipo === 'venda' && m.data >= ini);
  const fat = vendas.reduce((s, m) => s + m.preco * m.qtd, 0);
  const custo = vendas.reduce((s, m) => s + m.custo * m.qtd, 0);
  const pecas = vendas.reduce((s, m) => s + m.qtd, 0);
  const lucro = fat - custo;
  const nVendas = vendas.length;

  const emEstoque = S.produtos.reduce((s, p) => s + totalEstoque(p), 0);
  const valorCusto = S.produtos.reduce((s, p) => s + totalEstoque(p) * custoDe(p.id), 0);
  const valorVenda = S.produtos.reduce((s, p) => s + totalEstoque(p) * precoAtual(p), 0);

  // alertas
  const min = Number(S.loja.estoqueMinimo) || 2;
  const diasParado = Number(S.loja.diasParado) || 30;
  const baixos = S.produtos.filter((p) => !esgotado(p) && totalEstoque(p) <= min * 2 && p.variacoes.some((v) => v.qtd > 0 && v.qtd < min) || (!esgotado(p) && totalEstoque(p) <= min));
  const esgotados = S.produtos.filter((p) => esgotado(p));
  const ultimaVenda = {};
  S.movs.forEach((m) => { if (m.tipo === 'venda') ultimaVenda[m.produtoId] = Math.max(ultimaVenda[m.produtoId] || 0, m.data); });
  const parados = S.produtos.filter((p) => totalEstoque(p) > 0 && Date.now() - (ultimaVenda[p.id] || p.criadoEm) > diasParado * DIA);
  const procurados = esgotados.filter((p) => (S.stats[p.id]?.whats || 0) >= 5);

  // ranking
  const porProd = {};
  vendas.forEach((m) => {
    const r = (porProd[m.produtoId] ||= { id: m.produtoId, nome: m.nome, qtd: 0, fat: 0, lucro: 0 });
    r.qtd += m.qtd; r.fat += m.preco * m.qtd; r.lucro += (m.preco - m.custo) * m.qtd;
  });
  const top = Object.values(porProd).sort((a, b) => b.qtd - a.qtd || b.lucro - a.lucro).slice(0, 5);
  const maxQ = top[0]?.qtd || 1;
  const vistos = S.produtos.map((p) => ({ p, ...(S.stats[p.id] || { views: 0, whats: 0 }) })).sort((a, b) => b.views - a.views).slice(0, 5);
  const thumb = (id) => S.produtos.find((p) => p.id === id)?.thumb || '';

  const alerta = (ic, cls, titulo, sub, filtro) => `<button class="alerta" data-acao="irProdutos" data-v="${filtro}"><span class="ic ${cls}">${ico(ic)}</span><span class="m">${titulo}<small>${sub}</small></span>${ico('voltar', 18).replace('<svg', '<svg style="transform:rotate(180deg);color:var(--tx3)"')}</button>`;
  const nomes = (l) => esc(l.slice(0, 3).map((p) => p.nome.replace(/^(Camisa|Chuteira|Tênis) /, '')).join(', ') + (l.length > 3 ? ` e mais ${l.length - 3}` : ''));

  return `
    <div class="adm-h"><h1>Resumo</h1><button class="btn mini" data-acao="mov" data-v="venda">${ico('mais', 18)} Venda</button></div>
    ${chipsPeriodo()}
    <div class="kpis">
      <div class="kpi escuro"><span>Vendido</span><b>${brl(fat)}</b><small>${nVendas} ${nVendas === 1 ? 'venda' : 'vendas'} · ${pecas} ${pecas === 1 ? 'peça' : 'peças'}</small></div>
      <div class="kpi escuro"><span>Lucro</span><b>${brl(lucro)}</b><small>Margem de ${pct(lucro, fat)}%</small></div>
      <div class="kpi"><span>Ticket médio</span><b>${brl(nVendas ? fat / nVendas : 0)}</b><small>Lucro de ${brl(pecas ? lucro / pecas : 0)} por peça</small></div>
      <div class="kpi"><span>Em estoque</span><b>${emEstoque} peças</b><small>Custo ${brl(valorCusto)} · vende ${brl(valorVenda)}</small></div>
    </div>

    ${aEnviarResumo()}
    ${baixos.length || parados.length || procurados.length || esgotados.length ? `<div class="bloco"><h2>Precisa de atenção</h2>
      ${procurados.length ? alerta('olho', 'r', `${procurados.length} esgotado${procurados.length > 1 ? 's' : ''} com procura`, `${nomes(procurados)}. Vale repor.`, 'esgotados') : ''}
      ${baixos.length ? alerta('alerta', '', `${baixos.length} com estoque baixo`, nomes(baixos), 'baixo') : ''}
      ${parados.length ? alerta('caixa', '', `${parados.length} parado${parados.length > 1 ? 's' : ''} há mais de ${diasParado} dias`, `${nomes(parados)}. Que tal uma promoção?`, 'parados') : ''}
      ${esgotados.length && !procurados.length ? alerta('caixa', 'r', `${esgotados.length} esgotado${esgotados.length > 1 ? 's' : ''}`, nomes(esgotados), 'esgotados') : ''}
    </div>` : ''}

    <div class="duas">
    <div class="bloco"><h2>Mais vendidos <small>${PERIODOS.find((x) => x[0] === S.periodo)[1].toLowerCase()}</small></h2>
      ${top.length ? top.map((r) => `
        <button class="linha" data-acao="editar" data-v="${r.id}"><img src="${thumb(r.id)}" alt=""><div class="m"><div class="t">${esc(r.nome)}</div><div class="s">${r.qtd} ${r.qtd === 1 ? 'peça' : 'peças'} · lucro ${brl(r.lucro)}</div><div class="bar"><i style="width:${(r.qtd / maxQ) * 100}%"></i></div></div><div class="v">${brl(r.fat)}</div></button>`).join('') : '<p class="muted">Nenhuma venda nesse período.</p>'}
    </div>

    <div class="bloco"><h2>Mais vistos no catálogo <small>desde o início</small></h2>
      ${vistos.map((r) => `
        <button class="linha" data-acao="editar" data-v="${r.p.id}"><img src="${r.p.thumb}" alt=""><div class="m"><div class="t">${esc(r.p.nome)}</div><div class="s">${r.whats} chamaram no WhatsApp (${pct(r.whats, r.views)}%)</div></div><div class="v">${r.views}<small>visitas</small></div></button>`).join('')}
    </div>
    </div>
    <div style="height:24px"></div>`;
}

/* ---------- pedidos do site ---------- */
const FILTROS_PED = [['pago', 'A enviar'], ['aguardando', 'Aguardando pagamento'], ['enviado', 'Enviados'], ['todos', 'Todos']];
const quando = (t) => {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};
const CLASSE_ST = { aguardando: 'a', pago: 'k', enviado: '', entregue: '', cancelado: 'r' };
const badgeSt = (st) => `<span class="badge ${CLASSE_ST[st] || ''}">${STATUS_PEDIDO[st] || st}</span>`;
const fmtTel = (t) => { const d = soDigitos(t).replace(/^55(?=\d{10,11}$)/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };
const pecasDe = (p) => p.itens.reduce((t, i) => t + i.qtd, 0);
const metodoTxt = (pg) => (pg?.metodo === 'pix' ? 'Pix' : pg?.metodo === 'credit_card' ? `Cartão${pg.parcelas > 1 ? ` em ${pg.parcelas}x` : ''}` : '');

function aEnviarResumo() {
  const l = S.pedidos.filter((p) => p.status === 'pago');
  if (!l.length) return '';
  return `<div class="bloco"><button class="alerta destaque-ped" data-acao="irPedidos"><span class="ic k">${ico('sacola')}</span><span class="m">${l.length} ${l.length === 1 ? 'pedido pago' : 'pedidos pagos'} para enviar<small>${esc(l.slice(0, 3).map((p) => p.cliente.nome.split(' ')[0]).join(', '))} · ${brl(l.reduce((t, p) => t + p.total, 0))}</small></span>${ico('voltar', 18).replace('<svg', '<svg style="transform:rotate(180deg);color:var(--tx3)"')}</button></div>`;
}

function telaPedidos() {
  const l = S.pedidos.filter((p) => S.filtroPed === 'todos' || p.status === S.filtroPed || (S.filtroPed === 'enviado' && p.status === 'entregue'));
  const pagos30 = S.pedidos.filter((p) => ['pago', 'enviado', 'entregue'].includes(p.status) && p.criadoEm > Date.now() - 30 * DIA);
  return `
    <div class="adm-h"><h1>Pedidos</h1><span class="muted">pelo site</span></div>
    ${pagamentoReal ? '' : '<p class="muted" style="padding:0 16px 8px;font-size:13px">Frete e pagamento ainda simulados. Ligam quando o servidor for configurado (servidor/LEIA-ME.md).</p>'}
    <div class="kpis"><div class="kpi"><span>Pagos em 30 dias</span><b>${pagos30.length}</b><small>${brl(pagos30.reduce((t, p) => t + p.total, 0))} com frete</small></div><div class="kpi"><span>A enviar</span><b>${S.pedidos.filter((p) => p.status === 'pago').length}</b><small>${S.pedidos.filter((p) => p.status === 'aguardando').length} aguardando pagamento</small></div></div>
    <div class="chips" style="padding-top:4px">${FILTROS_PED.map(([v, n]) => `<button class="chip ${S.filtroPed === v ? 'on' : ''}" data-acao="filtroPed" data-v="${v}">${n}</button>`).join('')}</div>
    <div class="lista2" style="padding:0 16px 24px">${l.length ? l.map((p) => {
      const capa = S.produtos.find((x) => x.id === p.itens[0]?.id)?.thumb || '';
      return `<button class="linha" data-acao="pedido" data-v="${esc(p.id)}"><img src="${capa}" alt=""><div class="m"><div class="t">${esc(p.cliente.nome)}</div><div class="s">${pecasDe(p)} ${pecasDe(p) === 1 ? 'peça' : 'peças'} · ${esc(p.frete?.nome || '')} · ${quando(p.criadoEm)}</div><div style="margin-top:4px">${badgeSt(p.status)}</div></div><div class="v">${brl(p.total)}<small>${esc(p.id)}</small></div></button>`;
    }).join('') : '<p class="muted" style="padding:30px 0;text-align:center">Nenhum pedido aqui.</p>'}</div>`;
}

function abrirPedido(id) {
  const p = S.pedidos.find((x) => x.id === id);
  if (!p) return;
  const pg = $('#pagina');
  const e = p.endereco;
  const endTxt = e ? `${e.rua}, ${e.numero}${e.complemento ? ' - ' + e.complemento : ''}\n${e.bairro} · ${e.cidade}/${e.uf}\nCEP ${String(e.cep).replace(/(\d{5})(\d{3})/, '$1-$2')}` : '';
  const wa = (txt) => `https://wa.me/${soDigitos(p.cliente.telefone)}?text=${encodeURIComponent(txt)}`;
  const nome1 = p.cliente.nome.split(' ')[0];
  const retirada = p.frete?.tipo === 'retirada';
  pg.innerHTML = `
    <div class="pg-top"><button class="icon-btn" data-x="fechar" aria-label="Fechar">${ico('fechar')}</button><b>Pedido ${esc(p.id)}</b><span style="width:44px"></span></div>
    <div class="cnt">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 14px">${badgeSt(p.status)}<span class="muted" style="font-size:14px">${new Date(p.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="ped-b"><span>Cliente</span><b>${esc(p.cliente.nome)}</b><div class="muted">${esc(fmtTel(p.cliente.telefone))}</div>
        <a class="btn sec mini" style="margin-top:10px" href="${wa(`Olá, ${nome1}! Aqui é da ${S.loja.nome}, sobre o seu pedido ${p.id}.`)}" target="_blank" rel="noopener">${icoWhats(18)} Chamar no WhatsApp</a></div>
      <div class="ped-b"><span>Entrega</span><b>${esc(p.frete?.nome || '')}${p.frete?.empresa ? ` · ${esc(p.frete.empresa)}` : ''}</b>
        ${e ? `<div style="white-space:pre-line;margin-top:4px">${esc(endTxt)}</div><button class="btn sec mini" data-x="copiarEnd" style="margin-top:10px">${ico('copiar', 18)} Copiar endereço</button>` : `<div class="muted">${retirada ? 'O cliente vai retirar na loja' : ''}</div>`}
        ${p.rastreio ? `<div style="margin-top:10px">Rastreio: <b>${esc(p.rastreio)}</b></div>` : ''}</div>
      <div class="ped-b"><span>Itens</span>
        ${p.itens.map((i) => { const x = S.produtos.find((y) => y.id === i.id); return `<div class="linha" style="padding:10px 0"><img src="${x?.thumb || ''}" alt=""><div class="m"><div class="t">${esc(i.nome)}</div><div class="s">Tamanho ${esc(i.tam)} · ${i.qtd}x ${brl(i.preco)}</div></div><div class="v">${brl(i.preco * i.qtd)}</div></div>`; }).join('')}
        <div class="ped-l"><span>Frete</span><span>${p.frete?.preco ? brl(p.frete.preco) : 'Grátis'}</span></div>
        <div class="ped-l t"><span>Total</span><span>${brl(p.total)}</span></div>
        ${metodoTxt(p.pagamento) ? `<div class="ped-l"><span>Pagamento</span><span>${metodoTxt(p.pagamento)}</span></div>` : ''}
        ${p.pagamento?.recibo ? `<a href="${esc(p.pagamento.recibo)}" target="_blank" rel="noopener" style="text-decoration:underline;font-size:14px">Ver comprovante</a>` : ''}</div>
      ${p.status === 'pago' ? `
        ${retirada ? '' : `<label class="campo"><span>Código de rastreio (opcional)</span><input class="in" id="pRastreio" value="${esc(p.rastreio || '')}" placeholder="Ex.: AA123456789BR"></label>`}
        <button class="btn" data-x="enviado" style="margin-top:8px">${retirada ? 'Marcar como retirado' : 'Marcar como enviado e avisar o cliente'}</button>` : ''}
      ${p.status === 'enviado' ? '<button class="btn" data-x="entregue">Marcar como entregue</button>' : ''}
      ${p.status === 'aguardando' ? `<p class="muted" style="font-size:14px">O cliente ainda não pagou. Se ele desistir, cancele para não ficar na lista.</p>${p.linkPagamento ? `<button class="btn sec" data-x="copiarLink" style="margin-top:10px">${ico('link', 18)} Copiar link de pagamento</button>` : ''}<button class="perigo" data-x="cancelar">Cancelar pedido</button>` : ''}
    </div>`;
  pg.classList.add('on'); pg.scrollTop = 0; document.body.style.overflow = 'hidden';
  pg.onclick = async (ev) => {
    const b = ev.target.closest('[data-x]');
    if (!b) return;
    const x = b.dataset.x;
    if (x === 'fechar') return fecharPagina();
    if (x === 'copiarEnd') return copiar(`${p.cliente.nome}\n${endTxt}`, 'Endereço copiado');
    if (x === 'copiarLink') return copiar(p.linkPagamento, 'Link de pagamento copiado');
    let campos = null;
    if (x === 'enviado') {
      const rastreio = $('#pRastreio')?.value.trim().toUpperCase() || '';
      campos = retirada ? { status: 'entregue', entregueEm: Date.now() } : { status: 'enviado', enviadoEm: Date.now(), rastreio };
      if (!retirada) window.open(wa(`Olá, ${nome1}! Seu pedido ${p.id} da ${S.loja.nome} foi enviado${p.frete?.empresa ? ` pelos ${p.frete.empresa}` : ''}.${rastreio ? `\nCódigo de rastreio: *${rastreio}*${/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(rastreio) ? '\nAcompanhe em https://rastreamento.correios.com.br' : ''}` : ''}\nQualquer dúvida, é só chamar.`), '_blank', 'noopener');
    }
    if (x === 'entregue') campos = { status: 'entregue', entregueEm: Date.now() };
    if (x === 'cancelar') { if (!confirm(`Cancelar o pedido ${p.id}? Ele ainda não foi pago.`)) return; campos = { status: 'cancelado' }; }
    if (!campos) return;
    b.disabled = true;
    await api.atualizarPedido(p.id, campos);
    toast({ enviado: 'Pedido marcado como enviado', entregue: 'Pedido concluído', cancelado: 'Pedido cancelado' }[campos.status] || 'Pedido atualizado');
    fecharPagina(); recarregar();
  };
}

/* ---------- produtos ---------- */
const FILTROS = [['todos', 'Todos'], ['baixo', 'Estoque baixo'], ['esgotados', 'Esgotados'], ['parados', 'Parados'], ['promo', 'Promoção'], ['ocultos', 'Ocultos']];
function telaProdutos() {
  return `
    <div class="adm-h"><h1>Produtos</h1><span class="muted">${S.produtos.length}</span></div>
    <div style="padding:6px 16px 0"><input class="in" id="bProd" type="search" placeholder="Buscar produto" value="${esc(S.busca)}" style="border-radius:999px;background:var(--sf);border-color:var(--sf)"></div>
    <div class="chips">${FILTROS.map(([v, n]) => `<button class="chip ${S.filtroProd === v ? 'on' : ''}" data-acao="filtroProd" data-v="${v}">${n}</button>`).join('')}</div>
    <div class="lista2" style="padding:0 16px" id="listaProd">${listaProdutos()}</div>
    <button class="fab" data-acao="novo">${ico('mais', 20)} Novo produto</button>`;
}
function listaProdutos() {
  const min = Number(S.loja.estoqueMinimo) || 2;
  const diasParado = Number(S.loja.diasParado) || 30;
  const ultima = {};
  S.movs.forEach((m) => { if (m.tipo === 'venda') ultima[m.produtoId] = Math.max(ultima[m.produtoId] || 0, m.data); });
  const q = S.busca.toLowerCase();
  const l = S.produtos.filter((p) => {
    if (q && !`${p.nome} ${p.time} ${p.marca}`.toLowerCase().includes(q)) return false;
    const f = S.filtroProd;
    if (f === 'baixo') return !esgotado(p) && (totalEstoque(p) <= min || p.variacoes.some((v) => v.qtd > 0 && v.qtd < min));
    if (f === 'esgotados') return esgotado(p);
    if (f === 'parados') return totalEstoque(p) > 0 && Date.now() - (ultima[p.id] || p.criadoEm) > diasParado * DIA;
    if (f === 'promo') return p.promo && p.promo < p.preco;
    if (f === 'ocultos') return p.visivel === false;
    return true;
  });
  if (!l.length) return '<p class="muted" style="padding:30px 0;text-align:center">Nenhum produto aqui.</p>';
  return l.map((p) => {
    const lp = lucroPeca(p);
    const badges = [
      esgotado(p) ? '<span class="badge r">Esgotado</span>' : '',
      p.promo && p.promo < p.preco ? '<span class="badge r">Promoção</span>' : '',
      p.destaque ? '<span class="badge k">Destaque</span>' : '',
      p.visivel === false ? '<span class="badge">Oculto</span>' : ''
    ].join('');
    return `<button class="linha" data-acao="editar" data-v="${p.id}"><img src="${p.thumb}" alt=""><div class="m"><div class="t">${esc(p.nome)}</div><div class="s">${totalEstoque(p)} em estoque · lucro ${brl(lp)} (${pct(lp, precoAtual(p))}%)</div>${badges ? `<div style="margin-top:4px">${badges}</div>` : ''}</div><div class="v">${brl(precoAtual(p))}</div></button>`;
  }).join('');
}

/* ---------- editor de produto ---------- */
async function editor(id) {
  const orig = id ? S.produtos.find((p) => p.id === id) : null;
  const e = orig
    ? { ...orig, variacoes: orig.variacoes.map((v) => ({ ...v })), custo: custoDe(id), fotos: [{ id: orig.fotoIds?.[0], full: orig.thumb, thumb: orig.thumb }] }
    : { nome: '', categoria: 'camisa', time: '', marca: '', descricao: '', preco: 0, promo: null, custo: 0, variacoes: [], fotos: [], visivel: true, destaque: false, esgotadoManual: false };
  if (!orig) e.fotos = [];
  const pg = $('#pagina');
  const times = [...new Set(S.produtos.map((p) => p.time).filter(Boolean))].sort();
  const marcas = [...new Set(S.produtos.map((p) => p.marca).filter(Boolean))].sort();

  const html = () => `
    <div class="pg-top"><button class="icon-btn" data-x="fechar" aria-label="Fechar">${ico('fechar')}</button><b>${orig ? 'Editar produto' : 'Novo produto'}</b><span style="width:44px"></span></div>
    <div class="cnt">
      <div class="campo"><span>Fotos</span><div class="fotos" id="eFotos">${fotosHtml()}</div></div>
      <label class="campo"><span>Nome</span><input class="in" data-k="nome" value="${esc(e.nome)}" placeholder="Ex.: Camisa Flamengo I 25/26"></label>
      <div class="campo"><span>Categoria</span><div class="seg" id="eCat">${CATEGORIAS.map((c) => `<button class="${e.categoria === c.id ? 'on' : ''}" data-cat="${c.id}">${c.nome}</button>`).join('')}</div></div>
      <div class="dupla">
        <label class="campo"><span>Time</span><input class="in" data-k="time" value="${esc(e.time)}" list="dlTimes" placeholder="Opcional"></label>
        <label class="campo"><span>Marca</span><input class="in" data-k="marca" value="${esc(e.marca)}" list="dlMarcas"></label>
      </div>
      <datalist id="dlTimes">${times.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      <datalist id="dlMarcas">${marcas.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      <label class="campo"><span>Descrição</span><textarea class="in" data-k="descricao" placeholder="Opcional">${esc(e.descricao)}</textarea></label>

      <div class="tripla">
        <label class="campo"><span>Custo</span><input class="in" data-k="custo" inputmode="decimal" value="${fmtNum(e.custo)}" placeholder="0,00"></label>
        <label class="campo"><span>Preço</span><input class="in" data-k="preco" inputmode="decimal" value="${fmtNum(e.preco)}" placeholder="0,00"></label>
        <label class="campo"><span>Promoção</span><input class="in" data-k="promo" inputmode="decimal" value="${fmtNum(e.promo)}" placeholder="Opcional"></label>
      </div>
      <div class="lucro" id="eLucro"></div>

      <div class="campo"><span>Tamanhos e estoque</span>
        <div class="vars" id="eVars"></div>
        <div class="chips" id="eAddTam" style="padding:10px 0 0;flex-wrap:wrap"></div>
      </div>

      <div style="margin-top:18px;border-top:1px solid var(--ln)">
        <label class="sw"><span>Mostrar no catálogo</span><input type="checkbox" data-b="visivel" ${e.visivel !== false ? 'checked' : ''}></label>
        <label class="sw"><span>Destaque<small>Aparece primeiro na vitrine</small></span><input type="checkbox" data-b="destaque" ${e.destaque ? 'checked' : ''}></label>
        <label class="sw"><span>Marcar como esgotado<small>Mesmo com estoque. Ele já fica esgotado sozinho quando zera.</small></span><input type="checkbox" data-b="esgotadoManual" ${e.esgotadoManual ? 'checked' : ''}></label>
      </div>

      ${orig ? `
        <div class="acoes">
          <button class="btn sec" data-x="divulgar">${icoWhats(18)} Mensagem pronta</button>
          <button class="btn sec" data-x="link">${ico('link', 18)} Copiar link</button>
          <button class="btn sec" data-x="venda">${ico('mais', 18)} Registrar venda</button>
          <a class="btn sec" href="${linkProduto(orig.id)}" target="_blank">${ico('olho', 18)} Ver no catálogo</a>
        </div>
        <button class="perigo" data-x="excluir">${ico('lixo', 18)} Excluir produto</button>` : ''}
      <div class="cta" style="margin:20px -16px 0"><button class="btn" data-x="salvar">Salvar</button></div>
    </div>`;

  function fotosHtml() {
    return e.fotos.map((f, i) => `<div class="foto" data-i="${i}"><img src="${f.thumb}" alt="">${i === 0 ? '<span class="capa">Capa</span>' : ''}<button class="x" data-rm="${i}" aria-label="Remover foto">${ico('fechar', 14)}</button></div>`).join('') +
      (e.fotos.length < 6 ? `<label class="foto add">${ico('camera', 24)}<input type="file" accept="image/*" multiple id="eFile"></label>` : '');
  }
  function lucroHtml() {
    const preco = e.promo && e.promo < e.preco ? e.promo : e.preco;
    if (!preco) return '';
    const l = preco - e.custo;
    return `Lucro por peça: <b class="${l < 0 ? 'neg' : ''}">${brl(l)}</b> · margem de ${pct(l, preco)}%${e.promo && e.promo < e.preco ? ' (no preço de promoção)' : ''}`;
  }
  function varsHtml() {
    const ordem = TAMANHOS[e.categoria];
    e.variacoes.sort((a, b) => (ordem.indexOf(a.tam) + 1 || 99) - (ordem.indexOf(b.tam) + 1 || 99));
    $('#eVars', pg).innerHTML = e.variacoes.length ? e.variacoes.map((v, i) => `
      <div class="var"><span class="tm">${esc(v.tam)}</span><span class="st">${v.qtd <= 0 ? 'Esgotado' : v.qtd === 1 ? 'Última peça' : ''}</span>
        <div class="step"><button data-st="${i}" data-d="-1" aria-label="Menos">−</button><input data-q="${i}" inputmode="numeric" value="${v.qtd}"><button data-st="${i}" data-d="1" aria-label="Mais">+</button></div>
        <button class="icon-btn rm" data-rmt="${i}" aria-label="Remover tamanho">${ico('fechar', 18)}</button></div>`).join('') : '<p class="muted" style="font-size:14px">Toque nos tamanhos que você tem.</p>';
    const usados = new Set(e.variacoes.map((v) => v.tam));
    $('#eAddTam', pg).innerHTML = TAMANHOS[e.categoria].filter((t) => !usados.has(t)).map((t) => `<button class="chip" data-addt="${t}">+ ${t}</button>`).join('') + `<button class="chip" data-addt="?">Outro</button>`;
  }

  pg.innerHTML = html();
  pg.classList.add('on'); pg.scrollTop = 0; document.body.style.overflow = 'hidden';
  $('#eLucro', pg).innerHTML = lucroHtml();
  varsHtml();

  // fotos em alta resolução do produto existente
  if (orig) api.fotos(orig).then((fs) => { if (fs.length) { e.fotos = fs; $('#eFotos', pg).innerHTML = fotosHtml(); } });

  pg.oninput = (ev) => {
    const k = ev.target.dataset.k, q = ev.target.dataset.q;
    if (k) {
      e[k] = ['custo', 'preco', 'promo'].includes(k) ? num(ev.target.value) || (k === 'promo' ? null : 0) : ev.target.value;
      if (['custo', 'preco', 'promo'].includes(k)) $('#eLucro', pg).innerHTML = lucroHtml();
    }
    if (q !== undefined) e.variacoes[q].qtd = Math.max(0, parseInt(ev.target.value) || 0);
  };
  pg.onchange = async (ev) => {
    if (ev.target.dataset.b) e[ev.target.dataset.b] = ev.target.checked;
    if (ev.target.id === 'eFile') {
      const files = [...ev.target.files].slice(0, 6 - e.fotos.length);
      toast('Preparando fotos…');
      for (const file of files) {
        try { e.fotos.push({ full: await comprimir(file, 1200, 0.8), thumb: await comprimir(file, 600, 0.72) }); }
        catch { toast('Não deu para ler uma das fotos'); }
      }
      $('#eFotos', pg).innerHTML = fotosHtml();
    }
  };
  pg.onclick = async (ev) => {
    const t = ev.target.closest('button, .foto');
    if (!t) return;
    const d = t.dataset;
    if (d.rm !== undefined) { ev.preventDefault(); e.fotos.splice(+d.rm, 1); $('#eFotos', pg).innerHTML = fotosHtml(); return; }
    if (d.i !== undefined && +d.i > 0) { const [f] = e.fotos.splice(+d.i, 1); e.fotos.unshift(f); $('#eFotos', pg).innerHTML = fotosHtml(); toast('Nova capa escolhida'); return; }
    if (d.cat) {
      if (e.categoria !== d.cat && e.variacoes.some((v) => v.qtd > 0) && !confirm('Trocar a categoria apaga os tamanhos já preenchidos. Continuar?')) return;
      if (e.categoria !== d.cat) e.variacoes = [];
      e.categoria = d.cat;
      pg.querySelectorAll('#eCat button').forEach((b) => b.classList.toggle('on', b.dataset.cat === d.cat));
      varsHtml(); return;
    }
    if (d.st !== undefined) { const v = e.variacoes[+d.st]; v.qtd = Math.max(0, v.qtd + +d.d); varsHtml(); return; }
    if (d.rmt !== undefined) { e.variacoes.splice(+d.rmt, 1); varsHtml(); return; }
    if (d.addt) {
      let t = d.addt;
      if (t === '?') { t = (prompt('Qual tamanho?') || '').trim(); if (!t || e.variacoes.some((v) => v.tam === t)) return; }
      e.variacoes.push({ tam: t, qtd: 1 }); varsHtml(); return;
    }
    const x = d.x;
    if (x === 'fechar') fecharPagina();
    else if (x === 'link') copiar(linkProduto(orig.id), 'Link do produto copiado');
    else if (x === 'divulgar') copiar(msgDivulgar({ ...orig, ...e }), 'Mensagem copiada. É só colar no WhatsApp.');
    else if (x === 'venda') { fecharPagina(); formMov('venda', orig.id); }
    else if (x === 'excluir') {
      if (!confirm(`Excluir "${orig.nome}"? O histórico de vendas continua no resumo.`)) return;
      await api.excluirProduto(orig.id); fecharPagina(); toast('Produto excluído'); recarregar();
    } else if (x === 'salvar') {
      if (!e.nome.trim()) return toast('Dê um nome ao produto');
      if (!e.preco) return toast('Coloque o preço de venda');
      if (!e.fotos.length && !confirm('Salvar sem foto? Produto sem foto vende menos.')) return;
      t.disabled = true; t.textContent = 'Salvando…';
      try {
        const dados = {
          nome: e.nome.trim(), categoria: e.categoria, time: e.time.trim(), marca: e.marca.trim(), descricao: e.descricao.trim(),
          preco: e.preco, promo: e.promo && e.promo < e.preco ? e.promo : null, variacoes: e.variacoes,
          visivel: e.visivel !== false, destaque: !!e.destaque, esgotadoManual: !!e.esgotadoManual
        };
        await api.salvarProduto({ id: orig?.id, dados, custo: e.custo, fotos: e.fotos });
        fecharPagina(); toast('Produto salvo'); recarregar();
      } catch (err) {
        console.error(err); toast(err.message?.length < 120 ? err.message : 'Não deu para salvar. Tente de novo.');
        t.disabled = false; t.textContent = 'Salvar';
      }
    }
  };
}
function fecharPagina() {
  const pg = $('#pagina');
  pg.classList.remove('on'); pg.innerHTML = ''; document.body.style.overflow = '';
}

function msgDivulgar(p) {
  const tams = p.variacoes.filter((v) => v.qtd > 0).map((v) => v.tam);
  const promo = p.promo && p.promo < p.preco;
  return [
    `*${p.nome}*`,
    tams.length && !p.esgotadoManual ? `Tamanhos: ${tams.join(', ')}` : 'Esgotado no momento. Me chama para encomendar.',
    promo ? `De ~${brl(p.preco)}~ por *${brl(p.promo)}*` : `Valor: *${brl(p.preco)}*`,
    '',
    `Veja as fotos: ${linkProduto(p.id)}`
  ].join('\n');
}

/* ---------- movimentações ---------- */
function telaMovs() {
  const ini = inicioPeriodo();
  const l = S.movs.filter((m) => m.data >= ini);
  const vendas = l.filter((m) => m.tipo === 'venda');
  const fat = vendas.reduce((s, m) => s + m.preco * m.qtd, 0);
  const lucro = vendas.reduce((s, m) => s + (m.preco - m.custo) * m.qtd, 0);
  const entradas = l.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.qtd, 0);
  let diaAtual = '';
  const linhas = l.map((m) => {
    const dia = new Date(m.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    const cab = dia !== diaAtual ? `<div class="dia">${(diaAtual = dia)}</div>` : '';
    const p = S.produtos.find((x) => x.id === m.produtoId);
    const titulo = { venda: 'Venda', entrada: 'Entrada', saida: 'Saída' }[m.tipo];
    const valor = m.tipo === 'venda'
      ? `${brl(m.preco * m.qtd)}<small style="color:var(--ok)">+${brl((m.preco - m.custo) * m.qtd)}</small>`
      : `${m.tipo === 'entrada' ? '+' : '−'}${m.qtd}<small>${m.tipo === 'entrada' ? 'peças' : 'peças'}</small>`;
    return `${cab}<button class="linha" data-acao="desfazer" data-v="${m.id}">${p ? `<img src="${p.thumb}" alt="">` : '<img alt="">'}<div class="m"><div class="t">${esc(m.nome)}</div><div class="s">${titulo} · ${esc(m.tam)} · ${m.qtd}x${m.obs ? ' · ' + esc(m.obs) : ''}</div></div><div class="v">${valor}</div></button>`;
  }).join('');
  return `
    <div class="adm-h"><h1>Vendas e estoque</h1></div>
    <div class="dupla" style="padding:6px 16px 4px">
      <button class="btn" data-acao="mov" data-v="venda">${ico('mais', 18)} Venda</button>
      <button class="btn sec" data-acao="mov" data-v="entrada">${ico('caixa', 18)} Entrada</button>
    </div>
    ${chipsPeriodo()}
    <div class="kpis"><div class="kpi"><span>Vendido</span><b>${brl(fat)}</b><small>lucro ${brl(lucro)}</small></div><div class="kpi"><span>Entraram</span><b>${entradas} peças</b><small>${vendas.length} vendas no período</small></div></div>
    <div style="padding:0 16px 24px">${linhas || '<p class="muted" style="padding:30px 0;text-align:center">Nada registrado nesse período.</p>'}</div>`;
}

async function desfazer(id) {
  const m = S.movs.find((x) => x.id === id);
  if (!m) return;
  const tipo = { venda: 'a venda', entrada: 'a entrada', saida: 'a saída' }[m.tipo];
  if (!confirm(`Desfazer ${tipo} de ${m.qtd}x ${m.nome} (${m.tam})? O estoque volta como estava.`)) return;
  await api.excluirMovimento(id);
  toast('Desfeito'); recarregar();
}

function formMov(tipo = 'venda', produtoId = '') {
  const st = { tipo, produtoId, tam: '', qtd: 1, valor: 0, data: new Date().toISOString().slice(0, 10), obs: '', busca: '' };
  const folha = $('#folha');
  const prod = () => S.produtos.find((p) => p.id === st.produtoId);
  const valorPadrao = () => { const p = prod(); if (!p) return 0; return st.tipo === 'venda' ? precoAtual(p) : custoDe(p.id); };
  if (produtoId) st.valor = valorPadrao();

  const desenharF = () => {
    const p = prod();
    const achados = S.produtos.filter((x) => !st.busca || `${x.nome} ${x.time}`.toLowerCase().includes(st.busca.toLowerCase())).slice(0, 30);
    const v = p?.variacoes.find((x) => x.tam === st.tam);
    folha.innerHTML = `
      <div class="folha-h">${{ venda: 'Registrar venda', entrada: 'Entrada de estoque', saida: 'Saída de estoque' }[st.tipo]}<button class="icon-btn" data-f="fechar" aria-label="Fechar">${ico('fechar')}</button></div>
      <div class="folha-c">
        <div class="seg">${[['venda', 'Venda'], ['entrada', 'Entrada'], ['saida', 'Saída']].map(([k, n]) => `<button class="${st.tipo === k ? 'on' : ''}" data-tipo="${k}">${n}</button>`).join('')}</div>
        ${st.tipo === 'saida' ? '<p class="muted" style="font-size:13px;margin-top:8px">Para troca, defeito, brinde ou perda. Não entra no faturamento.</p>' : ''}
        <div class="campo"><span>Produto</span>
          ${p ? `<div class="linha" style="border:0;padding-top:0"><img src="${p.thumb}" alt=""><div class="m"><div class="t">${esc(p.nome)}</div><div class="s">${totalEstoque(p)} em estoque</div></div><button class="chip" data-f="trocar">Trocar</button></div>` : `
            <input class="in" id="fBusca" type="search" placeholder="Buscar produto" value="${esc(st.busca)}">
            <div class="sel-prod">${achados.map((x) => `<button class="linha" data-prod="${x.id}"><img src="${x.thumb}" alt=""><div class="m"><div class="t">${esc(x.nome)}</div><div class="s">${totalEstoque(x)} em estoque</div></div></button>`).join('')}</div>`}
        </div>
        ${p ? `
          <div class="campo"><span>Tamanho</span><div class="tams">${p.variacoes.map((x) => `<button class="tam ${st.tam === x.tam ? 'on' : ''}" data-tam="${esc(x.tam)}" ${st.tipo !== 'entrada' && x.qtd <= 0 ? 'disabled' : ''}>${esc(x.tam)}<small style="display:block;font-size:11px;color:var(--tx2);font-weight:400;line-height:1">${x.qtd} un</small></button>`).join('')}</div></div>
          <div class="dupla">
            <div class="campo"><span>Quantidade</span><div class="step" style="width:max-content"><button data-qd="-1">−</button><input id="fQtd" inputmode="numeric" value="${st.qtd}"><button data-qd="1">+</button></div></div>
            ${st.tipo !== 'saida' ? `<label class="campo"><span>${st.tipo === 'venda' ? 'Preço por peça' : 'Custo por peça'}</span><input class="in" id="fValor" inputmode="decimal" value="${fmtNum(st.valor)}"></label>` : '<span></span>'}
          </div>
          ${st.tipo === 'venda' ? `<div class="lucro" id="fLucro">${lucroMov()}</div>` : ''}
          <div class="dupla">
            <label class="campo"><span>Data</span><input class="in" id="fData" type="date" value="${st.data}"></label>
            <label class="campo"><span>Observação</span><input class="in" id="fObs" value="${esc(st.obs)}" placeholder="${st.tipo === 'venda' ? 'Cliente, pagamento…' : 'Fornecedor, motivo…'}"></label>
          </div>` : ''}
      </div>
      <div class="folha-f"><button class="btn" data-f="ok" ${p && st.tam ? '' : 'disabled'}>${st.tipo === 'venda' ? 'Registrar venda' : 'Salvar'}</button></div>`;
    if (!p) setTimeout(() => $('#fBusca')?.focus(), 50);
    if (v && st.tipo !== 'entrada' && st.qtd > v.qtd) toast(`Só tem ${v.qtd} no estoque`);
  };
  const lucroMov = () => { const l = (st.valor - custoDe(st.produtoId)) * st.qtd; return `Lucro desta venda: <b class="${l < 0 ? 'neg' : ''}">${brl(l)}</b>`; };

  desenharF();
  $('#veu').classList.add('on'); folha.classList.add('on');
  $('#veu').onclick = fechar;
  function fechar() { $('#veu').classList.remove('on'); folha.classList.remove('on'); }

  folha.oninput = (ev) => {
    const id = ev.target.id;
    if (id === 'fBusca') { st.busca = ev.target.value; const pos = ev.target.selectionStart; desenharF(); const i = $('#fBusca'); i.focus(); i.setSelectionRange(pos, pos); }
    if (id === 'fValor') { st.valor = num(ev.target.value); const l = $('#fLucro'); if (l) l.innerHTML = lucroMov(); }
    if (id === 'fQtd') { st.qtd = Math.max(1, parseInt(ev.target.value) || 1); const l = $('#fLucro'); if (l) l.innerHTML = lucroMov(); }
    if (id === 'fData') st.data = ev.target.value;
    if (id === 'fObs') st.obs = ev.target.value;
  };
  folha.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.f === 'fechar') return fechar();
    if (d.tipo) { st.tipo = d.tipo; st.valor = valorPadrao(); const v = prod()?.variacoes.find((x) => x.tam === st.tam); if (st.tipo !== 'entrada' && v && v.qtd <= 0) st.tam = ''; }
    if (d.prod) { st.produtoId = d.prod; st.tam = ''; st.valor = valorPadrao(); const disp = prod().variacoes.filter((x) => x.qtd > 0); if (disp.length === 1) st.tam = disp[0].tam; }
    if (d.f === 'trocar') { st.produtoId = ''; st.tam = ''; }
    if (d.tam) st.tam = d.tam;
    if (d.qd) st.qtd = Math.max(1, st.qtd + +d.qd);
    if (d.f === 'ok') {
      const p = prod();
      const v = p.variacoes.find((x) => x.tam === st.tam);
      if (st.tipo !== 'entrada' && st.qtd > v.qtd && !confirm(`O estoque de ${st.tam} é ${v.qtd}. Registrar mesmo assim?`)) return;
      b.disabled = true;
      const hora = new Date(); const [y, mo, di] = st.data.split('-').map(Number);
      const data = new Date(y, mo - 1, di, hora.getHours(), hora.getMinutes()).getTime();
      await api.registrar({
        produtoId: p.id, nome: p.nome, tam: st.tam, tipo: st.tipo, qtd: st.qtd,
        preco: st.tipo === 'venda' ? st.valor : 0,
        custo: st.tipo === 'entrada' && st.valor ? st.valor : custoDe(p.id),
        data, obs: st.obs.trim()
      });
      fechar();
      toast(st.tipo === 'venda' ? 'Venda registrada' : 'Estoque atualizado');
      return recarregar();
    }
    desenharF();
  };
}

/* ---------- loja ---------- */
function telaLoja() {
  const c = S.loja;
  setTimeout(() => {
    $('#app .adm').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-l]');
      if (!b) return;
      const a = b.dataset.l;
      if (a === 'copiar') copiar(catalogo, 'Link do catálogo copiado');
      if (a === 'msg') copiar(`Olá! Esse é o catálogo da ${c.nome}, com camisas, chuteiras e tênis. Escolhe o seu e me chama por aqui:\n${catalogo}`, 'Mensagem copiada');
      if (a === 'salvar') {
        const v = (id) => $('#' + id).value.trim();
        const nova = { nome: v('cNome') || 'B13 Multimarcas', slogan: v('cSlogan'), whatsapp: v('cWhats').replace(/\D/g, ''), instagram: v('cInsta').replace('@', ''), cidade: v('cCidade'), estoqueMinimo: +v('cMin') || 2, diasParado: +v('cParado') || 30,
          cepOrigem: soDigitos(v('cCepOrigem')), retirada: $('#cRetirada').checked, enderecoRetirada: v('cEndRet'), entregaLocal: $('#cLocal').checked,
          valorEntregaLocal: num(v('cValLocal')), cepsLocais: v('cCepsLocais'), freteGratisAcima: num(v('cGratis')), parcelasSemJuros: Math.min(12, Math.max(0, parseInt(v('cParcelas')) || 0)) };
        if (nova.whatsapp.length < 12) return toast('Coloque o WhatsApp com DDI e DDD, ex.: 5573999999999');
        if (nova.cepOrigem && nova.cepOrigem.length !== 8) return toast('O CEP de origem precisa ter 8 números');
        if (nova.entregaLocal && !soDigitos(nova.cepsLocais)) return toast('Diga o começo dos CEPs da cidade para a entrega própria');
        await api.salvarConfig(nova); toast('Dados da loja salvos'); recarregar();
      }
      if (a === 'sair') api.sair();
      if (a === 'reset' && confirm('Voltar os dados de exemplo? O que foi mexido na demonstração se perde.')) { await api.resetarDemo(); location.reload(); }
    });
  });
  return `
    <div class="adm-h"><h1>Loja</h1></div>
    <div class="bloco" style="padding-top:6px">
      <div class="kpi" style="display:flex;align-items:center;gap:12px"><div style="flex:1;min-width:0"><span>Link do catálogo</span><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(catalogo.replace(/^https?:\/\//, ''))}</div></div><a class="icon-btn" href="${catalogo}" target="_blank" aria-label="Abrir">${ico('olho')}</a></div>
      <div class="dupla" style="margin-top:8px"><button class="btn sec" data-l="copiar">${ico('copiar', 18)} Copiar link</button><button class="btn sec" data-l="msg">${icoWhats(18)} Mensagem pronta</button></div>
    </div>
    <div class="bloco">
      <h2>Dados da loja</h2>
      <label class="campo"><span>Nome</span><input class="in" id="cNome" value="${esc(c.nome)}"></label>
      <label class="campo"><span>Frase da vitrine</span><input class="in" id="cSlogan" value="${esc(c.slogan)}"></label>
      <label class="campo"><span>WhatsApp que recebe os pedidos</span><input class="in" id="cWhats" inputmode="tel" value="${esc(c.whatsapp)}" placeholder="5573999999999"></label>
      <div class="dupla">
        <label class="campo"><span>Instagram</span><input class="in" id="cInsta" value="${esc(c.instagram)}" placeholder="sem @"></label>
        <label class="campo"><span>Cidade</span><input class="in" id="cCidade" value="${esc(c.cidade)}" placeholder="Opcional"></label>
      </div>
      <h2 style="margin-top:28px">Entrega</h2>
      <label class="campo"><span>CEP de onde os pacotes saem</span><input class="in" id="cCepOrigem" inputmode="numeric" value="${esc(c.cepOrigem || '')}" placeholder="Usado no cálculo do Melhor Envio"></label>
      <label class="sw"><span>Retirada na loja<small>Grátis, o cliente busca</small></span><input type="checkbox" id="cRetirada" ${c.retirada ? 'checked' : ''}></label>
      <label class="campo"><span>Endereço ou instrução de retirada</span><input class="in" id="cEndRet" value="${esc(c.enderecoRetirada || '')}" placeholder="Ex.: Rua tal, 100. Seg a sáb, 9h às 18h"></label>
      <label class="sw"><span>Entrega própria na cidade<small>Valor fixo, sem transportadora</small></span><input type="checkbox" id="cLocal" ${c.entregaLocal ? 'checked' : ''}></label>
      <div class="dupla">
        <label class="campo"><span>Valor da entrega</span><input class="in" id="cValLocal" inputmode="decimal" value="${fmtNum(Number(c.valorEntregaLocal) || 0)}" placeholder="0,00"></label>
        <label class="campo"><span>CEPs da cidade começam com</span><input class="in" id="cCepsLocais" value="${esc(c.cepsLocais || '')}" placeholder="Ex.: 45600, 45601"></label>
      </div>
      <label class="campo"><span>Frete grátis em compras acima de</span><input class="in" id="cGratis" inputmode="decimal" value="${fmtNum(Number(c.freteGratisAcima) || 0)}" placeholder="Deixe vazio para não ter"></label>
      <h2 style="margin-top:28px">Pagamento online</h2>
      <p class="muted" style="font-size:14px;margin-bottom:10px">${pagamentoReal ? 'Ligado: o cliente paga com Pix ou cartão pela InfinitePay.' : 'Simulado por enquanto. Liga quando o servidor for configurado (servidor/LEIA-ME.md).'}</p>
      <label class="campo"><span>Parcelas sem juros para o cliente</span><input class="in" id="cParcelas" inputmode="numeric" value="${Number(c.parcelasSemJuros) || 0}" placeholder="0"><small class="muted" style="font-size:12px">A loja paga a taxa dessas parcelas. Precisa da chave de API da InfinitePay. 0 = o cliente paga os juros.</small></label>
      <h2 style="margin-top:28px">Alertas</h2>
      <div class="dupla">
        <label class="campo"><span>Estoque baixo abaixo de</span><input class="in" id="cMin" inputmode="numeric" value="${c.estoqueMinimo}"></label>
        <label class="campo"><span>Parado depois de (dias)</span><input class="in" id="cParado" inputmode="numeric" value="${c.diasParado}"></label>
      </div>
      <button class="btn" data-l="salvar" style="margin-top:20px">Salvar</button>
      ${api.modo === 'demo' ? '<button class="btn sec" data-l="reset" style="margin-top:10px">Restaurar dados de exemplo</button>' : ''}
      <button class="perigo" data-l="sair" style="color:var(--tx2)">${ico('sair', 18)} Sair</button>
    </div>
    <div style="height:24px"></div>`;
}
