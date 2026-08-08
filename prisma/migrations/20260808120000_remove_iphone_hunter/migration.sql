-- Remove o módulo iPhone Hunter (decisão do dono, 2026-08-08: "esse módulo de
-- busca de iphones será descontinuado. não iremos mais usar").
--
-- As três tabelas estavam VAZIAS em produção no momento da remoção — 0 anúncios,
-- 0 grupos, 0 mensagens —, então nada se perde. Verificado antes de escrever
-- esta migration.
--
-- Ordem: filhas antes das mães. `iphone_listings` referencia
-- `whatsapp_group_messages`, que referencia `whatsapp_groups`. Nenhuma tabela de
-- FORA do conjunto depende delas (confirmado em `pg_constraint`), então o DROP
-- não cascateia para o resto do sistema.
--
-- `IF EXISTS` porque o CI monta o banco do zero e um ambiente antigo pode não
-- ter as tabelas; a migration precisa ser idempotente nos dois casos.

DROP TABLE IF EXISTS "iphone_listings";
DROP TABLE IF EXISTS "whatsapp_group_messages";
DROP TABLE IF EXISTS "whatsapp_groups";

-- O enum só era usado por `iphone_listings.condition`.
DROP TYPE IF EXISTS "IPhoneCondition";
