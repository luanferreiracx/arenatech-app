# API de Parceiros — DePix (v1)

> Referência da API REST externa pra parceiros (ADR 0057). **Fase 2: read-only.**
> Endpoints de escrita (depósito/saque) vêm na Fase 3.

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
| `depix:deposit` | criar depósito (Fase 3) |
| `depix:withdraw` | sacar (Fase 3) |

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

## Notas

- **Versionamento:** `v1` no path. Mudanças quebrantes → `v2` (o `v1` não muda).
- **Idempotência/escrita:** os endpoints de criação (Fase 3) aceitarão
  `Idempotency-Key` e exigirão os escopos `depix:deposit`/`depix:withdraw`.
- **Limites:** depósitos seguem as regras da rede (CPF/CNPJ obrigatório a partir de
  R$500). O saldo é o DePix on-chain real — não um contador interno.
