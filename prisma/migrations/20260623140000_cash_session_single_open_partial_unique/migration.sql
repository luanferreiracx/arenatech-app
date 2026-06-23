-- Caixa: garantir no máximo 1 sessão ABERTA por (tenant, usuário).
--
-- Bug corrigido: o índice único `cash_sessions_tenant_id_user_id_closed_at_key`
-- (gerado por @@unique([tenantId, userId, closedAt])) NÃO impedia dois caixas
-- abertos. No PostgreSQL, NULLs são DISTINCT por padrão (NULLS DISTINCT), então
-- duas linhas com `closed_at IS NULL` para o mesmo (tenant, usuário) eram ambas
-- aceitas. A única defesa era o `findFirst` no aplicativo (check-then-act, racy
-- em duplo-submit / 2 abas), o que permitia fragmentar dinheiro entre 2 sessões.
--
-- Correção: índice único PARCIAL `WHERE closed_at IS NULL` — a invariante real.

-- 1) Deduplica caixas abertos pré-existentes (defensivo para banco "sujo" em
--    produção): mantém a sessão aberta mais recente por (tenant, usuário) e
--    fecha as demais como AUTOMATIC, preservando o histórico de movimentos.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, user_id
           ORDER BY opened_at DESC, id DESC
         ) AS rn
  FROM cash_sessions
  WHERE closed_at IS NULL
)
UPDATE cash_sessions cs
SET closed_at    = now(),
    close_type   = 'AUTOMATIC'::"CashSessionCloseType",
    closing_note = COALESCE(cs.closing_note || E'\n', '') ||
                   '[auto-fechado: deduplicacao de caixa aberto duplicado]'
FROM ranked
WHERE cs.id = ranked.id
  AND ranked.rn > 1;

-- 2) Remove o índice único antigo (inefetivo por causa dos NULLs distintos).
DROP INDEX IF EXISTS "cash_sessions_tenant_id_user_id_closed_at_key";

-- 3) Índice único parcial que de fato impede dois caixas abertos por usuário.
--    Não declarado no schema Prisma (Prisma ignora índices com WHERE) — mesmo
--    padrão de `users_cpf_key` / `customers_tenant_id_cpf_unique`.
CREATE UNIQUE INDEX "cash_sessions_one_open_per_user"
  ON "cash_sessions" ("tenant_id", "user_id")
  WHERE "closed_at" IS NULL;
