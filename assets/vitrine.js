import { abrir, esgotado, precoAtual, brl, esc, ico, icoWhats, CATEGORIAS, soDigitos, cpfValido, LIGAS, ligaDe, moverPilula, calcularPedido, faixaProgressiva, persDe, VERSOES, ligado, rotuloFaixa, patchesDe, precoComPers } from './data.js';
import { criar as criarServidor, buscarEndereco } from './servidor.js';
import { criarRastreio } from './rastreio.js';

const $ = (s) => document.querySelector(s);
const api = await abrir();
const loja = await api.config();
let produtos = (await api.produtos()).filter((p) => p.visivel !== false);
const f = { cat: '', tams: new Set(), times: new Set(), ligas: new Set(), versoes: new Set(), promo: false, q: '', ordem: '', col: null };
let aba = 'inicio';
const srv = criarServidor(api, loja, produtos);

// campanha da vitrine (painel > Loja): um time ou uma liga em destaque
const camp = loja.campanha?.ativa && loja.campanha.alvo ? (() => { const [tipo, ...v] = loja.campanha.alvo.split(':'); return { ...loja.campanha, tipo, valor: v.join(':') }; })() : null;
const naCampanha = (p) => !!camp && (camp.tipo === 'time' ? p.time === camp.valor : ligaDe(p) === camp.valor);
// ordem: campanha, destaques, depois mais novos; esgotados no fim
produtos.sort((a, b) => esgotado(a) - esgotado(b) || naCampanha(b) - naCampanha(a) || !!b.destaque - !!a.destaque || b.criadoEm - a.criadoEm);
const porId = (id) => produtos.find((p) => p.id === id);
const rs = criarRastreio(api, porId);
const emPromo = (p) => p.promo && p.promo < p.preco;

/* guardado no aparelho: favoritos e sacola */
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let favs = ler('b13-fav').filter(porId);
let sacola = ler('b13-sacola').filter((i) => porId(i.id));
const salvarFavs = () => gravar('b13-fav', favs);
const salvarSacola = (novo) => { gravar('b13-sacola', sacola); desenharAbas(); rs.sacola(sacola, novo); };
const estoqueDe = (p, tam) => (p.esgotadoManual ? 0 : p.variacoes.find((v) => v.tam === tam)?.qtd || 0);

document.title = `${loja.nome} | Catálogo`;
$('#btnBusca').innerHTML = ico('busca');
$('#qx').innerHTML = ico('fechar', 18);

function linkWhats(txt) {
  return `https://wa.me/${String(loja.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`;
}
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 1800);
}
// Pix e parcelas (painel > Loja > Pagamento)
const pixPct = () => Math.min(30, Math.max(0, Number(loja.pixDesconto) || 0));
const nParc = () => Math.min(12, Math.max(1, Number(loja.parcelasMax) || 12));
const semJuros = () => Math.min(nParc(), Number(loja.parcelasSemJuros) || 0);
const noPix = (v) => Math.round(v * (100 - pixPct())) / 100;
const parcTxt = (v) => (semJuros() > 1 ? `${semJuros()}x de ${brl(v / semJuros())} sem juros` : `em até ${nParc()}x no cartão`);
const totalEst = (p) => (p.esgotadoManual ? 0 : p.variacoes.reduce((t, v) => t + Math.max(0, v.qtd), 0));
const ultimas = (p) => escassez && !esgotado(p) && totalEst(p) <= 3;
// mais vendidos: os 6 primeiros com 2 ou mais vendas
const topVendidos = new Set(produtos.filter((p) => (p.vendidos || 0) >= 2).sort((a, b) => b.vendidos - a.vendidos).slice(0, 6).map((p) => p.id));
const tagDe = (p) => (esgotado(p) ? '<span class="tag cinza">Esgotado</span>' : emPromo(p) ? '<span class="tag">Promoção</span>' : ultimas(p) ? '<span class="tag">Últimas unidades</span>' : topVendidos.has(p.id) ? '<span class="tag azul">Mais vendido</span>' : p.destaque ? '<span class="tag cinza">Destaque</span>' : '');
function precoHtml(p, base = precoAtual(p)) {
  const de = emPromo(p) && base === precoAtual(p) ? `<s>${brl(p.preco)}</s>` : '';
  const cls = emPromo(p) ? 'pr' : '';
  if (!pixPct()) return `<div class="preco"><span class="${cls}">${brl(base)}</span>${de}</div><div class="parc">${parcTxt(base)}</div>`;
  return `<div class="preco"><span class="${cls}">${brl(noPix(base))}</span> <small class="nopix">no Pix</small>${de}</div><div class="parc">ou ${brl(base)} ${semJuros() > 1 ? 'em ' + parcTxt(base) : parcTxt(base)}</div>`;
}
const subDe = (p) => [CATEGORIAS.find((c) => c.id === p.categoria)?.um, p.time || p.marca, p.categoria === 'camisa' ? p.versao : ''].filter(Boolean).join(' · ');
const SELO = `<div class="selo">${ico('cadeado', 18)}<span><b>Pagamento seguro</b> · Pix e cartão pela InfinitePay</span></div>`;
// recursos de venda (painel > Loja > Recursos de venda): cada um liga, desliga ou vale até uma data
const V = loja.vendas || {};
const tem = (k) => ligado(V[k]);
const escassez = V.escassez?.ativo !== false;
const faixasCombo = ligado(loja.progressivo) ? (loja.progressivo.faixas || []).filter((x) => x.qtd > 1 && x.pct > 0).sort((a, b) => a.qtd - b.qtd) : [];
const comboSelo = faixasCombo.length && loja.progressivo.selo !== false ? faixasCombo[0] : null;
const prontaEntrega = tem('prazo') && V.prazo.pronta;
const colecoes = tem('colecoes') ? (V.colecoes.lista || []) : [];
const DICA_JOGADOR = tem('guia') && V.guia.dica ? V.guia.dica : 'A versão jogador é mais justa. Se gosta de folga, pegue um número acima.';
const TXT_DUVIDA = V.duvida?.texto || 'Dúvida no tamanho? Chama no WhatsApp';
// selinhos do card: combo, Pix, pronta entrega
function selosCard(p) {
  if (esgotado(p)) return '';
  const l = [];
  if (comboSelo) l.push(`<span class="sl combo">${esc(rotuloFaixa(comboSelo))}</span>`);
  if (tem('pixSelo') && pixPct()) l.push(`<span class="sl pix">${pixPct()}% OFF no Pix</span>`);
  if (prontaEntrega) l.push('<span class="sl">Pronta entrega</span>');
  return l.length ? `<div class="selos">${l.join('')}</div>` : '';
}

// Meta Pixel (painel > Loja). Só carrega se o lojista colocou o ID.
const PIXEL = String(loja.pixelMeta || '').replace(/\D/g, '');
if (PIXEL) {
  !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', PIXEL); fbq('track', 'PageView');
}
const px = (ev, dados) => { try { if (PIXEL && window.fbq) fbq('track', ev, { currency: 'BRL', ...dados }); } catch {} };

function card(p) {
  return `<a class="card ${esgotado(p) ? 'esg' : ''}" href="#p/${p.id}">
    <div class="ph"><img src="${p.thumb}" alt="${esc(p.nome)}" loading="lazy"></div>
    <div class="info">${tagDe(p)}<div class="nome">${esc(p.nome)}</div><div class="sub">${esc(subDe(p))}</div>${precoHtml(p)}${selosCard(p)}</div></a>`;
}

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function filtrar(ignorar) {
  const q = norm(f.q);
  return produtos.filter((p) => {
    if (f.cat && p.categoria !== f.cat) return false;
    if (q && !norm(`${p.nome} ${p.time} ${p.marca}`).includes(q)) return false;
    if (f.col && !f.col.termos.some((t) => norm(`${p.nome} ${p.time} ${p.descricao || ''}`).includes(norm(t)))) return false;
    if (ignorar === 'tudo') return true;
    if (f.promo && !emPromo(p)) return false;
    if (ignorar !== 'tam' && f.tams.size && !p.variacoes.some((v) => f.tams.has(v.tam) && v.qtd > 0 && !p.esgotadoManual)) return false;
    if (ignorar !== 'time' && f.times.size && !f.times.has(p.time)) return false;
    if (ignorar !== 'liga' && f.ligas.size && !f.ligas.has(ligaDe(p))) return false;
    if (ignorar !== 'versao' && f.versoes.size && !f.versoes.has(p.versao)) return false;
    return true;
  });
}
const ORDENS = [['', 'Relevância'], ['vendidos', 'Mais vendidos'], ['menor', 'Menor preço'], ['maior', 'Maior preço'], ['novos', 'Lançamentos']];
function ordenar(l) {
  const o = f.ordem, fim = (p) => esgotado(p);
  if (o === 'vendidos') return [...l].sort((a, b) => fim(a) - fim(b) || (b.vendidos || 0) - (a.vendidos || 0));
  if (o === 'menor') return [...l].sort((a, b) => fim(a) - fim(b) || precoAtual(a) - precoAtual(b));
  if (o === 'maior') return [...l].sort((a, b) => fim(a) - fim(b) || precoAtual(b) - precoAtual(a));
  if (o === 'novos') return [...l].sort((a, b) => fim(a) - fim(b) || b.criadoEm - a.criadoEm);
  return l;
}
const nFiltros = () => f.tams.size + f.times.size + f.ligas.size + f.versoes.size + (f.promo ? 1 : 0) + (f.col ? 1 : 0);
const zerarFiltros = () => { f.col = null; f.cat = ''; f.promo = false; f.tams.clear(); f.times.clear(); f.ligas.clear(); f.versoes.clear(); };
// ligas que têm produto, na ordem da lista (Brasileirão primeiro)
const ligasDe = (lista) => { const tem = new Set(lista.map(ligaDe).filter(Boolean)); return LIGAS.filter((l) => tem.has(l)); };

