-- Remove SimulatorSession: historico de simulacoes nunca foi usado na UI
-- (codigo morto). O envio WhatsApp do simulador agora e stateless (Cloud API
-- + PDF transiente via token HMAC), entao a tabela nao tem mais proposito.
DROP TABLE IF EXISTS "simulator_sessions";
