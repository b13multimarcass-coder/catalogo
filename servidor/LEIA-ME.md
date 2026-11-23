# Servidor de frete, etiqueta e pagamento

O arquivo `worker.js` roda de graça na Cloudflare. É ele que guarda as chaves da InfinitePay, do Melhor Envio e do Firebase, que não podem ficar no site.

Sem ele configurado, o site funciona em modo demonstração: o frete e o pagamento são simulados.

Pré-requisito: o Firebase já ligado (README principal).

## 1. InfinitePay (conta da B13)
1. No app da InfinitePay, ativar **Checkout integrado** ("Habilitar checkout integrado").
2. Anotar a **InfiniteTag** da loja, sem o `$`. Exemplo: `$b13multimarcas` vira `b13multimarcas`.
3. Opcional: gerar a **chave de API** (começa com `inchk_`, aparece uma vez só). Ela libera "parcelas sem juros", em que a loja paga a taxa.

A InfinitePay não tem ambiente de teste. O teste final é uma compra real de R$ 1,00 (passo 7).

## 2. Melhor Envio (conta da B13)
1. Criar a conta em melhorenvio.com.br, com o endereço de onde os pacotes saem.
2. Gerar um token em Integrações > Permissões de acesso > Gerar novo token, marcando estas permissões:

   | Permissão | Para quê |
   |---|---|
   | `shipping-calculate` | cotar o frete no site |
   | `cart-read`, `cart-write` | montar a etiqueta |
   | `shipping-checkout` | pagar a etiqueta com o saldo da carteira |
   | `shipping-generate` | gerar a etiqueta |
   | `shipping-print` | abrir o PDF para imprimir |
   | `shipping-tracking`, `orders-read` | pegar o código de rastreio |

   Se essa opção não aparecer, o token sai por um "aplicativo" na Área Dev e eu configuro.
3. Anotar a validade do token e renovar antes de vencer. Com o token vencido, o site mostra só retirada e entrega na cidade, e o botão de etiqueta avisa o erro.
4. Colocar **saldo na carteira** do Melhor Envio (Pix ou boleto). Cada etiqueta gerada no painel é paga com esse saldo. Sem saldo, o painel avisa e nada é cobrado.

## 3. Chave do Firebase para o servidor
No Console do Firebase: Configurações do projeto > Contas de serviço > **Gerar nova chave privada**.

Isso baixa um arquivo `.json`. Dele saem só dois valores: `client_email` e `private_key`. Não mande esse arquivo para ninguém.

## 4. Criar o Worker na Cloudflare
1. Criar a conta grátis em dash.cloudflare.com.
2. Workers & Pages > Create > Create Worker. Nome: `b13-loja`. Clicar em Deploy.
3. Edit code: apagar o que estiver lá, colar todo o `worker.js` e clicar em Deploy.
4. O endereço fica parecido com `https://b13-loja.SUACONTA.workers.dev`. Abrir no navegador deve mostrar `{"ok":true,...}`.

## 5. Variáveis do Worker
Em Settings > Variables and Secrets, criar uma por uma. O cadeado indica "Secret" (fica escondido).

| Nome | Valor |
|---|---|
| `SITE_URL` | endereço do catálogo, ex.: `https://b13multimarcas.com.br/` |
| `FIREBASE_PROJECT_ID` | id do projeto Firebase |
| `FIREBASE_CLIENT_EMAIL` 🔒 | `client_email` do arquivo do passo 3 |
| `FIREBASE_PRIVATE_KEY` 🔒 | `private_key` do arquivo do passo 3, inteiro, com o BEGIN e o END |
| `FIREBASE_API_KEY` | o `apiKey` que está em `assets/config.js` (confere o login do painel na hora de gerar etiqueta) |
| `INFINITEPAY_HANDLE` | InfiniteTag sem `$` |
| `INFINITEPAY_API_KEY` 🔒 | opcional, a chave `inchk_...` |
| `MELHOR_ENVIO_TOKEN` 🔒 | token do passo 2 |
| `MELHOR_ENVIO_EMAIL` | e-mail de contato da loja (o Melhor Envio exige) |

