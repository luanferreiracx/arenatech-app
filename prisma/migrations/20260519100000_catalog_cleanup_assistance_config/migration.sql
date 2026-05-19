-- Catálogo: remover entidades órfãs sem consumidor (DiagnosticTemplate,
-- DeviceCategory, Device). Features NextJs-only que nunca tiveram UI.
-- Paridade com escopo Laravel (nenhuma das 3 existe lá).
DROP TABLE IF EXISTS "devices";
DROP TABLE IF EXISTS "device_categories";
DROP TABLE IF EXISTS "diagnostic_templates";

-- TenantAssistanceSettings: novos campos para orcamento de servico via WhatsApp
-- (paridade Laravel `configuracoes_assistencia.parcelas_sem_juros`,
-- `desconto_pix`).
ALTER TABLE "tenant_assistance_settings"
  ADD COLUMN IF NOT EXISTS "installments_no_interest" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "pix_discount" DECIMAL(5, 2) NOT NULL DEFAULT 5;
