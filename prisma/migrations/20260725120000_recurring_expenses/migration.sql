-- Despesas/receitas recorrentes (template mensal). O cron gera a
-- FinancialTransaction de cada mês a partir daqui (idempotente por
-- last_generated_period). Tabela tenant-scoped com RLS.

CREATE TABLE "recurring_expenses" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"             UUID NOT NULL,
  "type"                  "TransactionType" NOT NULL DEFAULT 'PAYABLE',
  "description"           TEXT NOT NULL,
  "amount_cents"          INTEGER NOT NULL,
  "category"              TEXT,
  "category_id"           UUID,
  "supplier"              TEXT,
  "supplier_id"           UUID,
  "day_of_month"          INTEGER NOT NULL,
  "active"                BOOLEAN NOT NULL DEFAULT true,
  "last_generated_period" TEXT,
  "notes"                 TEXT,
  "created_by_user_id"    UUID,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurring_expenses_tenant_id_active_idx" ON "recurring_expenses" ("tenant_id", "active");

-- RLS: isolamento por tenant (mesmo padrão das demais tabelas tenant-scoped).
ALTER TABLE "recurring_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_expenses" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "recurring_expenses"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
