// Produtos de exemplo para o modo demonstração.
// As imagens são ilustrações em SVG; no uso real o lojista sobe as fotos.

const svg = (body) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">${body}</svg>`);

const sombra = '<ellipse cx="300" cy="540" rx="190" ry="14" fill="#000" opacity=".06"/>';

function camisa({ base, sec, padrao = 'liso', gola }) {
  const corpo =
    'M200 110 L252 90 Q300 122 348 90 L400 110 L492 168 L456 252 L410 230 L410 502 Q300 518 190 502 L190 230 L144 252 L108 168 Z';
  let pat = '';
  if (padrao === 'listras') {
    for (let x = 150; x < 460; x += 52) pat += `<rect x="${x}" y="60" width="26" height="480" fill="${sec}"/>`;
  } else if (padrao === 'aros') {
    for (let y = 150; y < 520; y += 56) pat += `<rect x="90" y="${y}" width="420" height="28" fill="${sec}"/>`;
  } else if (padrao === 'faixa') {
    pat = `<path d="M150 120 L215 100 L470 520 L400 530 Z" fill="${sec}"/>`;
  } else if (padrao === 'peito') {
    pat = `<rect x="90" y="250" width="420" height="44" fill="${sec}"/>`;
  }
  return svg(`${sombra}
    <defs><clipPath id="c"><path d="${corpo}"/></clipPath></defs>
    <path d="${corpo}" fill="${base}"/>
    <g clip-path="url(#c)">${pat}
      <path d="M108 168 L144 252 L160 244 L124 160 Z" fill="${gola || sec}"/>
      <path d="M492 168 L456 252 L440 244 L476 160 Z" fill="${gola || sec}"/>
      <rect x="180" y="300" width="240" height="220" fill="#000" opacity=".03"/>
    </g>
    <path d="M252 90 Q300 140 348 90" fill="none" stroke="${gola || sec}" stroke-width="12" stroke-linecap="round"/>
    <circle cx="352" cy="196" r="17" fill="${gola || sec}" opacity=".9"/>
    <path d="${corpo}" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="2"/>`);
}

function chuteira({ base, sec, sola = '#1a1a1a' }) {
  const cab = 'M110 404 Q98 330 118 282 Q170 262 226 280 Q266 290 304 258 Q334 240 364 260 L410 304 Q478 320 512 350 Q532 372 516 396 Z';
  let travas = '';
  [170, 230, 300, 380, 440, 492].forEach((x) => (travas += `<rect x="${x - 9}" y="418" width="18" height="22" rx="4" fill="${sola}"/>`));
  return svg(`${sombra}
    ${travas}
    <path d="M124 404 L522 390 Q528 410 508 418 L134 428 Z" fill="${sola}"/>
    <defs><clipPath id="b"><path d="${cab}"/></clipPath></defs>
    <path d="${cab}" fill="${base}"/>
    <g clip-path="url(#b)">
      <path d="M200 400 Q300 300 470 330 L480 345 Q320 330 230 410 Z" fill="${sec}"/>
      <path d="M190 292 Q200 250 248 236 L300 244 L210 300 Z" fill="${sec}" opacity=".85"/>
    </g>
    <path d="M330 262 L360 300 M316 272 L346 310 M302 282 L332 318" stroke="${sec}" stroke-width="5" stroke-linecap="round" opacity=".6"/>`);
}

function tenis({ base, sec, sola = '#ffffff' }) {
  const cab = 'M102 402 Q90 318 116 292 Q172 282 232 298 Q278 262 342 268 L386 304 Q462 318 506 346 Q526 362 516 384 Z';
  return svg(`${sombra}
    <path d="M94 398 L522 380 Q532 410 510 428 L112 444 Q88 432 94 398 Z" fill="${sola}" stroke="#000" stroke-opacity=".1" stroke-width="2"/>
    <path d="M104 432 L512 418 Q508 430 500 434 L114 446 Z" fill="#1a1a1a" opacity=".85"/>
    <defs><clipPath id="t"><path d="${cab}"/></clipPath></defs>
    <path d="${cab}" fill="${base}"/>
    <g clip-path="url(#t)">
      <path d="M180 410 Q300 320 520 360 L520 380 Q320 350 200 420 Z" fill="${sec}"/>
      <path d="M90 330 L170 318 L190 410 L90 410 Z" fill="${sec}" opacity=".9"/>
    </g>
    <path d="M300 280 L330 316 M286 290 L316 326 M272 300 L302 336" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`);
}

const DIA = 86400000;

// rng determinístico para os dados de exemplo ficarem sempre iguais
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

const TAM_CAMISA = ['P', 'M', 'G', 'GG', 'XG'];
const TAM_PE = ['37', '38', '39', '40', '41', '42', '43', '44'];

