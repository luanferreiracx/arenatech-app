-- ADR 0061 — teste grátis (trial).
--
-- `TRIALING` concede os módulos do plano e NÃO conta como receita. O fim do
-- teste vive em `current_period_end`, o mesmo campo do vencimento: quando passa,
-- a assinatura cai no caminho já existente (PAST_DUE → carência → bloqueio).
-- Nenhuma máquina de estados paralela, nenhuma coluna nova em `subscriptions`.

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING' BEFORE 'ACTIVE';

-- Configuração global da plataforma. O dono pediu controle do prazo de teste
-- "geral e de cada tenant": o geral é esta linha; o de cada tenant é empurrar o
-- `current_period_end` da assinatura em teste.
CREATE TABLE "platform_settings" (
  "id"            TEXT NOT NULL DEFAULT 'singleton',
  "trial_days"    INTEGER NOT NULL DEFAULT 7,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id" UUID,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id"),
  -- Linha única garantida pelo BANCO, não por convenção: sem isto, um segundo
  -- INSERT criaria uma configuração-fantasma que ninguém lê e todo mundo acha
  -- que está valendo.
  CONSTRAINT "platform_settings_singleton" CHECK ("id" = 'singleton'),
  CONSTRAINT "platform_settings_trial_days_range" CHECK ("trial_days" >= 0 AND "trial_days" <= 365)
);

INSERT INTO "platform_settings" ("id", "trial_days") VALUES ('singleton', 7)
  ON CONFLICT ("id") DO NOTHING;

-- Aviso próprio para o fim do teste. É a mensagem que muda, não o mecanismo:
-- quem está testando ainda não escolheu plano nem tem o que pagar, e "sua
-- assinatura vence" seria a frase errada no momento mais decisivo do funil.
ALTER TYPE "SubscriptionNoticeKind" ADD VALUE IF NOT EXISTS 'TRIAL_ENDING' BEFORE 'DUE_SOON';
