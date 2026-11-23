// Camada de dados: o mesmo conjunto de funções roda em dois modos.
// - demo: dados no localStorage, com produtos de exemplo
// - firebase: Auth + Firestore (plano gratuito). Fotos comprimidas ficam no Firestore.
import { FB_CFG, FB_HOSTS, LOJA_PADRAO } from './config.js';
import { seedDemo, pedidosDemo } from './seed.js';

export const modo = FB_CFG && FB_HOSTS.includes(location.hostname) ? 'firebase' : 'demo';

let api;
export async function abrir() {
  if (!api) api = modo === 'firebase' ? await firebaseApi() : demoApi();
  return api;
}

export const esgotado = (p) => p.esgotadoManual || p.variacoes.every((v) => v.qtd <= 0);
export const totalEstoque = (p) => p.variacoes.reduce((s, v) => s + Math.max(0, v.qtd), 0);
export const precoAtual = (p) => (p.promo && p.promo < p.preco ? p.promo : p.preco);
const sinal = (t) => (t === 'entrada' ? 1 : -1);

// Diferença de estoque entre o cadastro antigo e o novo vira movimentação
function ajustesDoCadastro(antes, depois, produtoId, nome, custo) {
  const movs = [];
  depois.variacoes.forEach((v) => {
    const old = antes?.variacoes.find((o) => o.tam === v.tam)?.qtd || 0;
    const d = v.qtd - old;
    if (d !== 0)
      movs.push({
        produtoId, nome, tam: v.tam, tipo: d > 0 ? 'entrada' : 'saida', qtd: Math.abs(d),
        preco: 0, custo, data: Date.now(), obs: antes ? 'Ajuste no cadastro' : 'Estoque inicial'
      });
  });
  return movs;
}

/* ---------------- modo demonstração ---------------- */
function demoApi() {
  const KEY = 'b13-demo-v1';
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { s = null; }
  if (!s) s = seedDemo(LOJA_PADRAO);
  s.config = { ...LOJA_PADRAO, ...s.config };
  if (!s.pedidos) s.pedidos = pedidosDemo(s);
  const salvar = () => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); }
    catch { throw new Error('O modo demonstração guarda pouca coisa no navegador. Com o Firebase ligado esse limite some.'); }
  };
  salvar();
  const novoId = (p) => p + ++s.seq;
  let user = sessionStorage.getItem('b13-demo-user') ? { email: 'demo@b13' } : null;
  const ouvintes = [];

  function aplicarMov(m) {
    const p = s.produtos[m.produtoId];
    if (!p) return;
    const v = p.variacoes.find((x) => x.tam === m.tam);
    if (v) v.qtd += sinal(m.tipo) * m.qtd;
  }

  return {
    modo: 'demo',
    async config() { return s.config; },
    async produtos() { return Object.values(s.produtos); },
    async fotos(p) { return (p.fotoIds || []).map((id) => ({ id, ...s.fotos[id] })).filter((f) => f.full); },
    async contar(id, campo) { s.stats[id] = s.stats[id] || { views: 0, whats: 0 }; s.stats[id][campo]++; salvar(); },

    onAuth(cb) { ouvintes.push(cb); cb(user); },
    async entrar() { user = { email: 'demo@b13' }; sessionStorage.setItem('b13-demo-user', '1'); ouvintes.forEach((f) => f(user)); },
    async entrarGoogle() { return this.entrar(); },
    async sair() { user = null; sessionStorage.removeItem('b13-demo-user'); ouvintes.forEach((f) => f(user)); },

    async privados() { return s.priv; },
    async stats() { return s.stats; },
    async movimentos() { return [...s.movimentos].sort((a, b) => b.data - a.data); },

    async salvarProduto({ id, dados, custo, fotos }) {
      id = id || novoId('p');
      const antes = s.produtos[id];
      const fotoIds = fotos.map((f) => {
        if (f.id) return f.id;
        const fid = novoId('f');
        s.fotos[fid] = { full: f.full, thumb: f.thumb };
        return fid;
      });
      (antes?.fotoIds || []).filter((f) => !fotoIds.includes(f)).forEach((f) => delete s.fotos[f]);
      const prod = { ...dados, id, fotoIds, thumb: fotos[0]?.thumb || '', criadoEm: antes?.criadoEm || Date.now() };
      ajustesDoCadastro(antes, prod, id, prod.nome, custo).forEach((m) => s.movimentos.push({ id: novoId('m'), ...m }));
      s.produtos[id] = prod;
      s.priv[id] = { custo };
      salvar();
      return id;
    },
    async excluirProduto(id) {
      (s.produtos[id]?.fotoIds || []).forEach((f) => delete s.fotos[f]);
      delete s.produtos[id]; delete s.priv[id]; delete s.stats[id];
      salvar();
    },
    async registrar(m) {
      const mov = { id: novoId('m'), ...m };
      aplicarMov(mov);
      s.movimentos.push(mov);
      salvar();
    },
    async excluirMovimento(id) {
      const m = s.movimentos.find((x) => x.id === id);
      if (!m) return;
      aplicarMov({ ...m, qtd: -m.qtd });
      s.movimentos = s.movimentos.filter((x) => x.id !== id);
      salvar();
    },
    async salvarConfig(c) { s.config = { ...s.config, ...c }; salvar(); },
    async pedidos() { return [...s.pedidos].sort((a, b) => b.criadoEm - a.criadoEm); },
    async salvarPedido(p) { s.pedidos = s.pedidos.filter((x) => x.id !== p.id).concat(p); salvar(); },
    async atualizarPedido(id, campos) { const p = s.pedidos.find((x) => x.id === id); if (p) Object.assign(p, campos); salvar(); },
    async remetente() { return s.remetente || {}; },
    async salvarRemetente(r) { s.remetente = r; salvar(); },
    async token() { return 'demo'; },
    async resetarDemo() { localStorage.removeItem(KEY); }
  };
}

