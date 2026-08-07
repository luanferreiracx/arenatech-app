-- E8-4 (auditoria 2026-08-07): a tabela de preços de avaliação não tinha
-- NENHUMA constraint impedindo duas linhas ATIVAS para a mesma combinação
-- (tenant, modelo, armazenamento, bateria) — e o `create` não checa duplicata.
--
-- Provado no navegador: duas inserções da mesma combinação com R$ 1.000 e
-- R$ 5.000 foram ambas aceitas (HTTP 200). O `sendWhatsApp` monta a tabela a
-- partir dessas linhas, então o CLIENTE receberia duas linhas "Bateria > 90%"
-- com preços diferentes — e a loja não teria resposta para "qual vale?".
--
-- Impacto medido: 0 duplicatas em produção hoje (232 linhas, 37 modelos). É
-- correção preventiva antes do primeiro erro de digitação.
--
-- Índice PARCIAL (`WHERE deleted_at IS NULL`) porque o soft delete é o padrão
-- do projeto: uma linha apagada não pode bloquear o recadastro da mesma
-- combinação. Um UNIQUE simples quebraria esse fluxo.
--
-- CONCURRENTLY não é usado aqui porque `prisma migrate deploy` roda cada
-- migration numa transação, e CREATE INDEX CONCURRENTLY não pode rodar dentro
-- de transação. A tabela tem 232 linhas — o lock é de milissegundos.
CREATE UNIQUE INDEX IF NOT EXISTS device_valuations_ativa_unica
  ON device_valuations (tenant_id, modelo, armazenamento, saude_bateria)
  WHERE deleted_at IS NULL;
