# Auditoria da API Eulen (DePix) — varredura completa

> Data: 2026-06-27. Fonte: docs.eulen.app (47 páginas, lidas uma a uma).
> Objetivo: usar a API com maestria — segurança, performance, robustez — e
> aproveitar tudo que ela oferece. Cada item diz **o que a Eulen oferece**, **o
> que fazemos hoje** e **a ação recomendada** (com prioridade).

## Mapa de endpoints (oficiais)

| Endpoint | Rate limit | Usamos? | Observação |
|---|---|---|---|
| `POST /deposit` | 15/min (burst 50) | ✅ | criação do PIX |
| `GET /deposit-status` | 60/min | ✅ (fallback) | "use só como fallback do webhook" |
| `GET /deposits` (lista) | 12/min | ❌ | **extrato/conciliação** (até 200 linhas, filtro data+status) |
| `POST /withdraw` | 10/min | ✅ | saque |
| `GET /withdraw-status` | 60/min | ✅ (fallback) | idem |
| `GET /user-info?euid=` | — | ❌ | **limites do usuário** (dailyLimitResetTime…) |
| `GET /ping` | 1/min | ❌ | healthcheck |
| Webhook `deposit` | — | ✅ | registrado |
| Webhook `withdraw` | — | ✅ | registrado |
| Webhook **`med`** | — | ❌ | **devolução pós-pagamento (MED)** — não registrado/tratado |

## 🔴 Achados de risco (P0/P1)

### A1 — Webhook MED não tratado (risco financeiro) — P0
A Eulen envia `webhookType: "med"` quando um depósito é **devolvido** pelo BC
(Mecanismo Especial de Devolução — golpe/fraude/contestação), com `qrId`,
`blockchainTxID`, `principalValueInCents`, `taxNumber`, `name`. Pode ocorrer
**depois** de já termos creditado o saldo. **Hoje** nosso `/api/webhooks/eulen`
cai no "webhookType desconhecido" e ignora. **Consequência:** saldo creditado de
um depósito que foi estornado fica indevidamente na carteira do tenant.
**Ação:** registrar o webhook `med` no Bot + `handleEulenMedWebhook`: marcar a tx
como `REFUNDED`/`MED`, debitar/estornar o crédito (ou abrir pendência de
reconciliação se já sacado), alertar. Status `refunded` também deve ser
reconciliável via `GET /deposits`.

### A2 — `under_review` / `delayed` / `will_refund` confirmam venda cedo? — P1
Hoje o webhook `approved` libera a venda na hora (correto p/ UX, #271). Mas a doc
lista `under_review` (pagamento recebido, em análise) e `delayed`/`will_refund`
como estados em que o DePix **pode não vir**. Conferir: só `approved` deve
liberar venda; `under_review` **não** deve liberar (hoje é "ack", ok); garantir
que `will_refund` (pré-crédito) cancele a venda. **Ação:** revisar a máquina de
estados do depósito contra a lista oficial (9 statuses) e cobrir `delayed`
(aguardar) e `will_refund` (cancelar venda) explicitamente.

## 🟠 Oportunidades (P2) — aproveitar o que a API oferece

### A3 — `GET /deposits` como rede de conciliação
Extrato de depósitos por intervalo+status (até 200). Hoje a rede de segurança é
o monitor LWK + status individual. Um cron diário batendo `/deposits?status=refunded`
e `status=depix_sent` reconcilia o que webhook/monitor perderam (incl. MED). P2.

### A4 — `endUserFullName` no `/deposit` (nome do pagador na geração)
O `DepositRequest` aceita `endUserFullName` (além de `endUserTaxNumber`). Não
enviamos. Não substitui o `payerName` real (que vem no status), mas pode ajudar
no anti-fraude/registro quando conhecemos o pagador (ex.: link com CPF). P3.

### A5 — `delayDepixInHours` (janela anti-fraude/MED)
Permite atrasar a conversão PIX→DePix (1–720h) para controlar exposição a MED em
pagamentos de comerciante. Não usamos. Pode ser um toggle futuro p/ recebimentos
de alto valor. P3 (produto).

### A6 — `GET /user-info?euid=` (limites reais do usuário)
Retorna limites/reset do usuário por EUID. Hoje temos cap local
(`validateDepixLimit`). Poderíamos exibir/validar o limite **real** da Eulen.
P3 — depende de termos o EUID do usuário.

## ✅ O que já está certo (confirmado pela doc)

- **`approved` confirma a venda** (não `depix_sent`) — a doc recomenda exatamente
  isso ("approved: segundos; depix_sent: minutos"). Fizemos no #271. ✓
- **X-Nonce** em todas as chamadas + retry com mesmo nonce no async (#269). ✓
- **Saque sempre com `taxNumber`/`euid`** (identificação do beneficiário) — exigido
  pela doc; enviamos `taxNumber`. ✓
- **Não reusar QR / pagar só pelo QR gerado** — ver A7 abaixo. ✓ (e reforça a
  decisão de não usar QR estático cru).
- **Expiração do saque respeitada** (não depositar após `expiration` = perda de
  fundos) — guard implementado (#272). ✓
- **Auth Basic do webhook** robusto (3 formatos, fail-closed) (#268). ✓

## 🟡 QR estático (resposta às perguntas do dono)

### A7 — A Eulen é CONTRA QR estático/reutilizável
A doc é categórica em 4 avisos no *API Overview*:
- *"Do not reuse QR codes — each QR code is single-use and tied to a specific
  deposit ID."*
- *"Do not send a direct transfer to the destination account, do not use
  standalone banking details."*
- *"Generate a new deposit for every new payment."*
- *"Pay within the time limit … create a new deposit for a fresh QR."*

**Logo:** o QR estático cru (`00020126…pdvdepixapp…`) aponta pra uma chave PIX
compartilhada da intermediadora (Plebz/Eulen) — pagar por ele é justamente o
"direct transfer / standalone banking details" que a doc proíbe. Pagamentos
nesse QR **não geram um deposit-id**, **não têm `endUserTaxNumber`**, **não
disparam webhook por transação** e **não se conciliam** com um tenant — ou seja,
**não há rastreamento automático nem crédito na carteira do tenant**.

**QR estático por tenant?** A API **não** oferece endpoint de "QR estático por
parceiro/tenant". O modelo dela é deposit dinâmico (1 QR = 1 deposit). O análogo
"estático" que rastreia e credita corretamente é o **link de pagamento** que já
construímos (`/pay/<token>` → gera um deposit dinâmico no ato, com CPF + webhook).

**Recomendação:** exibir o QR estático na Wallet **apenas como recurso
informativo/manual** (balcão), deixando explícito que ele **não credita
automaticamente** na carteira nem identifica o pagador — para cobrança rastreável,
usar o **link de pagamento**. (Decisão do dono: exibir com card + zoom.)

## Plano de execução proposto

1. **PR 1 (P0):** webhook `med` — handler + registro no Bot + estorno/pendência. ⬅️ prioridade
2. **PR 2 (P1):** revisar máquina de estados do depósito (`under_review`/`delayed`/
   `will_refund`) contra a doc; cobrir explicitamente.
3. **PR 3 (P2):** cron `/deposits` (conciliação por extrato, incl. refunded).
4. **PR 4 (feature):** card do QR estático na Wallet (imagem + copiar + zoom),
   com aviso de uso manual.
5. **Backlog (P3):** `endUserFullName`, `delayDepixInHours`, `user-info`.