/* ---------------- Firebase ---------------- */
async function firebaseApi() {
  const V = '10.12.2';
  const base = `https://www.gstatic.com/firebasejs/${V}/`;
  const [A, U, F] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js')
  ]);
  const app = A.initializeApp(FB_CFG);
  const auth = U.getAuth(app);
  const db = F.getFirestore(app);
  const { doc, collection, getDoc, getDocs, setDoc, deleteDoc, writeBatch, runTransaction, increment } = F;

  const lista = async (nome) => (await getDocs(collection(db, nome))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const mapa = async (nome) => Object.fromEntries((await lista(nome)).map((d) => [d.id, d]));

  return {
    modo: 'firebase',
    async config() {
      const d = await getDoc(doc(db, 'config', 'loja'));
      return { ...LOJA_PADRAO, ...(d.exists() ? d.data() : {}) };
    },
    async produtos() { return lista('produtos'); },
    async fotos(p) {
      const ds = await Promise.all((p.fotoIds || []).map((id) => getDoc(doc(db, 'fotos', id))));
      return ds.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() }));
    },
    async contar(id, campo) {
      try { await setDoc(doc(db, 'stats', id), { [campo]: increment(1) }, { merge: true }); } catch {}
    },

    onAuth(cb) { U.onAuthStateChanged(auth, cb); },
    entrar(email, senha) { return U.signInWithEmailAndPassword(auth, email, senha); },
    entrarGoogle() { return U.signInWithPopup(auth, new U.GoogleAuthProvider()); },
    sair() { return U.signOut(auth); },

    async privados() { return mapa('priv'); },
    async stats() { return mapa('stats'); },
    async movimentos() { return (await lista('movimentos')).sort((a, b) => b.data - a.data); },

    async salvarProduto({ id, dados, custo, fotos }) {
      const ref = id ? doc(db, 'produtos', id) : doc(collection(db, 'produtos'));
      const antesSnap = id ? await getDoc(ref) : null;
      const antes = antesSnap?.exists() ? antesSnap.data() : null;
      const b = writeBatch(db);
      const fotoIds = fotos.map((f) => {
        if (f.id) return f.id;
        const fr = doc(collection(db, 'fotos'));
        b.set(fr, { full: f.full, thumb: f.thumb, produtoId: ref.id });
        return fr.id;
      });
      (antes?.fotoIds || []).filter((f) => !fotoIds.includes(f)).forEach((f) => b.delete(doc(db, 'fotos', f)));
      const prod = { ...dados, fotoIds, thumb: fotos[0]?.thumb || '', criadoEm: antes?.criadoEm || Date.now() };
      delete prod.id;
      b.set(ref, prod);
      b.set(doc(db, 'priv', ref.id), { custo });
      ajustesDoCadastro(antes, prod, ref.id, prod.nome, custo).forEach((m) => b.set(doc(collection(db, 'movimentos')), m));
      await b.commit();
      return ref.id;
    },
    async excluirProduto(id) {
      const snap = await getDoc(doc(db, 'produtos', id));
      const b = writeBatch(db);
      (snap.data()?.fotoIds || []).forEach((f) => b.delete(doc(db, 'fotos', f)));
      ['produtos', 'priv', 'stats'].forEach((c) => b.delete(doc(db, c, id)));
      await b.commit();
    },
    async registrar(m, inverter = false) {
      await runTransaction(db, async (t) => {
        const ref = doc(db, 'produtos', m.produtoId);
        const snap = await t.get(ref);
        if (snap.exists()) {
          const variacoes = snap.data().variacoes.map((v) =>
            v.tam === m.tam ? { ...v, qtd: v.qtd + sinal(m.tipo) * m.qtd * (inverter ? -1 : 1) } : v);
          t.update(ref, { variacoes });
        }
        if (inverter) t.delete(doc(db, 'movimentos', m.id));
        else t.set(doc(collection(db, 'movimentos')), m);
      });
    },
    async excluirMovimento(id) {
      const snap = await getDoc(doc(db, 'movimentos', id));
      if (snap.exists()) await this.registrar({ id, ...snap.data() }, true);
    },
    async salvarConfig(c) { await setDoc(doc(db, 'config', 'loja'), c, { merge: true }); },
    async pedidos() { return (await lista('pedidos')).sort((a, b) => b.criadoEm - a.criadoEm); },
    async atualizarPedido(id, campos) { await setDoc(doc(db, 'pedidos', id), campos, { merge: true }); },
    // dados de quem envia (vão na etiqueta). Ficam em interno/, que só o lojista lê.
    async remetente() { const d = await getDoc(doc(db, 'interno', 'remetente')); return d.exists() ? d.data() : {}; },
    async salvarRemetente(r) { await setDoc(doc(db, 'interno', 'remetente'), r); },
    async token() { return auth.currentUser?.getIdToken(); }
  };
}

