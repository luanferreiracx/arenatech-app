-- CreateEnum
CREATE TYPE "IPhoneCondition" AS ENUM ('LACRADO', 'SEMINOVO_CAIXA', 'SEMINOVO');

-- CreateTable: whatsapp_groups
CREATE TABLE "whatsapp_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "evolution_group_jid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monitored" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_groups_tenant_id_evolution_group_jid_key"
  ON "whatsapp_groups"("tenant_id", "evolution_group_jid");
CREATE INDEX "whatsapp_groups_tenant_id_monitored_idx"
  ON "whatsapp_groups"("tenant_id", "monitored");

-- CreateTable: whatsapp_group_messages
CREATE TABLE "whatsapp_group_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "evolution_message_id" TEXT NOT NULL,
    "sender_jid" TEXT NOT NULL,
    "sender_name" TEXT,
    "body_text" TEXT NOT NULL,
    "media_url" TEXT,
    "media_type" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_group_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_group_messages_tenant_id_evolution_message_id_key"
  ON "whatsapp_group_messages"("tenant_id", "evolution_message_id");
CREATE INDEX "whatsapp_group_messages_tenant_id_posted_at_idx"
  ON "whatsapp_group_messages"("tenant_id", "posted_at");
CREATE INDEX "whatsapp_group_messages_tenant_id_group_id_posted_at_idx"
  ON "whatsapp_group_messages"("tenant_id", "group_id", "posted_at");

ALTER TABLE "whatsapp_group_messages"
  ADD CONSTRAINT "whatsapp_group_messages_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "whatsapp_groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: iphone_listings
CREATE TABLE "iphone_listings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "storage_gb" INTEGER,
    "color" TEXT,
    "price_cents" INTEGER,
    "has_box" BOOLEAN NOT NULL DEFAULT true,
    "condition" "IPhoneCondition" NOT NULL DEFAULT 'SEMINOVO_CAIXA',
    "raw_snippet" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "iphone_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "iphone_listings_message_id_key" ON "iphone_listings"("message_id");
CREATE INDEX "iphone_listings_tenant_id_model_posted_at_idx"
  ON "iphone_listings"("tenant_id", "model", "posted_at");
CREATE INDEX "iphone_listings_tenant_id_posted_at_idx"
  ON "iphone_listings"("tenant_id", "posted_at");

ALTER TABLE "iphone_listings"
  ADD CONSTRAINT "iphone_listings_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "whatsapp_group_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "whatsapp_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_groups"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "whatsapp_group_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_group_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_group_messages"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "iphone_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iphone_listings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "iphone_listings"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
