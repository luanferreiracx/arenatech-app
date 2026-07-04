# API de Parceiros — DePix

API REST para parceiros movimentarem o DePix de um tenant da Arena Tech: gerar
cobranças (depósito via QR PIX), sacar via **PIX** (off-ramp Eulen) e consultar o
**status** da transação criada. Pensada para integração **máquina-a-máquina** — sem
interface, autenticada por API-key. (Saldo, extrato e saque on-chain Liquid são só no
painel, não pela API.)

| | |
|---|---|
| **Versão** | `v1` |
| **Base URL** | `https://app.arenatechpi.com.br/api/v1/partner` |
| **Autenticação** | `Authorization: Bearer at_<prefix>_<secret>` |
| **Formato** | JSON (`application/json`); valores monetários sempre em **centavos** |
| **Doc interativa** | [`/docs/partner-api`](https://app.arenatechpi.com.br/docs/partner-api) (Swagger UI, pública) |
| **ADR** | [`0057`](./decisions/0057-api-parceiros-externos.md) |

> [!IMPORTANT]
> **Contrato canônico:** [`docs/openapi/partner-api.yaml`](./openapi/partner-api.yaml),
> **gerado a partir dos schemas Zod** da própria API (`pnpm openapi:gen`). É a fonte de
> verdade do formato de request/response — este guia cobre autenticação, fluxos,
> idempotência e webhooks, mas **não** redefine schemas à mão. O CI roda
> `openapi:check` e **falha** se a spec divergir do código, então a doc nunca
> desatualiza em silêncio.

---

## Sumário

- [Início rápido](#início-rápido)
- [Autenticação e escopos](#autenticação-e-escopos)
- [Convenções](#convenções) — valores, idempotência, paginação, rate limit, erros
- [Endpoints](#endpoints)
  - [POST /depix/deposits](#post-depixdeposits)
  - [POST /depix/withdrawals](#post-depixwithdrawals)
  - [GET /depix/transactions/:id](#get-depixtransactionsid) — status
- [Objeto `Transaction`](#objeto-transaction)
- [Webhooks](#webhooks)
- [Segurança e isolamento](#segurança-e-isolamento)
- [Versionamento](#versionamento)

---

## Início rápido

```bash
# 1. Gere uma cobrança de R$ 25,00 (escopo depix:deposit)
curl -X POST https://app.arenatechpi.com.br/api/v1/partner/depix/deposits \
  -H "Authorization: Bearer at_ab12cd34_SEU_SEGREDO" \
  -H "Idempotency-Key: 6f1e...uuid" \
  -H "Content-Type: application/json" \
  -d '{ "amountCents": 2500, "payerTaxId": "12345678909", "description": "Pedido #42" }'
# → 201 { "id": "tx-uuid", "qrCode": "00020126...", "qrCodeBase64": "data:image/png;base64,..." }

# 2. Consulte o status (a key de depósito OU de saque autoriza)
curl https://app.arenatechpi.com.br/api/v1/partner/depix/transactions/tx-uuid \
  -H "Authorization: Bearer at_ab12cd34_SEU_SEGREDO"
```

A confirmação do pagamento chega por [webhook](#webhooks) (`deposit.completed`) ou
por polling em [`GET /depix/transactions/:id`](#get-depixtransactionsid).

---

## Autenticação e escopos

Toda requisição exige o header:

```http
Authorization: Bearer at_<prefix>_<secret>
```

A API-key é emitida pelo **admin do tenant** em **Configurações → API de Parceiros**
(a opção aparece quando a Arena Tech libera o acesso à API para aquele tenant). O
**segredo é exibido uma única vez** no momento da criação — guarde com segurança, não
conseguimos exibi-lo de novo. Uma key revogada para de funcionar imediatamente.

Cada key carrega um conjunto de **escopos** — peça só o que a integração precisa:

| Escopo | Permite | Rate limit |
|---|---|---|
| `depix:deposit` | criar depósito (gerar QR PIX) | 30 req/min |
| `depix:withdraw` | sacar via PIX (off-ramp Eulen) | 10 req/min |

> A API se limita a **depósito + saque**. O **status** de uma transação
> (`GET /depix/transactions/:id`) é autorizado por **qualquer** dos escopos acima —
> quem cria acompanha o desfecho. Não há escopo de leitura dedicado (saldo e extrato
> completo ficam só no painel).

---

## Convenções

**Valores monetários** são sempre **inteiros em centavos** (`amountCents: 2500` =
R$ 25,00). Nunca usamos float para dinheiro.

**Idempotência** — os endpoints de escrita (`POST`) aceitam o header
`Idempotency-Key: <uuid>`. Repetir a mesma chamada com a mesma chave **não duplica**
a operação: você recebe o resultado da primeira. Gere um UUID por intenção (ex.: por
pedido) e reenvie-o em retries de rede.

**Rate limit** — por API-key, por minuto (ver tabela de escopos). Ao estourar, a API
responde `429`; respeite o backoff e reduza a cadência.

**Datas** — sempre ISO 8601 em UTC (`2026-06-30T10:00:00.000Z`).

### Respostas de erro

Erros usam o status HTTP adequado e um corpo JSON uniforme:

```json
{ "error": "insufficient_scope", "message": "A chave não tem o escopo depix:withdraw." }
```

| Status | Significado | Causa típica |
|---|---|---|
| `400` | Requisição inválida | Regra de negócio violada (ex.: cap diário de saque) |
| `401` | Não autenticado | Header ausente, key inválida ou revogada |
| `403` | Sem permissão | A key não tem o escopo exigido pelo endpoint |
| `404` | Não encontrado | Transação inexistente **ou de outro tenant** (ver [isolamento](#segurança-e-isolamento)) |
| `412` | Pré-condição falhou | Saque via API numa carteira non-custodial (use o painel) |
| `422` | Não processável | Validação do corpo (ex.: CPF obrigatório acima de R$ 500) |
| `429` | Rate limit | Acima da quota da key |
| `503` | Indisponível | Dependência temporariamente fora (tente de novo com backoff) |

---

## Endpoints

### POST /depix/deposits

Cria um depósito e devolve o **QR PIX** de cobrança. **Escopo:** `depix:deposit`.
Aceita `Idempotency-Key`.

**Body**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `amountCents` | int | sim | R$ 10,00 a R$ 5.000,00 (`1000`–`500000`) |
| `payerTaxId` | string | condicional | CPF/CNPJ do pagador — **obrigatório a partir de R$ 500,00** (regra da rede) |
| `description` | string | não | Descrição livre da cobrança |
| `depositAddress` | string | não | **BYOW:** endereço Liquid próprio onde receber o DePix (ver nota abaixo) |

```json
{ "amountCents": 10000, "payerTaxId": "12345678909", "description": "Pedido #42" }
```

> [!NOTE]
> **Carteira própria (BYOW).** Por padrão o DePix cai na carteira gerenciada do
> tenant. Para receber numa carteira **própria** (self-custody), informe
> `depositAddress` — a Eulen manda o DePix direto pra ela. O endereço **precisa
> estar cadastrado na allowlist** do tenant (painel → DePix, com 2FA + confirmação
> por email e WhatsApp); um endereço não autorizado retorna **`400`**. A API
> **nunca** cadastra endereços — só um humano aprova destinos, então uma key
> vazada não consegue desviar fundos. O crédito é confirmado pela Eulen (não há
> cross-check on-chain, pois a Arena não custodia esse endereço).

**`201 Created`**
```json
{
  "id": "uuid",
  "number": "TXD20260630-00007",
  "status": "PENDING",
  "amountCents": 10000,
  "qrCode": "00020126...",
  "qrCodeBase64": "data:image/png;base64,..."
}
```

| Campo | Descrição |
|---|---|
| `qrCode` | PIX copia-e-cola (BR Code) |
| `qrCodeBase64` | Imagem do QR como data URL (renderizável direto em `<img>`) |

Acompanhe a confirmação por [webhook](#webhooks) ou polling — o `status` vira
`COMPLETED` quando o DePix é creditado.

---

### POST /depix/withdrawals

Saque via **PIX** (off-ramp Eulen). **Escopo:** `depix:withdraw`.
Aceita `Idempotency-Key`.

> [!NOTE]
> **Só PIX pela API.** O saque **on-chain** (envio Liquid direto) **não** é exposto
> na API de parceiros — é irreversível, para endereço arbitrário e sem 2FA, risco
> desproporcional para uma chave de máquina. On-chain segue disponível apenas no
> **painel** (humano, com step-up 2FA + confirmação de endereço).

> [!NOTE]
> **Como o PIX é efetivado (Eulen + Liquid).** Não é PIX instantâneo direto: a Arena
> pede o off-ramp à Eulen, que devolve um endereço Liquid; a carteira Liquid do
> tenant envia o DePix on-chain pra esse endereço; a Eulen então paga o PIX ao
> destinatário. Por isso o saque nasce `PROCESSING` e conclui de forma **assíncrona**
> — acompanhe por `GET /depix/transactions/:id` ou pelo webhook `withdrawal.completed`.
> Depende de **saldo DePix on-chain** do tenant + gás de rede; se a janela do
> provedor expirar antes do envio, o saque falha **sem debitar** e deve ser refeito.

> [!WARNING]
> **Saque move dinheiro.** A chamada não pede 2FA (é máquina), mas é cercada por
> guardas: só funciona em carteira **custodial** (a non-custodial exige a senha do
> titular — use o painel) e respeita um **cap diário próprio da API** somado ao cap
> do painel. Use `Idempotency-Key` em todo saque.

**Body** (`method: "pix"`)

| Campo | Tipo | Descrição |
|---|---|---|
| `method` | `"pix"` | Único método aceito |
| `amountCents` | int | Valor em centavos |
| `pixKeyType` | enum | `RANDOM` · `CPF` · `CNPJ` · `EMAIL` · `PHONE` |
| `pixKey` | string | A chave PIX de destino |
| `recipientTaxId` | string | CPF/CNPJ do recebedor (validado) |
| `recipientName` | string? | Nome do recebedor (opcional) |

```json
{ "method": "pix", "amountCents": 5000, "pixKeyType": "CPF",
  "pixKey": "12345678909", "recipientTaxId": "12345678909", "recipientName": "Fulano" }
```

**`201 Created`**
```json
{ "id": "uuid", "number": "TXW20260630-00003", "status": "PROCESSING",
  "method": "pix", "amountCents": 5000, "onchainTxId": null }
```

Erros específicos: **`412`** carteira non-custodial · **`400`** cap diário estourado.

---

### GET /depix/transactions/:id

Status/detalhe de **uma** transação — o depósito ou saque que o parceiro criou.
**Escopo:** `depix:deposit` **ou** `depix:withdraw` (quem cria acompanha o desfecho).

Retorna **`404`** se a transação não existir — ou se pertencer a **outro tenant**
(transações de terceiros são invisíveis por design; ver [isolamento](#segurança-e-isolamento)).

**`200 OK`** — um objeto [`Transaction`](#objeto-transaction).

---

## Objeto `Transaction`

Retornado por `GET /depix/transactions/:id`.

```json
{
  "id": "uuid",
  "number": "TXD20260630-00001",
  "kind": "DEPOSIT",
  "status": "COMPLETED",
  "sourceType": "WALLET",
  "grossAmountCents": 10000,
  "netAmountCents": 9751,
  "feeArenaTechCents": 249,
  "payerName": "Fulano da Silva",
  "recipientName": null,
  "onchainTxId": "c379e379...",
  "onchainAddress": null,
  "createdAt": "2026-06-30T10:00:00.000Z",
  "completedAt": "2026-06-30T10:05:00.000Z"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | Identificador único (UUID) |
| `number` | string | Número legível no tenant (ex.: `TXD20260630-00001`) |
| `kind` | enum | `DEPOSIT` ou `WITHDRAW` |
| `status` | enum | Estado atual (ver abaixo) |
| `sourceType` | string | Origem da transação (ex.: `WALLET`) |
| `grossAmountCents` | int | Valor bruto, em centavos |
| `netAmountCents` | int? | Líquido após taxas, em centavos |
| `feeArenaTechCents` | int | Taxa Arena Tech retida, em centavos |
| `payerName` | string? | Pagador (depósito), quando disponível |
| `recipientName` | string? | Recebedor (saque), quando disponível |
| `onchainTxId` | string? | `txid` Liquid (depósito ou saque), quando houver |
| `onchainAddress` | string? | Endereço Liquid de destino (saque on-chain) |
| `createdAt` | string | Criação (ISO 8601) |
| `completedAt` | string? | Conclusão (ISO 8601), quando aplicável |

**Status:** `PENDING` → `PROCESSING` → `COMPLETED`, ou um terminal de falha:
`FAILED`, `CANCELLED`, `EXPIRED`, `MED_REFUNDED` (devolução pós-pagamento).

---

## Webhooks

Em vez de polling, configure uma **URL de webhook** (HTTPS) em **Configurações →
API de Parceiros**. A Arena Tech envia um `POST` quando um evento ocorre:

| Evento | Disparado quando |
|---|---|
| `deposit.completed` | um depósito confirma (DePix creditado) |
| `withdrawal.completed` | um saque conclui |

**Corpo**
```json
{
  "type": "deposit.completed",
  "transactionId": "uuid",
  "number": "TXD20260630-00001",
  "status": "COMPLETED",
  "amountCents": 9751,
  "occurredAt": "2026-06-30T10:00:00.000Z"
}
```

**Headers**

| Header | Conteúdo |
|---|---|
| `X-Signature` | `sha256=<hex>` = `HMAC-SHA256(corpoCru, secret)` |
| `X-Event-Type` | tipo do evento (ex.: `deposit.completed`) |
| `X-Event-Id` | id da transação |

A URL precisa ser **HTTPS e pública** — endereços internos/privados (localhost,
faixas privadas, link-local) são recusados no cadastro e revalidados na entrega
(proteção anti-SSRF). O `secret` do webhook é exibido **uma vez** ao salvar a URL (e
pode ser rotacionado). **Valide a assinatura** sobre o corpo **cru** (bytes
recebidos) antes de confiar no payload:

```js
import crypto from "node:crypto";

function isValidSignature(rawBody, headerSig, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(headerSig ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// handler
if (!isValidSignature(rawBody, req.headers["x-signature"], SECRET)) {
  return res.status(401).end();
}
res.status(200).end(); // responda rápido; processe de forma assíncrona
```

> [!NOTE]
> **Entrega best-effort:** tentamos entregar **uma vez** (timeout de 8s). Se o seu
> endpoint estiver fora do ar ou responder não-2xx, o evento **não é reentregue** —
> reconcilie pelo `GET /depix/transactions/:id`. Responda `2xx` rápido e processe o
> evento de forma assíncrona do seu lado.

---

## Segurança e isolamento

- **Isolamento por tenant (RLS):** toda leitura/escrita roda sob Row Level Security
  com o `tenant_id` da API-key. Uma key **nunca** enxerga ou movimenta dados de outro
  tenant — transações de terceiros respondem `404`, não `403`.
- **Superfície mínima:** a API só cria depósito/saque e consulta o status do que foi
  criado. Saldo, extrato completo e saque on-chain ficam **só no painel**.
- **Sem segredos em trânsito desnecessário:** o segredo da API-key e o secret de
  webhook são exibidos uma única vez; o backend guarda apenas o hash da key.
- **Webhooks assinados (HMAC-SHA256):** valide sempre `X-Signature` com comparação em
  tempo constante (`timingSafeEqual`) antes de processar.
- **Sempre HTTPS.** Nunca envie a API-key por canal não criptografado.

---

## Versionamento

A versão fica no path (`/api/v1/...`). Mudanças **quebrantes** entram numa nova versão
(`v2`) — o `v1` continua estável. Adições compatíveis (novos campos opcionais, novos
endpoints) podem ocorrer dentro do `v1` sem aviso de quebra.
