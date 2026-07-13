-- Consciência temporal do Talison por tenant (fecha a suposição hardcoded de
-- fuso America/Fortaleza + horário 09h30-20h + seg-sáb em business-hours.ts).
-- Aditiva: colunas com default que preservam o comportamento atual do arena-tech
-- (fuso Fortaleza, seg–sáb). O horário abre/fecha continua vindo de
-- business_hours_start/end (quando nulos, o código usa o default do sistema).
ALTER TABLE "chatbot_configs"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Fortaleza',
  ADD COLUMN "open_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6];
