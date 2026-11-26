import { moverPilula, abrir, esgotado, totalEstoque, precoAtual, brl, esc, ico, icoWhats, comprimir, CATEGORIAS, TAMANHOS, STATUS_PEDIDO, soDigitos, LIGAS, ligaAuto, codigoCupom, ligaDe, VERSOES, persDe, ligado, patchesDe } from './data.js';
import { real as pagamentoReal, gerarEtiqueta, buscarEndereco } from './servidor.js';
import { ORIGENS } from './rastreio.js';

const $ = (s, r = document) => r.querySelector(s);
const api = await abrir();
const DIA = 86400000;
const S = { aba: 'painel', periodo: '30', filtroProd: 'todos', filtroPed: 'pago', busca: '', loja: null, produtos: [], priv: {}, stats: {}, movs: [], pedidos: [], rem: {}, cupons: [], leads: [], dias: [], visitantes: [], rank: 'repor', filtroCli: 'carrinho' };
const catalogo = new URL('./', location.href).href;
const linkProduto = (id) => catalogo + '#p/' + id;

function toast(t, ms) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), ms || Math.max(2000, t.length * 60));
}
// traduz o erro do Firebase para o lojista entender o que houve
function msgErro(err) {
  const c = String(err?.code || '').replace('firestore/', '');
  if (c === 'permission-denied') return 'Sem permissão para salvar: esta conta não está liberada como lojista ou as regras do Firestore estão desatualizadas.';
  if (c === 'unavailable' || c === 'deadline-exceeded' || err?.message === 'prazo') return 'Não consegui falar com o banco de dados. Confira a internet e tente de novo.';
  if (c === 'resource-exhausted') return 'O limite diário do Firebase acabou. Tente de novo amanhã.';
  if (c === 'unauthenticated') return 'Sua sessão expirou. Saia e entre de novo.';
  return 'Não deu para salvar: ' + String(err?.message || err).slice(0, 140);
}
// gravação que não responde em 20 s vira erro (antes o botão ficava parado sem aviso)
const comPrazo = (p, s = 20) => Promise.race([p, new Promise((_, n) => setTimeout(() => n(new Error('prazo')), s * 1000))]);
// nenhum erro passa calado: mostra na tela o que aconteceu
window.addEventListener('unhandledrejection', (ev) => { console.error(ev.reason); toast(msgErro(ev.reason), 8000); });
window.addEventListener('error', (ev) => { if (ev.error) toast(msgErro(ev.error), 8000); });
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
  try { await carregar(); try { localStorage.setItem('b13-lojista', '1'); } catch {} } catch (e) {
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
  const [loja, produtos, priv, stats, movs, pedidos, rem, cupons, leads, dias, visitantes] = await Promise.all([api.config(), api.produtos(), api.privados(), api.stats(), api.movimentos(), api.pedidos(), api.remetente().catch(() => ({})), api.cupons().catch(() => []), api.leads().catch(() => []), api.dias().catch(() => []), api.visitantes(Date.now() - 30 * DIA).catch(() => [])]);
  Object.assign(S, { loja, produtos, priv, stats, movs, pedidos, rem, cupons, leads, dias, visitantes });
  S.produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
async function recarregar() { await carregar(); desenhar(); }

/* ---------- casca ---------- */
const ABAS = [
  { id: 'painel', nome: 'Resumo', ic: 'painel' },
  { id: 'pedidos', nome: 'Pedidos', ic: 'sacola' },
  { id: 'clientes', nome: 'Clientes', ic: 'pessoas' },
  { id: 'produtos', nome: 'Produtos', ic: 'caixa' },
  { id: 'movs', nome: 'Estoque', ic: 'setas' },
  { id: 'loja', nome: 'Loja', ic: 'loja' }
];
const pilulaTabs = () => moverPilula($('.tabs'), 'tabs', matchMedia('(min-width: 1024px)').matches ? [0, 0] : [12, 7]);
addEventListener('resize', pilulaTabs);
let chaveAdm = '';
function desenhar() {
  const chave = [S.aba, S.filtroProd, S.filtroPed, S.periodo, S.rank, S.filtroCli].join('|');
  const anima = chave !== chaveAdm;
  chaveAdm = chave;
  const corpo = { painel: telaPainel, pedidos: telaPedidos, clientes: telaClientes, produtos: telaProdutos, movs: telaMovs, loja: telaLoja }[S.aba]();
  const aEnviar = S.pedidos.filter((p) => p.status === 'pago').length;
  const aChamar = recuperaveis().filter((r) => !r.contatadoEm).length;
  $('#app').innerHTML = `
    <div class="adm ${anima ? 'anima' : ''}">${api.modo === 'demo' ? '<div class="demo-aviso" style="padding-top:10px">Modo demonstração, com produtos de exemplo</div>' : ''}${corpo}</div>
    <nav class="tabs">${ABAS.map((a) => `<button class="${S.aba === a.id ? 'on' : ''}" data-aba="${a.id}">${ico(a.ic)}${a.nome}${a.id === 'pedidos' && aEnviar ? `<span class="tb-n">${aEnviar}</span>` : ''}${a.id === 'clientes' && aChamar ? `<span class="tb-n">${aChamar}</span>` : ''}</button>`).join('')}</nav>`;
  pilulaTabs();
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
    else if (acao === 'lote') lote();
    else if (acao === 'mov') formMov(v);
    else if (acao === 'vendaDe') formMov('venda', v);
    else if (acao === 'desfazer') desfazer(v);
    else if (acao === 'pedido') abrirPedido(v);
    else if (acao === 'filtroPed') { S.filtroPed = v; desenhar(); }
    else if (acao === 'irPedidos') { S.aba = 'pedidos'; S.filtroPed = 'pago'; desenhar(); scrollTo(0, 0); }
    else if (acao === 'irProdutos') { S.aba = 'produtos'; S.filtroProd = v; desenhar(); scrollTo(0, 0); }
    else if (acao === 'rank') { S.rank = v; desenhar(); }
    else if (acao === 'filtroCli') { S.filtroCli = v; desenhar(); }
    else if (acao === 'recuperar') abrirRecuperar(v);
    else if (acao === 'atualizarCli') { b.disabled = true; recarregar(); }
    else if (acao === 'irClientes') { S.aba = 'clientes'; S.filtroCli = 'carrinho'; desenhar(); scrollTo(0, 0); }
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
    ${chamarResumo()}
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

    ${blocoDesempenho()}
    </div>
    <div style="height:24px"></div>`;
}

/* ---------- rastreio do site: somas por período ---------- */
const MIN = 60000;
const diaTs = (id) => { const [y, m, d] = id.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
function somaDias(ini) {
  const r = {};
  S.dias.forEach((d) => { if (diaTs(d.id) >= ini) Object.entries(d).forEach(([k, v]) => { if (k !== 'id' && typeof v === 'number') r[k] = (r[k] || 0) + v; }); });
  return r;
}
const rotuloPeriodo = () => PERIODOS.find((x) => x[0] === S.periodo)[1].toLowerCase();
const fim8 = (t) => soDigitos(t).slice(-8);
const pagoSt = (p) => ['pago', 'enviado', 'entregue'].includes(p.status);
// pagou depois (pelo site) com o mesmo WhatsApp?
const pagouDepois = (whats, desde) => !!whats && S.pedidos.some((p) => pagoSt(p) && fim8(p.cliente?.telefone) === fim8(whats) && p.criadoEm >= desde - 60 * MIN);

/* ---------- desempenho dos produtos (Resumo) ---------- */
const RANKS = [['repor', 'Repor'], ['clicados', 'Mais clicados'], ['naoConvertem', 'Olham e não compram'], ['encalhados', 'Vendem pouco'], ['ninguem', 'Ninguém olha']];
function desempenho() {
  const ini = inicioPeriodo();
  const semDias = !S.dias.length;
  const d = somaDias(ini);
  const vend = {}, vend30 = {};
  S.movs.forEach((m) => {
    if (m.tipo !== 'venda') return;
    if (m.data >= ini) vend[m.produtoId] = (vend[m.produtoId] || 0) + m.qtd;
    if (m.data >= Date.now() - 30 * DIA) vend30[m.produtoId] = (vend30[m.produtoId] || 0) + m.qtd;
  });
  return {
    semDias,
    l: S.produtos.map((p) => ({
      p,
      views: semDias ? S.stats[p.id]?.views || 0 : d['v_' + p.id] || 0,
      sac: d['s_' + p.id] || 0,
      wh: semDias ? S.stats[p.id]?.whats || 0 : d['w_' + p.id] || 0,
      vend: vend[p.id] || 0, v30: vend30[p.id] || 0, est: totalEstoque(p)
    }))
  };
}
function blocoDesempenho() {
  const { semDias, l } = desempenho();
  const min = Number(S.loja.estoqueMinimo) || 2;
  const linha = (r, sub, v, vs) => `<button class="linha" data-acao="editar" data-v="${r.p.id}"><img src="${r.p.thumb}" alt=""><div class="m"><div class="t">${esc(r.p.nome)}</div><div class="s">${sub}</div></div><div class="v">${v}<small>${vs}</small></div></button>`;
  const cliques = (r) => `${r.views} ${r.views === 1 ? 'visita' : 'visitas'}${r.sac ? ` · ${r.sac} na sacola` : ''}${r.wh ? ` · ${r.wh} no WhatsApp` : ''}`;
  let itens = [], dica = '';
  if (S.rank === 'repor') {
    itens = l.map((r) => {
      const porDia = r.v30 / 30;
      const dias = porDia ? r.est / porDia : Infinity;
      const procura = r.views >= 8 || r.sac > 0 || r.wh >= 2;
      const zerados = r.p.variacoes.filter((v) => v.qtd <= 0).map((v) => v.tam);
      return { ...r, dias, procura, zerados };
    }).filter((r) => (r.est === 0 && (r.v30 > 0 || r.procura)) || (r.v30 > 0 && (r.dias <= 21 || r.est <= min)) || (r.est > 0 && r.est <= min && r.procura))
      .sort((a, b) => a.dias - b.dias || b.v30 - a.v30).slice(0, 8)
      .map((r) => linha(r,
        r.est === 0 ? `Esgotado${r.v30 ? ` · vendeu ${r.v30} em 30 dias` : ''}${r.procura ? ` · ${cliques(r)}` : ''}`
          : `${r.v30 ? `Vende ~${Math.max(1, Math.round(r.v30 / 30 * 7))} por semana` : cliques(r)}${r.zerados.length ? ` · acabou ${r.zerados.slice(0, 4).join(', ')}` : ''}`,
        r.est === 0 ? '0' : isFinite(r.dias) ? `~${Math.max(1, Math.round(r.dias))} dias` : `${r.est} un`,
        r.est === 0 ? 'em estoque' : isFinite(r.dias) ? `${r.est} em estoque` : 'em estoque'));
    dica = 'Quem vende rápido e está acabando, ou esgotou com gente procurando. "Dias" é quanto o estoque dura no ritmo dos últimos 30 dias.';
  } else if (S.rank === 'clicados') {
    itens = l.filter((r) => r.views).sort((a, b) => b.views - a.views).slice(0, 8)
      .map((r) => linha(r, `${r.sac} na sacola · ${r.wh} no WhatsApp · ${r.vend} ${r.vend === 1 ? 'vendida' : 'vendidas'}`, r.views, 'visitas'));
    dica = 'Os produtos que mais chamam atenção. Bons para anúncio e Stories.';
  } else if (S.rank === 'naoConvertem') {
    itens = l.filter((r) => r.views >= 5 && r.vend === 0 && r.est > 0).sort((a, b) => b.views - a.views).slice(0, 8)
      .map((r) => linha(r, `${cliques(r)} · nenhuma venda`, r.views, 'visitas'));
    dica = 'Muita gente abre e ninguém compra. Confira preço, fotos, descrição e se tem os tamanhos mais pedidos.';
  } else if (S.rank === 'encalhados') {
    itens = l.filter((r) => r.est > 0 && r.vend <= 1).map((r) => ({ ...r, parado: r.est * (custoDe(r.p.id) || precoAtual(r.p) * 0.5) }))
      .sort((a, b) => a.vend - b.vend || b.parado - a.parado).slice(0, 8)
      .map((r) => linha(r, `${r.vend ? '1 vendida' : 'Nenhuma venda'} · ${r.est} em estoque`, brl(r.parado), 'parado'));
    dica = 'Dinheiro parado no estoque (pelo custo). Promoção, combo ou desconto no Pix ajudam a girar.';
  } else if (S.rank === 'ninguem') {
    itens = l.filter((r) => r.est > 0 && r.views <= 2).sort((a, b) => a.views - b.views || a.p.criadoEm - b.p.criadoEm).slice(0, 8)
      .map((r) => linha(r, `${r.est} em estoque · ${r.vend} ${r.vend === 1 ? 'vendida' : 'vendidas'}`, r.views, r.views === 1 ? 'visita' : 'visitas'));
    dica = 'Quase ninguém abriu. Ponha como destaque, troque a foto da capa ou poste nos Stories com o link.';
  }
  return `<div class="bloco"><h2>Desempenho dos produtos <small>${semDias ? 'cliques desde o início' : rotuloPeriodo()}</small></h2>
    <div class="chips" style="padding:0 0 6px">${RANKS.map(([v, n]) => `<button class="chip ${S.rank === v ? 'on' : ''}" data-acao="rank" data-v="${v}">${n}</button>`).join('')}</div>
    <p class="muted" style="font-size:13px;margin-bottom:4px">${dica}</p>
    ${itens.length ? itens.join('') : '<p class="muted" style="padding:14px 0">Nada aqui por enquanto.</p>'}
  </div>`;
}

/* ---------- clientes: quem está no site e quem dá para recuperar ---------- */
// Lista do que dá para chamar no WhatsApp: sacolas abandonadas (com WhatsApp) e pagamentos gerados e não pagos
function recuperaveis() {
  const agora = Date.now();
  const r = [];
  S.visitantes.forEach((v) => {
    if (!v.whats || !v.sacola?.length || v.etapa === 'comprou' || agora - v.ultimo < 30 * MIN) return;
    if (pagouDepois(v.whats, v.sacolaEm || v.ultimo)) return;
    r.push({ tipo: 'v', id: v.id, nome: v.nome, whats: v.whats, itens: v.sacola, valor: v.valor || 0, quando: v.ultimo, etapa: v.etapa, contatadoEm: v.contatadoEm, contatos: v.contatos || 0 });
  });
  S.pedidos.forEach((p) => {
    if (p.status !== 'aguardando' || agora - p.criadoEm < 30 * MIN || agora - p.criadoEm > 30 * DIA) return;
    if (pagouDepois(p.cliente?.telefone, p.criadoEm + 60 * MIN)) return;
    // mesma pessoa já está na lista pela sacola: fica só o pedido, que é mais forte
    const i = r.findIndex((x) => x.tipo === 'v' && fim8(x.whats) === fim8(p.cliente?.telefone));
    if (i >= 0) r.splice(i, 1);
    r.push({ tipo: 'p', id: p.id, nome: p.cliente?.nome, whats: p.cliente?.telefone, itens: p.itens, valor: p.total, quando: p.criadoEm, etapa: 'pagamento', contatadoEm: p.contatadoEm, contatos: p.contatos || 0 });
  });
  return r.sort((a, b) => !!a.contatadoEm - !!b.contatadoEm || b.quando - a.quando);
}
function interessados() {
  const agora = Date.now();
  return S.visitantes.filter((v) => v.whats && !v.sacola?.length && v.etapa !== 'comprou' && v.vistos?.length && agora - v.ultimo > 30 * MIN && !pagouDepois(v.whats, v.ultimo - DIA))
    .map((v) => ({ tipo: 'v', id: v.id, nome: v.nome, whats: v.whats, vistos: v.vistos, quando: v.ultimo, etapa: 'olhou', contatadoEm: v.contatadoEm, contatos: v.contatos || 0 }))
    .sort((a, b) => !!a.contatadoEm - !!b.contatadoEm || b.quando - a.quando);
}
const ETAPA = { pagamento: ['Gerou o pagamento e não pagou', 'r'], checkout: ['Chegou no pagamento', 'a'], sacola: ['Deixou na sacola', 'a'], whats: ['Mandou o pedido no WhatsApp', 'k'], olhou: ['Olhou e saiu', ''] };
function chamarResumo() {
  const l = recuperaveis().filter((r) => !r.contatadoEm);
  if (!l.length) return '';
  return `<div class="bloco"><button class="alerta destaque-ped" data-acao="irClientes"><span class="ic k">${icoWhats(22)}</span><span class="m">${l.length} ${l.length === 1 ? 'sacola abandonada' : 'sacolas abandonadas'} para recuperar<small>${esc(l.slice(0, 3).map((r) => (r.nome || 'Sem nome').split(' ')[0]).join(', '))} · ${brl(l.reduce((t, r) => t + r.valor, 0))}</small></span>${ico('voltar', 18).replace('<svg', '<svg style="transform:rotate(180deg);color:var(--tx3)"')}</button></div>`;
}
function linhaCliente(r) {
  const prodsIds = r.itens ? r.itens.map((i) => i.id) : r.vistos.map((v) => v.id);
  const capa = S.produtos.find((x) => x.id === prodsIds[0])?.thumb || '';
  const nomeProd = (id, nome) => (S.produtos.find((x) => x.id === id)?.nome || nome || 'Produto').replace(/^(Camisa|Chuteira|Tênis) /, '');
  const desc = r.itens
    ? r.itens.slice(0, 2).map((i) => `${nomeProd(i.id, i.nome)} (${i.tam})`).join(', ') + (r.itens.length > 2 ? ` e mais ${r.itens.length - 2}` : '')
    : r.vistos.slice(0, 2).map((v) => `${nomeProd(v.id)}${v.n > 1 ? ` (${v.n}x)` : ''}`).join(', ') + (r.vistos.length > 2 ? ` e mais ${r.vistos.length - 2}` : '');
  const [et, cls] = ETAPA[r.etapa] || ['', ''];
  return `<button class="linha" data-acao="recuperar" data-v="${r.tipo}:${esc(r.id)}"><img src="${capa}" alt=""><div class="m"><div class="t">${esc(r.nome || 'Sem nome')} <span class="muted" style="font-weight:400;font-size:13px">${esc(fmtTel(r.whats || ''))}</span></div><div class="s">${esc(desc)}</div><div style="margin-top:4px">${et ? `<span class="badge ${cls}">${et}</span>` : ''}${r.contatadoEm ? `<span class="badge k">Chamado ${quando(r.contatadoEm)}</span>` : ''}</div></div><div class="v">${r.valor ? brl(r.valor) : ''}<small>${quando(r.quando)}</small></div></button>`;
}
function telaClientes() {
  const agora = Date.now();
  const ini = inicioPeriodo();
  const d = somaDias(ini);
  const vis = S.visitantes.filter((v) => v.ultimo >= ini);
  const online = S.visitantes.filter((v) => agora - v.ultimo < 4 * MIN).sort((a, b) => b.ultimo - a.ultimo);
  const compras = S.pedidos.filter((p) => pagoSt(p) && p.criadoEm >= ini).length;
  const visitantes = d.visitantes || vis.length;
  // funil pelas fichas (no máximo 30 dias para trás)
  const funil = [
    ['Entraram no site', vis.length],
    ['Abriram um produto', vis.filter((v) => v.vistos?.length).length],
    ['Puseram na sacola', vis.filter((v) => v.sacolaEm >= ini).length],
    ['Chegaram no pagamento', vis.filter((v) => v.checkoutEm >= ini).length],
    ['Compraram', vis.filter((v) => v.comprouEm >= ini).length]
  ];
  const fmax = funil[0][1] || 1;
  // visitantes por dia (até 14 dias, ou o período escolhido se for menor)
  const nDias = S.periodo === 'hoje' ? 1 : S.periodo === '7' ? 7 : 14;
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const serie = Array.from({ length: nDias }, (_, i) => {
    const t = hoje0.getTime() - (nDias - 1 - i) * DIA;
    const dd = S.dias.find((x) => diaTs(x.id) === t) || {};
    return { t, n: dd.visitantes || 0, c: dd.compras || 0 };
  });
  const smax = Math.max(1, ...serie.map((x) => x.n));
  const origens = Object.entries(d).filter(([k]) => k.startsWith('o_')).map(([k, n]) => [k.slice(2), n]).sort((a, b) => b[1] - a[1]);
  const omax = origens[0]?.[1] || 1;
  const rec = recuperaveis(), intr = interessados();
  const anonimos = S.visitantes.filter((v) => !v.whats && v.sacola?.length && v.etapa !== 'comprou' && agora - v.ultimo > 30 * MIN).length;
  const lista = S.filtroCli === 'carrinho' ? rec : intr;
  const semDados = !S.dias.length && !S.visitantes.length;

  return `
    <div class="adm-h"><h1>Clientes</h1><button class="btn sec mini" data-acao="atualizarCli" style="width:auto;padding:0 14px">Atualizar</button></div>
    ${chipsPeriodo()}
    ${semDados ? '<p class="muted" style="padding:4px 16px 0;font-size:14px">O site começa a contar as visitas a partir de agora. Os números aparecem aqui conforme as pessoas entram.</p>' : ''}
    <div class="kpis">
      <div class="kpi escuro"><span>Agora no site</span><b>${online.length}</b><small>${online.length ? esc(online.slice(0, 2).map((v) => v.pagina || 'Início').join(' · ')) : 'ninguém nos últimos minutos'}</small></div>
      <div class="kpi"><span>Visitantes</span><b>${visitantes}</b><small>${d.sessoes || 0} ${d.sessoes === 1 ? 'visita' : 'visitas'} · ${rotuloPeriodo()}</small></div>
      <div class="kpi"><span>Compraram pelo site</span><b>${compras}</b><small>${visitantes ? `${(compras / visitantes * 100).toFixed(1).replace('.', ',')}% de quem entrou` : '—'}</small></div>
      <div class="kpi"><span>Deixaram o WhatsApp</span><b>${(d.cadastros || 0)}</b><small>no cupom de primeira compra</small></div>
    </div>

    <div class="bloco"><h2>Para recuperar <small>chame no WhatsApp</small></h2>
      <div class="chips" style="padding:0 0 6px">
        <button class="chip ${S.filtroCli === 'carrinho' ? 'on' : ''}" data-acao="filtroCli" data-v="carrinho">Sacola abandonada · ${rec.length}</button>
        <button class="chip ${S.filtroCli === 'interesse' ? 'on' : ''}" data-acao="filtroCli" data-v="interesse">Olharam e saíram · ${intr.length}</button>
      </div>
      <p class="muted" style="font-size:13px;margin-bottom:4px">${S.filtroCli === 'carrinho'
        ? 'Quem deixou o WhatsApp, separou peças e não pagou. Toque para mandar uma mensagem pronta, com ou sem cupom.'
        : 'Quem deixou o WhatsApp, abriu produtos e não pôs nada na sacola. Bom para oferecer um cupom.'}</p>
      ${lista.length ? lista.slice(0, 40).map(linhaCliente).join('') : '<p class="muted" style="padding:14px 0">Ninguém aqui agora.</p>'}
      ${anonimos ? `<p class="muted" style="font-size:13px;margin-top:10px">Mais ${anonimos} ${anonimos === 1 ? 'pessoa deixou' : 'pessoas deixaram'} peças na sacola sem informar o WhatsApp. O cupom de primeira compra (aba Loja) ajuda a pegar esse contato.</p>` : ''}
    </div>

    <div class="duas">
    <div class="bloco"><h2>Visitantes por dia <small>${nDias === 1 ? 'hoje' : `últimos ${nDias} dias`}</small></h2>
      <div class="grafico">${serie.map((x) => `<div class="gcol" title="${new Date(x.t).toLocaleDateString('pt-BR')}: ${x.n} visitantes, ${x.c} compras"><span>${x.n || ''}</span><i style="height:${Math.max(2, (x.n / smax) * 100)}%"></i><small>${new Date(x.t).getDate()}</small></div>`).join('')}</div>
    </div>
    <div class="bloco"><h2>Caminho até a compra <small>${S.periodo === 'tudo' ? 'últimos 30 dias' : rotuloPeriodo()}</small></h2>
      ${funil.map(([n, q], i) => `<div class="funil"><div class="fl"><span>${n}</span><b>${q}${i ? ` <small>${pct(q, funil[0][1])}%</small>` : ''}</b></div><div class="bar"><i style="width:${(q / fmax) * 100}%"></i></div></div>`).join('')}
    </div>
    </div>

    <div class="duas">
    <div class="bloco"><h2>De onde vêm</h2>
      ${origens.length ? origens.map(([o, n]) => `<div class="funil"><div class="fl"><span>${esc(ORIGENS[o] || o)}</span><b>${n} <small>${pct(n, d.sessoes)}%</small></b></div><div class="bar"><i style="width:${(n / omax) * 100}%"></i></div></div>`).join('') : '<p class="muted">Ainda sem visitas no período.</p>'}
      <p class="muted" style="font-size:13px;margin-top:8px">Dica: no link da bio e dos anúncios, use o endereço com <b>?utm_source=instagram</b> no fim para separar certinho.</p>
    </div>
    <div class="bloco"><h2>Agora no site <small>últimos 4 min</small></h2>
      ${online.length ? online.slice(0, 10).map((v) => `<div class="linha"><div class="m"><div class="t">${esc(v.nome || 'Visitante')} <span class="muted" style="font-weight:400;font-size:13px">${esc(v.aparelho || '')}</span></div><div class="s">Em: ${esc(v.pagina || 'Início')}${v.sacola?.length ? ` · ${v.sacola.reduce((t, i) => t + i.qtd, 0)} na sacola` : ''}</div></div><div class="v"><small>${esc(ORIGENS[v.origem] || '')}</small></div></div>`).join('') : '<p class="muted">Ninguém navegando agora.</p>'}
    </div>
    </div>
    <div style="height:24px"></div>`;
}

/* ---------- mensagem de recuperação no WhatsApp ---------- */
function abrirRecuperar(chave) {
  const [tipo, ...rest] = chave.split(':');
  const id = rest.join(':');
  const r = [...recuperaveis(), ...interessados()].find((x) => x.tipo === tipo && x.id === id);
  if (!r) return toast('Esse cliente já saiu da lista');
  const ativos = S.cupons.filter((k) => k.ativo !== false);
  const st = { modelo: r.itens ? 'lembrete' : 'cupom', cupom: ativos[0]?.codigo || '', texto: '' };
  const primeiro = (r.nome || '').trim().split(' ')[0];
  const nomeP = (pid, nome) => S.produtos.find((x) => x.id === pid)?.nome || nome || 'a peça';
  const itens = r.itens || [];
  const topVisto = r.vistos?.slice().sort((a, b) => b.n - a.n)[0];
  // link que remonta a sacola no aparelho do cliente (e já aplica o cupom)
  const linkVolta = (cod) => itens.length
    ? catalogo + '#volta/' + itens.map((i) => [i.id, i.tam, i.qtd].map((x) => encodeURIComponent(x)).join('~')).join(',') + (cod ? '/' + cod : '')
    : topVisto ? linkProduto(topVisto.id) : catalogo;
  const oQue = () => itens.length
    ? (itens.length === 1 ? `a *${nomeP(itens[0].id, itens[0].nome)}* (${itens[0].tam})` : `${itens.reduce((t, i) => t + i.qtd, 0)} peças`)
    : topVisto ? `a *${nomeP(topVisto.id)}*` : 'umas peças';
  const montar = () => {
    const k = ativos.find((x) => x.codigo === st.cupom);
    const oi = `Oi${primeiro ? ' ' + primeiro : ''}! Tudo bem? Aqui é da ${S.loja.nome}.`;
    const pagto = r.etapa === 'pagamento';
    if (st.modelo === 'lembrete')
      return `${oi}\n\nVi que você ${pagto ? 'começou o pagamento de' : itens.length ? 'separou' : 'olhou'} ${oQue()} no site e não finalizou. Ficou alguma dúvida de tamanho, frete ou pagamento? Posso te ajudar por aqui.\n\n${itens.length ? 'Sua sacola continua salva:' : 'O link:'} ${linkVolta('')}`;
    if (st.modelo === 'cupom')
      return `${oi}\n\nVi que você ${itens.length ? 'separou' : 'curtiu'} ${oQue()}. Pra te ajudar a fechar, liberei o cupom *${k?.codigo || 'CUPOM'}* com *${k?.pct || 10}% de desconto*${S.loja.pixDesconto ? ` (e no Pix ainda tem ${S.loja.pixDesconto}% a mais)` : ''}.\n\n${itens.length ? 'O link já abre sua sacola com o cupom aplicado:' : 'É só usar no pagamento:'} ${linkVolta(k?.codigo || '')}`;
    return `${oi}\n\n${itens.length ? `Separei aqui ${oQue()} pra você.` : `Ainda temos ${oQue()}.`} As peças estão saindo rápido e não consigo garantir o tamanho por muito tempo. Quer que eu reserve?\n\n${linkVolta('')}`;
  };
  const folha = $('#folha');
  const desenharF = () => {
    st.texto = montar();
    folha.innerHTML = `
      <div class="folha-h">Chamar ${esc(primeiro || 'cliente')}<button class="icon-btn" data-f="fechar" aria-label="Fechar">${ico('fechar')}</button></div>
      <div class="folha-c">
        <div class="muted" style="font-size:14px">${esc(fmtTel(r.whats))} · ${(ETAPA[r.etapa] || [''])[0]} ${quando(r.quando)}${r.valor ? ` · ${brl(r.valor)}` : ''}${r.contatos ? ` · já chamado ${r.contatos}x` : ''}</div>
        ${itens.length ? `<div style="margin-top:8px">${itens.map((i) => `<div class="linha" style="padding:6px 0"><img src="${S.produtos.find((x) => x.id === i.id)?.thumb || ''}" alt="" style="width:40px;height:40px"><div class="m"><div class="t" style="font-size:14px">${esc(nomeP(i.id, i.nome))}</div><div class="s" style="font-size:13px">${i.qtd}x · ${esc(i.tam)}${i.pers ? ` · ${esc(i.pers)}` : ''}</div></div></div>`).join('')}</div>` : ''}
        <div class="seg" style="margin-top:14px">${[['lembrete', 'Lembrete'], ['cupom', 'Com cupom'], ['urgencia', 'Últimas peças']].map(([k, n]) => `<button class="${st.modelo === k ? 'on' : ''}" data-modelo="${k}">${n}</button>`).join('')}</div>
        ${st.modelo === 'cupom' ? (ativos.length
          ? `<label class="campo"><span>Cupom</span><select class="in" id="rCupom">${ativos.map((k) => `<option value="${esc(k.codigo)}" ${st.cupom === k.codigo ? 'selected' : ''}>${esc(k.codigo)} · ${k.pct}%</option>`).join('')}</select></label>`
          : `<div class="campo"><span>Cupom</span><button class="btn sec mini" data-f="criarCupom" style="width:auto;padding:0 16px">Criar cupom VOLTA10 (10%)</button></div>`) : ''}
        <label class="campo"><span>Mensagem (pode editar)</span><textarea class="in" id="rTexto" style="height:190px">${esc(st.texto)}</textarea></label>
      </div>
      <div class="folha-f"><button class="btn" data-f="enviar">${icoWhats()} Abrir no WhatsApp</button>${r.contatadoEm ? '' : '<button class="btn sec" data-f="marcar" style="margin-top:8px">Já chamei por fora</button>'}</div>`;
  };
  desenharF();
  $('#veu').classList.add('on'); folha.classList.add('on');
  $('#veu').onclick = fechar;
  function fechar() { $('#veu').classList.remove('on'); folha.classList.remove('on'); }
  async function marcar() {
    const campos = { contatadoEm: Date.now(), contatos: (r.contatos || 0) + 1 };
    try {
      if (r.tipo === 'p') { await api.atualizarPedido(r.id, campos); Object.assign(S.pedidos.find((p) => p.id === r.id) || {}, campos); }
      else { await api.marcarVisitante(r.id, campos); Object.assign(S.visitantes.find((v) => v.id === r.id) || {}, campos); }
    } catch (e) { console.error(e); }
  }
  folha.oninput = (ev) => { if (ev.target.id === 'rTexto') st.texto = ev.target.value; };
  folha.onchange = (ev) => { if (ev.target.id === 'rCupom') { st.cupom = ev.target.value; desenharF(); } };
  folha.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.f === 'fechar') return fechar();
    if (b.dataset.modelo) { st.modelo = b.dataset.modelo; return desenharF(); }
    if (b.dataset.f === 'criarCupom') {
      b.disabled = true;
      const c = { codigo: 'VOLTA10', pct: 10, ativo: true, criadoEm: Date.now() };
      await api.salvarCupom(c); S.cupons = await api.cupons();
      ativos.splice(0, ativos.length, ...S.cupons.filter((k) => k.ativo !== false));
      st.cupom = 'VOLTA10'; toast('Cupom VOLTA10 criado'); return desenharF();
    }
    if (b.dataset.f === 'enviar') {
      const tel = soDigitos(r.whats);
      window.open(`https://wa.me/${tel.length <= 11 ? '55' + tel : tel}?text=${encodeURIComponent(st.texto)}`, '_blank', 'noopener');
      await marcar(); fechar(); desenhar();
      return toast('Marcado como chamado');
    }
    if (b.dataset.f === 'marcar') { await marcar(); fechar(); desenhar(); return toast('Marcado como chamado'); }
  };
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
  const et = p.etiqueta || {};
  const blocoEtiqueta = p.frete?.tipo === 'transportadora' && ['pago', 'enviado'].includes(p.status) ? `
      <div class="ped-b"><span>Etiqueta do Melhor Envio</span>
        ${et.url ? `<b>Pronta${et.custo ? ` · paga ${brl(et.custo)}` : ''}</b>${et.rastreio ? `<div class="muted">Rastreio ${esc(et.rastreio)}</div>` : ''}
          <a class="btn sec mini" href="${esc(et.url)}" target="_blank" rel="noopener" style="margin-top:10px">${ico('caixa', 18)} Imprimir etiqueta</a>`
        : et.demo ? `<b>Gerada (simulação)</b><div class="muted" style="font-size:14px">Rastreio ${esc(et.rastreio)}. Com o servidor ligado, aqui aparece o botão para imprimir.</div>`
        : `<div class="muted" style="font-size:14px">Compra a etiqueta ${esc(p.frete.nome)} com o saldo da carteira do Melhor Envio, gera o PDF para imprimir e já preenche o rastreio.${et.meId ? ' Da última vez ficou pela metade: tocar de novo continua de onde parou, sem pagar duas vezes.' : ''}</div>
          <button class="btn mini" data-x="etiqueta" style="margin-top:10px">${ico('caixa', 18)} ${et.meId ? 'Continuar etiqueta' : 'Gerar etiqueta'}</button>`}
      </div>` : '';
  pg.innerHTML = `
    <div class="pg-top"><button class="icon-btn" data-x="fechar" aria-label="Fechar">${ico('fechar')}</button><b>Pedido ${esc(p.id)}</b><span style="width:44px"></span></div>
    <div class="cnt">
      ${p.obs ? `<div class="alerta" style="margin:0 0 12px"><span class="ic a">${ico('alerta')}</span><span class="m">${esc(p.obs)}</span></div>` : ''}
      ${p.itens.some((i) => i.pers) ? `<div class="alerta" style="margin:0 0 12px"><span class="ic k">${ico('camisa')}</span><span class="m">Tem peça para personalizar<small>Confira nome e número nos itens</small></span></div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 14px">${badgeSt(p.status)}<span class="muted" style="font-size:14px">${new Date(p.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="ped-b"><span>Cliente</span><b>${esc(p.cliente.nome)}</b><div class="muted">${esc(fmtTel(p.cliente.telefone))}</div>
        <a class="btn sec mini" style="margin-top:10px" href="${wa(`Olá, ${nome1}! Aqui é da ${S.loja.nome}, sobre o seu pedido ${p.id}.`)}" target="_blank" rel="noopener">${icoWhats(18)} Chamar no WhatsApp</a></div>
      <div class="ped-b"><span>Entrega</span><b>${esc(p.frete?.nome || '')}${p.frete?.empresa ? ` · ${esc(p.frete.empresa)}` : ''}</b>
        ${e ? `<div style="white-space:pre-line;margin-top:4px">${esc(endTxt)}</div><button class="btn sec mini" data-x="copiarEnd" style="margin-top:10px">${ico('copiar', 18)} Copiar endereço</button>` : `<div class="muted">${retirada ? 'O cliente vai retirar na loja' : ''}</div>`}
        ${p.rastreio ? `<div style="margin-top:10px">Rastreio: <b>${esc(p.rastreio)}</b></div>` : ''}</div>
      <div class="ped-b"><span>Itens</span>
        ${p.itens.map((i) => { const x = S.produtos.find((y) => y.id === i.id); return `<div class="linha" style="padding:10px 0"><img src="${x?.thumb || ''}" alt=""><div class="m"><div class="t">${esc(i.nome)}</div><div class="s">Tamanho ${esc(i.tam)} · ${i.qtd}x ${brl(i.preco)}${i.cheio && i.cheio !== i.preco ? ` <s style="color:var(--tx3)">${brl(i.cheio)}</s>` : ''}</div>${i.pers ? `<div class="s" style="color:var(--tx);font-weight:600">Personalizar: ${esc([i.pers.nome, i.pers.numero].filter(Boolean).join(' · '))}</div>` : ''}</div><div class="v">${brl(i.preco * i.qtd)}</div></div>`; }).join('')}
        ${p.desconto ? `<div class="ped-l" style="color:var(--ok)"><span>${p.cupom ? `Cupom ${esc(p.cupom.codigo)} (${p.cupom.pct}%)` : 'Desconto por quantidade'}</span><span>− ${brl(p.desconto)}</span></div>` : ''}
        ${p.descontoPix ? `<div class="ped-l" style="color:var(--ok)"><span>Desconto no Pix</span><span>− ${brl(p.descontoPix)}</span></div>` : ''}
        <div class="ped-l"><span>Frete</span><span>${p.frete?.preco ? brl(p.frete.preco) : 'Grátis'}</span></div>
        <div class="ped-l t"><span>Total</span><span>${brl(p.total)}</span></div>
        ${metodoTxt(p.pagamento) ? `<div class="ped-l"><span>Pagamento</span><span>${metodoTxt(p.pagamento)}</span></div>` : ''}
        ${p.pagamento?.recibo ? `<a href="${esc(p.pagamento.recibo)}" target="_blank" rel="noopener" style="text-decoration:underline;font-size:14px">Ver comprovante</a>` : ''}</div>
      ${blocoEtiqueta}
      ${p.status === 'pago' ? `
        ${retirada ? '' : `<label class="campo"><span>Código de rastreio (opcional)</span><input class="in" id="pRastreio" value="${esc(p.rastreio || et.rastreio || '')}" placeholder="Ex.: AA123456789BR"></label>`}
        <button class="btn" data-x="enviado" style="margin-top:8px">${retirada ? 'Marcar como retirado' : 'Marcar como enviado e avisar o cliente'}</button>` : ''}
      ${p.status === 'enviado' ? '<button class="btn" data-x="entregue">Marcar como entregue</button>' : ''}
      ${p.status === 'aguardando' ? `<p class="muted" style="font-size:14px">O cliente ainda não pagou. Se ele desistir, cancele para não ficar na lista.</p>${p.linkPagamento ? `<button class="btn sec" data-x="copiarLink" style="margin-top:10px">${ico('link', 18)} Copiar link de pagamento</button>` : ''}<button class="perigo" data-x="cancelar">Cancelar pedido</button>` : ''}
    </div>`;
  pg.classList.remove('sai'); pg.classList.add('on'); pg.scrollTop = 0; document.body.style.overflow = 'hidden';
  pg.onclick = async (ev) => {
    const b = ev.target.closest('[data-x]');
    if (!b) return;
    const x = b.dataset.x;
    if (x === 'fechar') return fecharPagina();
    if (x === 'copiarEnd') return copiar(`${p.cliente.nome}\n${endTxt}`, 'Endereço copiado');
    if (x === 'copiarLink') return copiar(p.linkPagamento, 'Link de pagamento copiado');
    if (x === 'etiqueta') {
      if (!et.meId && !confirm(`Comprar a etiqueta ${p.frete.nome} no Melhor Envio?\nO valor sai do saldo da carteira do Melhor Envio${p.frete.preco ? ` (o cliente pagou ${brl(p.frete.preco)} de frete)` : ''}.`)) return;
      b.disabled = true; b.textContent = 'Gerando a etiqueta…';
      try { await gerarEtiqueta(api, p.id); toast('Etiqueta pronta'); }
      catch (err) { alert(err.message); }
      await recarregar();
      return abrirPedido(p.id);
    }
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
    <div style="padding:10px 16px 0"><button class="btn sec" data-acao="lote">${ico('camera', 18)} Cadastrar várias de uma vez</button></div>
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

/* ---------- cadastro em lote ---------- */
// Escolhe várias fotos de uma vez: cada foto vira um produto. O que vale para todas
// (categoria, marca, preço, custo, tamanhos) é preenchido uma vez só, no topo.
const LOTE_KEY = 'b13-lote';
function lote() {
  let lembrado = {};
  try { lembrado = JSON.parse(localStorage.getItem(LOTE_KEY)) || {}; } catch {}
  const g = { categoria: 'camisa', versao: '', marca: '', preco: 0, custo: 0, grade: {}, ...lembrado };
  const itens = []; // { fotos: [{full, thumb}], nome, time, preco }
  let salvando = false;
  const pg = $('#pagina');
  const marcas = [...new Set(S.produtos.map((p) => p.marca).filter(Boolean))].sort();
  const times = [...new Set(S.produtos.map((p) => p.time).filter(Boolean))].sort();
  const totTxt = () => (somaGrade(g.grade) ? `${somaGrade(g.grade)} ${somaGrade(g.grade) === 1 ? 'peça' : 'peças'} em estoque de cada` : 'toque nos tamanhos que tem');
  const um = () => CATEGORIAS.find((c) => c.id === g.categoria)?.um || '';
  const sugestao = (it) => (it.time ? `${um()} ${it.time}` : '');
  // grade de tamanhos com quantidade digitável. esc: 'g' = vale para todas; número = só aquela peça
  const gradeDe = (sc) => (sc === 'g' ? g.grade : itens[sc].grade);
  const somaGrade = (gr) => Object.values(gr).reduce((t, q) => t + (q || 0), 0);
  const resumoGrade = (gr) => TAMANHOS[g.categoria].filter((t) => gr[t] !== undefined).map((t) => `${t} ${gr[t]}`).join(' · ');
  const gradeHtml = (sc) => {
    const gr = gradeDe(sc);
    const usados = TAMANHOS[g.categoria].filter((t) => gr[t] !== undefined);
    return `${usados.map((t) => `
      <div class="var"><span class="tm">${esc(t)}</span><span class="st"></span>
        <div class="step"><button data-gs="${sc}" data-t="${esc(t)}" data-d="-1" aria-label="Menos">−</button><input data-gq="${sc}" data-t="${esc(t)}" inputmode="numeric" value="${gr[t]}"><button data-gs="${sc}" data-t="${esc(t)}" data-d="1" aria-label="Mais">+</button></div>
        <button class="icon-btn rm" data-grm="${sc}" data-t="${esc(t)}" aria-label="Tirar tamanho">${ico('fechar', 18)}</button></div>`).join('')}
      <div class="chips" style="padding:8px 0 0;flex-wrap:wrap">${TAMANHOS[g.categoria].filter((t) => gr[t] === undefined).map((t) => `<button class="chip" data-gadd="${sc}" data-t="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>`;
  };
  const it0 = (i) => (itens[i].grade ? `A peça ${i + 1} está sem quantidade` : 'Coloque os tamanhos e a quantidade lá em cima');
  const itemHtml = (it, i) => `
    <div class="lote-it" data-i="${i}">
      <div class="lote-f"><img src="${it.fotos[0].thumb}" alt="">${it.fotos.length > 1 ? `<span class="capa">${it.fotos.length} fotos</span>` : ''}</div>
      <div class="lote-c">
        <input class="in" data-n="nome" value="${esc(it.nome)}" placeholder="${esc(sugestao(it) || 'Nome da peça')}">
        <div class="dupla"><input class="in" data-n="time" value="${esc(it.time)}" list="dlTimesL" placeholder="Time (opcional)"><input class="in" data-n="preco" inputmode="decimal" value="${fmtNum(it.preco)}" placeholder="${g.preco ? 'Preço ' + fmtNum(g.preco) : 'Preço'}"></div>
        ${it.grade
          ? `<div class="lote-g"><div class="lote-gt">Tamanhos só desta peça <button data-padrao="${i}">Usar os de cima</button></div><div id="grade-${i}">${gradeHtml(i)}</div></div>`
          : `<div class="lote-gt">${somaGrade(g.grade) ? esc(resumoGrade(g.grade)) : 'Sem tamanhos ainda'} <button data-mudar="${i}">Mudar só desta</button></div>`}
        <div class="lote-a">${i > 0 ? `<button data-juntar="${i}">${ico('link', 15)} Mesma peça da de cima</button>` : '<span></span>'}<button data-tirar="${i}">${ico('lixo', 15)} Tirar</button></div>
      </div>
    </div>`;

  function desenharLote() {
    pg.innerHTML = `
      <div class="pg-top"><button class="icon-btn" data-x="fechar" aria-label="Fechar">${ico('fechar')}</button><b>Cadastrar várias</b><span style="width:44px"></span></div>
      <div class="cnt">
        <h3 class="lote-h">1. Vale para todas</h3>
        <div class="campo"><span>Categoria</span><div class="seg" id="lCat">${CATEGORIAS.map((c) => `<button class="${g.categoria === c.id ? 'on' : ''}" data-cat="${c.id}">${c.nome}</button>`).join('')}</div></div>
        <div class="tripla">
          <label class="campo"><span>Preço</span><input class="in" data-g="preco" inputmode="decimal" value="${fmtNum(g.preco)}" placeholder="0,00"></label>
          <label class="campo"><span>Custo</span><input class="in" data-g="custo" inputmode="decimal" value="${fmtNum(g.custo)}" placeholder="Opcional"></label>
          <label class="campo"><span>Marca</span><input class="in" data-g="marca" value="${esc(g.marca)}" list="dlMarcasL" placeholder="Opcional"></label>
        </div>
        <label class="campo" id="lVersaoW" ${g.categoria === 'camisa' ? '' : 'hidden'}><span>Versão</span><select class="in" data-g="versao">${['', ...VERSOES].map((x) => `<option value="${x}" ${g.versao === x ? 'selected' : ''}>${x || 'Não informar'}</option>`).join('')}</select></label>
        <datalist id="dlMarcasL">${marcas.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
        <datalist id="dlTimesL">${times.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
        <div class="campo"><span>Tamanhos e quantidade de cada peça <small class="muted" id="lGradeTot">${totTxt()}</small></span>
          <div id="grade-g">${gradeHtml('g')}</div>
          <div class="dupla" style="margin-top:8px"><button class="btn sec mini" data-x="gradeCheia">Grade completa</button><button class="btn sec mini" data-x="gradeZera">Limpar</button></div>
        </div>

        <h3 class="lote-h">2. Fotos <small class="muted">uma foto = uma peça</small></h3>
        <label class="btn" style="margin-bottom:6px;cursor:pointer">${ico('camera', 18)} ${itens.length ? 'Adicionar mais fotos' : 'Escolher as fotos'}<input type="file" accept="image/*" multiple id="lFile" hidden></label>
        <p class="muted" style="font-size:13px;margin-bottom:10px">Se uma peça tiver mais de uma foto, toque em "Mesma peça da de cima". O nome pode ficar vazio se você puser o time: vira "${esc(um())} + time".</p>
        <div id="lItens">${itens.map(itemHtml).join('')}</div>
      </div>
      <div class="cta" style="margin:0"><button class="btn" data-x="salvar" ${itens.length ? '' : 'disabled'}>${itens.length ? `Salvar ${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'}` : 'Escolha as fotos'}</button></div>`;
  }
  const atualizarCta = () => {
    const b = $('[data-x="salvar"]', pg);
    if (salvando || !b) return;
    b.disabled = !itens.length;
    b.textContent = itens.length ? `Salvar ${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'}` : 'Escolha as fotos';
  };
  const redesenharItens = () => { $('#lItens', pg).innerHTML = itens.map(itemHtml).join(''); atualizarCta(); };
  // redesenha a grade mexida; a de cima também atualiza o resumo das peças que usam ela
  const redesenharGrade = (sc = 'g') => {
    const el = $(`#grade-${sc}`, pg);
    if (el) el.innerHTML = gradeHtml(sc);
    if (sc === 'g') { $('#lGradeTot', pg).textContent = totTxt(); atualizarResumos(); }
  };
  const atualizarResumos = () => pg.querySelectorAll('.lote-it').forEach((el) => {
    const it = itens[+el.dataset.i];
    const r = !it?.grade && el.querySelector('.lote-gt');
    if (r) r.firstChild.textContent = (somaGrade(g.grade) ? resumoGrade(g.grade) : 'Sem tamanhos ainda') + ' ';
  });
  const lembrar = () => { try { localStorage.setItem(LOTE_KEY, JSON.stringify({ categoria: g.categoria, versao: g.versao, marca: g.marca, preco: g.preco, custo: g.custo, grade: g.grade })); } catch {} };

  desenharLote();
  pg.classList.remove('sai'); pg.classList.add('on'); pg.scrollTop = 0; document.body.style.overflow = 'hidden';

  pg.oninput = (ev) => {
    const k = ev.target.dataset.g, n = ev.target.dataset.n;
    if (k) {
      g[k] = k === 'marca' || k === 'versao' ? ev.target.value : num(ev.target.value);
      if (k === 'preco') pg.querySelectorAll('[data-n="preco"]').forEach((x) => (x.placeholder = g.preco ? 'Preço ' + fmtNum(g.preco) : 'Preço'));
    }
    if (ev.target.dataset.gq !== undefined) {
      const sc = ev.target.dataset.gq === 'g' ? 'g' : +ev.target.dataset.gq;
      gradeDe(sc)[ev.target.dataset.t] = Math.min(999, Math.max(0, parseInt(ev.target.value) || 0));
      if (sc === 'g') { $('#lGradeTot', pg).textContent = totTxt(); atualizarResumos(); }
      return;
    }
    if (n) {
      const it = itens[+ev.target.closest('.lote-it').dataset.i];
      it[n] = n === 'preco' ? num(ev.target.value) : ev.target.value;
      if (n === 'time') ev.target.closest('.lote-it').querySelector('[data-n="nome"]').placeholder = sugestao(it) || 'Nome da peça';
    }
  };
  pg.onchange = async (ev) => {
    if (ev.target.id !== 'lFile') return;
    const files = [...ev.target.files].slice(0, 40 - itens.length);
    ev.target.value = '';
    if (!files.length) return toast('Até 40 peças por vez');
    for (const [k, file] of files.entries()) {
      toast(`Preparando foto ${k + 1} de ${files.length}…`);
      try { itens.push({ fotos: [{ full: await comprimir(file, 1200, 0.8), thumb: await comprimir(file, 600, 0.72) }], nome: '', time: '', preco: 0, grade: null }); }
      catch { toast('Não deu para ler uma das fotos'); }
      redesenharItens();
    }
    desenharLote();
  };
  pg.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b || salvando) return;
    const d = b.dataset;
    if (d.cat) {
      if (g.categoria === d.cat) return;
      g.categoria = d.cat; g.grade = {}; itens.forEach((it) => (it.grade = null));
      pg.querySelectorAll('#lCat button').forEach((x) => x.classList.toggle('on', x.dataset.cat === d.cat));
      $('#lVersaoW', pg).hidden = d.cat !== 'camisa';
      redesenharGrade(); redesenharItens(); return;
    }
    const sc = (v) => (v === 'g' ? 'g' : +v);
    if (d.gadd !== undefined) { gradeDe(sc(d.gadd))[d.t] = 1; redesenharGrade(sc(d.gadd)); return; }
    if (d.grm !== undefined) { delete gradeDe(sc(d.grm))[d.t]; redesenharGrade(sc(d.grm)); return; }
    if (d.gs !== undefined) { const gr = gradeDe(sc(d.gs)); gr[d.t] = Math.min(999, Math.max(0, (gr[d.t] || 0) + +d.d)); redesenharGrade(sc(d.gs)); return; }
    if (d.mudar !== undefined) { itens[+d.mudar].grade = { ...g.grade }; redesenharItens(); return; }
    if (d.padrao !== undefined) { itens[+d.padrao].grade = null; redesenharItens(); return; }
    if (d.juntar) { const i = +d.juntar; itens[i - 1].fotos.push(...itens[i].fotos.slice(0, 6 - itens[i - 1].fotos.length)); itens.splice(i, 1); redesenharItens(); return; }
    if (d.tirar) { itens.splice(+d.tirar, 1); redesenharItens(); return; }
    const x = d.x;
    if (x === 'gradeCheia') { const padrao = g.categoria === 'camisa' ? ['P', 'M', 'G', 'GG'] : ['38', '39', '40', '41', '42', '43']; g.grade = Object.fromEntries(padrao.map((t) => [t, 1])); redesenharGrade(); return; }
    if (x === 'gradeZera') { g.grade = {}; redesenharGrade(); return; }
    if (x === 'fechar') { if (itens.length && !confirm('Sair sem salvar? As fotos escolhidas se perdem.')) return; return fecharPagina(); }
    if (x !== 'salvar') return;

    // confere antes de salvar qualquer coisa
    const semNome = itens.findIndex((it) => !(it.nome.trim() || sugestao(it)));
    if (semNome >= 0) { toast(`Falta o nome da peça ${semNome + 1}`); return pg.querySelector(`.lote-it[data-i="${semNome}"] [data-n="nome"]`)?.focus(); }
    const semPreco = itens.findIndex((it) => !(it.preco || g.preco));
    if (semPreco >= 0) return toast(g.preco ? `Falta o preço da peça ${semPreco + 1}` : 'Coloque o preço lá em cima (vale para todas)');
    const semGrade = itens.findIndex((it) => !somaGrade(it.grade || g.grade));
    if (semGrade >= 0) return toast(it0(semGrade));

    salvando = true; lembrar();
    const variacoesDe = (gr) => TAMANHOS[g.categoria].filter((t) => gr[t] > 0).map((t) => ({ tam: t, qtd: gr[t] }));
    let ok = 0, ultimoErro = null;
    for (let i = 0; i < itens.length; ) {
      const it = itens[i];
      b.disabled = true; b.textContent = `Salvando ${ok + 1} de ${ok + itens.length}…`;
      try {
        await comPrazo(api.salvarProduto({
          dados: { nome: it.nome.trim() || sugestao(it), categoria: g.categoria, versao: g.categoria === 'camisa' ? g.versao : '', time: it.time.trim(), marca: g.marca.trim(), descricao: '', preco: it.preco || g.preco, promo: null, variacoes: variacoesDe(it.grade || g.grade), visivel: true, destaque: false, esgotadoManual: false },
          custo: g.custo, fotos: it.fotos
        }), 40);
        itens.splice(i, 1); ok++;
      } catch (err) { console.error(err); ultimoErro = err; i++; }
    }
    salvando = false;
    await carregar();
    if (!itens.length) { fecharPagina(); desenhar(); return toast(`${ok} ${ok === 1 ? 'produto salvo' : 'produtos salvos'}`); }
    redesenharItens();
    toast(`${ok} salvos. ${itens.length} não salvaram. ${msgErro(ultimoErro)}`, 9000);
  };
}

