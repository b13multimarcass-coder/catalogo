import { abrir, esgotado, precoAtual, brl, esc, ico, icoWhats, CATEGORIAS, soDigitos } from './data.js';
import { criar as criarServidor, buscarEndereco } from './servidor.js';

const $ = (s) => document.querySelector(s);
const api = await abrir();
const loja = await api.config();
let produtos = (await api.produtos()).filter((p) => p.visivel !== false);
const f = { cat: '', tams: new Set(), times: new Set(), promo: false, q: '' };
let aba = 'inicio';
const srv = criarServidor(api, loja, produtos);

// ordem: destaques, depois mais novos; esgotados no fim
produtos.sort((a, b) => esgotado(a) - esgotado(b) || !!b.destaque - !!a.destaque || b.criadoEm - a.criadoEm);
const porId = (id) => produtos.find((p) => p.id === id);
const emPromo = (p) => p.promo && p.promo < p.preco;

/* guardado no aparelho: favoritos e sacola */
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let favs = ler('b13-fav').filter(porId);
let sacola = ler('b13-sacola').filter((i) => porId(i.id));
const salvarFavs = () => gravar('b13-fav', favs);
const salvarSacola = () => { gravar('b13-sacola', sacola); desenharAbas(); };
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
const tagDe = (p) => (esgotado(p) ? '<span class="tag cinza">Esgotado</span>' : emPromo(p) ? '<span class="tag">Promoção</span>' : p.destaque ? '<span class="tag cinza">Destaque</span>' : '');
const precoHtml = (p) =>
  emPromo(p) ? `<div class="preco"><span class="pr">${brl(p.promo)}</span><s>${brl(p.preco)}</s></div>` : `<div class="preco">${brl(p.preco)}</div>`;
const subDe = (p) => [CATEGORIAS.find((c) => c.id === p.categoria)?.um, p.time || p.marca].filter(Boolean).join(' · ');

function card(p) {
  return `<a class="card ${esgotado(p) ? 'esg' : ''}" href="#p/${p.id}">
    <div class="ph"><img src="${p.thumb}" alt="${esc(p.nome)}" loading="lazy"></div>
    <div class="info">${tagDe(p)}<div class="nome">${esc(p.nome)}</div><div class="sub">${esc(subDe(p))}</div>${precoHtml(p)}</div></a>`;
}

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function filtrar(ignorar) {
  const q = norm(f.q);
  return produtos.filter((p) => {
    if (f.cat && p.categoria !== f.cat) return false;
    if (q && !norm(`${p.nome} ${p.time} ${p.marca}`).includes(q)) return false;
    if (ignorar === 'tudo') return true;
    if (f.promo && !emPromo(p)) return false;
    if (ignorar !== 'tam' && f.tams.size && !p.variacoes.some((v) => f.tams.has(v.tam) && v.qtd > 0 && !p.esgotadoManual)) return false;
    if (ignorar !== 'time' && f.times.size && !f.times.has(p.time)) return false;
    return true;
  });
}
const nFiltros = () => f.tams.size + f.times.size + (f.promo ? 1 : 0);
const zerarFiltros = () => { f.cat = ''; f.promo = false; f.tams.clear(); f.times.clear(); };

/* menu em pílula */
const catsComProduto = () => CATEGORIAS.filter((c) => produtos.some((p) => p.categoria === c.id));
function rotuloSel() {
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
}
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