/* menu em pílula */
const catsComProduto = () => CATEGORIAS.filter((c) => produtos.some((p) => p.categoria === c.id));
function rotuloSel() {
  if (f.col) return f.col.nome;
  if (f.promo && !f.cat) return 'Promoções';
  return CATEGORIAS.find((c) => c.id === f.cat)?.nome || 'Tudo';
}
function desenharMenu() {
  const temPromo = produtos.some((p) => emPromo(p) && !esgotado(p));
  const item = (rot, dados, on) => `<button role="menuitemradio" aria-checked="${on}" ${dados} class="${on ? 'on' : ''}">${rot}${on ? ico('check', 20) : ''}</button>`;
  $('#sel').innerHTML = `${esc(rotuloSel())} ${ico('baixo', 20)}`;
  $('#menu').innerHTML =
    item('Tudo', 'data-cat=""', !f.cat && !f.promo) +
    catsComProduto().map((c) => item(c.nome, `data-cat="${c.id}"`, f.cat === c.id && !f.promo)).join('') +
    (temPromo ? `<hr>${item('<span class="ponto"></span>Promoções', 'data-promo', f.promo && !f.cat)}` : '') +
    `<hr><button data-whats>${icoWhats(18)} Falar com a loja</button>`;
}
function abrirMenu(abre) {
  $('#menu').classList.toggle('on', abre);
  $('#sel').setAttribute('aria-expanded', abre);
}
$('#sel').onclick = (e) => { e.stopPropagation(); abrirMenu(!$('#menu').classList.contains('on')); };
document.addEventListener('click', (e) => { if (!e.target.closest('.sel-w')) abrirMenu(false); });
$('#menu').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  abrirMenu(false);
  if ('whats' in b.dataset) return window.open(linkWhats('Olá! Vim pelo catálogo.'), '_blank', 'noopener');
  zerarFiltros();
  f.promo = 'promo' in b.dataset;
  f.cat = f.promo ? '' : b.dataset.cat;
  irPara('comprar');
};

/* telas */
const TELAS = {
  inicio: { nome: 'Destaques', ico: 'casa' },
  comprar: { nome: 'Comprar', ico: 'camisa' },
  favoritos: { nome: 'Favoritos', ico: 'coracao' },
  sacola: { nome: 'Sacola', ico: 'sacola' },
  loja: { nome: 'Loja', ico: 'loja' }
};
function desenharAbas() {
  const n = sacola.reduce((s, i) => s + i.qtd, 0);
  const vis = aba === 'finalizar' || aba === 'pedido' ? 'sacola' : aba;
  $('#abas').innerHTML = Object.entries(TELAS)
    .map(([id, t]) => `<button data-aba="${id}" class="${vis === id ? 'on' : ''}" ${vis === id ? 'aria-current="page"' : ''}>${ico(t.ico, 25)}${t.nome}${id === 'sacola' && n ? `<span class="badge-n">${n}</span>` : ''}</button>`)
    .join('');
  pilulaAbas();
}
const telaLarga = matchMedia('(min-width: 1024px)');
const pilulaAbas = () => moverPilula($('#abas'), 'abas', telaLarga.matches ? [0, 0] : [7, -6]);
addEventListener('resize', pilulaAbas);
$('#abas').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.aba === aba && !$('#pagina').classList.contains('on')) return scrollTo({ top: 0, behavior: 'smooth' });
  if (b.dataset.aba === 'comprar' && aba !== 'comprar') zerarFiltros();
  irPara(b.dataset.aba);
};
function irPara(t) {
  const h = '#' + t;
  if (location.hash === h) rota();
  else location.hash = h;
}

// anima a entrada só quando muda a tela ou o filtro (não a cada letra digitada na busca)
let chaveTela = '';
function render() {
  const chave = [aba, f.cat, f.promo, f.ordem, [...f.tams], [...f.times], [...f.ligas], [...f.versoes], pd.carregando].join('|');
  $('#tela').classList.toggle('anima', chave !== chaveTela);
  chaveTela = chave;
  document.body.classList.toggle('fundo', aba === 'inicio');
  desenharMenu();
  desenharAbas();
  const tela = $('#tela');
  if (aba === 'inicio') tela.innerHTML = telaInicio();
  else if (aba === 'comprar') tela.innerHTML = telaComprar();
  else if (aba === 'favoritos') tela.innerHTML = telaFavoritos();
  else if (aba === 'sacola') tela.innerHTML = telaSacola();
  else if (aba === 'finalizar') tela.innerHTML = telaFinalizar();
  else if (aba === 'pedido') tela.innerHTML = telaPedido();
  else tela.innerHTML = telaLoja();
  if (aba === 'inicio') ligarHero();
}

