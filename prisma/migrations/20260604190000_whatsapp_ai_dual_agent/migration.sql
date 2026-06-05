-- Dual-agent WhatsApp IA: assistente normal + Claude Code no servidor.

CREATE TYPE "WhatsappAiAgentKind" AS ENUM ('assistant', 'claude_code');
CREATE TYPE "WhatsappAiExecutionStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out');

ALTER TABLE "whatsapp_ai_conversations"
  ADD COLUMN "agent_kind" "WhatsappAiAgentKind" NOT NULL DEFAULT 'assistant',
  ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "model" TEXT;

CREATE TABLE "whatsapp_ai_executions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "status" "WhatsappAiExecutionStatus" NOT NULL DEFAULT 'queued',
  "prompt" TEXT NOT NULL,
  "workdir" TEXT NOT NULL,
  "model" TEXT,
  "branch_name" TEXT,
  "pr_url" TEXT,
  "run_url" TEXT,
  "result_summary" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_ai_executions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "whatsapp_ai_executions"
  ADD CONSTRAINT "whatsapp_ai_executions_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_ai_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "whatsapp_ai_executions_tenant_id_conversation_id_created_at_idx"
  ON "whatsapp_ai_executions"("tenant_id", "conversation_id", "created_at");
CREATE INDEX "whatsapp_ai_executions_tenant_id_status_created_at_idx"
  ON "whatsapp_ai_executions"("tenant_id", "status", "created_at");

ALTER TABLE "whatsapp_ai_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_ai_executions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whatsapp_ai_executions"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON "whatsapp_ai_executions"
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON "whatsapp_ai_executions" TO app_user;
GRANT ALL ON "whatsapp_ai_executions" TO app_admin;
