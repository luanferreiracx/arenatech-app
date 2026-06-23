-- Remove o sistema de comissao legado (ADR 0056).
--
-- O legado (Commission / CommissionRule / SocioCommissionRule) nunca foi usado
-- em producao. Quem recebe comissao agora e:
--   - Provider (User MEI/CLT) via apuracao progressiva (sistema provider_*), ou
--   - ServiceProvider (entidade externa) pago como conta a pagar (PAYABLE),
--     usando ServiceProvider.commission_rate no pagamento da OS.
--
-- Sem chaves estrangeiras externas apontando para estas tabelas (verificado),
-- entao o DROP ... CASCADE remove apenas indices/policies/constraints proprios.

DROP TABLE IF EXISTS "commissions" CASCADE;
DROP TABLE IF EXISTS "commission_rules" CASCADE;
DROP TABLE IF EXISTS "socio_commission_rules" CASCADE;

DROP TYPE IF EXISTS "CommissionType";
DROP TYPE IF EXISTS "CommissionStatus";
