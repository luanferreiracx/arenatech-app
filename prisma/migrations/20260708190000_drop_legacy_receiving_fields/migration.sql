-- Remove campos legado/inativos de Regras de Venda (tenant_receiving_settings):
--  * default_policy_device / default_policy_non_device: política de taxa migrou
--    para decisão por venda (CLIENTE_PAGA/loja absorve no PDV).
--  * require_cpf_above: obsoleto — a API da Eulen (DePix) exige CPF em qualquer
--    valor, não só acima de um teto.
--  * auto_close_time, monthly_sales_goal, default_das_rate, default_icms_diff_rate:
--    nunca foram aplicados por nenhuma lógica de negócio.
-- Colunas mantidas: min_installment_amount, max_discount_percent_non_admin (ativas).
ALTER TABLE "tenant_receiving_settings"
  DROP COLUMN IF EXISTS "default_policy_device",
  DROP COLUMN IF EXISTS "default_policy_non_device",
  DROP COLUMN IF EXISTS "require_cpf_above",
  DROP COLUMN IF EXISTS "auto_close_time",
  DROP COLUMN IF EXISTS "monthly_sales_goal",
  DROP COLUMN IF EXISTS "default_das_rate",
  DROP COLUMN IF EXISTS "default_icms_diff_rate";
