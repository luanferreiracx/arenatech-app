-- Teto de desconto (%) para usuarios NAO-admin no PDV. Admin do tenant e
-- irrestrito. Vale para o desconto do carrinho (applyDiscount) e para o override
-- de preco de item (updateItemPrice, medido contra o preco de tabela).
--
-- Aditiva, com DEFAULT constante -> Postgres 11+ nao reescreve a tabela
-- (zero-downtime). Linhas existentes passam a enxergar o default (10) sem
-- UPDATE. A coluna e nullable: null = "sem teto" (o tenant pode limpar o campo
-- na tela para liberar geral). O default 10 aplica um teto conservador desde o
-- primeiro dia (decisao do dono).
ALTER TABLE "tenant_receiving_settings"
  ADD COLUMN "max_discount_percent_non_admin" INTEGER DEFAULT 10;
