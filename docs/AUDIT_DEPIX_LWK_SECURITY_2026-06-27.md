# Auditoria de segurança/correção — DePix + LWK (2026-06-27)

> Investigate + review-project + security-review, com **validação manual de cada
> achado** contra o código real (vários "P0" dos agentes eram falsos positivos).
> Resultado: **nenhum P0 confirmado**. Achados reais abaixo, priorizados.

## ✅ O que está sólido (confirmado)

- **Crédito de depósito é seguro:** o `verifyDepositOnChain` (≥2 conf + amount com
  tolerância 1¢) roda **no handler, ANTES** do `settleDepositConfirmed`, e o settle
  recebe `crossCheck.onchainAmount` (valor on-chain real), **não** o `valueInCents`
  do payload. Impossível creditar valor forjado mesmo com webhook comprometido.
- **Idempotência:** replay-guard (`recordWebhookEvent`/`markWebhookProcessed`) em
  todos os handlers (deposit/withdraw/med/static); ledger via `upsert` unique
  `[transactionId,kind]`; `idempotencyKey` no `lwk.transfer`. Taxa não é cobrada 2x.
- **Isolamento por tenant:** tabelas DePix com RLS (incl. `payment_links`,
  `tenant_depix_transactions`); `createDeposit`/`createWithdraw` são
  `tenantProcedure` (RLS-scoped). QR estático cria tx só na central (guard).
- **LWK auth:** `hmac.compare_digest` + fail-closed (aborta sem API_KEY); tenant_id
  validado por regex UUID estrito (sem path traversal); seeds gravadas 0600;
  container non-root.
- **LWK cripto (crypto.py):** Argon2id (256MiB, t=3, p=2) + AES-256-GCM (AEAD), IV/
  salt aleatórios por cifragem, sem chave/salt fixos, sem seed em log próprio.
- **LWK transfer:** rejeita valor ≤ 0, valida endereço (`lwk.Address`), fee_rate
  limitado, saldo garantido pelo builder antes de assinar.
- **Saque anti-perda:** guard de `expiration` antes do sweep (#272); expiração do
  QR (#272); nome do destinatário oficial da Eulen (#286).
- **Página pública /pay:** revalida tudo no servidor (CPF, checkbox, limites,
  status), rate-limit por IP, token CSPRNG. Server Actions (proxy não expõe tRPC).

## 🟠 Achados reais (validados)

### H1 — LWK envia o webhook secret em claro no header (HIGH) — fix trivial
`lwk/app.py` (~linha 373): `send_webhook` manda **`X-Webhook-Secret: <secret>`** em
claro **além** da assinatura HMAC (`X-Signature`). Confirmado: o nosso endpoint
`/api/webhooks/lwk-deposit` valida **só pelo `X-Signature` (HMAC)** — o
`X-Webhook-Secret` **não é usado**. É um secret vazando à toa (se a URL/TLS for
comprometida). **Fix:** remover a linha `headers["X-Webhook-Secret"] = ...`. Seguro,
não quebra a validação.

### H2 — Depósito pode ficar preso em PROCESSING_FEE se crashar após o transfer (P1)
`depix-transaction.service.ts` `settleDepositConfirmed` (~474-549): se o
`lwk.transfer` da taxa **sucede** mas o processo **crasha antes** de marcar
COMPLETED (linha 545), a tx fica em `PROCESSING_FEE`. No reprocessamento, a
transição PENDING/PROCESSING→PROCESSING_FEE dá `count=0` e retorna
`alreadyCompleted:true` — **enganoso**: a tx nunca vira COMPLETED (fica presa,
embora a taxa já tenha sido paga; sem perda de fundos). **Fix:** se `count=0`,
reconsultar o status real; se `PROCESSING_FEE`, retomar a marcação COMPLETED +
ledger (idempotente via upsert). Ou um cron que finaliza PROCESSING_FEE com fee
ledger SETTLED.

### M1 — Exception logada com `{e}` em endpoints de seed/mnemonic (MEDIUM)
`lwk/app.py` (776/806/832/871/949): `log_detail=f"...: {e}"` nos endpoints
mnemonic_reveal/encrypt_seed/rewrap/recover/setup_noncustodial. Se a lib lwk/crypto
lançar exceção contendo material sensível, vai pro log. Mitigado (o `crypto.py` usa
`InvalidPassphraseError` genérica), mas defensivo. **Fix:** logar mensagem fixa sem
`{e}` nesses endpoints sensíveis.

### M2 — Race de saques concorrentes (P1, JÁ DOCUMENTADO "HIGH #6")
`createWithdraw` (~1157-1175): leitura da reserva (saldo disponível = on-chain −
saques pendentes) ocorre **fora** de transação atômica com a criação. Dois saques
concorrentes podem ambos passar o gate. **Mitigado** por: cap diário
(`checkDailyWithdrawCap`) + rejeição do LWK no 2º sweep. Risco residual: payout
órfão no provedor. **Fix (defesa):** `SELECT … FOR UPDATE` na reserva ou advisory
lock por tenant no createWithdraw.

## 🟡 Menores (baixa prioridade)
- LWK `idempotency.json`/descriptor em resposta, `tenant_id` em webhook interno —
  privacidade/limpeza, não exploráveis (rede interna, HMAC).
- Tolerância de 1¢ no cross-check — cobre floating-point; perda máx 1 centavo.

## Plano sugerido
1. **H1** (trivial, alto valor): remover `X-Webhook-Secret` do `lwk/app.py`.
2. **H2** (robustez): finalizar PROCESSING_FEE preso (handler + cron).
3. **M1** (hardening): tirar `{e}` dos logs de seed/mnemonic.
4. **M2** (defesa em profundidade): lock na reserva de saque.

> Nada aqui é um buraco de segurança explorável remotamente. H1 é o de melhor
> custo/benefício. Sem bloqueios para prosseguir com outras melhorias.
