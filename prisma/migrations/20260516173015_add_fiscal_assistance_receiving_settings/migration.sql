-- DropForeignKey
ALTER TABLE "interest_interactions" DROP CONSTRAINT "interest_interactions_interest_id_fkey";

-- AlterTable
ALTER TABLE "interest_interactions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "occurred_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "interests" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "business_hours" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "street_number" TEXT,
ADD COLUMN     "warranty_new_months" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "warranty_used_months" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "zip_code" TEXT;

-- CreateTable
CREATE TABLE "tenant_fiscal_settings" (
    "tenant_id" UUID NOT NULL,
    "legal_name" TEXT,
    "trade_name" TEXT,
    "cnpj" TEXT,
    "ie" TEXT,
    "cnae" TEXT,
    "tax_regime" INTEGER NOT NULL DEFAULT 1,
    "zip_code" TEXT,
    "street" TEXT,
    "street_number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "municipality_code" TEXT,
    "nfe_environment" INTEGER NOT NULL DEFAULT 2,
    "nfe_series" TEXT NOT NULL DEFAULT '1',
    "nfce_series" TEXT NOT NULL DEFAULT '1',
    "default_csosn" TEXT DEFAULT '102',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_issue" BOOLEAN NOT NULL DEFAULT false,
    "certificate_url" TEXT,
    "certificate_uploaded_at" TIMESTAMP(3),
    "certificate_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_fiscal_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "tenant_assistance_settings" (
    "tenant_id" UUID NOT NULL,
    "terms_of_service" TEXT,
    "warranty_policy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_assistance_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "tenant_receiving_settings" (
    "tenant_id" UUID NOT NULL,
    "default_policy_device" TEXT NOT NULL DEFAULT 'CUSTOMER_PAYS',
    "default_policy_non_device" TEXT NOT NULL DEFAULT 'STORE_ABSORBS',
    "min_installment_amount" INTEGER NOT NULL DEFAULT 5000,
    "require_cpf_above" INTEGER NOT NULL DEFAULT 50000,
    "auto_close_time" TEXT,
    "monthly_sales_goal" INTEGER,
    "default_das_rate" DECIMAL(5,2),
    "default_icms_diff_rate" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_receiving_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "interest_interactions" ADD CONSTRAINT "interest_interactions_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
