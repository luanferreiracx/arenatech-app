-- Tipos de regra de comissao flexiveis (ADR 0056, evolucao pos-epico).
-- Cada regra ganha 3 eixos, todos com DEFAULT que preserva o comportamento atual
-- (percentual progressivo sobre o lucro, vendas proprias). Aditiva com DEFAULT
-- constante -> Postgres 11+ nao reescreve a tabela (zero-downtime); linhas
-- existentes passam a enxergar os defaults sem UPDATE.
--
--   value_type: PERCENT (rate = %) | FIXED_PER_UNIT (rate = R$ por unidade)
--   base:       PROFIT  (lucro/LBC) | GROSS_NET (total liquido do item)
--   source:     OWN     (vendas proprias) | STORE (participacao nas de outros)
ALTER TABLE "provider_commission_rules"
  ADD COLUMN "value_type" TEXT NOT NULL DEFAULT 'PERCENT',
  ADD COLUMN "base"       TEXT NOT NULL DEFAULT 'PROFIT',
  ADD COLUMN "source"     TEXT NOT NULL DEFAULT 'OWN';

-- `rate` passa a comportar tambem valor fixo em reais (nao so % <= 100).
-- Alarga a precisao 7,4 -> 10,4 (widening seguro, sem perda de dados).
ALTER TABLE "provider_commission_rules"
  ALTER COLUMN "rate" TYPE DECIMAL(10, 4);
