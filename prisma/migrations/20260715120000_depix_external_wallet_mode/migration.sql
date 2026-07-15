-- Modo carteira EXTERNAL: quando o tenant administra a PROPRIA carteira (a Arena
-- nao custodia), a linha em tenant_depix_wallets existe so como marcador de modo
-- (custodyModel = 'external') e nao tem descriptor/endereco mestre proprios.
-- Relaxa o NOT NULL dessas duas colunas. custodyModel ja e String livre (sem enum),
-- entao o valor 'external' nao exige DDL.
ALTER TABLE "tenant_depix_wallets" ALTER COLUMN "liquid_descriptor" DROP NOT NULL;
ALTER TABLE "tenant_depix_wallets" ALTER COLUMN "master_address" DROP NOT NULL;
