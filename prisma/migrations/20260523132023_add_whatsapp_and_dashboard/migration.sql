-- WhatsApp conversations (paridade Laravel whatsapp_conversations)
CREATE TABLE "whatsapp_conversations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "last_inbound_at" TIMESTAMP(3),
  "last_outbound_at" TIMESTAMP(3),
  "inbound_count" INTEGER NOT NULL DEFAULT 0,
  "outbound_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_conversations_tenant_id_phone_key"
  ON "whatsapp_conversations"("tenant_id", "phone");
CREATE INDEX "whatsapp_conversations_tenant_id_last_inbound_at_idx"
  ON "whatsapp_conversations"("tenant_id", "last_inbound_at");

ALTER TABLE "whatsapp_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_conversations"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- WhatsApp messages sent (audit log, paridade whatsapp_mensagens_enviadas)
CREATE TABLE "whatsapp_messages_sent" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "template_name" TEXT,
  "content" TEXT,
  "wamid" TEXT,
  "status" TEXT NOT NULL DEFAULT 'enviado',
  "error_message" TEXT,
  "origin_type" TEXT,
  "origin_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_messages_sent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "whatsapp_messages_sent_tenant_phone_created_idx"
  ON "whatsapp_messages_sent"("tenant_id", "phone", "created_at");
CREATE INDEX "whatsapp_messages_sent_tenant_origin_idx"
  ON "whatsapp_messages_sent"("tenant_id", "origin_type", "origin_id");
CREATE INDEX "whatsapp_messages_sent_tenant_status_idx"
  ON "whatsapp_messages_sent"("tenant_id", "status");

ALTER TABLE "whatsapp_messages_sent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_messages_sent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_messages_sent"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Dashboard categories (paridade categorias_dashboard)
CREATE TABLE "dashboard_categories" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "color" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dashboard_categories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dashboard_categories_tenant_idx"
  ON "dashboard_categories"("tenant_id", "active", "order");

ALTER TABLE "dashboard_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dashboard_categories"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Dashboard links (paridade links_dashboard)
CREATE TABLE "dashboard_links" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "icon" TEXT,
  "color" TEXT,
  "description" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "open_new_tab" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dashboard_links_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dashboard_links_tenant_idx"
  ON "dashboard_links"("tenant_id", "category_id", "active", "order");

ALTER TABLE "dashboard_links"
  ADD CONSTRAINT "dashboard_links_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "dashboard_categories"("id") ON DELETE CASCADE;

ALTER TABLE "dashboard_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dashboard_links"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
