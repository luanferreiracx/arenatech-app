-- AlterTable: TenantFiscalSettings ganha CFOP/NCM/CSC padrão
ALTER TABLE "tenant_fiscal_settings"
ADD COLUMN "default_cfop" TEXT DEFAULT '5102',
ADD COLUMN "default_ncm" TEXT DEFAULT '85171231',
ADD COLUMN "csc_id" TEXT,
ADD COLUMN "csc_token" TEXT;