/* ---------------- entrega ---------------- */
// Mesma regra em servidor/worker.js: mude nos dois lugares.
export const soDigitos = (t) => String(t || '').replace(/\D/g, '');
export function opcoesLocais(cfg, cep, subtotal) {
  const ops = [];
  const gratis = Number(cfg.freteGratisAcima) > 0 && subtotal >= Number(cfg.freteGratisAcima);
  if (cfg.retirada) ops.push({ id: 'retirada', tipo: 'retirada', nome: 'Retirar na loja', preco: 0, detalhe: cfg.enderecoRetirada || 'Combine o horário pelo WhatsApp' });
  const prefixos = String(cfg.cepsLocais || '').split(',').map(soDigitos).filter(Boolean);
  if (cfg.entregaLocal && prefixos.some((p) => soDigitos(cep).startsWith(p)))
    ops.push({ id: 'local', tipo: 'local', nome: `Entrega em ${cfg.cidade || 'sua cidade'}`, preco: gratis ? 0 : Number(cfg.valorEntregaLocal) || 0, detalhe: 'Entrega da própria loja' });
  return ops;
}
// CPF do cliente vai na etiqueta. Mesma regra em servidor/worker.js.
export function cpfValido(c) {
  c = soDigitos(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
export const STATUS_PEDIDO = {
  aguardando: 'Aguardando pagamento', pago: 'Pago, a enviar', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado'
};

/* ---------------- utilidades ---------------- */
export const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const CATEGORIAS = [
  { id: 'camisa', nome: 'Camisas', um: 'Camisa' },
  { id: 'chuteira', nome: 'Chuteiras', um: 'Chuteira' },
  { id: 'tenis', nome: 'Tênis', um: 'Tênis' }
];
export const TAMANHOS = {
  camisa: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'Infantil 8', 'Infantil 10', 'Infantil 12', 'Infantil 14'],
  chuteira: ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
  tenis: ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45']
};

// Comprime a foto no próprio aparelho antes de salvar
export function comprimir(file, max, q) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', q));
    };
    img.onerror = erro;
    img.src = URL.createObjectURL(file);
  });
}

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICO = {
  voltar: '<path d="M15 18l-6-6 6-6"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  caixa: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  setas: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  loja: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 01-6 0 3 3 0 01-4 0 3 3 0 01-6 0V9z"/><path d="M5 13v8h14v-8"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  alerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  olho: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sair: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  casa: '<path d="M4 10.5L12 4l8 6.5V20H4z"/>',
  camisa: '<path d="M8.5 4L4 6.5l1.8 4 2-.8V20h8.4V9.7l2 .8 1.8-4L15.5 4a3.5 3.5 0 01-7 0z"/>',
  coracao: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.4 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z"/>',
  sacola: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 016 0V8"/>',
  baixo: '<path d="M7 10l5 5 5-5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  menos: '<path d="M5 12h14"/>'
};
export const ico = (n, s = 22) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n]}</svg>`;
export const icoWhats = (s = 20) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3a.4.4 0 000-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.2c0-.1-.2-.2-.5-.3z"/></svg>`;
