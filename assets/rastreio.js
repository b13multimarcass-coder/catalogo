// Rastreio da vitrine: quantas pessoas entram, de onde vêm, o que olham, o que põem na sacola
// e quem chegou no pagamento sem pagar (para a loja chamar no WhatsApp).
//
// Dois lugares no Firestore (ver firestore.rules):
// - dias/{AAAA-MM-DD}: contadores do dia (visitantes, sessões, origem e, por produto, vistos,
//   sacola e WhatsApp). Leve: o painel lê um documento por dia.
// - visitantes/{id}: a ficha de quem está navegando (id aleatório guardado no aparelho).
//   Nome e WhatsApp só entram se a própria pessoa digitou (cupom de primeira compra ou checkout).
//
// Escritas são agrupadas (uma a cada poucos segundos) para caber no plano gratuito.
// Quem abriu o painel neste aparelho (o lojista) não é contado.
import { diaDe, soDigitos, precoAtual } from './data.js';

const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const novoId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]).join('');

// De onde a pessoa veio. Chamar antes de a URL ser limpa.
export function origemDaVisita() {
  const q = new URLSearchParams(location.search);
  const utm = (q.get('utm_source') || '').toLowerCase();
  const ref = document.referrer ? new URL(document.referrer).hostname : '';
  const ua = navigator.userAgent;
  const t = utm + ' ' + ref;
  if (/instagram|\big\b/.test(t) || /Instagram/.test(ua)) return 'instagram';
  if (/facebook|fb\b|meta/.test(t) || /FBAN|FBAV/.test(ua) || q.get('fbclid')) return 'facebook';
  if (/whats|wa\.me/.test(t)) return 'whatsapp';
  if (/google/.test(t) || q.get('gclid')) return 'google';
  if (/tiktok/.test(t)) return 'tiktok';
  if (ref && ref !== location.hostname) return 'outros';
  return 'direto';
}
export const ORIGENS = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', google: 'Google', tiktok: 'TikTok', outros: 'Outros sites', direto: 'Link direto ou digitado' };