function telaInicio() {
  const dest = produtos.filter((p) => !esgotado(p) && (p.destaque || emPromo(p))).slice(0, 5);
  const daCamp = produtos.filter((p) => naCampanha(p) && !esgotado(p));
  const linkCamp = camp ? `#comprar/${camp.tipo}/${encodeURIComponent(camp.valor)}` : '';
  const slideCamp = camp && daCamp.length ? `<a class="slide camp" href="${linkCamp}">
      <div class="camp-fotos">${daCamp.slice(0, 3).map((p, i) => `<img src="${p.thumb}" alt="" style="--i:${i}">`).join('')}</div>
      <div class="camp-txt"><small>${camp.tipo === 'liga' ? esc(camp.valor) : 'Campanha'}</small><b>${esc(camp.titulo || (camp.tipo === 'time' ? `Semana ${camp.valor}` : camp.valor))}</b>${camp.texto ? `<p>${esc(camp.texto)}</p>` : ''}
        <div class="camp-acoes"><i>Ver as peças</i>${camp.cupom ? `<span class="camp-cupom">Cupom <b>${esc(camp.cupom)}</b></span>` : ''}</div></div></a>` : '';
  const slides = [
    ...(slideCamp ? [slideCamp] : []),
    `<a class="slide marca-s" href="#comprar"><img src="assets/marca/logo-branco.png" alt="${esc(loja.nome)}"><p>${esc(loja.slogan || '')}</p><i>Ver o catálogo</i></a>`,
    ...dest.map((p) => `<a class="slide ${p.fotoIds?.length ? '' : 'sem-foto'}" href="#p/${p.id}"><img src="${p.thumb}" alt=""><div class="txt"><small>${emPromo(p) ? 'Promoção' : 'Destaque'}</small><b>${esc(p.nome)}</b><span>${brl(precoAtual(p))}</span></div></a>`)
  ];
  const capa = (cat) => produtos.find((p) => p.categoria === cat && p.destaque && !esgotado(p)) || produtos.find((p) => p.categoria === cat);
  const promo = produtos.find((p) => emPromo(p) && !esgotado(p));
  const blocos = catsComProduto().map((c) => `<a class="bloco" href="#comprar/${c.id}"><img src="${capa(c.id).thumb}" alt=""><b>${c.nome}</b></a>`);
  if (promo) blocos.push(`<a class="bloco promo" href="#comprar/promo"><img src="${promo.thumb}" alt=""><b>Promoções</b></a>`);
  const novos = produtos.filter((p) => !esgotado(p)).sort((a, b) => b.criadoEm - a.criadoEm).slice(0, 8);
  const altas = produtos.filter((p) => !esgotado(p) && p.destaque && !(slideCamp && naCampanha(p))).slice(0, 8);
  const times = [...new Set(produtos.map((p) => p.time).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const ligas = ligasDe(produtos);
  const faixa = (t, lista, link) => (lista.length ? `<section class="faixa"><h2>${t}<a href="${link}">Ver tudo</a></h2><div class="trilho">${lista.map(card).join('')}</div></section>` : '');
  return `
    <div class="hero" id="hero">${slides.join('')}</div>
    <div class="dots"><div id="dots">${slides.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></div>
    ${slideCamp ? faixa(esc(camp.titulo || camp.valor), daCamp.slice(0, 10), linkCamp) : ''}
    <div class="blocos">${blocos.join('')}</div>
    ${colecoesHtml()}
    ${faixa('Em alta', altas, '#comprar')}
    ${faixa('Chegou agora', novos, '#comprar')}
    ${ligas.length > 1 ? `<section class="faixa"><h2>Por liga</h2><div class="times">${ligas.map((l) => `<a class="chip" href="#comprar/liga/${encodeURIComponent(l)}">${esc(l)}</a>`).join('')}</div></section>` : ''}
    ${provaHtml()}
    ${times.length ? `<section class="faixa"><h2>Por time</h2><div class="times">${times.map((t) => `<a class="chip" href="#comprar/time/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div></section>` : ''}
    <div style="height:8px"></div>`;
}
// coleções (painel > Loja): atalhos por memória, ex.: Copa de 2002, Ídolos. Só as que têm produto.
function colecoesHtml() {
  const cs = colecoes.filter((c) => produtos.some((p) => !esgotado(p) && c.termos.some((t) => norm(`${p.nome} ${p.time} ${p.descricao || ''}`).includes(norm(t)))));
  if (!cs.length) return '';
  return `<section class="faixa"><h2>Coleções</h2><div class="times">${cs.map((c) => `<a class="chip col" href="#comprar/col/${encodeURIComponent(c.nome)}">${esc(c.nome)}</a>`).join('')}</div></section>`;
}
// prova social (painel > Loja): números honestos + fotos reais de clientes e pedidos
const PROVA = tem('prova') ? V.prova : null;
let fotosProva = null;
function provaNumeros(curto) {
  if (!PROVA) return '';
  const l = [PROVA.pedidos && `<b>${esc(PROVA.pedidos)}</b> pedidos enviados`, PROVA.desde && `Loja desde <b>${esc(PROVA.desde)}</b>`].filter(Boolean);
  if (!curto && PROVA.reclame) l.push(`<a href="${esc(PROVA.reclame)}" target="_blank" rel="noopener">Ver no Reclame Aqui</a>`);
  return l.length ? `<div class="prova-n">${ico('check', 16)}<span>${l.join(' · ')}</span></div>` : '';
}
function provaHtml() {
  if (!PROVA) return '';
  const ids = PROVA.fotoIds || [];
  if (ids.length && !fotosProva) {
    fotosProva = [];
    api.fotosLoja(ids).then((fs) => { fotosProva = fs; const el = $('#provaTrilho'); if (el) el.innerHTML = fotosProvaHtml(); }).catch(() => {});
  }
  return `<section class="faixa prova"><h2>${esc(PROVA.titulo || `Clientes ${loja.nome}`)}</h2>
    ${provaNumeros()}
    ${ids.length ? `<div class="trilho prova-t" id="provaTrilho">${fotosProvaHtml()}</div>` : ''}</section>`;
}
const fotosProvaHtml = () => (fotosProva || []).map((f) => `<button class="pf" data-pf="${f.id}"><img src="${f.thumb}" alt="Foto de cliente" loading="lazy"></button>`).join('');
function abrirFotoProva(id) {
  const f = (fotosProva || []).find((x) => x.id === id);
  if (!f) return;
  $('#folha').innerHTML = `<div class="folha-h"><span></span><button class="icon-btn" data-fechar aria-label="Fechar">${ico('fechar')}</button></div><div class="folha-c"><img src="${f.full}" alt="" style="width:100%;border-radius:12px"></div>`;
  $('#folha').onclick = (e) => { if (e.target.closest('[data-fechar]')) fecharFiltros(); };
  $('#veu').classList.add('on'); $('#folha').classList.add('on');
}
// faixa de avisos no topo: as frases se alternam
function ligarAvisos() {
  const msgs = tem('faixa') ? (V.faixa.msgs || []).filter(Boolean) : [];
  const el = $('#avisos');
  if (!el || !msgs.length) return;
  el.hidden = false;
  el.innerHTML = msgs.map((m, i) => `<span class="${i ? '' : 'on'}">${esc(m)}</span>`).join('');
  if (msgs.length < 2) return;
  let i = 0;
  setInterval(() => { const ss = el.children; ss[i].classList.remove('on'); i = (i + 1) % ss.length; ss[i].classList.add('on'); }, 4000);
}
ligarAvisos();
function ligarHero() {
  const h = $('#hero'), d = $('#dots');
  if (!h) return;
  h.onscroll = () => {
    const w = h.firstElementChild.offsetWidth + 10;
    const i = Math.round(h.scrollLeft / w);
    d.querySelectorAll('i').forEach((x, k) => x.classList.toggle('on', k === i));
  };
  // no computador não dá para arrastar com o dedo: clicar na bolinha leva ao cartão
  d.onclick = (e) => {
    const k = [...d.children].indexOf(e.target);
    if (k >= 0) h.scrollTo({ left: k * (h.firstElementChild.offsetWidth + 10), behavior: 'smooth' });
  };
}

function telaComprar() {
  const n = nFiltros();
  const lista = ordenar(filtrar());
  const cats = [{ id: '', nome: 'Tudo' }, ...catsComProduto()];
  return `
    <div class="tit"><h1>${f.q ? 'Busca' : esc(rotuloSel())}</h1><p>${lista.length} ${lista.length === 1 ? 'produto' : 'produtos'}${n || f.q ? ` · <button data-limpar style="text-decoration:underline;color:var(--tx)">Limpar filtros</button>` : ''}</p></div>
    <nav class="chips">${cats.map((c) => `<button class="chip ${f.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.nome}</button>`).join('')}<button class="chip ${n ? 'on' : ''}" data-filtro>${ico('filtro', 18)} Filtrar${n ? `<span class="n">${n}</span>` : ''}</button><label class="chip ordem ${f.ordem ? 'on' : ''}">${ico('setas', 16)}<select id="ordem" aria-label="Ordenar">${ORDENS.map(([v, t]) => `<option value="${v}" ${f.ordem === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></nav>
    ${ligasHtml()}
    <section class="grid">${lista.length ? lista.map(card).join('') : `<div class="vazio" style="grid-column:1/-1">Nada encontrado com esses filtros.</div>`}</section>`;
}
// atalho de ligas logo acima da grade (só quando há camisas de mais de uma liga)
function ligasHtml() {
  const ls = ligasDe(filtrar('liga'));
  if (ls.length < 2 && !f.ligas.size) return '';
  return `<nav class="chips ligas" aria-label="Ligas"><button class="chip ${f.ligas.size ? '' : 'on'}" data-liga="">Todas as ligas</button>${ls.map((l) => `<button class="chip ${f.ligas.has(l) ? 'on' : ''}" data-liga="${esc(l)}">${esc(l)}</button>`).join('')}</nav>`;
}
function telaFavoritos() {
  const lista = favs.map(porId).filter(Boolean);
  if (!lista.length)
    return `<div class="tit"><h1>Favoritos</h1></div><div class="vazio2"><div class="ic">${ico('coracao', 30)}</div><b>Nenhum favorito ainda</b>Toque no coração de um produto para guardar ele aqui.<a class="btn mini" href="#comprar" style="margin-top:6px">Ver produtos</a></div>`;
  return `<div class="tit"><h1>Favoritos</h1><p>${lista.length} ${lista.length === 1 ? 'produto' : 'produtos'}</p></div><section class="grid">${lista.map(card).join('')}</section>`;
}
// barra de frete grátis (painel > Loja > Entrega)
function barraFrete(bruto) {
  const meta = Number(loja.freteGratisAcima) || 0;
  if (!meta) return '';
  const falta = Math.max(0, meta - bruto);
  return `<div class="frete-barra ${falta ? '' : 'ok'}"><span>${falta ? `Faltam <b>${brl(falta)}</b> para o frete grátis` : `${ico('check', 16)} Você ganhou <b>frete grátis</b>`}</span><i><em style="width:${Math.min(100, (bruto / meta) * 100)}%"></em></i></div>`;
}
// desconto progressivo: mostra a próxima faixa
function avisoProgressivo(pecas) {
  const fx = faixasCombo;
  if (!fx.length) return '';
  const atual = faixaProgressiva(loja, pecas), prox = fx.find((x) => x.qtd > pecas);
  if (!atual && !prox) return '';
  const falta = prox ? prox.qtd - pecas : 0;
  const proxTxt = prox ? (prox.pague ? `${falta === 1 ? 'Falta 1 peça' : `Faltam ${falta} peças`} para levar ${prox.qtd} e <b>pagar ${prox.pague}</b>` : `${falta === 1 ? 'Falta 1 peça' : `Faltam ${falta} peças`} para ganhar <b>${prox.pct}% de desconto</b>`) : '';
  return `<div class="prog">${ico('sacola', 16)}<span>${atual ? `Combo ativado: <b>${esc(rotuloFaixa(atual))}</b>${prox ? `. ${proxTxt}` : ''}` : proxTxt}</span></div>`;
}
// nome do desconto aplicado: "Cupom X (10%)", "Leve 3, pague 2" ou "Desconto por quantidade (10%)"
const rotuloDesc = (conta) => (conta.regra === 'cupom' ? `Cupom ${conta.cupom.codigo} (${conta.pct}%)` : conta.faixa?.pague ? rotuloFaixa(conta.faixa) : `Desconto por quantidade (${conta.pct}%)`);
const linhaTrocas = () => (tem('trocas') && V.trocas.texto ? `<div class="info-l">${ico('setas', 17)}<span>${esc(V.trocas.texto)}</span></div>` : '');
const linhaPrazo = () => (tem('prazo') && V.prazo.texto ? `<div class="info-l">${ico('caixa', 17)}<span>${esc(V.prazo.texto)}</span></div>` : '');
// sugestões: mesmo time, mesma liga, depois destaques
function sugestoes(base, fora, n = 8) {
  const nota = (x) => base.reduce((t, b) => t + (x.time && x.time === b.time ? 4 : 0) + (ligaDe(x) && ligaDe(x) === ligaDe(b) ? 2 : 0) + (x.categoria === b.categoria ? 1 : 0), 0) + (x.destaque ? 0.5 : 0);
  return produtos.filter((x) => !fora.has(x.id) && !esgotado(x)).map((x) => [nota(x), x]).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, x]) => x);
}
function telaSacola() {
  if (!sacola.length)
    return `<div class="tit"><h1>Sacola</h1></div><div class="vazio2"><div class="ic">${ico('sacola', 30)}</div><b>Sua sacola está vazia</b>Junte os produtos aqui e mande o pedido inteiro numa mensagem só.<a class="btn mini" href="#comprar" style="margin-top:6px">Ver produtos</a></div>`;
  const conta = contaSacola('cartao');
  const total = conta.total;
  const pecas = conta.pecas;
  const sug = sugestoes(sacola.map((i) => porId(i.id)), new Set(sacola.map((i) => i.id)));
  return `
    <div class="tit"><h1>Sacola</h1><p>${pecas} ${pecas === 1 ? 'peça' : 'peças'}</p></div>
    <div class="sac">
    <div class="itens">${sacola.map((i, k) => {
      const p = porId(i.id);
      const max = estoqueDe(p, i.tam);
      return `<div class="item"><a class="ph" href="#p/${p.id}"><img src="${p.thumb}" alt=""></a><div>
        <div class="nm">${esc(p.nome)}</div><div class="sb">Tamanho ${esc(i.tam)}${i.pers ? ` · <b>${esc(persTxt(i.pers))}</b>` : ''}${max < i.qtd ? ' · <span style="color:var(--promo)">sem estoque suficiente</span>' : ''}</div>
        ${precoHtml(p, precoLinha(i))}
        <div class="rod"><div class="qtd"><button data-menos="${k}" aria-label="${i.qtd > 1 ? 'Diminuir' : 'Remover'}">${ico(i.qtd > 1 ? 'menos' : 'lixo', 18)}</button><span>${i.qtd}</span><button data-mais="${k}" aria-label="Aumentar" ${i.qtd >= max ? 'disabled' : ''}>${ico('mais', 18)}</button></div></div>
      </div></div>`;
    }).join('')}</div>
    <div class="resumo">
      ${barraFrete(conta.bruto)}
      ${avisoProgressivo(pecas)}
      ${conta.desconto ? `<div class="l desc"><span>${esc(rotuloDesc(conta))}</span><span>− ${brl(conta.desconto)}</span></div>` : ''}
      <div class="l t"><span>Total</span><span>${brl(total)}</span></div>
      ${pixPct() ? `<div class="l pixl"><span>No Pix</span><span>${brl(contaSacola('pix').total)}</span></div>` : ''}
      <small>Calcule o frete e pague com Pix ou cartão em até ${nParc()}x. Se preferir, combine tudo pelo WhatsApp.</small>
      <a class="btn" href="#finalizar">Finalizar compra</a>
      <button class="btn sec" data-pedir style="margin-top:10px">${icoWhats()} Pedir pelo WhatsApp</button>
      <button class="lnk" data-esvaziar>Esvaziar sacola</button>
      ${SELO}
      ${linhaTrocas()}
    </div>
    </div>
    ${sug.length ? `<section class="faixa"><h2>Combine com</h2><div class="trilho">${sug.map(card).join('')}</div></section>` : ''}`;
}
function telaLoja() {
  return `
    <div class="lojab">
      <div class="cab"><img src="assets/marca/logo-branco.png" alt="${esc(loja.nome)}">${loja.slogan ? `<p>${esc(loja.slogan)}</p>` : ''}</div>
      <a class="btn" href="${linkWhats('Olá! Vim pelo catálogo.')}" target="_blank" rel="noopener">${icoWhats()} Falar no WhatsApp</a>
      ${loja.instagram ? `<a class="btn sec" href="https://instagram.com/${esc(loja.instagram)}" target="_blank" rel="noopener">Instagram @${esc(loja.instagram)}</a>` : ''}
      ${loja.cidade ? `<p class="muted" style="text-align:center">${esc(loja.cidade)}</p>` : ''}
      ${PROVA ? `<div class="confia">${provaNumeros()}${PROVA.cnpj ? `<p>CNPJ ${esc(PROVA.cnpj)}</p>` : ''}</div>` : ''}
      ${linhaPrazo()}${linhaTrocas()}
      <div class="passos">
        <strong>Como comprar</strong>
        <div><b>1</b><span>Escolha o produto e o tamanho.</span></div>
        <div><b>2</b><span>Peça direto pelo WhatsApp ou junte tudo na sacola.</span></div>
        <div><b>3</b><span>Combine entrega e pagamento com a loja.</span></div>
      </div>
    </div>`;
}

/* finalizar compra: entrega, dados e pagamento */
const CK_KEY = 'b13-cliente';
const ck = { cep: '', opcoes: null, freteId: '', carregando: false, erro: '', simulado: false, metodo: 'pix', cupom: null, cupomTxt: '', cupomErro: '', nome: '', telefone: '', cpf: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
try { Object.assign(ck, JSON.parse(localStorage.getItem(CK_KEY)) || {}, { opcoes: null, carregando: false, erro: '', cupomErro: '' }); } catch {}
const CAMPOS_CK = ['cep', 'freteId', 'metodo', 'cupomTxt', 'nome', 'telefone', 'cpf', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
const salvarCk = () => gravar(CK_KEY, Object.fromEntries(CAMPOS_CK.map((k) => [k, ck[k]])));
const freteEscolhido = () => ck.opcoes?.find((o) => o.id === ck.freteId);
const fmtCep = (c) => { const d = soDigitos(c); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5, 8) : d; };
// preço de uma linha da sacola: produto (com promoção) + personalização
const PERS = persDe(loja);
const PATCHES = ligado(PERS) ? patchesDe(PERS) : [];
const precoLinha = (i) => precoComPers(precoAtual(porId(i.id)), PERS, i);
const persTxt = (pe) => [pe.nome, pe.numero, pe.patch && `patch ${pe.patch}`].filter(Boolean).join(' ');
const contaSacola = (metodo = ck.metodo) => calcularPedido(loja, sacola.map((i) => ({ preco: precoLinha(i), qtd: i.qtd })), ck.cupom, metodo);
const subtotalSacola = () => contaSacola().bruto;
const detalheFrete = (o) => (o.tipo === 'transportadora' ? `${o.empresa ? o.empresa + ' · ' : ''}${o.prazo ? `até ${o.prazo} ${o.prazo === 1 ? 'dia útil' : 'dias úteis'}` : ''}` : o.detalhe || '');

function telaFinalizar() {
  if (!sacola.length) return telaSacola();
  if (!pixPct()) ck.metodo = 'cartao';
  const conta = contaSacola();
  const sub = conta.bruto;
  const pecas = conta.pecas;
  const op = freteEscolhido();
  const entrega = op && op.tipo !== 'retirada';
  const campo = (id, rot, extra = '') => `<label class="cmp"><span>${rot}</span><input data-ck="${id}" value="${esc(ck[id])}" ${extra}></label>`;
  return `
    <div class="tit"><a href="#sacola" class="voltar-lnk">${ico('voltar', 18)} Sacola</a><h1>Finalizar compra</h1><p>${pecas} ${pecas === 1 ? 'peça' : 'peças'} · ${brl(sub)}</p></div>
    <div class="fin">
      <section class="passo"><h2><b>1</b> Entrega</h2>
        ${barraFrete(sub)}
        <div class="cep-l"><input data-ck="cep" id="ckCep" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="Seu CEP" value="${esc(fmtCep(ck.cep))}"><button class="btn mini" data-cotar>Calcular</button></div>
        <a class="lnk-p" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener">Não sei meu CEP</a>
        ${ck.carregando ? '<p class="muted" style="padding:14px 0">Calculando o frete…</p>' : ''}
        ${ck.erro ? `<p class="erro-ck">${esc(ck.erro)}</p>` : ''}
        ${ck.opcoes && !ck.carregando ? `<div class="opcoes">${ck.opcoes.map((o) => `
          <label class="op ${o.id === ck.freteId ? 'on' : ''}"><input type="radio" name="frete" value="${esc(o.id)}" ${o.id === ck.freteId ? 'checked' : ''}>
            <span class="m"><b>${esc(o.nome)}</b><small>${esc(detalheFrete(o))}</small></span><span class="v">${o.preco ? brl(o.preco) : 'Grátis'}</span></label>`).join('')}</div>
          ${ck.simulado ? '<p class="muted" style="font-size:13px;margin-top:8px">Valores simulados (modo demonstração).</p>' : ''}` : ''}
      </section>
      <section class="passo"><h2><b>2</b> Seus dados</h2>
        ${campo('nome', 'Nome completo', 'autocomplete="name"')}
        ${campo('telefone', 'WhatsApp com DDD', 'inputmode="tel" autocomplete="tel" placeholder="(73) 99999-9999"')}
        ${op?.tipo === 'transportadora' ? campo('cpf', 'CPF (vai na etiqueta de envio)', 'inputmode="numeric" maxlength="14" placeholder="000.000.000-00"') : ''}
        ${entrega ? `
          <div class="dupla-ck">${campo('rua', 'Rua', 'autocomplete="address-line1"')}${campo('numero', 'Número', 'inputmode="numeric"')}</div>
          ${campo('complemento', 'Complemento', 'placeholder="Opcional"')}
          ${campo('bairro', 'Bairro')}
          <div class="dupla-ck">${campo('cidade', 'Cidade')}${campo('uf', 'UF', 'maxlength="2"')}</div>` : ''}
      </section>
      <section class="passo"><h2><b>3</b> Pagamento</h2>
        ${ck.cupom
          ? `<div class="cupom-ok">${ico('check', 18)}<span>Cupom <b>${esc(ck.cupom.codigo)}</b> · ${ck.cupom.pct}% de desconto</span><button data-tirarcupom>Tirar</button></div>`
          : `<div class="cep-l cupom-l"><input data-ck="cupomTxt" placeholder="Cupom de desconto" autocapitalize="characters" autocomplete="off" value="${esc(ck.cupomTxt || (camp?.cupom && sacola.some((i) => naCampanha(porId(i.id))) ? camp.cupom : ''))}"><button class="btn sec mini" data-cupom>Aplicar</button></div>`}
        ${ck.cupomErro ? `<p class="erro-ck" style="margin:6px 0 4px">${esc(ck.cupomErro)}</p>` : ''}
        ${ck.cupom && conta.regra === 'progressivo' ? `<p class="muted" style="font-size:13px;margin-top:6px">O combo (${esc(rotuloDesc(conta))}) dá mais desconto que o cupom, então vale ele. Os dois não somam.</p>` : ''}
        ${pixPct() ? `<div class="opcoes metodos">
          <label class="op ${ck.metodo === 'pix' ? 'on' : ''}"><input type="radio" name="metodo" value="pix" ${ck.metodo === 'pix' ? 'checked' : ''}><span class="m"><b>Pix</b><small>${pixPct()}% de desconto · aprovação na hora</small></span><span class="v">${brl(contaSacola('pix').total)}</span></label>
          <label class="op ${ck.metodo === 'cartao' ? 'on' : ''}"><input type="radio" name="metodo" value="cartao" ${ck.metodo === 'cartao' ? 'checked' : ''}><span class="m"><b>Cartão de crédito</b><small>${semJuros() > 1 ? `até ${semJuros()}x sem juros` : `em até ${nParc()}x`}</small></span><span class="v">${brl(contaSacola('cartao').total)}</span></label>
        </div>` : ''}
        <div class="l" style="margin-top:12px"><span>Produtos</span><span>${brl(sub)}</span></div>
        ${conta.desconto ? `<div class="l desc"><span>${esc(rotuloDesc(conta))}</span><span>− ${brl(conta.desconto)}</span></div>` : ''}
        ${conta.descontoPix ? `<div class="l desc"><span>Desconto no Pix (${conta.pix}%)</span><span>− ${brl(conta.descontoPix)}</span></div>` : ''}
        <div class="l"><span>Frete</span><span>${op ? (op.preco ? brl(op.preco) : 'Grátis') : '—'}</span></div>
        <div class="l t"><span>Total</span><span>${brl(conta.total + (op?.preco || 0))}</span></div>
        <button class="btn" data-pagar style="margin-top:16px">Pagar ${brl(conta.total + (op?.preco || 0))}${ck.metodo === 'pix' && pixPct() ? ' no Pix' : ''}</button>
        ${SELO}
        <button class="btn sec" data-whatsfin style="margin-top:14px">${icoWhats()} Prefiro combinar pelo WhatsApp</button>
      </section>
    </div>`;
}
async function cotarFrete() {
  const cep = soDigitos(ck.cep);
  if (cep.length !== 8) { ck.erro = 'Digite o CEP com 8 números.'; ck.opcoes = null; return render(); }
  ck.carregando = true; ck.erro = ''; render();
  try {
    const r = await srv.cotar(cep, sacola);
    ck.opcoes = r.opcoes; ck.simulado = !!r.simulado;
    if (!freteEscolhido()) ck.freteId = r.opcoes.length === 1 ? r.opcoes[0].id : '';
    if (!ck.rua || ck.cepEnd !== cep) {
      const e = await buscarEndereco(cep);
      if (e) Object.assign(ck, e, { cepEnd: cep });
    }
  } catch (e) { ck.erro = e.message; ck.opcoes = null; }
  ck.carregando = false; salvarCk(); render();
}
async function pagarAgora(b) {
  const op = freteEscolhido();
  const faltando = !op ? (ck.opcoes ? ['cep', 'Escolha a forma de entrega'] : ['cep', 'Calcule o frete com o seu CEP'])
    : ck.nome.trim().length < 3 ? ['nome', 'Informe seu nome']
    : soDigitos(ck.telefone).length < 10 ? ['telefone', 'Informe seu WhatsApp com DDD']
    : op.tipo === 'transportadora' && !cpfValido(ck.cpf) ? ['cpf', 'Informe um CPF válido. Ele vai na etiqueta de envio']
    : op.tipo !== 'retirada' && ['rua', 'numero', 'bairro', 'cidade', 'uf'].find((k) => !String(ck[k]).trim());
  if (faltando) {
    const [k, msg] = Array.isArray(faltando) ? faltando : [faltando, 'Complete o endereço de entrega'];
    toast(msg); $(`[data-ck="${k}"]`)?.focus(); return;
  }
  b.disabled = true; b.textContent = 'Abrindo o pagamento…';
  try {
    const r = await srv.pagar({
      itens: sacola, cep: ck.cep, freteId: ck.freteId,
      cupom: ck.cupom?.codigo || '', metodo: ck.metodo,
      cliente: { nome: ck.nome.trim(), telefone: ck.telefone, ...(op.tipo === 'transportadora' ? { cpf: soDigitos(ck.cpf) } : {}) },
      endereco: op.tipo === 'retirada' ? null : { rua: ck.rua, numero: ck.numero, complemento: ck.complemento, bairro: ck.bairro, cidade: ck.cidade, uf: ck.uf }
    });
    location.href = r.url;
  } catch (e) {
    toast(e.message); b.disabled = false; b.textContent = 'Tentar de novo';
  }
}
$('#tela').addEventListener('input', (e) => {
  const k = e.target.dataset.ck;
  if (!k) return;
  ck[k] = e.target.value;
  if (k === 'nome' || k === 'telefone') { clearTimeout(rs.tc); rs.tc = setTimeout(() => rs.contato(ck.nome, ck.telefone), 1200); }
  if (k === 'cep') {
    const d = soDigitos(ck.cep);
    if (d.length === 8 && d !== ck.cepCotado) { ck.cepCotado = d; ck.cep = d; cotarFrete(); }
  }
  salvarCk();
});
$('#tela').addEventListener('change', (e) => {
  if (e.target.id === 'ordem') { f.ordem = e.target.value; return render(); }
  if (e.target.name === 'metodo') { ck.metodo = e.target.value; salvarCk(); return render(); }
  if (e.target.name !== 'frete') return;
  ck.freteId = e.target.value; salvarCk(); render();
});

/* volta do pagamento */
const pd = { q: null, carregando: false, res: null, erro: '' };
function telaPedido() {
  const q = pd.q || {};
  if (q.demo === 'pagar') {
    return `<div class="tit"><h1>Pagamento</h1><p>Pedido ${esc(q.pedido)}</p></div>
      <div class="fin"><section class="passo">
        <p class="aviso-demo">Modo demonstração. Com tudo ligado, aqui abre a página segura da InfinitePay, com Pix e cartão em até 12x.</p>
        <button class="btn" data-sim="pix" style="margin-top:16px">Simular pagamento com Pix</button>
        <button class="btn sec" data-sim="credit_card" style="margin-top:10px">Simular pagamento com cartão</button>
      </section></div>`;
  }
  if (pd.carregando) return `<div class="vazio2"><div class="ic">${ico('sacola', 30)}</div><b>Confirmando o pagamento…</b></div>`;
  const r = pd.res;
  if (!r) return `<div class="vazio2"><b>Não deu para confirmar agora</b>${esc(pd.erro)}<button class="btn mini" data-reconfirmar style="margin-top:6px">Tentar de novo</button></div>`;
  const avisar = linkWhats(`Olá! ${r.pago ? 'Acabei de pagar' : 'Tentei pagar'} o pedido *${r.pedido}* pelo site (${brl(r.total)}).`);
  const itens = `<div class="itens">${(r.itens || []).map((i) => `<div class="mini-i"><span>${i.qtd}x ${esc(i.nome)} <small>${esc(i.tam)}</small></span><span>${brl(i.preco * i.qtd)}</span></div>`).join('')}
    ${r.desconto ? `<div class="mini-i"><span>${r.cupom ? 'Cupom ' + esc(r.cupom.codigo) : 'Combo'}</span><span>− ${brl(r.desconto)}</span></div>` : ''}
    ${r.descontoPix ? `<div class="mini-i"><span>Desconto no Pix</span><span>− ${brl(r.descontoPix)}</span></div>` : ''}
    <div class="mini-i"><span>${esc(r.frete?.nome || 'Entrega')}</span><span>${r.frete?.preco ? brl(r.frete.preco) : 'Grátis'}</span></div>
    <div class="mini-i t"><span>Total</span><span>${brl(r.total)}</span></div></div>`;
  if (r.pago)
    return `<div class="ok-pg"><div class="ic-ok">${ico('check', 38)}</div><h1>Pagamento aprovado</h1><p>Pedido <b>${esc(r.pedido)}</b>. A loja já recebeu e vai separar tudo.</p></div>
      ${itens}
      <div class="fin" style="padding-top:4px">
        <a class="btn" href="${avisar}" target="_blank" rel="noopener">${icoWhats()} Falar com a loja</a>
        ${r.recibo ? `<a class="btn sec" href="${esc(r.recibo)}" target="_blank" rel="noopener" style="margin-top:10px">Ver comprovante</a>` : ''}
        <a class="lnk" href="#inicio">Voltar ao catálogo</a>
      </div>`;
  return `<div class="ok-pg"><div class="ic-ok esp">${ico('alerta', 34)}</div><h1>Pagamento ainda não confirmado</h1><p>Pedido <b>${esc(r.pedido)}</b>. Se você já pagou, aguarde alguns segundos e confira de novo.</p></div>
    ${itens}
    <div class="fin" style="padding-top:4px">
      <button class="btn" data-reconfirmar>Conferir de novo</button>
      <a class="btn sec" href="${avisar}" target="_blank" rel="noopener" style="margin-top:10px">${icoWhats()} Falar com a loja</a>
    </div>`;
}
async function confirmarPedido() {
  pd.carregando = true; pd.erro = ''; render();
  try {
    pd.res = await srv.confirmar(pd.q);
    if (pd.res.pago) {
      const vendidos = new Set((pd.res.itens || []).map((i) => i.id + '|' + i.tam));
      sacola = sacola.filter((i) => !vendidos.has(i.id + '|' + i.tam)); gravar('b13-sacola', sacola); desenharAbas();
      rs.comprou(pd.res.pedido, sacola);
      ck.opcoes = null; ck.freteId = ''; ck.cupom = null; ck.cupomTxt = '';
      // Purchase no Pixel, uma vez por pedido
      const k = 'b13-px-' + pd.res.pedido;
      if (!localStorage.getItem(k)) { px('Purchase', { value: pd.res.total, content_type: 'product', content_ids: (pd.res.itens || []).map((i) => i.id), num_items: (pd.res.itens || []).reduce((t, i) => t + i.qtd, 0) }); gravar(k, 1); }
    }
  } catch (e) { pd.res = null; pd.erro = e.message; }
  pd.carregando = false; render();
}
function simularPagamento(metodo) {
  pd.q = { pedido: pd.q.pedido, transaction_nsu: 'DEMO' + Date.now(), slug: 'demo', capture_method: metodo };
  history.replaceState(null, '', `${location.pathname}?${new URLSearchParams(pd.q)}`);
  confirmarPedido();
}

/* cliques dentro das telas */
$('#tela').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if ('filtro' in d) return abrirFiltros();
  if (d.pf) return abrirFotoProva(d.pf);
  if ('limpar' in d) { zerarFiltros(); f.q = ''; $('#q').value = ''; fecharBusca(); return render(); }
  if (d.cat !== undefined) { f.cat = d.cat; f.promo = false; f.tams.clear(); if (d.cat && d.cat !== 'camisa') f.ligas.clear(); return render(); }
  if (d.liga !== undefined) { if (!d.liga) f.ligas.clear(); else if (f.ligas.has(d.liga) && f.ligas.size === 1) f.ligas.clear(); else { f.ligas.clear(); f.ligas.add(d.liga); } return render(); }
  if (d.menos !== undefined) {
    const i = sacola[+d.menos];
    if (--i.qtd <= 0) sacola.splice(+d.menos, 1);
    salvarSacola(); return render();
  }
  if (d.mais !== undefined) { sacola[+d.mais].qtd++; salvarSacola(); return render(); }
  if ('esvaziar' in d) { sacola = []; salvarSacola(); return render(); }
  if ('pedir' in d) return pedirSacola();
  if ('cotar' in d) return cotarFrete();
  if ('pagar' in d) return pagarAgora(b);
  if ('whatsfin' in d) return pedirSacola(true);
  if ('cupom' in d) return aplicarCupom(b);
  if ('tirarcupom' in d) { ck.cupom = null; ck.cupomTxt = ''; ck.cupomErro = ''; return render(); }
  if (d.sim) return simularPagamento(d.sim);
  if ('reconfirmar' in d) return confirmarPedido();
});
async function aplicarCupom(b) {
  b.disabled = true; b.textContent = '…';
  ck.cupomTxt = b.previousElementSibling?.value || ck.cupomTxt;
  try { ck.cupom = await srv.cupom(ck.cupomTxt); ck.cupomErro = ''; toast(`Cupom aplicado: ${ck.cupom.pct}% de desconto`); }
  catch (e) { ck.cupom = null; ck.cupomErro = e.message; }
  render();
}
function pedirSacola(comEntrega) {
  const base = location.href.split('#')[0].split('?')[0];
  const conta = contaSacola(comEntrega ? ck.metodo : 'cartao');
  let total = conta.total;
  const linhas = sacola.map((i) => {
    const p = porId(i.id);
    api.contar(p.id, 'whats');
    return `${i.qtd}x *${p.nome}*\nTamanho: ${i.tam}${i.pers ? `\nPersonalizar: ${persTxt(i.pers)}` : ''} · ${brl(precoLinha(i) * i.qtd)}\n${base}#p/${p.id}`;
  });
  let txt = `Olá! Quero fazer este pedido pelo catálogo:\n\n${linhas.join('\n\n')}`;
  const op = comEntrega && ck.opcoes?.find((o) => o.id === ck.freteId);
  if (op) {
    total += op.preco;
    txt += `\n\nEntrega: ${op.nome}${op.empresa ? ' (' + op.empresa + ')' : ''} · ${op.preco ? brl(op.preco) : 'grátis'}`;
    if (op.tipo !== 'retirada' && ck.rua) txt += `\n${ck.rua}, ${ck.numero}${ck.complemento ? ' ' + ck.complemento : ''} · ${ck.bairro} · ${ck.cidade}/${ck.uf} · CEP ${ck.cep}`;
  }
  if (comEntrega && ck.nome) txt += `\nNome: ${ck.nome}`;
  if (conta.desconto) txt += `\n${rotuloDesc(conta)}: − ${brl(conta.desconto)}`;
  if (conta.descontoPix) txt += `\nDesconto no Pix: − ${brl(conta.descontoPix)}`;
  txt += `\n\n*Total: ${brl(total)}*`;
  rs.pedidoWhats();
  if (comEntrega) rs.contato(ck.nome, ck.telefone);
  window.open(linkWhats(txt), '_blank', 'noopener');
}

/* busca */
$('#btnBusca').onclick = () => { $('#top').classList.add('buscando'); $('#q').focus(); };
function fecharBusca() { $('#top').classList.remove('buscando'); }
$('#qx').onclick = (e) => { e.preventDefault(); f.q = ''; $('#q').value = ''; fecharBusca(); render(); };
$('#q').oninput = (e) => {
  f.q = e.target.value;
  if (aba !== 'comprar') { zerarFiltros(); irPara('comprar'); } else render();
};

/* filtros */
const ORDEM_TAM = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];
const ordTam = (a, b) => {
  const ia = ORDEM_TAM.indexOf(a), ib = ORDEM_TAM.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, 'pt-BR', { numeric: true });
};
function abrirFiltros() {
  const base = filtrar('tudo');
  const tams = [...new Set(base.flatMap((p) => p.variacoes.filter((v) => v.qtd > 0 && !p.esgotadoManual).map((v) => v.tam)))].sort(ordTam);
  const times = [...new Set(base.map((p) => p.time).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const ligas = ligasDe(base);
  const versoes = VERSOES.filter((v) => base.some((p) => p.versao === v));
  const temPromo = base.some(emPromo);
  const grupo = (titulo, itens, set, chave) =>
    itens.length ? `<div class="sec-t">${titulo}</div><div class="chips">${itens.map((t) => `<button class="chip ${set.has(t) ? 'on' : ''}" data-${chave}="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '';
  const desenhar = () => {
    const n = filtrar().length;
    $('#folha').innerHTML = `
      <div class="folha-h">Filtrar<button class="icon-btn" data-fechar aria-label="Fechar">${ico('fechar')}</button></div>
      <div class="folha-c">
        ${grupo('Tamanho', tams, f.tams, 'tam')}
        ${grupo('Liga', ligas, f.ligas, 'liga')}
        ${grupo('Versão', versoes, f.versoes, 'versao')}
        ${grupo('Time', times, f.times, 'time')}
        ${temPromo ? `<label class="sw" style="margin-top:12px"><span>Só promoções</span><input type="checkbox" id="fPromo" ${f.promo ? 'checked' : ''}></label>` : ''}
      </div>
      <div class="folha-f"><button class="btn sec" data-zerar>Limpar</button><button class="btn" data-fechar>Ver ${n} ${n === 1 ? 'produto' : 'produtos'}</button></div>`;
  };
  desenhar();
  $('#folha').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tam) toggle(f.tams, b.dataset.tam);
    else if (b.dataset.time) toggle(f.times, b.dataset.time);
    else if (b.dataset.liga) toggle(f.ligas, b.dataset.liga);
    else if (b.dataset.versao) toggle(f.versoes, b.dataset.versao);
    else if ('zerar' in b.dataset) { f.tams.clear(); f.times.clear(); f.ligas.clear(); f.versoes.clear(); f.promo = false; }
    else if ('fechar' in b.dataset) return fecharFiltros();
    desenhar(); render();
  };
  $('#folha').onchange = (e) => { if (e.target.id === 'fPromo') { f.promo = e.target.checked; desenhar(); render(); } };
  $('#veu').classList.add('on');
  $('#folha').classList.add('on');
}
// Guia de tamanhos: medidas aproximadas, em cm. Camisa: largura (axila a axila) x altura.
const GUIA = {
  Torcedor: [['P', 50, 70], ['M', 53, 72], ['G', 56, 74], ['GG', 59, 76], ['XG', 62, 78], ['XGG', 65, 80]],
  Jogador: [['P', 48, 69], ['M', 51, 71], ['G', 54, 73], ['GG', 57, 75], ['XG', 60, 77]],
  Feminina: [['P', 44, 62], ['M', 46, 64], ['G', 48, 66], ['GG', 50, 68]],
  Infantil: [['8', 40, 54], ['10', 42, 57], ['12', 44, 60], ['14', 46, 63]],
  pe: [['34', 22.5], ['35', 23], ['36', 23.5], ['37', 24.5], ['38', 25], ['39', 26], ['40', 26.5], ['41', 27], ['42', 28], ['43', 28.5], ['44', 29.5], ['45', 30]]
};
function abrirGuia(p) {
  const camisa = p.categoria === 'camisa';
  const tipo = camisa ? (GUIA[p.versao] ? p.versao : 'Torcedor') : 'pe';
  const linhas = GUIA[tipo];
  $('#folha').innerHTML = `
    <div class="folha-h">Guia de tamanhos<button class="icon-btn" data-fechar aria-label="Fechar">${ico('fechar')}</button></div>
    <div class="folha-c">
      ${camisa ? `<p class="muted" style="font-size:14px;margin:6px 0 14px">Camisa ${tipo === 'Torcedor' ? 'versão torcedor' : tipo.toLowerCase()}. Meça uma camisa sua deitada: <b>largura</b> de uma axila à outra e <b>altura</b> do ombro até a barra.</p>
        <table class="guia"><tr><th>Tamanho</th><th>Largura</th><th>Altura</th></tr>${linhas.map(([t, l, a]) => `<tr><td>${t}</td><td>${l} cm</td><td>${a} cm</td></tr>`).join('')}</table>
        ${tipo === 'Jogador' ? `<p class="muted" style="font-size:13px;margin-top:10px">${esc(DICA_JOGADOR)}</p>` : ''}`
      : `<p class="muted" style="font-size:14px;margin:6px 0 14px">Fique em pé sobre um papel e meça do calcanhar até a ponta do dedo maior.</p>
        <table class="guia"><tr><th>Número</th><th>Pé (cm)</th></tr>${linhas.map(([t, c]) => `<tr><td>${t}</td><td>${String(c).replace('.', ',')} cm</td></tr>`).join('')}</table>`}
      <p class="muted" style="font-size:13px;margin-top:14px">Medidas aproximadas: podem variar um pouco entre modelos. Na dúvida, chame a loja no WhatsApp.</p>
      ${tem('duvida') ? `<a class="btn sec" style="margin-top:14px" target="_blank" rel="noopener" href="${linkWhats(`Olá! Tenho uma dúvida sobre o tamanho desta peça:\n*${p.nome}*`)}">${icoWhats()} ${esc(TXT_DUVIDA)}</a>` : ''}
    </div>`;
  $('#folha').onclick = (e) => { if (e.target.closest('[data-fechar]')) fecharFiltros(); };
  $('#folha').onchange = null;
  $('#veu').classList.add('on'); $('#folha').classList.add('on');
}
const toggle = (s, v) => (s.has(v) ? s.delete(v) : s.add(v));
function fecharFiltros() { $('#veu').classList.remove('on'); $('#folha').classList.remove('on'); }
$('#veu').onclick = fecharFiltros;

