-- Chatbot por tenant, fatia 2: credencial da Cloud API por tenant + saúde.
--
-- `WHATSAPP_CLOUD` é distinto de `EVOLUTION_WHATSAPP`: um é a API oficial da
-- Meta (credencial própria do lojista), o outro é a via não-oficial por QR code.
-- Contratos e riscos diferentes; um tenant pode usar um sem o outro.
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'WHATSAPP_CLOUD';

-- Saúde da credencial, preenchida pela verificação periódica.
--
-- Credencial de terceiro APODRECE sozinha: o token da Meta expira (24h no
-- temporário, 60 dias no de usuário — só o de system user é permanente), pode
-- ser revogado no Business Manager, e o número pode perder a verificação. Nada
-- disso gera evento nosso: sem checar de tempos em tempos, o primeiro sinal é o
-- bot parar de responder ao cliente da loja.
--
-- Tudo NULLABLE: integração que nunca foi verificada tem `health_checked_at`
-- nulo, que é diferente de "verificada e falhou".
ALTER TABLE "tenant_integrations"
  ADD COLUMN "health_checked_at"  TIMESTAMP(3),
  ADD COLUMN "health_ok"          BOOLEAN,
  ADD COLUMN "health_reason"      TEXT,
  ADD COLUMN "health_notified_at" TIMESTAMP(3);
