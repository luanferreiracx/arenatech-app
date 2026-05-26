-- Generic webhook audit + replay protection (gap Wp2, Ww1, Wa2, Wn1).
-- Cobre providers que nao tem audit dedicado (pagbank, depix-withdraw,
-- autentique, nuvemfiscal). `DepixWebhookEvent` ja existe para o
-- payment webhook do DePix.
CREATE TABLE "webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT,
  "source_ip" TEXT,
  "signature_valid" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");
CREATE INDEX "webhook_events_provider_created_at_idx" ON "webhook_events"("provider", "created_at");
