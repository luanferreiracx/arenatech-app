# API de Parceiros — DePix (v1)

> Referência da API REST externa pra parceiros (ADR 0057). Read-only + escrita
> (depósito e saque).

> **Contrato canônico:** [`docs/openapi/partner-api.yaml`](./openapi/partner-api.yaml),
> **gerado dos schemas Zod** (`pnpm openapi:gen`) — é a fonte de verdade do formato de
> request/response. Este guia cobre autenticação, idempotência, webhooks e exemplos;
> **não** redefine schemas à mão (evita divergência). O CI roda `openapi:check` e
> **falha** se a spec sair de sincronia com o código.
>
> **Doc interativa (Swagger UI):** `/docs/partner-api` (pública). A spec viva é servida
> em `GET /api/v1/partner/openapi.yaml`.

## Autenticação

Toda requisição exige o header:

```
Authorization: Bearer at_<prefix>_<secret>
```

A API-key é emitida pelo **admin do tenant** em `Configurações → API de Parceiros`
(disponível quando a Arena Tech libera o acesso). O segredo é exibido **uma única
vez** na criação. Cada key tem **escopos**:

| Escopo | Permite |
|---|---|
| `depix:read` | saldo, status de transação, extrato |
| `depix:deposit` | criar depósito (gerar QR) |
| `depix:withdraw` | sacar (PIX ou on-chain) |

**Escrita aceita idempotência:** envie `Idempotency-Key: <uuid>` — repetir a mesma
chamada com a mesma key não duplica a operação.

**Respostas de erro** (JSON): `401` sem/inválida key · `403` sem o escopo · `429`
acima da quota (60 req/min por key) · `503` indisponível.

Base URL: `https://app.arenatechpi.com.br/api/v1/partner`

---

## GET /depix/balance

Saldo DePix do tenant. Escopo: `depix:read`.

**200**
```json
{ "depix": 1234.56, "provisioned": true }
```
- `depix` — saldo em reais (DePix on-chain real).
- `provisioned` — `false` se a carteira ainda não foi criada (saldo 0).

---

## GET /depix/transactions

Extrato paginado. Escopo: `depix:read`.

**Query params:**
- `page` (0-based, default 0)
- `pageSize` (1–100, default 20)
- `kind` (`DEPOSIT` | `WITHDRAW`, opcional)
- `status` (opcional; ex.: `COMPLETED`, `PENDING`, `PROCESSING`, `FAILED`, …)

**200**
```json
{
  "data": [ /* PartnerTransaction[] (ver abaixo) */ ],
  "total": 137,
  "page": 0,
  "pageSize": 20,
  "pageCount": 7
}
```

---

## GET /depix/transactions/:id

Detalhe de uma transação. Escopo: `depix:read`. **404** se não existir
(transações de outro tenant nunca são visíveis — isolamento por RLS).

**200 — objeto `PartnerTransaction`:**
```json
{
  "id": "uuid",
  "number": "TXD20260629-00001",
  "kind": "DEPOSIT",
  "status": "COMPLETED",
  "sourceType": "WALLET",
  "grossAmountCents": 10000,
  "netAmountCents": 9751,
  "feeArenaTechCents": 249,
  "payerName": "Fulano da Silva",
  "recipientName": null,
  "onchainTxId": "c379e379…",
  "onchainAddress": null,
  "createdAt": "2026-06-29T10:00:00.000Z",
  "completedAt": "2026-06-29T10:05:00.000Z"
}
```

| Campo | Descrição |
|---|---|
| `kind` | `DEPOSIT` ou `WITHDRAW` |
| `status` | estado da transação (ver lista abaixo) |
| `grossAmountCents` | valor bruto em centavos |
| `netAmountCents` | líquido (após taxas), em centavos |
| `feeArenaTechCents` | taxa Arena retida |
| `onchainTxId` | txid Liquid (depósito ou saque), quando houver |
| `onchainAddress` | endereço Liquid de destino (saque on-chain) |

**Status possíveis:** `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`,
`EXPIRED`, `MED_REFUNDED` (devolução pós-pago).

---

## POST /depix/deposits

Cria um depósito e devolve o QR PIX de cobrança. Escopo: `depix:deposit`.
Rate-limit: 30/min. Aceita `Idempotency-Key`.

**Body:**
```json
{ "amountCents": 10000, "payerTaxId": "12345678909", "description": "Pedido #42" }
```
- `amountCents` — R$ 10,00 a R$ 5.000,00 (1000–500000).
- `payerTaxId` — CPF/CNPJ do pagador. **Obrigatório a partir de R$ 500,00** (422 se ausente).
- `description` — opcional.

**201**
```json
{
  "id": "uuid",
  "number": "TXD20260629-00007",
  "status": "PENDING",
  "amountCents": 10000,
  "qrCode": "00020126…",
  "qrCodeBase64": "data:image/png;base64,…"
}
```
Acompanhe a confirmação via `GET /depix/transactions/:id` (vira `COMPLETED`).

---

## POST /depix/withdrawals

Saque PIX **ou** on-chain. Escopo: `depix:withdraw`. Rate-limit: 10/min.
Aceita `Idempotency-Key`.

> **Importante:** disponível só para carteira **custodial** (a non-custodial exige a
> senha do titular — use o painel). Sem 2FA (chamada de máquina), mas com **cap diário
> próprio da API** + cap do painel + validação on-chain. **Saque move dinheiro — use
> com cuidado.**

**PIX:**
```json
{ "method": "pix", "amountCents": 5000, "pixKeyType": "CPF",
  "pixKey": "12345678909", "recipientName": "Fulano", "recipientTaxId": "12345678909" }
```

**On-chain (Liquid):**
```json
{ "method": "onchain", "amountCents": 5000, "toAddress": "lq1qq…" }
```

**201**
```json
{ "id": "uuid", "number": "TXW…", "status": "PROCESSING",
  "method": "pix", "amountCents": 5000, "onchainTxId": null }
```
- `412` se a carteira for non-custodial; `400` se estourar o cap diário.

---

## Webhooks (notificações de saída)

Em vez de fazer polling, configure uma **URL de webhook** (HTTPS) em
`Configurações → API de Parceiros`. A Arena envia um **POST** quando:

| Evento | Quando |
|---|---|
| `deposit.completed` | um depósito confirma (DePix creditado) |
| `withdrawal.completed` | um saque conclui |

**Assinatura:** cada POST traz o header
`X-Signature: sha256=<hex>` = `HMAC-SHA256(corpo, secret)` — o `secret` é exibido
**uma vez** ao salvar a URL (e pode ser rotacionado). Valide a assinatura antes de
confiar no corpo. Também enviamos `X-Event-Type` e `X-Event-Id` (= id da transação).

**Corpo:**
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

**Validação (exemplo Node):**
```js
const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
if (req.headers["x-signature"] !== expected) return res.status(401).end();
```

> **Entrega best-effort:** tentamos entregar uma vez (timeout 8s). Se o seu endpoint
> estiver fora do ar, o evento **não é reentregue** — reconcilie via
> `GET /transactions/:id`. Responda **2xx** rápido (processe async do seu lado).

---

## Notas

- **Versionamento:** `v1` no path. Mudanças quebrantes → `v2` (o `v1` não muda).
- **Idempotência/escrita:** os endpoints de criação (Fase 3) aceitarão
  `Idempotency-Key` e exigirão os escopos `depix:deposit`/`depix:withdraw`.
- **Limites:** depósitos seguem as regras da rede (CPF/CNPJ obrigatório a partir de
  R$500). O saldo é o DePix on-chain real — não um contador interno.