/* ---------- editor de produto ---------- */
// base: cadastrar parecido (copia tudo menos nome, time, fotos e descrição)
async function editor(id, base = null) {
  const orig = id ? S.produtos.find((p) => p.id === id) : null;
  const e = orig
    ? { ...orig, variacoes: orig.variacoes.map((v) => ({ ...v })), custo: custoDe(id), fotos: [{ id: orig.fotoIds?.[0], full: orig.thumb, thumb: orig.thumb }] }
    : base
      ? { nome: '', categoria: base.categoria, versao: base.versao || '', time: '', marca: base.marca || '', descricao: '', preco: base.preco, promo: base.promo || null, custo: custoDe(base.id), variacoes: base.variacoes.map((v) => ({ tam: v.tam, qtd: Math.max(1, v.qtd) })), fotos: [], visivel: true, destaque: false, esgotadoManual: false }
      : { nome: '', categoria: 'camisa', time: '', marca: '', descricao: '', preco: 0, promo: null, custo: 0, variacoes: [], fotos: [], visivel: true, destaque: false, esgotadoManual: false };
  if (!orig) e.fotos = [];
  const pg = $('#pagina');
  const times = [...new Set(S.produtos.map((p) => p.time).filter(Boolean))].sort();
  const marcas = [...new Set(S.produtos.map((p) => p.marca).filter(Boolean))].sort();

  const html = () => `
    <div class="pg-top"><button class="icon-btn" data-x="fechar" aria-label="Fechar">${ico('fechar')}</button><b>${orig ? 'Editar produto' : base ? 'Produto parecido' : 'Novo produto'}</b><span style="width:44px"></span></div>
    <div class="cnt">
      ${orig ? `<button class="btn sec" data-x="parecido" style="margin-bottom:14px">${ico('copiar', 18)} Cadastrar outro parecido</button>` : ''}
      ${base ? `<p class="muted" style="font-size:14px;margin-bottom:12px">Copiei categoria, marca, preço, custo e tamanhos de "${esc(base.nome)}". Coloque a foto e o nome.</p>` : ''}
      <div class="campo"><span>Fotos</span><div class="fotos" id="eFotos">${fotosHtml()}</div></div>
      <label class="campo"><span>Nome</span><input class="in" data-k="nome" value="${esc(e.nome)}" placeholder="Ex.: Camisa Flamengo I 25/26"></label>
      <div class="campo"><span>Categoria</span><div class="seg" id="eCat">${CATEGORIAS.map((c) => `<button class="${e.categoria === c.id ? 'on' : ''}" data-cat="${c.id}">${c.nome}</button>`).join('')}</div></div>
      <div class="dupla">
        <label class="campo"><span>Time</span><input class="in" data-k="time" value="${esc(e.time)}" list="dlTimes" placeholder="Opcional"></label>
        <label class="campo"><span>Marca</span><input class="in" data-k="marca" value="${esc(e.marca)}" list="dlMarcas"></label>
      </div>
      <div class="dupla" id="eLigaW" ${e.categoria === 'camisa' ? '' : 'hidden'}>
        <label class="campo"><span>Liga</span><select class="in" data-k="liga" id="eLiga">${ligaOpts()}</select></label>
        <label class="campo"><span>Versão</span><select class="in" data-k="versao">${['', ...VERSOES].map((x) => `<option value="${x}" ${(e.versao || '') === x ? 'selected' : ''}>${x || 'Não informar'}</option>`).join('')}</select></label>
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

  function ligaOpts() {
    const auto = ligaAuto(e.time, e.nome);
    return ['', ...LIGAS].map((l) => `<option value="${esc(l)}" ${(e.liga || '') === l ? 'selected' : ''}>${l ? esc(l) : `Automática${auto ? ` (${esc(auto)})` : e.time ? ' (Outras)' : ''}`}</option>`).join('');
  }
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
  pg.classList.remove('sai'); pg.classList.add('on'); pg.scrollTop = 0; document.body.style.overflow = 'hidden';
  $('#eLucro', pg).innerHTML = lucroHtml();
  varsHtml();

  // fotos em alta resolução do produto existente
  if (orig) api.fotos(orig).then((fs) => { if (fs.length) { e.fotos = fs; $('#eFotos', pg).innerHTML = fotosHtml(); } });

  pg.oninput = (ev) => {
    const k = ev.target.dataset.k, q = ev.target.dataset.q;
    if (k) {
      e[k] = ['custo', 'preco', 'promo'].includes(k) ? num(ev.target.value) || (k === 'promo' ? null : 0) : ev.target.value;
      if (['custo', 'preco', 'promo'].includes(k)) $('#eLucro', pg).innerHTML = lucroHtml();
      if (k === 'time' || k === 'nome') $('#eLiga', pg).options[0].textContent = ligaOpts().match(/>([^<]*)<\/option>/)[1].replace(/&amp;/g, '&');
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
      $('#eLigaW', pg).hidden = d.cat !== 'camisa';
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
    else if (x === 'parecido') editor(null, orig);
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
          nome: e.nome.trim(), categoria: e.categoria, time: e.time.trim(), liga: e.categoria === 'camisa' ? e.liga || '' : '', versao: e.categoria === 'camisa' ? e.versao || '' : '', marca: e.marca.trim(), descricao: e.descricao.trim(),
          preco: e.preco, promo: e.promo && e.promo < e.preco ? e.promo : null, variacoes: e.variacoes,
          visivel: e.visivel !== false, destaque: !!e.destaque, esgotadoManual: !!e.esgotadoManual
        };
        await comPrazo(api.salvarProduto({ id: orig?.id, dados, custo: e.custo, fotos: e.fotos }), 40);
        fecharPagina(); toast('Produto salvo'); recarregar();
      } catch (err) {
        console.error(err); toast(msgErro(err), 8000);
        t.disabled = false; t.textContent = 'Salvar';
      }
    }
  };
}
// fecha a página com a animação de descida; depois() roda quando ela some
function fecharAnimado(pg, depois) {
  pg.classList.remove('on'); pg.classList.add('sai');
  setTimeout(() => { if (pg.classList.contains('sai')) { pg.classList.remove('sai'); depois?.(); } }, 260);
}
function fecharPagina() {
  const pg = $('#pagina');
  document.body.style.overflow = '';
  if (!pg.classList.contains('on')) { pg.innerHTML = ''; return; }
  fecharAnimado(pg, () => (pg.innerHTML = ''));
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

/* ---------- recursos de venda (o que os concorrentes de nicho fazem), todos opcionais ---------- */
// Cada recurso: { ativo, ate } e campos próprios. "ate" vazio = fica ligado até desligar.
function recursosHtml(c) {
  const v = c.vendas || {};
  const prog = c.progressivo || {};
  const pers = persDe(c);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const rec = (id, titulo, desc, x, corpo = '', comData = true) => {
    const venceu = x?.ativo && x.ate && !ligado(x);
    return `<div class="rec ${x?.ativo ? 'on' : ''}">
      <label class="sw"><span><b>${titulo}</b><small>${desc}</small></span><input type="checkbox" id="${id}On" ${x?.ativo ? 'checked' : ''}></label>
      <div class="rec-c">
        ${comData ? `<label class="campo"><span>Ligado até (opcional, para uma ação)</span><input class="in" type="date" id="${id}Ate" min="${hojeIso}" value="${esc(x?.ate || '')}"></label>` : ''}
        ${venceu ? `<p class="rec-venceu">Terminou em ${x.ate.split('-').reverse().join('/')}. Está desligado no site.</p>` : ''}
        ${corpo}
      </div></div>`;
  };
  const inp = (id, rot, val, ph = '', extra = '') => `<label class="campo"><span>${rot}</span><input class="in" id="${id}" value="${esc(val ?? '')}" placeholder="${esc(ph)}" ${extra}></label>`;
  const msgs = v.faixa?.msgs || [];
  const fxs = prog.faixas || [];
  return `
      <h2 style="margin-top:28px">Recursos de venda</h2>
      <p class="muted" style="font-size:14px;margin-bottom:10px">O que as lojas de camisa que mais vendem usam. Tudo opcional: ligue sempre, só numa ação (com data para desligar sozinho) ou deixe desligado.</p>

      ${rec('rcFaixa', 'Faixa de avisos no topo', 'Cupom, Pix, frete ou combo numa faixa fixa em cima do site. As frases se alternam.', v.faixa, `
        ${[0, 1, 2].map((i) => inp('rcFaixaM' + i, `Frase ${i + 1}`, msgs[i], ['Ex.: 10% OFF na 1ª compra com o cupom B13PRIMEIRA', 'Ex.: 10% de desconto no Pix', 'Ex.: Leve 3, pague 2 em todas as camisas'][i], 'maxlength="80"')).join('')}
        <button class="btn sec mini" data-l="sugerirFaixa" style="width:auto;padding:0 16px;margin-top:10px">Sugerir com o que está ligado</button>`)}

      ${rec('rcCombo', 'Combo "leve mais, pague menos"', 'O truque número 1 do nicho. Desconto automático pela quantidade de peças. Não soma com cupom: vale o maior.', prog, `
        ${[0, 1, 2].map((n) => { const fx = fxs[n] || {}; const tipo = fx.pague ? 'pague' : 'pct'; return `<div class="faixa-prog"><span>Levando</span><input class="in" id="cProgQ${n}" inputmode="numeric" value="${fx.qtd || ''}" placeholder="${n ? '' : 3}"><select class="in" id="cProgT${n}"><option value="pague" ${tipo === 'pague' ? 'selected' : ''}>paga</option><option value="pct" ${tipo === 'pct' ? 'selected' : ''}>ganha %</option></select><input class="in" id="cProgV${n}" inputmode="numeric" value="${fx.pague || fx.pct || ''}" placeholder="${n ? '' : 2}"></div>`; }).join('')}
        <div class="chips" style="padding:8px 0 0"><button class="chip" data-l="combo" data-v="3:2">Leve 3, pague 2</button><button class="chip" data-l="combo" data-v="5:3">Leve 5, pague 3</button><button class="chip" data-l="combo" data-v="2:10">Leve 2, ganhe 10%</button></div>
        <label class="sw"><span>Selo do combo em todos os produtos<small>Ex.: "Leve 3, pague 2" no card e "sai R$ X cada" na página</small></span><input type="checkbox" id="cProgSelo" ${prog.selo !== false ? 'checked' : ''}></label>`)}

      ${rec('rcPix', 'Selo de desconto no Pix', `"${Number(c.pixDesconto) || 'X'}% OFF no Pix" no card de cada produto. O desconto em si é o de Pagamento online.`, v.pixSelo)}

      ${rec('cPers', 'Personalização (nome e número)', 'Upsell de maior margem do nicho. Toda camisa ganha a opção de personalizar.', pers, `
        <div class="dupla">
          ${inp('cPersPreco', 'Preço do nome e número', fmtNum(Number(pers.preco) || 0), '30,00', 'inputmode="decimal"')}
          ${inp('cPersMax', 'Letras no nome (máx.)', pers.maxNome, '12', 'inputmode="numeric"')}
        </div>
        ${inp('cPersDias', 'Prazo a mais para personalizada (dias úteis)', pers.dias || '', 'Ex.: 2', 'inputmode="numeric"')}
        <label class="sw"><span>Oferecer patch<small>Ex.: Brasileirão, Libertadores, Champions. O cliente escolhe um.</small></span><input type="checkbox" id="cPatchOn" ${pers.patch?.ativo ? 'checked' : ''}></label>
        <div class="dupla">
          ${inp('cPatchPreco', 'Preço do patch', fmtNum(Number(pers.patch?.preco) || 0), '25,00', 'inputmode="decimal"')}
          ${inp('cPatchNomes', 'Patches (separe por vírgula)', pers.patch?.nomes || '', 'Brasileirão, Libertadores')}
        </div>`)}

      ${rec('rcProva', 'Prova social (contra o medo de golpe)', 'Fotos de clientes e de pedidos enviados, número de pedidos e tempo de loja. Aparece no início e no produto.', v.prova, `
        ${inp('rcProvaTit', 'Título da seção', v.prova?.titulo, 'Clientes B13')}
        <div class="dupla">
          ${inp('rcProvaPed', 'Pedidos enviados (só se for real)', v.prova?.pedidos, 'Ex.: +1.200')}
          ${inp('rcProvaDesde', 'Loja desde', v.prova?.desde, 'Ex.: 2019')}
        </div>
        <div class="dupla">
          ${inp('rcProvaCnpj', 'CNPJ (opcional)', v.prova?.cnpj, '00.000.000/0001-00')}
          ${inp('rcProvaRA', 'Link do Reclame Aqui (opcional)', v.prova?.reclame, 'https://www.reclameaqui.com.br/empresa/...')}
        </div>
        <div class="campo"><span>Fotos (clientes vestindo, pacotes, prints com autorização)</span><div class="fotos" id="provaFotos">${provaFotosHtml()}</div></div>`)}

      ${rec('rcPrazo', 'Prazo e pronta entrega', 'Diz quando o pedido sai. Bate o prazo de 15 a 25 dias dos importadores.', v.prazo, `
        ${inp('rcPrazoTxt', 'Frase do prazo', v.prazo?.texto, 'Ex.: Pronta entrega: enviamos em até 2 dias úteis')}
        <label class="sw"><span>Selo "Pronta entrega" nos produtos com estoque</span><input type="checkbox" id="rcPronta" ${v.prazo?.pronta ? 'checked' : ''}></label>`, false)}

      ${rec('rcTrocas', 'Política de troca em destaque', 'Tira o maior medo: errar o tamanho. Aparece no produto e na sacola.', v.trocas, `
        ${inp('rcTrocasTxt', 'Frase', v.trocas?.texto, 'Ex.: 1ª troca de tamanho grátis em até 7 dias')}`, false)}

      ${rec('rcDuvida', 'Botão "dúvida no tamanho?"', 'Atalho para o WhatsApp dentro da página do produto, já com o nome da camisa.', v.duvida, `
        ${inp('rcDuvidaTxt', 'Texto do botão', v.duvida?.texto, 'Dúvida no tamanho? Chama no WhatsApp')}`, false)}

      ${rec('rcGuia', 'Dica de tamanho da versão jogador', 'Aparece no produto e no guia de tamanhos das camisas versão jogador.', v.guia, `
        ${inp('rcGuiaTxt', 'Dica', v.guia?.dica, 'A versão jogador veste justa: pegue 1 tamanho acima')}`, false)}

      ${rec('rcCol', 'Coleções (retrô por memória)', 'Atalhos no início do site, como "Copa de 2002" ou "Ídolos". Cada linha: nome da coleção, dois-pontos e as palavras que acham as camisas.', v.colecoes, `
        <label class="campo"><span>Coleções (uma por linha)</span><textarea class="in" id="rcColTxt" placeholder="Copa de 2002: 2002&#10;Anos 90: 1990, 1994, 1998&#10;Ídolos: Ronaldo, Romário, Zico">${esc(v.colecoes?.texto || '')}</textarea></label>`)}

      ${rec('rcEsc', 'Avisos de estoque', '"Últimas unidades" e "restam só 2 nesse tamanho". Sempre com o estoque real.', { ativo: v.escassez?.ativo !== false }, '', false)}`;
}
function provaFotosHtml() {
  const ids = S.loja.vendas?.prova?.fotoIds || [];
  const fs = ids.map((id) => S.provaFotos?.[id]).filter(Boolean);
  return fs.map((f) => `<div class="foto"><img src="${f.thumb}" alt=""><button class="x" data-l="tirarFotoProva" data-v="${f.id}" aria-label="Tirar foto">${ico('fechar', 14)}</button></div>`).join('') +
    (ids.length < 12 ? `<label class="foto add">${ico('camera', 22)}<span>Adicionar</span><input type="file" accept="image/*" multiple id="provaInput"></label>` : '');
}
function lerRecursos(v) {
  const on = (id) => !!$('#' + id + 'On')?.checked;
  const ate = (id) => $('#' + id + 'Ate')?.value || '';
  const vendas = S.loja.vendas || {};
  const faixas = [0, 1, 2].map((n) => {
    const qtd = parseInt(v('cProgQ' + n)) || 0, val = parseInt(v('cProgV' + n)) || 0, tipo = $('#cProgT' + n).value;
    if (qtd < 2 || val <= 0) return null;
    if (tipo === 'pague') { if (val >= qtd) return null; return { qtd, pague: val, pct: Math.round((qtd - val) / qtd * 10000) / 100 }; }
    return { qtd, pct: Math.min(50, val) };
  }).filter(Boolean).filter((f) => f.pct <= 60);
  const colecoes = v('rcColTxt').split('\n').map((l) => { const [nome, ...t] = l.split(':'); return { nome: nome.trim().slice(0, 40), termos: t.join(':').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10) }; }).filter((x) => x.nome && x.termos.length).slice(0, 10);
  return {
    progressivo: { ativo: on('rcCombo'), ate: ate('rcCombo'), selo: $('#cProgSelo').checked, faixas },
    pers: { ativo: on('cPers'), ate: ate('cPers'), preco: num(v('cPersPreco')), maxNome: Math.min(15, Math.max(4, parseInt(v('cPersMax')) || 12)), dias: Math.min(30, Math.max(0, parseInt(v('cPersDias')) || 0)),
      patch: { ativo: $('#cPatchOn').checked, preco: num(v('cPatchPreco')), nomes: v('cPatchNomes').slice(0, 200) } },
    vendas: {
      faixa: { ativo: on('rcFaixa'), ate: ate('rcFaixa'), msgs: [0, 1, 2].map((i) => v('rcFaixaM' + i).slice(0, 80)).filter(Boolean) },
      pixSelo: { ativo: on('rcPix'), ate: ate('rcPix') },
      prova: { ativo: on('rcProva'), ate: ate('rcProva'), titulo: v('rcProvaTit').slice(0, 40), pedidos: v('rcProvaPed').slice(0, 20), desde: v('rcProvaDesde').slice(0, 10), cnpj: v('rcProvaCnpj').slice(0, 20), reclame: /^https:\/\//.test(v('rcProvaRA')) ? v('rcProvaRA').slice(0, 200) : '', fotoIds: vendas.prova?.fotoIds || [] },
      prazo: { ativo: on('rcPrazo'), texto: v('rcPrazoTxt').slice(0, 80), pronta: $('#rcPronta').checked },
      trocas: { ativo: on('rcTrocas'), texto: v('rcTrocasTxt').slice(0, 80) },
      duvida: { ativo: on('rcDuvida'), texto: v('rcDuvidaTxt').slice(0, 50) },
      guia: { ativo: on('rcGuia'), dica: v('rcGuiaTxt').slice(0, 120) },
      colecoes: { ativo: on('rcCol'), ate: ate('rcCol'), texto: v('rcColTxt').slice(0, 800), lista: colecoes },
      escassez: { ativo: on('rcEsc') }
    }
  };
}
// faixa do topo: sugere frases a partir do que já está ligado
function sugerirFaixa() {
  const c = S.loja, v = (id) => $('#' + id).value.trim();
  const ideias = [];
  const bv = c.boasVindas;
  const k = S.cupons.find((x) => x.codigo === bv?.cupom && x.ativo !== false);
  if (k) ideias.push(`${k.pct}% OFF na 1ª compra com o cupom ${k.codigo}`);
  const fx = (parseInt(v('cProgQ0')) || 0) > 1 && $('#rcComboOn').checked ? { qtd: parseInt(v('cProgQ0')), tipo: $('#cProgT0').value, val: parseInt(v('cProgV0')) } : null;
  if (fx) ideias.push(fx.tipo === 'pague' ? `Leve ${fx.qtd}, pague ${fx.val} em todo o site` : `Leve ${fx.qtd} peças e ganhe ${fx.val}% de desconto`);
  if (Number(c.pixDesconto)) ideias.push(`${c.pixDesconto}% de desconto no Pix`);
  if (Number(c.freteGratisAcima)) ideias.push(`Frete grátis acima de ${brl(Number(c.freteGratisAcima))}`);
  if ($('#rcPrazoOn').checked && v('rcPrazoTxt')) ideias.push(v('rcPrazoTxt'));
  if ($('#rcTrocasOn').checked && v('rcTrocasTxt')) ideias.push(v('rcTrocasTxt'));
  ideias.push(`Parcele em até ${Number(c.parcelasMax) || 12}x no cartão`);
  [0, 1, 2].forEach((i) => ($('#rcFaixaM' + i).value = ideias[i] || ''));
  $('#rcFaixaOn').checked = true;
  toast('Frases sugeridas. Confira e salve.');
}

// fotos da prova social: salvam na hora (não esperam o botão Salvar)
async function carregarFotosProva() {
  const ids = (S.loja.vendas?.prova?.fotoIds || []).filter((id) => !S.provaFotos?.[id]);
  if (!ids.length) return;
  (await api.fotosLoja(ids).catch(() => [])).forEach((f) => ((S.provaFotos ||= {})[f.id] = f));
  const el = $('#provaFotos'); if (el) el.innerHTML = provaFotosHtml();
}
async function salvarFotosProva(ids) {
  const vendas = { ...(S.loja.vendas || {}) };
  vendas.prova = { ...(vendas.prova || {}), fotoIds: ids };
  await api.salvarConfig({ vendas });
  S.loja.vendas = vendas;
  const el = $('#provaFotos'); if (el) el.innerHTML = provaFotosHtml();
}

/* ---------- loja ---------- */
// times e ligas que têm produto, para escolher a campanha
function alvosCampanha(atual = '') {
  const times = [...new Set(S.produtos.map((p) => p.time).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const ligas = LIGAS.filter((l) => S.produtos.some((p) => ligaDe(p) === l));
  const op = (v, rot) => `<option value="${esc(v)}" ${atual === v ? 'selected' : ''}>${esc(rot)}</option>`;
  return `${times.length ? `<optgroup label="Time">${times.map((t) => op('time:' + t, t)).join('')}</optgroup>` : ''}${ligas.length ? `<optgroup label="Liga">${ligas.map((l) => op('liga:' + l, l)).join('')}</optgroup>` : ''}`;
}
function cuponsHtml() {
  if (!S.cupons.length) return '<p class="muted" style="font-size:14px;padding:4px 0 10px">Nenhum cupom criado ainda.</p>';
  return S.cupons.map((k) => `
    <div class="cupom-it ${k.ativo === false ? 'off' : ''}">
      <b>${esc(k.codigo)}</b><span class="pct">${k.pct}% off</span>
      <label class="sw mini" title="Ligado"><input type="checkbox" data-cupomliga="${esc(k.codigo)}" ${k.ativo === false ? '' : 'checked'}></label>
      <button class="icon-btn" data-l="apagarCupom" data-cod="${esc(k.codigo)}" aria-label="Apagar cupom">${ico('lixo', 18)}</button>
    </div>`).join('');
}
function telaLoja() {
  const c = S.loja;
  const cpg = c.campanha || {};
  const prog = c.progressivo || {};
  const pers = persDe(c);
  const bv = c.boasVindas || {};
  const r = S.rem || {};
  setTimeout(() => {
    $('#listaCupons').addEventListener('change', async (ev) => {
      const cod = ev.target.dataset.cupomliga;
      if (!cod) return;
      const k = S.cupons.find((x) => x.codigo === cod);
      await api.salvarCupom({ ...k, ativo: ev.target.checked });
      S.cupons = await api.cupons(); $('#listaCupons').innerHTML = cuponsHtml();
      toast(ev.target.checked ? `Cupom ${cod} ligado` : `Cupom ${cod} desligado`);
    });
    carregarFotosProva();
    $('#app .adm').addEventListener('change', async (ev) => {
      if (ev.target.id !== 'provaInput') return;
      const arqs = [...ev.target.files].slice(0, 12);
      toast('Enviando fotos…');
      const novos = [];
      for (const f of arqs) {
        try {
          const [full, thumb] = await Promise.all([comprimir(f, 900, 0.72), comprimir(f, 360, 0.7)]);
          const id = await api.salvarFotoLoja({ full, thumb });
          (S.provaFotos ||= {})[id] = { id, full, thumb }; novos.push(id);
        } catch (e) { console.error(e); }
      }
      await salvarFotosProva([...(S.loja.vendas?.prova?.fotoIds || []), ...novos].slice(0, 12));
      toast(novos.length ? `${novos.length} ${novos.length === 1 ? 'foto adicionada' : 'fotos adicionadas'}` : 'Não deu para enviar as fotos');
    });
    $('#app .adm').addEventListener('change', (ev) => { const r = ev.target.closest('.rec'); if (r && ev.target.matches('.rec > .sw input')) r.classList.toggle('on', ev.target.checked); });
    $('#rCep').addEventListener('change', async () => {
      if (soDigitos($('#rCep').value).length !== 8) return;
      const e = await buscarEndereco($('#rCep').value);
      if (!e) return;
      [['rRua', e.rua], ['rBairro', e.bairro], ['rCidade', e.cidade], ['rUf', e.uf]].forEach(([id, val]) => { if (val && !$('#' + id).value.trim()) $('#' + id).value = val; });
    });
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
          valorEntregaLocal: num(v('cValLocal')), cepsLocais: v('cCepsLocais'), freteGratisAcima: num(v('cGratis')), parcelasSemJuros: Math.min(12, Math.max(0, parseInt(v('cParcelas')) || 0)),
          pixDesconto: Math.min(30, Math.max(0, parseInt(v('cPix')) || 0)), parcelasMax: Math.min(12, Math.max(1, parseInt(v('cParcMax')) || 12)),
          ...lerRecursos(v),
          boasVindas: { ativo: $('#cBvOn').checked, cupom: $('#cBvCupom').value, titulo: v('cBvTitulo'), texto: v('cBvTexto') },
          pixelMeta: soDigitos(v('cPixel')) };
        if (nova.boasVindas.ativo && !nova.boasVindas.cupom) return toast('Escolha o cupom da primeira compra');
        if (nova.progressivo.ativo && !nova.progressivo.faixas.length) return toast('Preencha pelo menos uma faixa do combo (ex.: levando 3, paga 2)');
        if (nova.pers.patch.ativo && !patchesDe(nova.pers).length) return toast('Escreva os nomes dos patches, separados por vírgula');
        if (nova.vendas.faixa.ativo && !nova.vendas.faixa.msgs.length) return toast('Escreva pelo menos uma frase para a faixa do topo');
        if (nova.vendas.colecoes.ativo && !nova.vendas.colecoes.lista.length) return toast('Escreva as coleções assim: Copa de 2002: 2002');
        nova.campanha = { ativa: $('#cpgAtiva').checked, alvo: $('#cpgAlvo').value, titulo: v('cpgTitulo'), texto: v('cpgTexto'), cupom: $('#cpgCupom').value };
        if (nova.campanha.ativa && !nova.campanha.alvo) return toast('Escolha o time ou a liga da campanha');
        if (nova.whatsapp.length < 12) return toast('Coloque o WhatsApp com DDI e DDD, ex.: 5573999999999');
        if (nova.cepOrigem && nova.cepOrigem.length !== 8) return toast('O CEP de origem precisa ter 8 números');
        if (nova.entregaLocal && !soDigitos(nova.cepsLocais)) return toast('Diga o começo dos CEPs da cidade para a entrega própria');
        const rem = { nome: v('rNome'), documento: soDigitos(v('rDoc')), ie: v('rIE'), telefone: soDigitos(v('rTel')), email: v('rEmail'), cep: soDigitos(v('rCep')),
          rua: v('rRua'), numero: v('rNum'), complemento: v('rComp'), bairro: v('rBairro'), cidade: v('rCidade'), uf: v('rUf').toUpperCase() };
        const remMudou = Object.keys(rem).some((k) => rem[k] !== (S.rem?.[k] ?? ''));
        if (rem.documento && ![11, 14].includes(rem.documento.length)) return toast('O CPF tem 11 números e o CNPJ tem 14');
        if (rem.cep && rem.cep.length !== 8) return toast('O CEP do remetente precisa ter 8 números');
        b.disabled = true; const txt = b.textContent; b.textContent = 'Salvando…';
        try {
          if (remMudou) {
            try { await comPrazo(api.salvarRemetente(rem)); }
            catch (err) { console.error(err); return toast('Não deu para salvar o remetente. ' + msgErro(err), 8000); }
          }
          await comPrazo(api.salvarConfig(nova));
        } catch (err) { console.error(err); return toast(msgErro(err), 8000); }
        finally { b.disabled = false; b.textContent = txt; }
        toast('Dados da loja salvos'); recarregar();
      }
      if (a === 'criarCupom') {
        const codigo = codigoCupom($('#cpCod').value), pct = parseInt($('#cpPct').value);
        if (codigo.length < 3) return toast('O código precisa ter pelo menos 3 letras ou números');
        if (!(pct >= 1 && pct <= 90)) return toast('A porcentagem vai de 1 a 90');
        if (S.cupons.some((k) => k.codigo === codigo) && !confirm(`O cupom ${codigo} já existe. Trocar para ${pct}%?`)) return;
        try { await api.salvarCupom({ codigo, pct, ativo: true }); }
        catch { return toast('Não deu para salvar. Atualize as regras do Firestore (README).'); }
        S.cupons = await api.cupons(); $('#listaCupons').innerHTML = cuponsHtml(); $('#cpCod').value = ''; $('#cpPct').value = '';
        return toast(`Cupom ${codigo} criado: ${pct}% de desconto`);
      }
      if (a === 'apagarCupom') {
        if (!confirm(`Apagar o cupom ${b.dataset.cod}? Quem tentar usar vai ver "cupom inválido".`)) return;
        await api.excluirCupom(b.dataset.cod); S.cupons = await api.cupons(); $('#listaCupons').innerHTML = cuponsHtml();
        return toast('Cupom apagado');
      }
      if (a === 'sugerirFaixa') return sugerirFaixa();
      if (a === 'combo') {
        const [q, val] = b.dataset.v.split(':').map(Number);
        const pague = val < q;
        $('#cProgQ0').value = q; $('#cProgT0').value = pague ? 'pague' : 'pct'; $('#cProgV0').value = val;
        [1, 2].forEach((n) => { $('#cProgQ' + n).value = ''; $('#cProgV' + n).value = ''; });
        $('#rcComboOn').checked = true;
        return toast('Combo preenchido. Salve para valer.');
      }
      if (a === 'tirarFotoProva') {
        const ids = (S.loja.vendas?.prova?.fotoIds || []).filter((x) => x !== b.dataset.v);
        await salvarFotosProva(ids); api.excluirFotoLoja(b.dataset.v).catch(() => {});
        return toast('Foto tirada');
      }
      if (a === 'copiarLeads') return copiar(S.leads.map((l) => `${l.nome || 'Sem nome'}\t${l.whats}\t${new Date(l.criadoEm).toLocaleDateString('pt-BR')}`).join('\n'), `${S.leads.length} contatos copiados. Cole numa planilha.`);
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
      <h2 style="margin-top:28px">Etiquetas (remetente)</h2>
      <p class="muted" style="font-size:14px;margin-bottom:10px">Quem envia o pacote. Vai impresso na etiqueta do Melhor Envio. Só o painel vê esses dados.</p>
      <label class="campo"><span>Nome ou razão social</span><input class="in" id="rNome" value="${esc(r.nome || '')}"></label>
      <div class="dupla">
        <label class="campo"><span>CPF ou CNPJ</span><input class="in" id="rDoc" inputmode="numeric" value="${esc(r.documento || '')}"></label>
        <label class="campo"><span>Inscrição estadual</span><input class="in" id="rIE" value="${esc(r.ie || '')}" placeholder="Só se for CNPJ"></label>
      </div>
      <div class="dupla">
        <label class="campo"><span>Telefone</span><input class="in" id="rTel" inputmode="tel" value="${esc(r.telefone || '')}" placeholder="(73) 99999-9999"></label>
        <label class="campo"><span>E-mail</span><input class="in" id="rEmail" type="email" value="${esc(r.email || '')}"></label>
      </div>
      <label class="campo"><span>CEP</span><input class="in" id="rCep" inputmode="numeric" value="${esc(r.cep || c.cepOrigem || '')}" placeholder="O mesmo de onde os pacotes saem"></label>
      <div class="dupla">
        <label class="campo"><span>Rua</span><input class="in" id="rRua" value="${esc(r.rua || '')}"></label>
        <label class="campo"><span>Número</span><input class="in" id="rNum" value="${esc(r.numero || '')}"></label>
      </div>
      <label class="campo"><span>Complemento</span><input class="in" id="rComp" value="${esc(r.complemento || '')}" placeholder="Opcional"></label>
      <label class="campo"><span>Bairro</span><input class="in" id="rBairro" value="${esc(r.bairro || '')}"></label>
      <div class="dupla">
        <label class="campo"><span>Cidade</span><input class="in" id="rCidade" value="${esc(r.cidade || '')}"></label>
        <label class="campo"><span>UF</span><input class="in" id="rUf" maxlength="2" value="${esc(r.uf || '')}"></label>
      </div>
      <h2 style="margin-top:28px">Pagamento online</h2>
      <p class="muted" style="font-size:14px;margin-bottom:10px">${pagamentoReal ? 'Ligado: o cliente paga com Pix ou cartão pela InfinitePay.' : 'Simulado por enquanto. Liga quando o servidor for configurado (servidor/LEIA-ME.md).'}</p>
      <div class="dupla">
        <label class="campo"><span>Desconto no Pix (%)</span><input class="in" id="cPix" inputmode="numeric" value="${Number(c.pixDesconto) || ''}" placeholder="Ex.: 5"></label>
        <label class="campo"><span>Parcelas no cartão (máx.)</span><input class="in" id="cParcMax" inputmode="numeric" value="${Number(c.parcelasMax) || 12}"></label>
      </div>
      <p class="muted" style="font-size:12px;margin:-4px 0 12px">O site mostra "R$ X no Pix" e "ou R$ Y em até 12x" em todos os produtos. 0 = sem desconto no Pix.</p>
      <label class="campo"><span>Parcelas sem juros para o cliente</span><input class="in" id="cParcelas" inputmode="numeric" value="${Number(c.parcelasSemJuros) || 0}" placeholder="0"><small class="muted" style="font-size:12px">A loja paga a taxa dessas parcelas. Precisa da chave de API da InfinitePay. 0 = o cliente paga os juros.</small></label>
      ${recursosHtml(c)}

      <h2 style="margin-top:28px">Cupom de primeira compra</h2>
      <p class="muted" style="font-size:14px;margin-bottom:10px">Uma janela aparece uma vez para quem entra no site: a pessoa deixa o WhatsApp e ganha o cupom. Crie o cupom antes, aqui embaixo em "Cupons de desconto".</p>
      <label class="sw"><span>Janela de primeira compra ligada</span><input type="checkbox" id="cBvOn" ${bv.ativo ? 'checked' : ''}></label>
      <label class="campo"><span>Cupom que a pessoa ganha</span><select class="in" id="cBvCupom"><option value="">Escolha…</option>${S.cupons.filter((k) => k.ativo !== false).map((k) => `<option value="${esc(k.codigo)}" ${bv.cupom === k.codigo ? 'selected' : ''}>${esc(k.codigo)} · ${k.pct}%</option>`).join('')}</select></label>
      <label class="campo"><span>Título da janela</span><input class="in" id="cBvTitulo" value="${esc(bv.titulo || '')}" placeholder="Ex.: Ganhe 10% na primeira compra"></label>
      <label class="campo"><span>Frase</span><input class="in" id="cBvTexto" value="${esc(bv.texto || '')}" placeholder="Ex.: Deixe seu WhatsApp e receba o cupom agora."></label>
      <div class="kpi" style="display:flex;align-items:center;gap:12px;margin-top:6px"><div style="flex:1"><span>Contatos recebidos</span><b style="font-size:22px">${S.leads.length}</b></div>${S.leads.length ? `<button class="btn sec mini" data-l="copiarLeads" style="width:auto;padding:0 16px">${ico('copiar', 16)} Copiar lista</button>` : ''}</div>

      <h2 style="margin-top:28px">Meta Pixel (anúncios)</h2>
      <p class="muted" style="font-size:14px;margin-bottom:10px">Com o ID do Pixel, o site avisa o Meta de cada visita, sacola, checkout e compra. Assim os anúncios aprendem quem compra.</p>
      <label class="campo"><span>ID do Pixel</span><input class="in" id="cPixel" inputmode="numeric" value="${esc(c.pixelMeta || '')}" placeholder="Só números, ex.: 123456789012345"></label>

      <h2 style="margin-top:28px">Campanha da vitrine</h2>
      <p class="muted" style="font-size:14px;margin-bottom:10px">Escolha um time ou uma liga para empurrar. O site abre com um banner dela e mostra essas peças primeiro.</p>
      <label class="sw"><span>Campanha ligada</span><input type="checkbox" id="cpgAtiva" ${cpg.ativa ? 'checked' : ''}></label>
      <label class="campo"><span>Destacar</span><select class="in" id="cpgAlvo"><option value="">Escolha…</option>${alvosCampanha(cpg.alvo)}</select></label>
      <label class="campo"><span>Título do banner</span><input class="in" id="cpgTitulo" value="${esc(cpg.titulo || '')}" placeholder="Ex.: Semana do Flamengo"></label>
      <label class="campo"><span>Frase</span><input class="in" id="cpgTexto" value="${esc(cpg.texto || '')}" placeholder="Ex.: Todas as camisas com 15% off"></label>
      <label class="campo"><span>Cupom no banner (opcional)</span><select class="in" id="cpgCupom"><option value="">Sem cupom</option>${S.cupons.filter((k) => k.ativo !== false).map((k) => `<option value="${esc(k.codigo)}" ${cpg.cupom === k.codigo ? 'selected' : ''}>${esc(k.codigo)} · ${k.pct}%</option>`).join('')}</select></label>
      <h2 style="margin-top:28px">Cupons de desconto</h2>
      <p class="muted" style="font-size:14px;margin-bottom:10px">O cliente digita o cupom na hora de pagar. O desconto vale sobre os produtos (o frete não entra).</p>
      <div id="listaCupons">${cuponsHtml()}</div>
      <div class="cupom-novo">
        <input class="in" id="cpCod" placeholder="Código, ex.: FLA15" autocapitalize="characters" autocomplete="off">
        <div class="cupom-pct"><input class="in" id="cpPct" inputmode="numeric" placeholder="10"><span>%</span></div>
        <button class="btn mini" data-l="criarCupom">Criar</button>
      </div>
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
