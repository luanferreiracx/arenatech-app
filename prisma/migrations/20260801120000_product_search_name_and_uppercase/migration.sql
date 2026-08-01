-- Busca de produto insensível a ACENTO + nome de produto padronizado em CAIXA ALTA.
--
-- ── Problema 1: a busca era rigorosa demais ──────────────────────────────────
-- `contains mode:"insensitive"` do Prisma vira ILIKE: ignora caixa, NÃO ignora
-- acento. Quem digitava "pelicula" não achava "Película"; "camera" não achava
-- "Câmera". Cada tela resolvia (ou não) por conta própria — o PDV tinha um
-- $queryRaw com unaccent, e estoque/⌘K/OS/NF-e/catálogo não tinham nada.
--
-- Solução: uma coluna derivada `search_name` (nome + marca, minúsculo e sem
-- acento) mantida por trigger. Toda tela filtra a MESMA coluna com o termo
-- normalizado no TS (src/lib/search/normalize.ts) — Prisma puro, sem SQL cru,
-- e com índice GIN trigram para o `%termo%`.
--
-- Por que trigger e não coluna gerada: `unaccent()` é STABLE (depende do
-- dicionário), e GENERATED ALWAYS exige expressão IMMUTABLE. Marcar unaccent
-- como immutable é a gambiarra clássica — trigger é honesto e o Prisma enxerga
-- a coluna como um `String?` comum.
--
-- ── Problema 2: nome do produto em caixa mista ───────────────────────────────
-- O acervo tinha "iphone 13", "IPhone 13 PRO" e "Capinha silicone" convivendo.
-- A partir daqui o app grava sempre em caixa alta (normalizeProductName); esta
-- migração normaliza o que já existe.
--
-- Idempotente: rodar de novo não muda nada (upper de upper é upper; o backfill
-- de search_name recalcula o mesmo valor).

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Normalizador único (espelha normalizeSearchTerm em src/lib/search/normalize.ts)
--    minúsculo + sem acento + espaços colapsados. STABLE porque unaccent() é
--    STABLE — não usar em índice/coluna gerada, só em trigger e backfill.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_normalize(input text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT lower(public.unaccent(regexp_replace(btrim(coalesce(input, '')), '\s+', ' ', 'g')))
$$;

COMMENT ON FUNCTION public.search_normalize(text) IS
  'Normaliza texto para busca: minúsculo, sem acento, espaços colapsados. '
  'Espelha normalizeSearchTerm() em src/lib/search/normalize.ts — mudou aqui, mude lá.';

-- ---------------------------------------------------------------------------
-- 2. products.search_name — nome + marca normalizados
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_name text;

COMMENT ON COLUMN products.search_name IS
  'Derivada (trigger products_search_name_sync): nome + marca em minúsculo e sem '
  'acento. Alvo único das buscas de produto. Nunca escrever pela aplicação.';

CREATE OR REPLACE FUNCTION public.products_search_name_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_name := public.search_normalize(
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.brand, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_search_name_sync ON products;
CREATE TRIGGER products_search_name_sync
  BEFORE INSERT OR UPDATE OF name, brand ON products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_search_name_sync();

-- ---------------------------------------------------------------------------
-- 3. product_brands.search_name — dedup de marca (Asus/ASUS/ÁSUS) e busca
-- ---------------------------------------------------------------------------
ALTER TABLE product_brands ADD COLUMN IF NOT EXISTS search_name text;

COMMENT ON COLUMN product_brands.search_name IS
  'Derivada (trigger product_brands_search_name_sync): nome em minúsculo e sem '
  'acento. Chave de dedup do find-or-create e alvo da busca. Nunca escrever pela aplicação.';

CREATE OR REPLACE FUNCTION public.product_brands_search_name_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_name := public.search_normalize(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_brands_search_name_sync ON product_brands;
CREATE TRIGGER product_brands_search_name_sync
  BEFORE INSERT OR UPDATE OF name ON product_brands
  FOR EACH ROW
  EXECUTE FUNCTION public.product_brands_search_name_sync();

-- ---------------------------------------------------------------------------
-- 4. Backfill do acervo
-- ---------------------------------------------------------------------------
-- 4.1 Nome do produto em caixa alta (e espaços colapsados). Só as linhas que
--     mudam — o trigger recalcula search_name dessas de brinde.
UPDATE products
   SET name = upper(regexp_replace(btrim(name), '\s+', ' ', 'g'))
 WHERE name IS DISTINCT FROM upper(regexp_replace(btrim(name), '\s+', ' ', 'g'));

-- 4.2 search_name de TODAS as linhas (as que o passo 4.1 não tocou seguem NULL).
UPDATE products
   SET search_name = public.search_normalize(coalesce(name, '') || ' ' || coalesce(brand, ''))
 WHERE search_name IS DISTINCT FROM public.search_normalize(coalesce(name, '') || ' ' || coalesce(brand, ''));

UPDATE product_brands
   SET search_name = public.search_normalize(name)
 WHERE search_name IS DISTINCT FROM public.search_normalize(name);

-- ---------------------------------------------------------------------------
-- 5. Índices
-- ---------------------------------------------------------------------------
-- GIN trigram: suporta o ILIKE '%termo%' da busca (mesmo papel do antigo
-- products_name_trgm_idx, agora sobre a coluna normalizada).
CREATE INDEX IF NOT EXISTS products_search_name_trgm_idx
  ON products USING gin (search_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Btree composto: o find-or-create de marca casa por igualdade dentro do tenant.
CREATE INDEX IF NOT EXISTS product_brands_tenant_search_name_idx
  ON product_brands (tenant_id, search_name)
  WHERE deleted_at IS NULL;

-- O trigram sobre `brand` cru perdeu o último leitor (a busca por marca agora
-- entra em search_name). Índice GIN sem leitor só custa escrita.
DROP INDEX IF EXISTS products_brand_trgm_idx;
