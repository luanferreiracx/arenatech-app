-- CreateEnum
CREATE TYPE "RewardActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'USED');
CREATE TYPE "RewardType" AS ENUM ('DISCOUNT_PERCENTAGE', 'DISCOUNT_FIXED', 'CASHBACK', 'GIFT');

-- CreateTable reward_campaigns
CREATE TABLE "reward_campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "publication_type" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "validity_days" INTEGER NOT NULL DEFAULT 30,
    "reward_type" "RewardType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "max_cap" DECIMAL(10,2),
    "participant_limit" INTEGER,
    "reward_limit" INTEGER,
    "total_participants" INTEGER NOT NULL DEFAULT 0,
    "total_rewards_generated" INTEGER NOT NULL DEFAULT 0,
    "rules" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reward_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable reward_actions
CREATE TABLE "reward_actions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "campaign_id" UUID,
    "status" "RewardActionStatus" NOT NULL DEFAULT 'PENDING',
    "reward_type" "RewardType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "used_in_sale_id" UUID,
    "validated_by_id" UUID,
    "validated_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reward_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable reward_balances
CREATE TABLE "reward_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "total_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "locked_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "available_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reference_month" TEXT,
    "total_credited_month" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_credited_historical" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_used_historical" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_expired_historical" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_rewards_received" INTEGER NOT NULL DEFAULT 0,
    "total_rewards_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reward_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable reward_movements
CREATE TABLE "reward_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "balance_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reward_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_balances_customer_id_key" ON "reward_balances"("customer_id");
CREATE INDEX "reward_campaigns_tenant_id_active_idx" ON "reward_campaigns"("tenant_id", "active");
CREATE INDEX "reward_campaigns_tenant_id_start_date_end_date_idx" ON "reward_campaigns"("tenant_id", "start_date", "end_date");
CREATE INDEX "reward_actions_tenant_id_customer_id_idx" ON "reward_actions"("tenant_id", "customer_id");
CREATE INDEX "reward_actions_tenant_id_status_idx" ON "reward_actions"("tenant_id", "status");
CREATE INDEX "reward_actions_tenant_id_campaign_id_idx" ON "reward_actions"("tenant_id", "campaign_id");
CREATE INDEX "reward_balances_tenant_id_idx" ON "reward_balances"("tenant_id");
CREATE INDEX "reward_movements_tenant_id_balance_id_idx" ON "reward_movements"("tenant_id", "balance_id");

-- AddForeignKey
ALTER TABLE "reward_actions" ADD CONSTRAINT "reward_actions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "reward_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reward_movements" ADD CONSTRAINT "reward_movements_balance_id_fkey" FOREIGN KEY ("balance_id") REFERENCES "reward_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
