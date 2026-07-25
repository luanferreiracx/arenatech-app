-- Backfill do ledger `installment_payments` para lançamentos À VISTA históricos.
--
-- BUG (auditoria 2026-07-25): a linha de DESPESA do DRE e o `stats.paidMonth`
-- leem SÓ de `installment_payments`, mas os lançamentos que nascem PAID
-- (compra de aparelho à vista, OS paga em dinheiro/pix, venda à vista
-- não-cartão) criavam a FinancialTransaction PAID sem parcela e sem ledger.
--
-- Medido em produção antes desta migration:
--   PAYABLE    sem parcela: 62 registros, R$ 342.130,00  (24% da despesa de 2026)
--   RECEIVABLE sem parcela: 424 registros, R$ 266.952,33
--
-- O DRE mostrava R$ 1.107.499,99 de despesa quando o real era R$ 1.449.629,99
-- — lucro inflado em R$ 342 mil.
--
-- Este backfill cria (a) a parcela única que `installments_total = 1` já
-- promete e (b) a linha correspondente no ledger, com a data-caixa do próprio
-- lançamento (`paid_at`), preservando o regime de caixa por mês.
--
-- Idempotente: só age em transação PAID, com paid_amount > 0, que NÃO tenha
-- linha no ledger. Rodar de novo é no-op.

-- (1) Parcela única para transação PAID que não tem parcela nenhuma.
WITH faltando AS (
  SELECT t.id, t.tenant_id, t.paid_amount, t.payment_method,
         COALESCE(t.paid_at, t.due_date, t.created_at) AS data_caixa,
         t.due_date
  FROM financial_transactions t
  WHERE t.status = 'PAID'
    AND t.deleted_at IS NULL
    AND t.paid_amount > 0
    AND NOT EXISTS (SELECT 1 FROM installments i WHERE i.transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM installment_payments ip WHERE ip.transaction_id = t.id)
)
INSERT INTO installments
  (id, tenant_id, transaction_id, number, amount, due_date, paid_amount, paid_at,
   payment_method, status, created_at, updated_at)
SELECT gen_random_uuid(), f.tenant_id, f.id, 1, f.paid_amount, f.due_date,
       f.paid_amount, f.data_caixa, f.payment_method, 'PAID', now(), now()
FROM faltando f;

-- (2) Linha no ledger para toda parcela PAGA que ainda não tem evento.
--     Cobre tanto as parcelas criadas em (1) quanto as que já existiam
--     (ex.: OS paga em dinheiro, que criava a parcela mas não o ledger).
INSERT INTO installment_payments
  (id, tenant_id, installment_id, transaction_id, amount_cents, payment_method,
   paid_at, kind, created_at)
SELECT gen_random_uuid(), i.tenant_id, i.id, i.transaction_id,
       ROUND(i.paid_amount * 100)::int,
       i.payment_method,
       COALESCE(i.paid_at, t.paid_at, i.due_date),
       'payment',
       now()
FROM installments i
JOIN financial_transactions t ON t.id = i.transaction_id
WHERE i.paid_amount > 0
  AND t.deleted_at IS NULL
  AND t.status = 'PAID'
  AND NOT EXISTS (
    SELECT 1 FROM installment_payments ip WHERE ip.installment_id = i.id
  );
