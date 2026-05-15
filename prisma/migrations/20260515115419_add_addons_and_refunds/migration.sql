-- CreateEnum
CREATE TYPE "AddonPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "addons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "query_count" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "validity_days" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_purchases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "quantity_purchased" INTEGER NOT NULL,
    "quantity_remaining" INTEGER NOT NULL,
    "price_paid" DECIMAL(10,2) NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiration_date" TIMESTAMP(3) NOT NULL,
    "status" "AddonPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addon_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "old_plan_id" UUID,
    "new_plan_id" UUID,
    "refund_amount" DECIMAL(10,2) NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "processed_by_id" UUID,
    "processed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "addons_slug_key" ON "addons"("slug");

-- CreateIndex
CREATE INDEX "addon_purchases_tenant_id_idx" ON "addon_purchases"("tenant_id");

-- CreateIndex
CREATE INDEX "addon_purchases_addon_id_idx" ON "addon_purchases"("addon_id");

-- CreateIndex
CREATE INDEX "refunds_tenant_id_idx" ON "refunds"("tenant_id");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
