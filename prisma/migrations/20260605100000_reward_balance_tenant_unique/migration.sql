-- Corrige a unicidade de saldo de recompensas para o domínio multi-tenant.
-- Antes, reward_balances.customer_id era único globalmente; isso impedia que
-- tenants diferentes mantivessem saldos independentes para o mesmo customer_id.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT tenant_id, customer_id
      FROM reward_balances
      GROUP BY tenant_id, customer_id
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'reward_balances has duplicate tenant_id/customer_id pairs; reconcile before applying unique constraint';
  END IF;
END
$$;

DROP INDEX IF EXISTS reward_balances_customer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reward_balances_tenant_id_customer_id_key
  ON reward_balances (tenant_id, customer_id);
