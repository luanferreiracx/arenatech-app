-- Gate da carteira DePix por tenant.
--
-- Até aqui `wallet` e `depix-ops` eram piso incondicional (ADR 0061): todo
-- tenant, de qualquer plano, caía na carteira. A intenção do ADR era proteger o
-- cliente — não separá-lo do próprio dinheiro quando ele deve — e essa parte
-- continua valendo. O efeito colateral é que abrir cadastro colocaria 100% dos
-- clientes novos na superfície mais frágil do sistema (Esplora pública, cache do
-- LWK, off-ramp de terceiro), inclusive quem contratou para vender celular e
-- nunca vai tocar em DePix.
--
-- Agora o piso é CONDICIONAL: vale para quem tem DePix habilitado. Uma vez
-- habilitado e com carteira provisionada, nada mais tira — nem a suspensão por
-- inadimplência, nem o superadmin (ver `admin.setDepixEnabled`).
ALTER TABLE "tenants" ADD COLUMN "depix_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: todo tenant que JÁ EXISTE continua com a carteira.
--
-- O default é `false` porque é o certo para quem chega depois. Aplicá-lo aos
-- atuais tiraria a carteira de quem já opera — exatamente a regressão que o
-- ADR 0061 proíbe. Como a coluna nasce com o default, o UPDATE abaixo é o que
-- diferencia "tenant existente" de "tenant novo".
UPDATE "tenants" SET "depix_enabled" = true;
