-- CreateTable: ChatbotConfig (singleton por tenant)
CREATE TABLE "chatbot_configs" (
    "tenant_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "whitelist_phones" JSONB,
    "business_hours_start" TEXT,
    "business_hours_end" TEXT,
    "greeting_message" TEXT,
    "out_of_hours_message" TEXT,
    "handoff_message" TEXT,
    "follow_up_delay_hours" INTEGER NOT NULL DEFAULT 24,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chatbot_configs_pkey" PRIMARY KEY ("tenant_id")
);

-- RLS
ALTER TABLE "chatbot_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chatbot_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "chatbot_configs"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
