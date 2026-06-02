-- Historico de recargas L-BTC (taxa de rede Liquid) do tenant central pros demais.
-- Trigger automatico apos cada saque sucedido + endpoint manual em /admin/depix-lbtc.

CREATE TABLE depix_lbtc_refills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  amount_sats     INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  txid            TEXT,
  source          TEXT NOT NULL,
  triggered_by    UUID,
  error_message   TEXT,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP(3)
);

CREATE INDEX depix_lbtc_refills_tenant_id_created_at_idx ON depix_lbtc_refills (tenant_id, created_at);
CREATE INDEX depix_lbtc_refills_status_created_at_idx ON depix_lbtc_refills (status, created_at);
