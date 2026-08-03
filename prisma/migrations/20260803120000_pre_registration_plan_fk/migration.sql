-- Funil self-service (ADR 0061): `pre_registrations.plan_id` passa a ser o plano
-- que o CLIENTE escolheu na página de preços, e a aprovação abre o teste grátis
-- nele. Até aqui a coluna existia mas ninguém escrevia — era um uuid solto, sem
-- FK: um plano removido deixava o pré-cadastro apontando para o nada, e a
-- aprovação morria com "plano não existe" sem dizer de onde veio o id.
--
-- Limpa antes de restringir: linha órfã (id que não casa com nenhum plano)
-- viraria erro na criação da constraint e derrubaria o deploy. `NULL` é um
-- estado que a aprovação já trata — significa "entrou sem escolher plano".
UPDATE "pre_registrations" pr
SET "plan_id" = NULL
WHERE pr."plan_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "plans" p WHERE p."id" = pr."plan_id");

-- Índice antes da FK: o Postgres NÃO cria índice no lado que referencia, e sem
-- ele todo DELETE/UPDATE em `plans` varre `pre_registrations` inteira para
-- resolver o `ON DELETE SET NULL`.
CREATE INDEX IF NOT EXISTS "pre_registrations_plan_id_idx" ON "pre_registrations"("plan_id");

-- `SET NULL` e não `RESTRICT`: um cadastro pendente não pode travar a gestão de
-- planos do superadmin. Ele volta a ser "sem plano", estado já suportado.
ALTER TABLE "pre_registrations"
  ADD CONSTRAINT "pre_registrations_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
