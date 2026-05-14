-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('WAITING', 'CONTACTED', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('PURCHASE', 'SALE', 'TRADE', 'REPAIR');

-- CreateEnum
CREATE TYPE "DepixWithdrawStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PixKeyType" AS ENUM ('RANDOM', 'CPF', 'CNPJ', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "QuickSaleStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "customer_interests" ADD COLUMN     "assigned_user_id" UUID,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "estimated_value" DECIMAL(10,2),
ADD COLUMN     "interest_type" "InterestType" NOT NULL DEFAULT 'PURCHASE',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'media',
ADD COLUMN     "product" TEXT,
ADD COLUMN     "status" "InterestStatus" NOT NULL DEFAULT 'WAITING',
ADD COLUMN     "status_change_reason" TEXT;

-- CreateTable
CREATE TABLE "interest_interactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "interaction_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depix_withdrawals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "pix_key_type" "PixKeyType" NOT NULL,
    "pix_key" TEXT NOT NULL,
    "recipient_name" TEXT,
    "recipient_tax_id" TEXT,
    "notes" TEXT,
    "requested_amount" DECIMAL(10,2) NOT NULL,
    "received_amount" DECIMAL(10,2),
    "fee" DECIMAL(10,2),
    "deposit_amount" DECIMAL(10,2),
    "status" "DepixWithdrawStatus" NOT NULL DEFAULT 'PENDING',
    "depix_id" TEXT,
    "deposit_address" TEXT,
    "blockchain_tx_id" TEXT,
    "expiration" TIMESTAMP(3),
    "api_response" JSONB,
    "user_id" UUID NOT NULL,
    "user_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depix_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_sales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "QuickSaleStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "buyer_name" TEXT,
    "cpf_cnpj" TEXT,
    "phone" TEXT,
    "product_description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "paid_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interest_interactions_tenant_id_interest_id_idx" ON "interest_interactions"("tenant_id", "interest_id");

-- CreateIndex
CREATE UNIQUE INDEX "depix_withdrawals_number_key" ON "depix_withdrawals"("number");

-- CreateIndex
CREATE INDEX "depix_withdrawals_tenant_id_idx" ON "depix_withdrawals"("tenant_id");

-- CreateIndex
CREATE INDEX "depix_withdrawals_status_idx" ON "depix_withdrawals"("status");

-- CreateIndex
CREATE INDEX "depix_withdrawals_pix_key_idx" ON "depix_withdrawals"("pix_key");

-- CreateIndex
CREATE INDEX "quick_sales_tenant_id_status_idx" ON "quick_sales"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "quick_sales_tenant_id_created_at_idx" ON "quick_sales"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quick_sales_tenant_id_number_key" ON "quick_sales"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "customer_interests_tenant_id_status_idx" ON "customer_interests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "customer_interests_tenant_id_interest_type_idx" ON "customer_interests"("tenant_id", "interest_type");

-- AddForeignKey
ALTER TABLE "interest_interactions" ADD CONSTRAINT "interest_interactions_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "customer_interests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
