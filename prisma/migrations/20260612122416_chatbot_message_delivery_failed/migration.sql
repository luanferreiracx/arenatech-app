-- Marca falha de entrega no WhatsApp por mensagem (Chatwoot/Meta status "failed").
ALTER TABLE "chatbot_messages" ADD COLUMN "delivery_failed" BOOLEAN NOT NULL DEFAULT false;

-- Índice por external_id (lookup na atualização de status vinda do webhook).
CREATE INDEX "chatbot_messages_tenant_id_external_id_idx" ON "chatbot_messages"("tenant_id", "external_id");
