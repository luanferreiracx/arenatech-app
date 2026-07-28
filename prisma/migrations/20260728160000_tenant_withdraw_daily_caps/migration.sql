-- Tetos de saque por 24h configuráveis pelo superadmin, POR TENANT.
--
-- Antes os dois tetos eram constantes de ambiente, iguais para todo mundo: subir
-- para um parceiro de volume alto subiria para todos. Agora o default continua no
-- ambiente e cada tenant pode ter o seu; `NULL` = usa o default.
--
-- Os dois tetos são separados de propósito, porque os caminhos são diferentes:
-- o do painel protege um humano com 2FA; o da API protege uma máquina SEM 2FA —
-- e, para a carteira central (isenta do teto do painel), o da API é o ÚNICO
-- limite diário. Ver docs/decisions/0057.
ALTER TABLE "tenants"
  ADD COLUMN "depix_withdraw_daily_cap_cents" INTEGER,
  ADD COLUMN "partner_api_withdraw_daily_cap_cents" INTEGER;
