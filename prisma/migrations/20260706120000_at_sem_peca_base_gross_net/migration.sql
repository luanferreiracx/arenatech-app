-- Preserva o comportamento historico ao tornar a BASE (lucro/total) configuravel
-- nas categorias de AT de execucao.
--
-- Antes desta mudanca, o eixo `base` nao era usado para servicos: o valor era
-- fixado no codigo por categoria — "AT sem peca" comissionava sobre o VALOR do
-- servico (serviceAmount), "AT com peca" e "Intermediacao" sobre o LUCRO (LBS).
-- Agora o evento carrega as duas bases e o `base` da regra escolhe qual usar.
--
-- Regras `servico_at_sem_peca` ja cadastradas foram salvas com base='PROFIT'
-- (default do schema) mas o comportamento real era 'valor total'. Corrige-as para
-- GROSS_NET para nao mudar o valor pago a ninguem. `servico_at_com_peca` e
-- `intermediacao_at` ja usavam lucro (PROFIT) — nao mexe.
UPDATE "provider_commission_rules"
SET "base" = 'GROSS_NET'
WHERE "category" = 'servico_at_sem_peca' AND "base" = 'PROFIT';
