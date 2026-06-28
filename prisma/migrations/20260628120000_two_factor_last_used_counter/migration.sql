-- Anti-replay de TOTP no step-up (P2-1 da auditoria 2026-06-28): guarda o último
-- "passo" (counter = floor(unixtime/30)) de TOTP já usado por usuário, para que o
-- MESMO código de 6 dígitos não autorize duas operações (ex.: dois saques) dentro
-- da janela de validade (~30-90s). Aditivo, nullable, zero-downtime.
ALTER TABLE "users" ADD COLUMN "two_factor_last_used_counter" BIGINT;
