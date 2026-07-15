-- Remove o canal pessoal WhatsApp→Claude Code (decisão do dono: não será mais usado).
-- Feature inteira eliminada: webhook evolution-ai + lib whatsapp-ai-agent + worker.
-- CASCADE derruba FKs entre as 3 tabelas, índices e policies de RLS.
DROP TABLE IF EXISTS "whatsapp_ai_executions" CASCADE;
DROP TABLE IF EXISTS "whatsapp_ai_messages" CASCADE;
DROP TABLE IF EXISTS "whatsapp_ai_conversations" CASCADE;
