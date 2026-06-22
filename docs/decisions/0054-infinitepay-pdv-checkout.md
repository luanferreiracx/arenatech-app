# ADR 0054 — InfinitePay como forma de pagamento no PDV

**Status:** aceito
**Data:** 2026-06-22
**Relacionado:** ADR 0042 (PDV é o caminho canônico de pagamento de OS).

## Contexto

O PDV tinha duas formas eletrônicas com confirmação real (**DePix**, carteira
LWK, restrita ao tenant `arena-tech`) e um **PIX manual** — o operador apenas
marcava "recebido", sem nenhuma verificação. PIX manual abre furo: a venda
finaliza mesmo que o dinheiro não tenha entrado.

A loja quer aceitar PIX/cartão com confirmação automática via **InfinitePay**
(maquininha/checkout que ela já usa). PIX e DePix são coisas distintas — o DePix
não é tocado por esta mudança.

### O que a API da InfinitePay oferece (confirmado contra a API real)

- `POST /links` → cria um **link de checkout hospedado** e retorna `{ url }`. A
  página aceita **PIX e cartão** (não dá para forçar só PIX); o meio real vem em
  `capture_method`.
- **Sem autenticação** além do `handle` (InfiniteTag do lojista, sem `$`). O
  dinheiro cai na conta desse handle — criar link é "público".
- `POST /payment_check` → confirma um pagamento. Exige `transaction_nsu` +
  `slug`, que **só existem após o pagamento** e chegam pelo **webhook**.
- **Webhook sem assinatura** (sem HMAC/secret na doc).

## Decisão

Adicionar a InfinitePay como **forma nova "InfinitePay"** no PDV (o PIX manual
continua existindo). Escopo inicial: **PDV** (que já cobre pagamento de OS).
Espelha o fluxo de QR do DePix.

### Configuração

Handle por tenant em `TenantIntegration` (provider `INFINITEPAY`,
`config = { handle }`), editável em **Configurações → Integrações**. A forma só
aparece no PDV quando a integração está ativa **e** tem handle.

### Fluxo

1. Operador escolhe **InfinitePay** (deve cobrir o valor restante, como o DePix).
2. `sale.createInfinitepayLink` chama `POST /links` com `order_nsu = id da venda`
   e `webhook_url` da intranet; grava um leg `infinitepay` **pendente** em
   `paymentDetails` (antes do finalize — evita corrida pagar-antes-de-finalizar)
   e gera o QR a partir da URL (server-side, `qrcode`).
3. O cliente paga (PIX/cartão) na página da InfinitePay.
4. O **webhook** `/api/webhooks/infinitepay` recebe a notificação e dispara SSE;
   o PDV (polling de 30s como fallback) detecta e **auto-finaliza** via
   `sale.finalize`.

### Segurança (sem assinatura → confiar no `payment_check`)

A regra de ouro: **nunca confiar no payload do webhook**. Cada webhook é
**revalidado via `POST /payment_check`** (fonte de verdade da liquidação) antes
de marcar pago. Um webhook forjado com `slug`/`transaction_nsu` falsos reprova
no `payment_check`. Além disso, o `finalize` revalida no servidor que o leg está
`paid` em `paymentDetails` (gravado só pelo webhook verificado) — espelha a
guarda *wallet-first* do DePix e impede tampering pelo cliente.

### Canal de tempo real

Reusa o canal `pg_notify('depix_paid')` + a rota `GET /api/sse/sale/[saleId]`
(que já é genérica: filtra por `id` e emite `paid`). É efetivamente um canal de
"venda paga"; evitamos um segundo canal/refactor do fluxo DePix em produção.

## Consequências

- **PIX manual segue existindo** como fallback (cliente pagou por outro app).
- O checkout aceita PIX **e cartão**; registramos o meio real pelo
  `capture_method`. Não é possível restringir a só PIX por esta API.
- O webhook precisa de `NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL` pública e acessível
  pela InfinitePay (igual aos demais webhooks). Em dev local sem URL pública, a
  confirmação não chega — limitação conhecida, idêntica ao DePix.
- Não há tabela dedicada: o estado do pagamento mora no leg `infinitepay` de
  `paymentDetails` (KISS). `order_nsu = id da venda` dá lookup por PK no webhook.
- A InfinitePay **não assina** o webhook; se um dia publicarem HMAC, adicionar a
  verificação de assinatura como camada extra (o `payment_check` continua sendo
  a autoridade).