/* página do produto */
let scrollAntes = 0;
async function abrirProduto(id) {
  const p = porId(id);
  if (!p) { location.hash = ''; return; }
  const pg = $('#pagina');
  if (!pg.classList.contains('on')) scrollAntes = scrollY;
  let tam = '';
  const esg = esgotado(p);
  const fav = () => favs.includes(p.id);
  const rel = sugestoes([p], new Set([p.id]));
  const podePers = ligado(PERS) && p.categoria === 'camisa' && !esg;
  let pers = null; // { nome, numero } quando o cliente marca a personalização
  const fx = comboSelo;

  pg.innerHTML = `
    <div class="pg-top"><button class="icon-btn" data-voltar aria-label="Voltar">${ico('voltar')}</button><a href="#inicio" aria-label="${esc(loja.nome)}"><img src="assets/marca/simbolo-azul.png" alt="" style="height:30px"></a>
      <div class="dir"><button class="icon-btn coracao ${fav() ? 'on' : ''}" data-fav aria-label="Favoritar" aria-pressed="${fav()}">${ico('coracao')}</button><button class="icon-btn" data-share aria-label="Compartilhar">${ico('share')}</button></div></div>
    <div class="pg-in">
      <div><div class="galeria" id="gal"><img src="${p.thumb}" alt="${esc(p.nome)}"></div><div class="pontos" id="pts"></div></div>
      <div class="pd">
        ${tagDe(p)}
        <h1>${esc(p.nome)}</h1>
        <div class="sub">${esc([subDe(p), p.time ? p.marca : ''].filter(Boolean).join(' · '))}</div>
        <div id="pPreco">${precoHtml(p)}</div>
        ${fx && !esg ? `<div class="prog mini">${ico('sacola', 15)}<span><b>${esc(rotuloFaixa(fx))}</b>${fx.pague ? `: sai ${brl(Math.round(precoAtual(p) * (100 - fx.pct)) / 100)} cada` : ''}</span></div>` : ''}
        ${PROVA ? provaNumeros(true) : ''}
        <div class="sec-t"><span>${esg ? 'Tamanhos' : 'Escolha o tamanho'}</span><button class="lnk-guia" data-guia>${ico('regua', 16)} Guia de tamanhos</button></div>
        <div class="tams" id="tams">${p.variacoes.map((v) => `<button class="tam" data-t="${esc(v.tam)}" ${v.qtd <= 0 || p.esgotadoManual ? 'disabled' : ''}>${esc(v.tam)}${escassez && v.qtd > 0 && v.qtd <= 2 && !p.esgotadoManual ? '<i class="ult"></i>' : ''}</button>`).join('')}</div>
        <p class="restam" id="restam"></p>
        ${tem('guia') && p.categoria === 'camisa' && p.versao === 'Jogador' ? `<p class="dica-tam">${ico('regua', 15)} ${esc(DICA_JOGADOR)}</p>` : ''}
        ${tem('duvida') && !esg ? `<button class="lnk-duvida" data-duvida>${icoWhats(16)} ${esc(TXT_DUVIDA)}</button>` : ''}
        ${podePers ? `
          <div class="pers" id="persBox">
            <label class="sw"><span>Personalizar com nome e número<small>+ ${brl(Number(PERS.preco) || 0)} · peça personalizada não tem troca${Number(PERS.dias) ? ` · +${PERS.dias} ${Number(PERS.dias) === 1 ? 'dia útil' : 'dias úteis'} no prazo` : ''}</small></span><input type="checkbox" id="persOn"></label>
            <div class="pers-c" id="persC" hidden>
              <div class="pers-prev"><b id="persPN">NOME</b><span id="persPNum">10</span></div>
              <div class="dupla-ck"><label class="cmp"><span>Nome (até ${Number(PERS.maxNome) || 12} letras)</span><input id="persNome" maxlength="${Number(PERS.maxNome) || 12}" autocapitalize="characters"></label><label class="cmp"><span>Número</span><input id="persNum" inputmode="numeric" maxlength="2"></label></div>
            </div>
            ${PATCHES.length ? `<label class="cmp" style="margin-top:6px"><span>Patch (+ ${brl(Number(PERS.patch.preco) || 0)})</span><select id="persPatch"><option value="">Sem patch</option>${PATCHES.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>` : ''}
          </div>` : ''}
        <div class="cta"><div class="acoes">
          ${esg ? '' : `<button class="btn sec meia" id="btnSacola">${ico('sacola', 20)} Sacola</button>`}
          <button class="btn" id="btnWhats">${icoWhats()} ${esg ? 'Avise-me quando chegar' : 'Pedir no WhatsApp'}</button>
        </div></div>
        ${esg ? '' : SELO}
        ${esg ? '' : linhaPrazo() + linhaTrocas()}
        ${p.descricao ? `<p class="desc">${esc(p.descricao)}</p>` : ''}
        ${rel.length ? `<div class="sec-t" style="margin-top:40px">Você também pode gostar</div><div class="rel">${rel.map(card).join('')}</div>` : ''}
      </div>
    </div>`;
  pg.classList.remove('sai'); pg.classList.add('on');
  pg.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  document.title = `${p.nome} | ${loja.nome}`;
  api.contar(p.id, 'views');
  rs.produto(p);
  px('ViewContent', { content_ids: [p.id], content_type: 'product', content_name: p.nome, value: precoAtual(p) });
  pg.querySelector('[data-guia]').onclick = () => abrirGuia(p);
  const btnDuvida = pg.querySelector('[data-duvida]');
  if (btnDuvida) btnDuvida.onclick = () => { rs.whats(p); window.open(linkWhats(`Olá! Tenho uma dúvida sobre o tamanho desta peça:\n*${p.nome}*${tam ? `\nPensei no ${tam}` : ''}\n${location.href.split('#')[0]}#p/${p.id}`), '_blank', 'noopener'); };
  if (podePers) {
    const atual = () => {
      const nome = pg.querySelector('#persNome').value.toUpperCase().replace(/[^A-ZÀ-Ú .'-]/g, '');
      const numero = pg.querySelector('#persNum').value.replace(/\D/g, '').slice(0, 2);
      pg.querySelector('#persNome').value = nome; pg.querySelector('#persNum').value = numero;
      pg.querySelector('#persPN').textContent = nome || 'NOME'; pg.querySelector('#persPNum').textContent = numero || '10';
      const patch = pg.querySelector('#persPatch')?.value || '';
      const ligadoNome = pg.querySelector('#persOn').checked;
      pers = ligadoNome || patch ? { nome: ligadoNome ? nome.trim() : '', numero: ligadoNome ? numero : '', ...(patch ? { patch } : {}) } : null;
      if (pers && ligadoNome) pers.querNome = true;
      pg.querySelector('#pPreco').innerHTML = precoHtml(p, precoComPers(precoAtual(p), PERS, { pers: pers && { ...pers, nome: pers.nome || (ligadoNome ? ' ' : '') } }));
    };
    pg.querySelector('#persOn').onchange = (e) => { pg.querySelector('#persC').hidden = !e.target.checked; atual(); };
    pg.querySelector('#persPatch')?.addEventListener('change', atual);
    pg.querySelector('#persC').oninput = atual;
  }

  const tamsEl = pg.querySelector('#tams');
  tamsEl.onclick = (e) => {
    const b = e.target.closest('.tam');
    if (!b || b.disabled) return;
    tam = tam === b.dataset.t ? '' : b.dataset.t;
    pg.querySelectorAll('.tam').forEach((x) => x.classList.toggle('on', x.dataset.t === tam));
    const q = tam ? estoqueDe(p, tam) : 0;
    pg.querySelector('#restam').textContent = escassez && tam && q <= 2 ? (q === 1 ? 'Última peça nesse tamanho' : `Restam só ${q} nesse tamanho`) : '';
  };
  pg.querySelector('#btnWhats').onclick = () => {
    const url = location.href.split('#')[0] + '#p/' + p.id;
    const txt = esg
      ? `Olá! Vi no catálogo e quero ser avisado quando chegar:\n*${p.nome}*\n${url}`
      : `Olá! Vi no catálogo e tenho interesse:\n*${p.nome}*${tam ? `\nTamanho: ${tam}` : ''}\nValor: ${brl(precoAtual(p))}\n${url}`;
    api.contar(p.id, 'whats');
    rs.whats(p);
    window.open(linkWhats(txt), '_blank', 'noopener');
  };
  const btnSacola = pg.querySelector('#btnSacola');
  if (btnSacola) btnSacola.onclick = () => {
    if (!tam) {
      toast('Escolha o tamanho');
      tamsEl.classList.remove('pisca'); void tamsEl.offsetWidth; tamsEl.classList.add('pisca');
      return;
    }
    if (pers?.querNome && !pers.nome && !pers.numero) return toast('Escreva o nome ou o número da personalização');
    if (pers) delete pers.querNome;
    const mesmo = (i) => i.id === p.id && i.tam === tam && JSON.stringify(i.pers || null) === JSON.stringify(pers);
    const ja = sacola.find(mesmo);
    const noCarrinho = sacola.filter((i) => i.id === p.id && i.tam === tam).reduce((t, i) => t + i.qtd, 0);
    if (noCarrinho >= estoqueDe(p, tam)) return toast('Esse é todo o estoque desse tamanho');
    if (ja) ja.qtd++; else sacola.push({ id: p.id, tam, qtd: 1, ...(pers ? { pers } : {}) });
    salvarSacola(p);
    px('AddToCart', { content_ids: [p.id], content_type: 'product', content_name: p.nome, value: precoAtual(p) });
    toast('Adicionado à sacola');
  };
  pg.querySelector('[data-fav]').onclick = (e) => {
    favs = fav() ? favs.filter((x) => x !== p.id) : [p.id, ...favs];
    salvarFavs();
    e.currentTarget.classList.toggle('on', fav());
    e.currentTarget.setAttribute('aria-pressed', fav());
    toast(fav() ? 'Salvo nos favoritos' : 'Removido dos favoritos');
  };
  pg.querySelector('[data-share]').onclick = async () => {
    const url = location.href;
    if (navigator.share) { try { await navigator.share({ title: p.nome, url }); } catch {} }
    else { await navigator.clipboard.writeText(url); toast('Link copiado'); }
  };
  pg.querySelector('[data-voltar]').onclick = () => (voltarPossivel ? history.back() : (location.hash = '#inicio'));

  // fotos em alta só na página do produto
  const fotos = await api.fotos(p);
  if (fotos.length && location.hash === '#p/' + p.id) {
    const gal = pg.querySelector('#gal');
    gal.innerHTML = fotos.map((ft, i) => `<img src="${ft.full}" alt="${esc(p.nome)} foto ${i + 1}">`).join('');
    const pts = pg.querySelector('#pts');
    if (fotos.length > 1) {
      pts.innerHTML = fotos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('');
      gal.onscroll = () => {
        const i = Math.round(gal.scrollLeft / gal.clientWidth);
        pts.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
      };
    }
  }
}
// fecha a página com a animação de descida; depois() roda quando ela some
function fecharAnimado(pg, depois) {
  pg.classList.remove('on'); pg.classList.add('sai');
  setTimeout(() => { if (pg.classList.contains('sai')) { pg.classList.remove('sai'); depois?.(); } }, 260);
}
function fecharProduto() {
  const pg = $('#pagina');
  if (!pg.classList.contains('on')) return false;
  fecharAnimado(pg);
  document.body.style.overflow = '';
  document.title = `${loja.nome} | Catálogo`;
  return true;
}

/* rotas: #p/id (produto), #inicio, #comprar, #comprar/camisa, #comprar/promo, #comprar/time/Nome, #comprar/liga/Nome, #favoritos, #sacola, #loja */
let voltarPossivel = false;
function rota() {
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  let h = decodeURIComponent(location.hash.replace(/^#/, ''));
  // link de recuperação mandado pela loja no WhatsApp: #volta/<id~tam~qtd,...>/<CUPOM>
  const vm = h.match(/^volta\/([^/]*)\/?(.*)$/);
  if (vm) {
    let n = 0;
    vm[1].split(',').forEach((x) => {
      const [id, tam, q] = x.split('~');
      const p = porId(id), tem = p && tam ? estoqueDe(p, tam) : 0;
      if (tem <= 0) return;
      const qtd = Math.min(Math.max(1, Number(q) || 1), tem);
      const ja = sacola.find((i) => i.id === id && i.tam === tam && !i.pers);
      if (ja) ja.qtd = Math.max(ja.qtd, qtd); else sacola.push({ id, tam, qtd });
      n++;
    });
    if (n) salvarSacola();
    const cod = vm[2].trim().toUpperCase();
    if (cod) { ck.cupomTxt = cod; salvarCk(); srv.cupom(cod).then((c) => { ck.cupom = c; ck.cupomErro = ''; render(); toast(`Cupom ${c.codigo} aplicado: ${c.pct}% de desconto`); }).catch(() => {}); }
    history.replaceState(null, '', location.pathname + '#sacola');
    h = 'sacola';
    if (!n) setTimeout(() => toast('Essas peças acabaram. Veja as outras opções.'), 300);
  }
  const m = h.match(/^p\/(.+)$/);
  if (m) {
    if (!$('#tela').innerHTML) render();
    return abrirProduto(m[1]);
  }
  const voltando = fecharProduto();
  const [t, a, b] = h.split('/');
  if (t === 'comprar' && a) {
    zerarFiltros();
    if (a === 'promo') f.promo = true;
    else if (a === 'time' && b) f.times.add(b);
    else if (a === 'liga' && b) { f.cat = 'camisa'; f.ligas.add(b); }
    else if (a === 'col' && b) f.col = colecoes.find((c) => c.nome === b) || null;
    else f.cat = a;
  }
  const nova = TELAS[t] || t === 'finalizar' ? t : 'inicio';
  const mudou = nova !== aba || (!!a && !voltando);
  aba = nova;
  render();
  scrollTo(0, voltando && !mudou ? scrollAntes : 0);
  if (aba === 'finalizar' && !ck.opcoes && soDigitos(ck.cep).length === 8) cotarFrete();
  if (aba === 'finalizar' && sacola.length) { rs.checkout(); if (ck.telefone) rs.contato(ck.nome, ck.telefone); }
  else rs.pagina({ inicio: 'Início', comprar: 'Produtos', favoritos: 'Favoritos', sacola: 'Sacola', loja: 'A loja' }[aba] || 'Início');
  if (aba === 'finalizar' && !rota.iniciou && sacola.length) { rota.iniciou = true; const c = contaSacola(); px('InitiateCheckout', { value: c.total, num_items: c.pecas, content_ids: sacola.map((i) => i.id), content_type: 'product' }); }
}
addEventListener('hashchange', () => { voltarPossivel = true; rota(); });

/* cupom de primeira compra (painel > Loja). Aparece uma vez, depois de alguns segundos. */
const BV = loja.boasVindas || {};
function abrirBoasVindas() {
  const desenhar = (feito) => {
    $('#folha').innerHTML = `
      <div class="folha-h"><span></span><button class="icon-btn" data-fechar aria-label="Fechar">${ico('fechar')}</button></div>
      <div class="folha-c bv">
        <div class="bv-ic">${ico('presente', 34)}</div>
        ${feito ? `<h2>Seu cupom chegou</h2><p>Use na hora de pagar:</p>
          <button class="bv-cod" data-copiarbv>${esc(BV.cupom)}<small>Toque para copiar</small></button>
          <button class="btn" data-fechar style="margin-top:16px">Ver os produtos</button>`
        : `<h2>${esc(BV.titulo || 'Ganhe desconto na primeira compra')}</h2><p>${esc(BV.texto || 'Deixe seu WhatsApp e receba o cupom agora.')}</p>
          <label class="cmp"><span>Seu nome</span><input id="bvNome" autocomplete="name"></label>
          <label class="cmp"><span>WhatsApp com DDD</span><input id="bvWhats" inputmode="tel" autocomplete="tel" placeholder="(73) 99999-9999"></label>
          <button class="btn" data-bvok style="margin-top:14px">Quero meu cupom</button>
          <p class="muted" style="font-size:12px;margin-top:10px;text-align:center">A loja pode te chamar no WhatsApp com novidades.</p>`}
      </div>`;
  };
  desenhar(false);
  $('#folha').onchange = null;
  $('#folha').onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('fechar' in b.dataset) return fecharFiltros();
    if ('copiarbv' in b.dataset) { try { await navigator.clipboard.writeText(BV.cupom); toast('Cupom copiado'); } catch {} return; }
    if ('bvok' in b.dataset) {
      const nome = $('#bvNome').value.trim().slice(0, 60), whats = soDigitos($('#bvWhats').value);
      if (whats.length < 10 || whats.length > 13) return toast('Coloque o WhatsApp com DDD');
      b.disabled = true;
      try { await api.salvarLead({ nome, whats, criadoEm: Date.now() }); } catch (err) { console.error(err); }
      px('Lead', {});
      rs.cadastro(nome, whats);
      ck.cupomTxt = BV.cupom; if (!ck.nome && nome) ck.nome = nome; if (!ck.telefone) ck.telefone = whats; salvarCk();
      desenhar(true);
    }
  };
  $('#veu').classList.add('on'); $('#folha').classList.add('on');
}
if (BV.ativo && BV.cupom && !localStorage.getItem('b13-bv') && !location.search) {
  setTimeout(() => {
    if (['finalizar', 'pedido'].includes(aba) || $('#folha').classList.contains('on')) return;
    gravar('b13-bv', 1);
    abrirBoasVindas();
  }, 6000);
}

// cliente voltando da página de pagamento: ?pedido=...&transaction_nsu=...&slug=...
const params = new URLSearchParams(location.search);
if (params.get('pedido') || params.get('order_nsu')) {
  pd.q = Object.fromEntries(params);
  pd.q.pedido = pd.q.pedido || pd.q.order_nsu;
  aba = 'pedido';
  if (pd.q.demo === 'pagar') render(); else confirmarPedido();
} else rota();
