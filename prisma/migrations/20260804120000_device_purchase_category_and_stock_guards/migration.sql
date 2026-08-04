-- Auditoria de estoque 2026-08-04.
--
-- 1) Categoria fixa "Compra de aparelho" para TODO tenant (P1-3).
--    A compra de aparelho nascia sem `category`/`category_id`: a maior classe de
--    despesa do varejo de celular (24% da despesa do ano, medição 2026-07) não
--    aparecia em nenhum relatório por categoria. `resolveCategoryId` só faz
--    LOOKUP (criar ali furaria o gate de admin do `createCategory`), então a
--    categoria precisa existir de antemão — daí o backfill.
--
-- 2) CHECK de saldo não-negativo em produtos e variações (P1-9).
--    Hoje o invariante se sustenta só pela disciplina de escrever
--    `where: { currentStock: { gte: qty } }` em 7+ call sites espalhados por 5
--    arquivos. Um único caminho novo que esqueça derruba o invariante em
--    silêncio. Mesmo formato do CHECK que o módulo de fidelidade ganhou em
--    20260727120000_reward_balance_non_negative.

-- ── 1) Categoria de compra de aparelho ────────────────────────────────────
INSERT INTO financial_categories (id, tenant_id, name, code, type, kind, active, created_at, updated_at)
SELECT gen_random_uuid(), t.id, 'Compra de aparelho', 'COMPRA_APARELHO', 'DESPESA', 'FIXED', true, now(), now()
FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Reclassifica o histórico: compras de aparelho já lançadas ficam apontando
-- para a categoria nova, para o DRE por categoria não nascer com um buraco.
UPDATE financial_transactions ft
SET category = 'Compra de aparelho',
    category_id = fc.id
FROM financial_categories fc
WHERE fc.tenant_id = ft.tenant_id
  AND fc.code = 'COMPRA_APARELHO'
  AND ft.reference_type = 'device_purchase'
  AND ft.category_id IS NULL;

-- ── 2) Saldo de estoque nunca negativo ────────────────────────────────────
-- NOT VALID: não varre a tabela existente no deploy (evita lock longo). Linhas
-- novas e atualizadas já são checadas; a validação do histórico vem logo abaixo,
-- barata porque o invariante já vale hoje.
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_current_stock_non_negative;
ALTER TABLE products
  ADD CONSTRAINT products_current_stock_non_negative
  CHECK (current_stock >= 0) NOT VALID;

ALTER TABLE product_variations
  DROP CONSTRAINT IF EXISTS product_variations_current_stock_non_negative;
ALTER TABLE product_variations
  ADD CONSTRAINT product_variations_current_stock_non_negative
  CHECK (current_stock >= 0) NOT VALID;

-- Corrige eventual saldo negativo herdado antes de validar (não deveria existir;
-- se existir, é dado já corrompido e o CHECK não pode falhar o deploy por isso).
UPDATE products SET current_stock = 0 WHERE current_stock < 0;
UPDATE product_variations SET current_stock = 0 WHERE current_stock < 0;

ALTER TABLE products VALIDATE CONSTRAINT products_current_stock_non_negative;
ALTER TABLE product_variations VALIDATE CONSTRAINT product_variations_current_stock_non_negative;

-- ── 3) WITH CHECK nas policies de RLS que só tinham USING (P2) ────────────
-- Sem `WITH CHECK`, um INSERT/UPDATE que GRAVE `tenant_id` de outro tenant não é
-- rejeitado pelo banco — a proteção fica só na aplicação. Defesa em profundidade:
-- as tabelas de produto criadas em 20260516201321 nasceram só com USING,
-- enquanto `products` (20260508195700) já tinha as duas.
--
-- Usa `current_tenant_id()` (e não `current_setting(...)::uuid` cru, como a
-- migration original destas tabelas): a função faz
-- `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`, então
-- devolve NULL — em vez de ESTOURAR — quando a variável não está setada, caso
-- que acontece quando o pooler reseta a conexão. Com NULL a comparação é falsa
-- e a linha simplesmente não aparece, que é o comportamento seguro.
DROP POLICY IF EXISTS "tenant_isolation" ON "product_variations";
CREATE POLICY "tenant_isolation" ON "product_variations"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON "product_category_pivots";
CREATE POLICY "tenant_isolation" ON "product_category_pivots"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON "product_attributes";
CREATE POLICY "tenant_isolation" ON "product_attributes"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON "product_attribute_values";
CREATE POLICY "tenant_isolation" ON "product_attribute_values"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON "product_photos";
CREATE POLICY "tenant_isolation" ON "product_photos"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());
