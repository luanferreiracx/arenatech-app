-- Gate da API externa (ADR 0057): superadmin liga/desliga por-tenant. Só com isto
-- ligado o admin do tenant pode emitir/usar API-keys de parceiro. Default false.
ALTER TABLE "tenants" ADD COLUMN "api_access_enabled" BOOLEAN NOT NULL DEFAULT false;
