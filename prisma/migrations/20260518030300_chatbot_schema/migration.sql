-- CreateEnum
CREATE TYPE "ChatbotConversationStatus" AS ENUM ('OPEN', 'BOT_ACTIVE', 'HUMAN_TAKEOVER', 'RESOLVED');

-- CreateTable chatbot_conversations
CREATE TABLE "chatbot_conversations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "external_id" TEXT,
    "contact_phone" TEXT NOT NULL,
    "contact_name" TEXT,
    "customer_id" UUID,
    "status" "ChatbotConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_agent_id" UUID,
    "last_message_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable chatbot_messages
CREATE TABLE "chatbot_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_type" TEXT NOT NULL DEFAULT 'text',
    "media_url" TEXT,
    "external_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable chatbot_follow_ups
CREATE TABLE "chatbot_follow_ups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "executed_at" TIMESTAMP(3),
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "template_name" TEXT,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chatbot_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_conversations_tenant_id_contact_phone_key" ON "chatbot_conversations"("tenant_id", "contact_phone");
CREATE INDEX "chatbot_conversations_tenant_id_status_idx" ON "chatbot_conversations"("tenant_id", "status");
CREATE INDEX "chatbot_conversations_tenant_id_external_id_idx" ON "chatbot_conversations"("tenant_id", "external_id");
CREATE INDEX "chatbot_messages_tenant_id_conversation_id_idx" ON "chatbot_messages"("tenant_id", "conversation_id");
CREATE INDEX "chatbot_messages_tenant_id_created_at_idx" ON "chatbot_messages"("tenant_id", "created_at");
CREATE INDEX "chatbot_follow_ups_tenant_id_scheduled_at_idx" ON "chatbot_follow_ups"("tenant_id", "scheduled_at");
CREATE INDEX "chatbot_follow_ups_tenant_id_conversation_id_idx" ON "chatbot_follow_ups"("tenant_id", "conversation_id");

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
