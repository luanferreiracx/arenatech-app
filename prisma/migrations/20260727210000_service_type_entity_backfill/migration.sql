-- Tipo de serviço vira ENTIDADE de verdade. Auditoria 2026-07-25, item 17.
--
-- A tabela `service_types` e a FK `services.service_type_id` existem desde
-- 2026-05-16 e estavam 100% MORTAS: 0 linhas em produção, nenhum serviço
-- apontando. O texto livre `services.service_type` era a fonte real, e as cinco
-- operações "por tipo" (filtrar, reajustar em massa, renomear, duplicar,
-- excluir) casavam por igualdade exata de string — "Troca de Tela" ≠ "troca de
-- tela". O reajuste pegava metade dos serviços e o filtro escondia a outra
-- metade, com os dois aparecendo na lista com o mesmo nome aos olhos de quem lê.
--
-- Medição em produção (2026-07-27, antes desta migração):
--   105 serviços vivos · 14 tipos distintos · 0 divergindo por caixa/espaço.
-- Ou seja: o bug era LATENTE. O backfill é conservador por isso — 14 tipos
-- entram, 105 serviços saem vinculados, nenhum órfão.
--
-- Ordem (backfill deduplicado ANTES de qualquer constraint, para nenhum serviço
-- perder o tipo). Espelha o backfill de marca do produto
-- (20260713120000_product_brand_entity).

-- 0. `unaccent` normaliza "CÂMERA" = "camera". Não vem por padrão num banco
--    limpo (o CI roda migrate deploy do zero) — garante.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. Backfill: 1 linha de service_types por (tenant, slug canônico).
--    O slug é a MESMA normalização do resolver em TypeScript
--    (`slugifyServiceType`): minúsculo, sem acento, não-alfanumérico vira hífen.
--    A grafia canônica exibida é a mais frequente; desempate por mais curta,
--    depois alfabética — igual ao backfill de marca.
WITH normalized AS (
  SELECT
    s.tenant_id,
    btrim(s.service_type) AS raw,
    btrim(
      regexp_replace(
        lower(unaccent(btrim(s.service_type))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-'
    ) AS slug
  FROM services s
  WHERE s.service_type IS NOT NULL
    AND btrim(s.service_type) <> ''
    AND s.deleted_at IS NULL
    AND s.service_type_id IS NULL
),
ranked AS (
  SELECT
    tenant_id, slug, raw,
    row_number() OVER (
      PARTITION BY tenant_id, slug
      ORDER BY count(*) DESC, length(raw) ASC, raw ASC
    ) AS rn
  FROM normalized
  WHERE slug <> ''
  GROUP BY tenant_id, slug, raw
),
canonical AS (
  SELECT tenant_id, slug, raw AS canonical_name
  FROM ranked
  WHERE rn = 1
)
INSERT INTO "service_types" (id, tenant_id, name, slug, active, created_at, updated_at)
SELECT gen_random_uuid(), tenant_id, canonical_name, slug, true, now(), now()
FROM canonical
-- Um tenant pode já ter criado tipos pela tela (a entidade existe no schema há
-- meses, mesmo sem uso). Não recria nem estoura a unique (tenant_id, slug).
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- 2. Vincula cada serviço ao tipo do seu slug.
UPDATE "services" s
SET service_type_id = t.id
FROM "service_types" t
WHERE s.service_type_id IS NULL
  AND s.service_type IS NOT NULL
  AND btrim(s.service_type) <> ''
  AND t.tenant_id = s.tenant_id
  AND t.slug = btrim(
    regexp_replace(lower(unaccent(btrim(s.service_type))), '[^a-z0-9]+', '-', 'g'),
    '-'
  );

-- 3. Alinha a coluna-sombra `services.service_type` com a grafia canônica do
--    tipo. Sem isto a lista continuaria exibindo "troca de tela" para um
--    serviço cujo tipo se chama "Troca de Tela" — a divergência que motivou
--    tudo isto sobreviveria na leitura, mesmo com a FK correta.
UPDATE "services" s
SET service_type = t.name,
    name = t.name || COALESCE(' - ' || NULLIF(btrim(s.device_model), ''), '')
FROM "service_types" t
WHERE s.service_type_id = t.id
  AND s.deleted_at IS NULL
  AND s.service_type IS DISTINCT FROM t.name;
