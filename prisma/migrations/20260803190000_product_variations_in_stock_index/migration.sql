-- Segundo achado do `pg_stat_statements` (2026-08-03), na mesma sessão em que
-- ele foi ligado (ADR 0067).
--
-- Depois de corrigir a query do Talison, a listagem do catálogo público subiu ao
-- topo: ~110ms de média, com picos de 529ms. O plano mostrou o culpado — um
-- `Seq Scan` em `product_variations` varrendo as 2.316 linhas para achar 81, em
-- TODA listagem.
--
-- Causa: o catálogo pergunta "este produto tem variação em estoque?" com um
-- `EXISTS`, e o Prisma resolve isso filtrando só por `product_id`. Os dois
-- índices da tabela começam por `tenant_id` — nenhum servia.
--
-- Medido: 79ms → 4,9ms de execução; 206 → 160 buffers.
--
-- PARCIAL de propósito: o catálogo só olha variação ativa, não-deletada e com
-- saldo. Indexar só essas linhas deixa o índice pequeno e barato de manter na
-- escrita — o resto da tabela não entra.
--
-- Em produção já foi criado com CONCURRENTLY (sem lock de escrita) antes desta
-- migration existir; o IF NOT EXISTS a torna no-op lá e efetiva em banco novo.
-- Sem CONCURRENTLY aqui porque o Prisma roda migration em transação, e o
-- Postgres não permite a combinação.
CREATE INDEX IF NOT EXISTS "product_variations_in_stock_idx"
  ON "product_variations" ("product_id")
  WHERE "active" = true AND "deleted_at" IS NULL AND "current_stock" > 0;
