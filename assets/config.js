// Configuração do catálogo B13.
//
// Enquanto FB_CFG estiver vazio, o site roda em "modo demonstração":
// os dados ficam só no navegador, com produtos de exemplo.
//
// Para ligar o Firebase: crie o projeto, copie o config do app Web
// (Console do Firebase > Configurações do projeto > Seus apps) e cole abaixo.
// Depois coloque em FB_HOSTS o endereço onde o site vai rodar.

// Projeto "B13 Multimarcas" na conta Google da B13 (b13multimarcass@gmail.com).
export const FB_CFG = {
  apiKey: 'AIzaSyD4NGkeh78z3Ftao54WpHRj98heKSNsqlI',
  authDomain: 'b13-multimarcas.firebaseapp.com',
  projectId: 'b13-multimarcas',
  storageBucket: 'b13-multimarcas.firebasestorage.app',
  messagingSenderId: '581637625779',
  appId: '1:581637625779:web:abdace4be326e731e2ddc6'
};

export const FB_HOSTS = ['b13multimarcas.com.br', 'www.b13multimarcas.com.br', 'b13multimarcass-coder.github.io'];

// Endereço do servidor de frete e pagamento (Cloudflare Worker, pasta servidor/).
// Vazio = frete e pagamento simulados (modo demonstração).
export const SERVIDOR_URL = 'https://b13-loja.b13multimarcass.workers.dev';

// Valores iniciais da loja (editáveis no painel, aba Loja)
export const LOJA_PADRAO = {
  nome: 'B13 Multimarcas',
  slogan: 'Camisas, chuteiras e tênis.',
  whatsapp: '5573999999999',
  instagram: 'b13store',
  cidade: '',
  estoqueMinimo: 2,
  diasParado: 30,
  // entrega e pagamento
  cepOrigem: '',            // CEP de onde os pacotes saem (Melhor Envio)
  retirada: true,           // cliente pode retirar na loja
  enderecoRetirada: '',
  entregaLocal: false,      // entrega própria na cidade
  valorEntregaLocal: 10,
  cepsLocais: '',           // início dos CEPs da cidade, separados por vírgula (ex.: 45600, 45601)
  freteGratisAcima: 0,      // 0 = sem frete grátis
  parcelasSemJuros: 0       // parcelas em que a loja paga a taxa (precisa da chave de API da InfinitePay)
};