export function criarRastreio(api, porId) {
  const desligado = localStorage.getItem('b13-lojista') || navigator.webdriver;
  const nada = () => {};
  if (desligado) return { produto: nada, sacola: nada, pagina: nada, checkout: nada, contato: nada, whats: nada, pedidoWhats: nada, comprou: nada, cadastro: nada };

  let vid = ler('b13-vid', '');
  const primeira = !vid;
  if (!vid) { vid = novoId(); gravar('b13-vid', vid); }
  const ficha = ler('b13-ficha', { vistos: [], etapa: 'navegando' });
  const salvarFicha = () => gravar('b13-ficha', ficha);

  // contadores do dia
  const hoje = diaDe();
  const novaSessao = !sessionStorage.getItem('b13-sessao');
  const contas = [];
  if (novaSessao) { sessionStorage.setItem('b13-sessao', '1'); contas.push('sessoes', 'o_' + origemDaVisita()); }
  if (ler('b13-dia', '') !== hoje) { gravar('b13-dia', hoje); contas.push('visitantes'); }
  if (contas.length) api.somar(contas);

  // ficha: junta as mudanças e manda de uma vez
  let pendente = { ultimo: Date.now(), pagina: 'Início', aparelho: matchMedia('(pointer: coarse)').matches ? 'celular' : 'computador' };
  if (novaSessao) pendente.origem = origemDaVisita();
  if (primeira || !ficha.criado) pendente.criadoEm = Date.now();
  let visita = novaSessao, timer = 0;
  const enviar = () => {
    clearTimeout(timer); timer = 0;
    if (!pendente) return;
    const dados = { ...pendente, ultimo: Date.now() };
    pendente = null;
    api.visitante(vid, dados, visita);
    visita = false;
    if (!ficha.criado) { ficha.criado = 1; salvarFicha(); }
  };
  const marcar = (dados, ja = false) => {
    pendente = { ...(pendente || {}), ...dados };
    if (ja) return enviar();
    if (!timer) timer = setTimeout(enviar, 2500);
  };
  enviar();
  // "online agora": um sinal a cada 90 s enquanto a página está aberta (até 30 min)
  let sinais = 0;
  setInterval(() => { if (document.visibilityState === 'visible' && sinais++ < 20) marcar({}, true); }, 90000);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviar(); });

  const itensSacola = (sacola) => sacola.map((i) => {
    const p = porId(i.id);
    return { id: i.id, nome: p?.nome || '', tam: i.tam, qtd: i.qtd, preco: p ? precoAtual(p) : 0, ...(i.pers ? { pers: [i.pers.nome, i.pers.numero, i.pers.patch && 'patch ' + i.pers.patch].filter(Boolean).join(' ') } : {}) };
  });
  const contou = new Set(ler('b13-contou-' + hoje, []));
  const umaVezNoDia = (k) => { if (contou.has(k)) return false; contou.add(k); gravar('b13-contou-' + hoje, [...contou]); return true; };

  return {
    produto(p) {
      api.somar(['v_' + p.id]);
      const ja = ficha.vistos.find((v) => v.id === p.id);
      if (ja) { ja.n++; ja.t = Date.now(); } else ficha.vistos.unshift({ id: p.id, n: 1, t: Date.now() });
      ficha.vistos = ficha.vistos.sort((a, b) => b.t - a.t).slice(0, 15);
      salvarFicha();
      marcar({ pagina: p.nome.slice(0, 80), vistos: ficha.vistos });
    },
    pagina(nome) { marcar({ pagina: nome.slice(0, 80) }); },
    // chamada a cada mudança da sacola; novo = produto que acabou de entrar
    sacola(sacola, novo) {
      if (novo) api.somar(['s_' + novo.id]);
      const itens = itensSacola(sacola).slice(0, 30);
      const valor = Math.round(itens.reduce((t, i) => t + i.preco * i.qtd, 0) * 100) / 100;
      if (ficha.etapa !== 'comprou' || itens.length) ficha.etapa = itens.length ? (ficha.etapa === 'checkout' ? 'checkout' : 'sacola') : 'navegando';
      salvarFicha();
      marcar({ sacola: itens, valor, etapa: ficha.etapa, ...(novo ? { sacolaEm: Date.now() } : {}) }, true);
    },
    checkout() {
      if (umaVezNoDia('checkout')) api.somar(['checkout']);
      ficha.etapa = 'checkout'; salvarFicha();
      marcar({ etapa: 'checkout', checkoutEm: Date.now(), pagina: 'Finalizar compra' }, true);
    },
    contato(nome, whats) {
      whats = soDigitos(whats).slice(0, 13);
      nome = String(nome || '').trim().slice(0, 60);
      if (whats.length < 10 || (whats === ficha.whats && nome === (ficha.nome || ''))) return;
      ficha.whats = whats; ficha.nome = nome; salvarFicha();
      marcar({ whats, nome });
    },
    cadastro(nome, whats) { api.somar(['cadastros']); this.contato(nome, whats); },
    whats(p) { api.somar(['w_' + p.id]); },
    pedidoWhats() {
      if (umaVezNoDia('pedidoWhats')) api.somar(['pedidoWhats']);
      ficha.etapa = 'whats'; salvarFicha();
      marcar({ etapa: 'whats' }, true);
    },
    comprou(pedido, sacolaRestante) {
      if (umaVezNoDia('compra-' + pedido)) api.somar(['compras']);
      ficha.etapa = 'comprou'; salvarFicha();
      const itens = itensSacola(sacolaRestante);
      marcar({ etapa: 'comprou', comprouEm: Date.now(), pedido: String(pedido).slice(0, 40), sacola: itens, valor: itens.reduce((t, i) => t + i.preco * i.qtd, 0), pagina: 'Compra aprovada' }, true);
    }
  };
}
