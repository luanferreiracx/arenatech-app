-- AlterTable: TenantAssistanceSettings ganha valuationValidityDays
ALTER TABLE "tenant_assistance_settings"
ADD COLUMN "valuation_validity_days" INTEGER NOT NULL DEFAULT 7;