function render() {
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
  const slides = [
    `<a class="slide marca-s" href="#comprar"><img src="assets/marca/logo-branco.png" alt="${esc(loja.nome)}"><p>${esc(loja.slogan || '')}</p><i>Ver o catálogo</i></a>`,
    ...dest.map((p) => `<a class="slide ${p.fotoIds?.length ? '' : 'sem-foto'}" href="#p/${p.id}"><img src="${p.thumb}" alt=""><div class="txt"><small>${emPromo(p) ? 'Promoção' : 'Destaque'}</small><b>${esc(p.nome)}</b><span>${brl(precoAtual(p))}</span></div></a>`)
  ];
  const capa = (cat) => produtos.find((p) => p.categoria === cat && p.destaque && !esgotado(p)) || produtos.find((p) => p.categoria === cat);
  const promo = produtos.find((p) => emPromo(p) && !esgotado(p));
  const blocos = catsComProduto().map((c) => `<a class="bloco" href="#comprar/${c.id}"><img src="${capa(c.id).thumb}" alt=""><b>${c.nome}</b></a>`);
  if (promo) blocos.push(`<a class="bloco promo" href="#comprar/promo"><img src="${promo.thumb}" alt=""><b>Promoções</b></a>`);
  const novos = produtos.filter((p) => !esgotado(p)).sort((a, b) => b.criadoEm - a.criadoEm).slice(0, 8);
  const altas = produtos.filter((p) => !esgotado(p) && p.destaque).slice(0, 8);
  const times = [...new Set(produtos.map((p) => p.time).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const faixa = (t, lista, link) => (lista.length ? `<section class="faixa"><h2>${t}<a href="${link}">Ver tudo</a></h2><div class="trilho">${lista.map(card).join('')}</div></section>` : '');
  return `
    <div class="hero" id="hero">${slides.join('')}</div>
    <div class="dots"><div id="dots">${slides.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></div>
    <div class="blocos">${blocos.join('')}</div>
    ${faixa('Em alta', altas, '#comprar')}
    ${faixa('Chegou agora', novos, '#comprar')}
    ${times.length ? `<section class="faixa"><h2>Por time</h2><div class="times">${times.map((t) => `<a class="chip" href="#comprar/time/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div></section>` : ''}
    <div style="height:8px"></div>`;
}
function ligarHero() {
  const h = $('#hero'), d = $('#dots');
  if (!h) return;
  h.onscroll = () => {
    const w = h.firstElementChild.offsetWidth + 10;
    const i = Math.round(h.scrollLeft / w);
    d.querySelectorAll('i').forEach((x, k) => x.classList.toggle('on', k === i));
  };
}

function telaComprar() {
  const n = nFiltros();
  const lista = filtrar();
  const cats = [{ id: '', nome: 'Tudo' }, ...catsComProduto()];
  return `
    <div class="tit"><h1>${f.q ? 'Busca' : esc(rotuloSel())}</h1><p>${lista.length} ${lista.length === 1 ? 'produto' : 'produtos'}${n || f.q ? ` · <button data-limpar style="text-decoration:underline;color:var(--tx)">Limpar filtros</button>` : ''}</p></div>
    <nav class="chips">${cats.map((c) => `<button class="chip ${f.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.nome}</button>`).join('')}<button class="chip ${n ? 'on' : ''}" data-filtro>${ico('filtro', 18)} Filtrar${n ? `<span class="n">${n}</span>` : ''}</button></nav>
    <section class="grid">${lista.length ? lista.map(card).join('') : `<div class="vazio" style="grid-column:1/-1">Nada encontrado com esses filtros.</div>`}</section>`;
}
function telaFavoritos() {
  const lista = favs.map(porId).filter(Boolean);
  if (!lista.length)
    return `<div class="tit"><h1>Favoritos</h1></div><div class="vazio2"><div class="ic">${ico('coracao', 30)}</div><b>Nenhum favorito ainda</b>Toque no coração de um produto para guardar ele aqui.<a class="btn mini" href="#comprar" style="margin-top:6px">Ver produtos</a></div>`;
  return `<div class="tit"><h1>Favoritos</h1><p>${lista.length} ${lista.length === 1 ? 'produto' : 'produtos'}</p></div><section class="grid">${lista.map(card).join('')}</section>`;
}
function telaSacola() {
  if (!sacola.length)
    return `<div class="tit"><h1>Sacola</h1></div><div class="vazio2"><div class="ic">${ico('sacola', 30)}</div><b>Sua sacola está vazia</b>Junte os produtos aqui e mande o pedido inteiro numa mensagem só.<a class="btn mini" href="#comprar" style="margin-top:6px">Ver produtos</a></div>`;
  const total = sacola.reduce((s, i) => s + precoAtual(porId(i.id)) * i.qtd, 0);
  const pecas = sacola.reduce((s, i) => s + i.qtd, 0);
  return `
    <div class="tit"><h1>Sacola</h1><p>${pecas} ${pecas === 1 ? 'peça' : 'peças'}</p></div>
    <div class="itens">${sacola.map((i, k) => {
      const p = porId(i.id);
      const max = estoqueDe(p, i.tam);
      return `<div class="item"><a class="ph" href="#p/${p.id}"><img src="${p.thumb}" alt=""></a><div>
        <div class="nm">${esc(p.nome)}</div><div class="sb">Tamanho ${esc(i.tam)}${max < i.qtd ? ' · <span style="color:var(--promo)">sem estoque suficiente</span>' : ''}</div>
        ${precoHtml(p)}
        <div class="rod"><div class="qtd"><button data-menos="${k}" aria-label="${i.qtd > 1 ? 'Diminuir' : 'Remover'}">${ico(i.qtd > 1 ? 'menos' : 'lixo', 18)}</button><span>${i.qtd}</span><button data-mais="${k}" aria-label="Aumentar" ${i.qtd >= max ? 'disabled' : ''}>${ico('mais', 18)}</button></div></div>
      </div></div>`;
    }).join('')}</div>
    <div class="resumo">
      <div class="l t"><span>Total</span><span>${brl(total)}</span></div>
      <small>Calcule o frete e pague com Pix ou cartão em até 12x. Se preferir, combine tudo pelo WhatsApp.</small>
      <a class="btn" href="#finalizar">Finalizar compra</a>
      <button class="btn sec" data-pedir style="margin-top:10px">${icoWhats()} Pedir pelo WhatsApp</button>
      <button class="lnk" data-esvaziar>Esvaziar sacola</button>
    </div>`;
}
function telaLoja() {
  return `
    <div class="lojab">
      <div class="cab"><img src="assets/marca/logo-branco.png" alt="${esc(loja.nome)}">${loja.slogan ? `<p>${esc(loja.slogan)}</p>` : ''}</div>
      <a class="btn" href="${linkWhats('Olá! Vim pelo catálogo.')}" target="_blank" rel="noopener">${icoWhats()} Falar no WhatsApp</a>
      ${loja.instagram ? `<a class="btn sec" href="https://instagram.com/${esc(loja.instagram)}" target="_blank" rel="noopener">Instagram @${esc(loja.instagram)}</a>` : ''}
      ${loja.cidade ? `<p class="muted" style="text-align:center">${esc(loja.cidade)}</p>` : ''}
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
const ck = { cep: '', opcoes: null, freteId: '', carregando: false, erro: '', simulado: false, nome: '', telefone: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
try { Object.assign(ck, JSON.parse(localStorage.getItem(CK_KEY)) || {}, { opcoes: null, carregando: false, erro: '' }); } catch {}
const CAMPOS_CK = ['cep', 'freteId', 'nome', 'telefone', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
const salvarCk = () => gravar(CK_KEY, Object.fromEntries(CAMPOS_CK.map((k) => [k, ck[k]])));
const freteEscolhido = () => ck.opcoes?.find((o) => o.id === ck.freteId);
const fmtCep = (c) => { const d = soDigitos(c); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5, 8) : d; };
const subtotalSacola = () => sacola.reduce((t, i) => t + precoAtual(porId(i.id)) * i.qtd, 0);
const detalheFrete = (o) => (o.tipo === 'transportadora' ? `${o.empresa ? o.empresa + ' · ' : ''}${o.prazo ? `até ${o.prazo} ${o.prazo === 1 ? 'dia útil' : 'dias úteis'}` : ''}` : o.detalhe || '');

function telaFinalizar() {
  if (!sacola.length) return telaSacola();
  const sub = subtotalSacola();
  const pecas = sacola.reduce((t, i) => t + i.qtd, 0);
  const op = freteEscolhido();
  const entrega = op && op.tipo !== 'retirada';
  const campo = (id, rot, extra = '') => `<label class="cmp"><span>${rot}</span><input data-ck="${id}" value="${esc(ck[id])}" ${extra}></label>`;
  return `
    <div class="tit"><a href="#sacola" class="voltar-lnk">${ico('voltar', 18)} Sacola</a><h1>Finalizar compra</h1><p>${pecas} ${pecas === 1 ? 'peça' : 'peças'} · ${brl(sub)}</p></div>
    <div class="fin">
      <section class="passo"><h2><b>1</b> Entrega</h2>
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
        ${entrega ? `
          <div class="dupla-ck">${campo('rua', 'Rua', 'autocomplete="address-line1"')}${campo('numero', 'Número', 'inputmode="numeric"')}</div>
          ${campo('complemento', 'Complemento', 'placeholder="Opcional"')}
          ${campo('bairro', 'Bairro')}
          <div class="dupla-ck">${campo('cidade', 'Cidade')}${campo('uf', 'UF', 'maxlength="2"')}</div>` : ''}
      </section>
      <section class="passo"><h2><b>3</b> Pagamento</h2>
        <div class="l"><span>Produtos</span><span>${brl(sub)}</span></div>
        <div class="l"><span>Frete</span><span>${op ? (op.preco ? brl(op.preco) : 'Grátis') : '—'}</span></div>
        <div class="l t"><span>Total</span><span>${brl(sub + (op?.preco || 0))}</span></div>
        <button class="btn" data-pagar style="margin-top:16px">Pagar ${brl(sub + (op?.preco || 0))}</button>
        <p class="seguro">Pix ou cartão em até 12x, na página segura da InfinitePay.</p>
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
    : op.tipo !== 'retirada' && ['rua', 'numero', 'bairro', 'cidade', 'uf'].find((k) => !String(ck[k]).trim());
  if (faltando) {
    const [k, msg] = Array.isArray(faltando) ? faltando : [faltando, 'Complete o endereço de entrega'];
    toast(msg); $(`[data-ck="${k}"]`)?.focus(); return;
  }
  b.disabled = true; b.textContent = 'Abrindo o pagamento…';
  try {
    const r = await srv.pagar({
      itens: sacola, cep: ck.cep, freteId: ck.freteId,
      cliente: { nome: ck.nome.trim(), telefone: ck.telefone },
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
  if (k === 'cep') {
    const d = soDigitos(ck.cep);
    if (d.length === 8 && d !== ck.cepCotado) { ck.cepCotado = d; ck.cep = d; cotarFrete(); }
  }
  salvarCk();
});
$('#tela').addEventListener('change', (e) => {
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
      sacola = sacola.filter((i) => !vendidos.has(i.id + '|' + i.tam)); salvarSacola();
      ck.opcoes = null; ck.freteId = '';
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
  if ('limpar' in d) { zerarFiltros(); f.q = ''; $('#q').value = ''; fecharBusca(); return render(); }
  if (d.cat !== undefined) { f.cat = d.cat; f.promo = false; f.tams.clear(); return render(); }
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
  if (d.sim) return simularPagamento(d.sim);
  if ('reconfirmar' in d) return confirmarPedido();
});
function pedirSacola(comEntrega) {
  const base = location.href.split('#')[0].split('?')[0];
  let total = 0;
  const linhas = sacola.map((i) => {
    const p = porId(i.id);
    total += precoAtual(p) * i.qtd;
    api.contar(p.id, 'whats');
    return `${i.qtd}x *${p.nome}*\nTamanho: ${i.tam} · ${brl(precoAtual(p) * i.qtd)}\n${base}#p/${p.id}`;
  });
  let txt = `Olá! Quero fazer este pedido pelo catálogo:\n\n${linhas.join('\n\n')}`;
  const op = comEntrega && ck.opcoes?.find((o) => o.id === ck.freteId);
  if (op) {
    total += op.preco;
    txt += `\n\nEntrega: ${op.nome}${op.empresa ? ' (' + op.empresa + ')' : ''} · ${op.preco ? brl(op.preco) : 'grátis'}`;
    if (op.tipo !== 'retirada' && ck.rua) txt += `\n${ck.rua}, ${ck.numero}${ck.complemento ? ' ' + ck.complemento : ''} · ${ck.bairro} · ${ck.cidade}/${ck.uf} · CEP ${ck.cep}`;
  }
  if (comEntrega && ck.nome) txt += `\nNome: ${ck.nome}`;
  txt += `\n\n*Total: ${brl(total)}*`;
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
  const temPromo = base.some(emPromo);
  const grupo = (titulo, itens, set, chave) =>
    itens.length ? `<div class="sec-t">${titulo}</div><div class="chips">${itens.map((t) => `<button class="chip ${set.has(t) ? 'on' : ''}" data-${chave}="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '';
  const desenhar = () => {
    const n = filtrar().length;
    $('#folha').innerHTML = `
      <div class="folha-h">Filtrar<button class="icon-btn" data-fechar aria-label="Fechar">${ico('fechar')}</button></div>
      <div class="folha-c">
        ${grupo('Tamanho', tams, f.tams, 'tam')}
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
    else if ('zerar' in b.dataset) { f.tams.clear(); f.times.clear(); f.promo = false; }
    else if ('fechar' in b.dataset) return fecharFiltros();
    desenhar(); render();
  };
  $('#folha').onchange = (e) => { if (e.target.id === 'fPromo') { f.promo = e.target.checked; desenhar(); render(); } };
  $('#veu').classList.add('on');
  $('#folha').classList.add('on');
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
  const rel = produtos.filter((x) => x.id !== p.id && !esgotado(x) && ((x.time && x.time === p.time) || x.categoria === p.categoria)).slice(0, 8);

  pg.innerHTML = `
    <div class="pg-top"><button class="icon-btn" data-voltar aria-label="Voltar">${ico('voltar')}</button><a href="#inicio" aria-label="${esc(loja.nome)}"><img src="assets/marca/simbolo-azul.png" alt="" style="height:30px"></a>
      <div class="dir"><button class="icon-btn coracao ${fav() ? 'on' : ''}" data-fav aria-label="Favoritar" aria-pressed="${fav()}">${ico('coracao')}</button><button class="icon-btn" data-share aria-label="Compartilhar">${ico('share')}</button></div></div>
    <div class="pg-in">
      <div><div class="galeria" id="gal"><img src="${p.thumb}" alt="${esc(p.nome)}"></div><div class="pontos" id="pts"></div></div>
      <div class="pd">
        ${tagDe(p)}
        <h1>${esc(p.nome)}</h1>
        <div class="sub">${esc([subDe(p), p.time ? p.marca : ''].filter(Boolean).join(' · '))}</div>
        ${precoHtml(p)}
        <div class="sec-t"><span>${esg ? 'Tamanhos' : 'Escolha o tamanho'}</span></div>
        <div class="tams" id="tams">${p.variacoes.map((v) => `<button class="tam" data-t="${esc(v.tam)}" ${v.qtd <= 0 || p.esgotadoManual ? 'disabled' : ''}>${esc(v.tam)}</button>`).join('')}</div>
        <div class="cta"><div class="acoes">
          ${esg ? '' : `<button class="btn sec meia" id="btnSacola">${ico('sacola', 20)} Sacola</button>`}
          <button class="btn" id="btnWhats">${icoWhats()} ${esg ? 'Avise-me quando chegar' : 'Pedir no WhatsApp'}</button>
        </div></div>
        ${p.descricao ? `<p class="desc">${esc(p.descricao)}</p>` : ''}
        ${rel.length ? `<div class="sec-t" style="margin-top:40px">Você também pode gostar</div><div class="rel">${rel.map(card).join('')}</div>` : ''}
      </div>
    </div>`;
  pg.classList.add('on');
  pg.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  document.title = `${p.nome} | ${loja.nome}`;
  api.contar(p.id, 'views');

  const tamsEl = pg.querySelector('#tams');
  tamsEl.onclick = (e) => {
    const b = e.target.closest('.tam');
    if (!b || b.disabled) return;
    tam = tam === b.dataset.t ? '' : b.dataset.t;
    pg.querySelectorAll('.tam').forEach((x) => x.classList.toggle('on', x.dataset.t === tam));
  };
  pg.querySelector('#btnWhats').onclick = () => {
    const url = location.href.split('#')[0] + '#p/' + p.id;
    const txt = esg
      ? `Olá! Vi no catálogo e quero ser avisado quando chegar:\n*${p.nome}*\n${url}`
      : `Olá! Vi no catálogo e tenho interesse:\n*${p.nome}*${tam ? `\nTamanho: ${tam}` : ''}\nValor: ${brl(precoAtual(p))}\n${url}`;
    api.contar(p.id, 'whats');
    window.open(linkWhats(txt), '_blank', 'noopener');
  };
  const btnSacola = pg.querySelector('#btnSacola');
  if (btnSacola) btnSacola.onclick = () => {
    if (!tam) {
      toast('Escolha o tamanho');
      tamsEl.classList.remove('pisca'); void tamsEl.offsetWidth; tamsEl.classList.add('pisca');
      return;
    }
    const ja = sacola.find((i) => i.id === p.id && i.tam === tam);
    if (ja && ja.qtd >= estoqueDe(p, tam)) return toast('Esse é todo o estoque desse tamanho');
    if (ja) ja.qtd++; else sacola.push({ id: p.id, tam, qtd: 1 });
    salvarSacola();
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
function fecharProduto() {
  const pg = $('#pagina');
  if (!pg.classList.contains('on')) return false;
  pg.classList.remove('on');
  document.body.style.overflow = '';
  document.title = `${loja.nome} | Catálogo`;
  return true;
}

/* rotas: #p/id (produto), #inicio, #comprar, #comprar/camisa, #comprar/promo, #comprar/time/Nome, #favoritos, #sacola, #loja */
let voltarPossivel = false;
function rota() {
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
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
    else f.cat = a;
  }
  const nova = TELAS[t] || t === 'finalizar' ? t : 'inicio';
  const mudou = nova !== aba || (!!a && !voltando);
  aba = nova;
  render();
  scrollTo(0, voltando && !mudou ? scrollAntes : 0);
  if (aba === 'finalizar' && !ck.opcoes && soDigitos(ck.cep).length === 8) cotarFrete();
}
addEventListener('hashchange', () => { voltarPossivel = true; rota(); });

// cliente voltando da página de pagamento: ?pedido=...&transaction_nsu=...&slug=...
const params = new URLSearchParams(location.search);
if (params.get('pedido') || params.get('order_nsu')) {
  pd.q = Object.fromEntries(params);
  pd.q.pedido = pd.q.pedido || pd.q.order_nsu;
  aba = 'pedido';
  if (pd.q.demo === 'pagar') render(); else confirmarPedido();
} else rota();
