-- C7: rastrear OS que consumiu a recompensa (paridade com Laravel
-- `recompensas_acoes.referenciacao_id`, hoje so existe para vendas).
ALTER TABLE "reward_actions"
ADD COLUMN IF NOT EXISTS "used_in_os_id" UUID;
