-- Backfill das bandeiras de cartao padrao para tenants que ainda nao tem nenhuma.
--
-- Contexto: o seed `tenantFinancialInit` so roda na CRIACAO do tenant, e a
-- migration `receiving_foundation` foi aditiva (sem backfill). Tenants criados/
-- migrados do Laravel ANTES desse seed ficaram com ZERO bandeiras — entao o PDV
-- nao mostrava a captura de bandeira no cartao (o bloco exige bandeiras). Este
-- backfill semeia o catalogo padrao so para quem nao tem, fechando a disparidade.
--
-- Idempotente: o WHERE NOT EXISTS por (tenant, nome) garante que rodar de novo
-- nao duplica; e em banco limpo do zero (sem tenants) e um no-op.

INSERT INTO "card_brands" ("id", "tenant_id", "name", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), t."id", b."name", true, now(), now()
FROM "tenants" t
CROSS JOIN (VALUES ('Visa'), ('Mastercard'), ('Elo'), ('Amex'), ('Hipercard')) AS b("name")
WHERE NOT EXISTS (
  SELECT 1 FROM "card_brands" cb
  WHERE cb."tenant_id" = t."id" AND cb."name" = b."name"
);