const BASE = [
  { nome: 'Camisa Flamengo I 25/26', categoria: 'camisa', time: 'Flamengo', marca: 'Adidas', preco: 279.9, custo: 150, img: camisa({ base: '#c8102e', sec: '#111', padrao: 'aros', gola: '#111' }), estoque: [2, 6, 5, 3, 1], destaque: true, vendas: 18 },
  { nome: 'Camisa Corinthians I 25/26', categoria: 'camisa', time: 'Corinthians', marca: 'Nike', preco: 279.9, custo: 145, img: camisa({ base: '#fafafa', sec: '#111', padrao: 'liso', gola: '#111' }), estoque: [1, 4, 4, 2, 0], vendas: 11 },
  { nome: 'Camisa Palmeiras I 25/26', categoria: 'camisa', time: 'Palmeiras', marca: 'Puma', preco: 269.9, promo: 229.9, custo: 140, img: camisa({ base: '#0b6b3a', sec: '#fff', padrao: 'liso', gola: '#fff' }), estoque: [0, 3, 2, 2, 1], vendas: 9 },
  { nome: 'Camisa Seleção Brasileira I', categoria: 'camisa', time: 'Brasil', marca: 'Nike', preco: 299.9, custo: 160, img: camisa({ base: '#ffd200', sec: '#0b8a3e', padrao: 'liso', gola: '#0b8a3e' }), estoque: [3, 5, 6, 4, 2], destaque: true, vendas: 22 },
  { nome: 'Camisa São Paulo I 25/26', categoria: 'camisa', time: 'São Paulo', marca: 'New Balance', preco: 279.9, custo: 148, img: camisa({ base: '#fafafa', sec: '#c8102e', padrao: 'peito', gola: '#111' }), estoque: [1, 1, 0, 1, 0], vendas: 6 },
  { nome: 'Camisa Vasco I 25/26', categoria: 'camisa', time: 'Vasco', marca: 'Kappa', preco: 259.9, custo: 135, img: camisa({ base: '#111', sec: '#fafafa', padrao: 'faixa', gola: '#fafafa' }), estoque: [2, 2, 3, 1, 1], vendas: 0, parado: true },
  { nome: 'Camisa Barcelona I 25/26', categoria: 'camisa', time: 'Barcelona', marca: 'Nike', preco: 319.9, promo: 279.9, custo: 170, img: camisa({ base: '#a50044', sec: '#004d98', padrao: 'listras', gola: '#edbb00' }), estoque: [0, 2, 2, 1, 0], vendas: 7 },
  { nome: 'Camisa Real Madrid I 25/26', categoria: 'camisa', time: 'Real Madrid', marca: 'Adidas', preco: 319.9, custo: 172, img: camisa({ base: '#fafafa', sec: '#d4a017', padrao: 'liso', gola: '#1d1d6b' }), estoque: [0, 0, 0, 0, 0], vendas: 8 },
  { nome: 'Chuteira Campo Speed Elite', categoria: 'chuteira', marca: 'Nike', preco: 499.9, custo: 290, img: chuteira({ base: '#ff4f7b', sec: '#111' }), estoque: [0, 1, 2, 2, 3, 1, 1, 0], destaque: true, vendas: 7 },
  { nome: 'Chuteira Society Pro Control', categoria: 'chuteira', marca: 'Adidas', preco: 349.9, custo: 190, img: chuteira({ base: '#141414', sec: '#d7ff3a', sola: '#d7ff3a' }), estoque: [1, 2, 3, 3, 2, 2, 1, 1], vendas: 10 },
  { nome: 'Chuteira Futsal Touch', categoria: 'chuteira', marca: 'Puma', preco: 259.9, promo: 219.9, custo: 130, img: chuteira({ base: '#f4f4f4', sec: '#1e5bff', sola: '#c9a46a' }), estoque: [0, 1, 1, 2, 1, 0, 0, 0], vendas: 4 },
  { nome: 'Tênis Runner Leve', categoria: 'tenis', marca: 'Nike', preco: 449.9, custo: 250, img: tenis({ base: '#9aa3ad', sec: '#ff6a13' }), estoque: [1, 2, 2, 3, 2, 2, 1, 0], vendas: 6 },
  { nome: 'Tênis Street Branco', categoria: 'tenis', marca: 'Adidas', preco: 399.9, custo: 210, img: tenis({ base: '#fbfbfb', sec: '#1a1a1a' }), estoque: [2, 3, 3, 4, 4, 3, 2, 1], vendas: 12 },
  { nome: 'Tênis Retrô Preto', categoria: 'tenis', marca: 'Puma', preco: 379.9, custo: 200, img: tenis({ base: '#1a1a1a', sec: '#c8102e', sola: '#efe6d6' }), estoque: [0, 0, 1, 0, 1, 0, 0, 0], vendas: 3 }
];

