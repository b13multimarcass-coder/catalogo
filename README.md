# Catálogo B13

Site estático (HTML, CSS e JS puros, sem build) para GitHub Pages, com Firebase no plano gratuito.

- `index.html`: vitrine pública. É o link que vai no WhatsApp. Link direto de produto: `.../#p/<id>`.
- `admin.html`: painel da loja (login).
- `assets/config.js`: config do Firebase e dados iniciais da loja.
- `firestore.rules`: regras de segurança para colar no console.
- `servidor/`: frete (Melhor Envio) e pagamento (InfinitePay) num Cloudflare Worker grátis. Passo a passo em `servidor/LEIA-ME.md`.
- `documentos/`: material para o cliente (ex.: tabela de taxas de pagamento).
- `prints/`: telas da primeira versão.

## Modo demonstração
Sem o Firebase configurado, tudo roda com produtos de exemplo guardados no navegador. Frete e pagamento ficam simulados até o servidor ser ligado.
Para testar no Mac: `python3 -m http.server 8000` dentro desta pasta e abrir http://localhost:8000.

## Ligar o Firebase (uma vez)
1. Criar o projeto no console do Firebase (plano Spark, gratuito). Não precisa do Storage: as fotos são comprimidas no celular (cerca de 150 KB) e salvas no Firestore.
2. Authentication: ativar E-mail/senha e Google. Em "Domínios autorizados", incluir o domínio do GitHub Pages.
3. Firestore: criar o banco (southamerica-east1) e colar `firestore.rules` na aba Regras.
4. Criar a conta do lojista (fazer login uma vez no `admin.html`), copiar o UID em Authentication e criar o documento `admins/<UID>` com qualquer campo (ex.: `nome: "B13"`).
5. Copiar o config do app Web para `FB_CFG` em `assets/config.js` e conferir `FB_HOSTS`.
6. Entrar no painel, aba Loja: colocar o WhatsApp certo e salvar.

## Estrutura no Firestore
- `config/loja`: nome, frase, WhatsApp, Instagram, alertas
- `produtos/{id}`: nome, categoria, time, marca, preço, promoção, variações (tamanho e quantidade), capa
- `fotos/{id}`: foto grande e miniatura
- `priv/{id}`: custo (só o lojista lê)
- `movimentos/{id}`: vendas, entradas e saídas, com o custo da época (o lucro antigo não muda se o custo mudar)
- `stats/{id}`: visitas e cliques no WhatsApp
- `pedidos/{id}`: pedidos pagos pelo site (cliente, CPF, endereço, itens, frete, pagamento, etiqueta, andamento). Só o servidor cria.
- `interno/remetente`: quem envia o pacote (nome, CPF/CNPJ, endereço), usado na etiqueta do Melhor Envio. Só o lojista lê.

## Identidade visual
- Originais enviados pela B13 em `identidade/`. Azul da marca: `#4055A2`.
- Recortes com fundo transparente em `assets/marca/` (logo, símbolo e nome, em azul e branco), ícone do site e `compartilhar.jpg` (prévia do link no WhatsApp).
- A prévia do link (`og:image`) já aponta para o endereço completo em b13multimarcas.com.br. O WhatsApp só mostra a prévia com o endereço completo.

## Domínio: b13multimarcas.com.br
Registrado no Registro.br pela B13. O arquivo `CNAME` já diz ao GitHub Pages qual é o domínio.

1. **Registro.br** > domínio > DNS > "Editar zona" (usar os servidores DNS do próprio Registro.br). Criar estas entradas:

   | Tipo | Nome | Valor |
   |---|---|---|
   | A | (vazio) | 185.199.108.153 |
   | A | (vazio) | 185.199.109.153 |
   | A | (vazio) | 185.199.110.153 |
   | A | (vazio) | 185.199.111.153 |
   | CNAME | www | b13multimarcass-coder.github.io. |

2. **GitHub**: no repositório > Settings > Pages > Custom domain: `b13multimarcas.com.br`. Depois que o DNS propagar (de minutos a algumas horas), marcar "Enforce HTTPS".
3. **Firebase** > Authentication > Configurações > Domínios autorizados: incluir `b13multimarcas.com.br` e `www.b13multimarcas.com.br`.
4. **Servidor**: `SITE_URL` = `https://b13multimarcas.com.br/`.