Para testar o frete sem mexer na conta real, `MELHOR_ENVIO_URL` = `https://sandbox.melhorenvio.com.br`. Isso exige uma conta e um token criados no sandbox.

## 6. Ligar no site
- Em `assets/config.js`, colocar o endereço do Worker em `SERVIDOR_URL` e publicar o site.
- No painel, aba **Loja** > Entrega, preencher:
  - o CEP de onde os pacotes saem;
  - a retirada na loja;
  - a entrega na cidade (valor e começo dos CEPs);
  - o frete grátis, se houver.
- Ainda na aba **Loja**, parte **Etiquetas (remetente)**: nome, CPF ou CNPJ, telefone, e-mail e endereço de quem envia. Isso vai impresso na etiqueta.
- No Firestore, colar de novo o `firestore.rules` (ele ganhou a coleção `interno`, onde fica o remetente).
- Na parte **Pagamento online**, deve aparecer "Ligado".

## 7. Teste real de R$ 1,00
1. No painel, criar um produto "Teste", com preço R$ 1,00 e 1 peça, e deixar visível.
2. No catálogo, pôr esse produto na sacola, escolher **Retirar na loja** e pagar com Pix.
3. Conferir o resultado:
   - a tela de "Pagamento aprovado" aparece;
   - o pedido aparece na aba Pedidos como "Pago, a enviar";
   - o estoque do produto vai para 0;
   - a venda aparece na aba Estoque.
4. Apagar o produto de teste.

## Etiqueta pelo painel
1. Pedido pago por transportadora (PAC, SEDEX, Jadlog...). Abrir o pedido na aba **Pedidos** e tocar em **Gerar etiqueta**.
2. O servidor monta a etiqueta com o serviço que o cliente escolheu, paga com o saldo da carteira do Melhor Envio e gera o PDF.
3. Aparece o botão **Imprimir etiqueta**, e o rastreio já vem preenchido.
4. Colar a etiqueta na caixa, levar na agência (ou esperar a coleta) e tocar em **Marcar como enviado e avisar o cliente**.

Sem nota fiscal, a etiqueta vai com **declaração de conteúdo** (o Melhor Envio gera junto). O cliente informa o CPF no checkout porque as transportadoras pedem.

Se algo falhar no meio (sem saldo, token vencido), o painel mostra o motivo. Tocar de novo continua de onde parou, sem pagar duas vezes. Para cancelar uma etiqueta paga e ainda não postada, é pelo site do Melhor Envio (o valor volta para a carteira).

## Como funciona
1. O cliente digita o CEP. O servidor lê os produtos no Firestore e cota no Melhor Envio. Ele soma a retirada e a entrega na cidade conforme a aba Loja.
2. Em "Pagar":
   - o servidor confere de novo o preço, o estoque e o frete (nunca confia no que veio do navegador);
   - grava o pedido como "aguardando";
   - cria o link na InfinitePay, e o cliente vai para a página de pagamento.
3. Depois do pagamento, a InfinitePay avisa o servidor (`/webhook`) e o cliente volta para o site (`/confirmar`). Nos dois casos, o servidor pergunta à InfinitePay se o pagamento foi aprovado. Esse aviso não tem assinatura, por isso o servidor sempre confirma.
4. Se foi aprovado, o pedido vira "pago", o estoque baixa e a venda entra no painel com o custo. Isso acontece uma vez só, mesmo que o aviso e a volta do cliente cheguem juntos.

Embalagem padrão usada na cotação (cm e kg). Dá para mudar em `EMBALAGENS`, no topo do `worker.js`:

| Categoria | Embalagem |
|---|---|
| camisa | 25 x 4 x 30, 0,3 kg |
| chuteira | 20 x 12 x 33, 1,0 kg |
| tênis | 22 x 13 x 34, 1,1 kg |
