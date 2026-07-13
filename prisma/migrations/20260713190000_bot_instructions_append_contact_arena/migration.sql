-- Preserva o Instagram e o mapa da Arena Tech nas instruções da loja (ADR 0055 / M7).
-- Esses dois dados eram HARDCODED em business-context.ts (DEFAULT_INSTAGRAM/DEFAULT_MAPS_URL)
-- e injetados no bot. Ao remover o hardcode (que vazaria para um 2º tenant), movemos a
-- informação para o campo editável — fonte única — para o arena-tech não perder o contato.
--
-- IDEMPOTENTE e não-destrutivo: só anexa quando o campo já existe e ainda NÃO contém o
-- Instagram (evita duplicar em re-runs e não sobrescreve edição do admin). Num banco limpo
-- (CI) o arena-tech não existe → 0 linhas.
UPDATE "tenant_settings" ts
SET
  "bot_instructions" = ts."bot_instructions"
    || E'\n\nContato: nosso Instagram é @arenatechpi e a localização no mapa é https://maps.app.goo.gl/5dmJeT2y4cCGsKQD8.',
  "bot_instructions_updated_at" = NOW()
FROM "tenants" t
WHERE ts."tenant_id" = t."id"
  AND t."slug" = 'arena-tech'
  AND ts."bot_instructions" IS NOT NULL
  AND ts."bot_instructions" NOT LIKE '%@arenatechpi%';
