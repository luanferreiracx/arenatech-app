-- Backfill: liga financial_transactions.category_id (FK que ficava sempre NULL —
-- o create/update só gravavam a coluna-sombra `category` texto) a partir do texto
-- já gravado, casando por nome normalizado (lower+unaccent+btrim) DENTRO do tipo
-- correspondente (RECEIVABLE→RECEITA, PAYABLE→DESPESA).
--
-- Assim o histórico existente passa a ser categorizável em relatórios/DRE por
-- categoria, não só os lançamentos novos.
--
-- Seguro e idempotente: só toca linhas com category_id AINDA nulo e cujo texto
-- casa uma categoria ativa. Em banco limpo (sem transações) é no-op. Reexecução
-- não muda nada (as já linkadas deixam de casar o WHERE category_id IS NULL).
UPDATE financial_transactions ft
SET category_id = fc.id
FROM financial_categories fc
WHERE ft.category_id IS NULL
  AND ft.category IS NOT NULL
  AND btrim(ft.category) <> ''
  AND fc.tenant_id = ft.tenant_id
  AND fc.active = true
  AND fc.type::text = (CASE WHEN ft.type = 'RECEIVABLE' THEN 'RECEITA' ELSE 'DESPESA' END)
  AND lower(unaccent(btrim(fc.name))) = lower(unaccent(btrim(ft.category)));
