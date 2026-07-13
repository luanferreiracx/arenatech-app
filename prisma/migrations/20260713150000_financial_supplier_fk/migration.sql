-- Liga financial_transactions.supplier_id (que já existia) à entidade suppliers,
-- deprecando o campo texto livre `supplier` (que gera duplicatas no DRE por
-- fornecedor). Auditoria 2026-07-13 (D1/#2). Mesmo playbook da marca (#536).
-- A entidade Supplier já existe; só faltava a FK + backfill do texto→entidade.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. Backfill: para transações com `supplier` (texto) e SEM supplier_id, cria (ou
--    reusa) um Supplier por nome NORMALIZADO por tenant (grafia canônica = mais
--    frequente; empate: mais curta/alfabética) e vincula.
WITH normalized AS (
  SELECT ft.tenant_id, btrim(ft.supplier) AS raw, lower(unaccent(btrim(ft.supplier))) AS norm
  FROM financial_transactions ft
  WHERE ft.supplier IS NOT NULL AND btrim(ft.supplier) <> ''
    AND ft.supplier_id IS NULL AND ft.deleted_at IS NULL
),
ranked AS (
  SELECT tenant_id, norm, raw,
    row_number() OVER (PARTITION BY tenant_id, norm ORDER BY count(*) DESC, length(raw) ASC, raw ASC) AS rn
  FROM normalized GROUP BY tenant_id, norm, raw
),
canonical AS (SELECT tenant_id, norm, raw AS canonical_name FROM ranked WHERE rn = 1)
INSERT INTO suppliers (id, tenant_id, type, name, active, created_at, updated_at)
SELECT gen_random_uuid(), c.tenant_id, 'PJ', c.canonical_name, true, now(), now()
FROM canonical c
-- não recria um Supplier que já exista com o mesmo nome normalizado.
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers s
  WHERE s.tenant_id = c.tenant_id AND s.deleted_at IS NULL
    AND lower(unaccent(btrim(s.name))) = c.norm
);

-- 2. Vincula cada transação ao Supplier do seu grupo normalizado.
UPDATE financial_transactions ft
SET supplier_id = s.id
FROM suppliers s
WHERE ft.supplier IS NOT NULL AND btrim(ft.supplier) <> ''
  AND ft.supplier_id IS NULL AND ft.deleted_at IS NULL
  AND s.tenant_id = ft.tenant_id AND s.deleted_at IS NULL
  AND lower(unaccent(btrim(s.name))) = lower(unaccent(btrim(ft.supplier)));

-- 3. FK real (ON DELETE SET NULL: apagar fornecedor não apaga a transação).
ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "financial_transactions_tenant_id_supplier_id_idx"
  ON "financial_transactions" ("tenant_id", "supplier_id");