const DESC = {
  camisa: 'Modelo torcedor, tecido leve que seca rápido. Escudo e detalhes aplicados.',
  chuteira: 'Cabedal macio com bom toque na bola e solado com tração firme.',
  tenis: 'Confortável para o dia todo, com entressola macia e solado aderente.'
};

export function seedDemo(config) {
  const r = rng(13);
  const agora = Date.now();
  const produtos = {}, priv = {}, fotos = {}, stats = {};
  const movimentos = [];
  let n = 0;

  BASE.forEach((b, i) => {
    const id = 'p' + (i + 1);
    const tams = b.categoria === 'camisa' ? TAM_CAMISA : TAM_PE;
    const fotoId = 'f' + (i + 1);
    fotos[fotoId] = { full: b.img, thumb: b.img };
    produtos[id] = {
      id,
      nome: b.nome,
      categoria: b.categoria,
      time: b.time || '',
      marca: b.marca,
      descricao: DESC[b.categoria],
      preco: b.preco,
      promo: b.promo || null,
      variacoes: tams.map((t, k) => ({ tam: t, qtd: b.estoque[k] })),
      fotoIds: [fotoId],
      thumb: b.img,
      visivel: true,
      destaque: !!b.destaque,
      esgotadoManual: false,
      criadoEm: agora - (70 - i * 3) * DIA
    };
    priv[id] = { custo: b.custo };
    stats[id] = { views: Math.round(40 + r() * 260 + (b.destaque ? 200 : 0)), whats: 0 };
    stats[id].whats = Math.round(stats[id].views * (0.08 + r() * 0.12));

    // vendas espalhadas nos últimos 55 dias (ou mais antigas, se o produto está parado)
    const vendidosPorTam = tams.map(() => 0);
    for (let v = 0; v < b.vendas; v++) {
      const k = Math.floor(r() * tams.length);
      vendidosPorTam[k]++;
      const preco = b.promo && r() > 0.4 ? b.promo : b.preco;
      movimentos.push({
        id: 'm' + ++n, produtoId: id, nome: b.nome, tam: tams[k], tipo: 'venda', qtd: 1,
        preco, custo: b.custo, data: agora - Math.floor(r() * 55 * DIA) - 3600000, obs: ''
      });
    }
    // entrada inicial que fecha com o estoque atual
    tams.forEach((t, k) => {
      const q = b.estoque[k] + vendidosPorTam[k];
      if (q > 0)
        movimentos.push({
          id: 'm' + ++n, produtoId: id, nome: b.nome, tam: t, tipo: 'entrada', qtd: q,
          preco: 0, custo: b.custo, data: agora - (b.parado ? 75 : 62) * DIA, obs: 'Estoque inicial'
        });
    });
  });

  movimentos.sort((a, b) => b.data - a.data);
  return { config: { ...config }, produtos, priv, fotos, stats, movimentos, seq: n };
}

// Dois pedidos de exemplo para o painel (um pago a enviar, outro já enviado)
export function pedidosDemo(s) {
  const ps = Object.values(s.produtos).filter((p) => p.variacoes.some((v) => v.qtd > 0));
  const item = (p, qtd = 1) => {
    const v = p.variacoes.find((x) => x.qtd > 0);
    return { id: p.id, nome: p.nome, tam: v.tam, qtd, preco: p.promo && p.promo < p.preco ? p.promo : p.preco };
  };
  const montar = (id, horas, status, itens, frete, cliente, endereco, extra = {}) => {
    const subtotal = itens.reduce((t, i) => t + i.preco * i.qtd, 0);
    return {
      id, criadoEm: Date.now() - horas * 3600000, status, itens, subtotal, frete,
      total: Math.round((subtotal + frete.preco) * 100) / 100, cliente, endereco,
      pagamento: { metodo: 'pix', parcelas: 1, recibo: '' }, ...extra
    };
  };
  return [
    montar('B13-DEMO1', 3, 'pago', [item(ps[0]), item(ps[3])],
      { id: 'me-1', tipo: 'transportadora', nome: 'PAC', empresa: 'Correios', preco: 24.9, prazo: 6 },
      { nome: 'Rafael Souza', telefone: '5571988887777' },
      { cep: '40140110', rua: 'Rua Exemplo', numero: '120', complemento: 'Apto 302', bairro: 'Barra', cidade: 'Salvador', uf: 'BA' }),
    montar('B13-DEMO2', 52, 'enviado', [item(ps[8])],
      { id: 'me-2', tipo: 'transportadora', nome: 'SEDEX', empresa: 'Correios', preco: 41.5, prazo: 2 },
      { nome: 'Juliana Lima', telefone: '5573977776666' },
      { cep: '45600000', rua: 'Avenida Exemplo', numero: '45', complemento: '', bairro: 'Centro', cidade: 'Itabuna', uf: 'BA' },
      { rastreio: 'AA123456789BR', pagamento: { metodo: 'credit_card', parcelas: 3, recibo: '' } })
  ];
}
