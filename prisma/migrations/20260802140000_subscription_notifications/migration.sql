-- ADR 0061 — trava de idempotência dos avisos de cobrança (dunning).
--
-- Sem ela o cron diário reenviaria "sua assinatura venceu" todos os dias da
-- carência. A chave única inclui o vencimento do ciclo: quando o tenant paga e o
-- período avança, o mesmo aviso volta a ser possível no ciclo seguinte.

CREATE TYPE "SubscriptionNoticeKind" AS ENUM ('DUE_SOON', 'PAST_DUE', 'GRACE_ENDING', 'SUSPENDED');

CREATE TABLE "subscription_notifications" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "subscription_id"  UUID NOT NULL,
  "tenant_id"        UUID NOT NULL,
  "kind"             "SubscriptionNoticeKind" NOT NULL,
  "period_end"       TIMESTAMP(3) NOT NULL,
  "email_sent_at"    TIMESTAMP(3),
  "whatsapp_sent_at" TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_notifications_pkey" PRIMARY KEY ("id")
);

-- A trava propriamente dita.
CREATE UNIQUE INDEX "subscription_notifications_sub_kind_period_key"
  ON "subscription_notifications" ("subscription_id", "kind", "period_end");

CREATE INDEX "subscription_notifications_tenant_id_idx"
  ON "subscription_notifications" ("tenant_id");

-- RLS backstop, igual ao de `subscriptions` (migration 20260714120000).
--
-- O acesso legítimo é sempre por `withAdmin` (role app_admin, BYPASSRLS), então o
-- cron não quebra. A policy fecha o buraco do modelo: um `withTenant` acidental
-- sobre esta tabela, sem filtro explícito, passaria a NÃO ler o histórico de
-- cobrança de outro tenant. O guard-rail `rls.test.ts` exige isto de TODA tabela
-- com `tenant_id` — e foi ele que pegou a ausência aqui.
--
-- `tenant_id` já está indexado acima (coluna da policy indexada).
ALTER TABLE "subscription_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "subscription_notifications"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
