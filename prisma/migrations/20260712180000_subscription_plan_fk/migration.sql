-- Unifica a fonte da verdade do plano do tenant em `subscriptions` (FK real),
-- deprecando a coluna solta `tenants.plan` (String). Ver auditoria de tenants/planos.
--
-- Ordem importa (a FK não pode falhar e nenhum tenant pode perder o plano):
--   1. BACKFILL: todo tenant com `tenants.plan` = UUID de um plano existente,
--      mas SEM `subscriptions`, ganha uma Subscription ACTIVE com snapshot de
--      preço mensal. Sem isto, ao gating passar a ler via Subscription, esses
--      tenants ficariam sem plano.
--   2. Saneamento: `tenants.plan` que não referencia um plano existente (slug
--      legado ou lixo) vira NULL — a partir daqui `plan` é sombra e só aceita id.
--   3. FK: subscriptions.plan_id -> plans.id, ON DELETE RESTRICT (defesa em
--      profundidade: o banco recusa apagar um plano em uso).

-- 1. Backfill: cria Subscription para tenants com plano válido e sem assinatura.
INSERT INTO subscriptions (
  id, tenant_id, plan_id, status, billing_cycle, amount_cents,
  started_at, current_period_end, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  t.id,
  p.id,
  'ACTIVE',
  'MONTHLY',
  ROUND(p.monthly_price * 100)::int,
  now(),
  NULL,
  now(),
  now()
FROM tenants t
JOIN plans p ON p.id = t.plan::uuid
WHERE t.plan IS NOT NULL
  AND t.plan ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id);

-- 2. Saneia `tenants.plan` que não referencia plano existente (não vira FK; a
--    coluna permanece como sombra sincronizada, mas sem lixo/slug legado).
UPDATE tenants t
SET plan = NULL
WHERE t.plan IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM plans p
    WHERE t.plan ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND p.id = t.plan::uuid
  );

-- 3. FK real de subscriptions.plan_id -> plans.id.
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
