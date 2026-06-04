-- Agente IA pessoal via WhatsApp/Evolution. Separado do Talison/Chatwoot.
-- Tabelas tenant-scoped para histórico auditável e contexto curto do assistente privado.

CREATE TYPE "WhatsappAiMessageRole" AS ENUM ('user', 'assistant', 'system');

CREATE TABLE "whatsapp_ai_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "remote_jid" TEXT NOT NULL,
  "instance_name" TEXT NOT NULL,
  "last_message_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_ai_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "role" "WhatsappAiMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "evolution_message_id" TEXT,
  "provider_message_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_ai_conversations_tenant_id_instance_name_phone_key"
  ON "whatsapp_ai_conversations"("tenant_id", "instance_name", "phone");
CREATE INDEX "whatsapp_ai_conversations_tenant_id_last_message_at_idx"
  ON "whatsapp_ai_conversations"("tenant_id", "last_message_at");

CREATE UNIQUE INDEX "whatsapp_ai_messages_tenant_id_evolution_message_id_key"
  ON "whatsapp_ai_messages"("tenant_id", "evolution_message_id");
CREATE INDEX "whatsapp_ai_messages_tenant_id_conversation_id_created_at_idx"
  ON "whatsapp_ai_messages"("tenant_id", "conversation_id", "created_at");

ALTER TABLE "whatsapp_ai_messages"
  ADD CONSTRAINT "whatsapp_ai_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_ai_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_ai_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_ai_conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whatsapp_ai_conversations"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON "whatsapp_ai_conversations"
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON "whatsapp_ai_conversations" TO app_user;
GRANT ALL ON "whatsapp_ai_conversations" TO app_admin;

ALTER TABLE "whatsapp_ai_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_ai_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whatsapp_ai_messages"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON "whatsapp_ai_messages"
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON "whatsapp_ai_messages" TO app_user;
GRANT ALL ON "whatsapp_ai_messages" TO app_admin;
