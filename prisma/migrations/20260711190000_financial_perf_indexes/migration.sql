-- Auditoria financeira 2026-07-11 — índices de performance para ordenações que
-- hoje caem em sort-em-memória (G2 receivables por paidAt; B5 pendingReviews por
-- closedAt).
--
-- Tabelas de porte modesto (financial_transactions / cash_sessions) → CREATE
-- INDEX simples é seguro no deploy limpo do CI. Em produção com volume grande,
-- preferir CREATE INDEX CONCURRENTLY fora de transação na janela de deploy.

-- G2: `receivables` filtra (type, status) e ORDENA por paidAt.
CREATE INDEX IF NOT EXISTS "financial_transactions_tenant_id_type_status_paid_at_idx"
  ON "financial_transactions" ("tenant_id", "type", "status", "paid_at");

-- B5: `pendingReviews` filtra verified=false + closedAt not null e ORDENA por closedAt.
CREATE INDEX IF NOT EXISTS "cash_sessions_tenant_id_verified_closed_at_idx"
  ON "cash_sessions" ("tenant_id", "verified", "closed_at");
