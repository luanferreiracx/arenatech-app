-- Módulo 10 (Configurações/Auth), CFG-1 — remove política de bloqueio que nada aplicava.
--
-- `max_failed_login_attempts` e `lockout_minutes` existiam em
-- `tenant_security_settings`, eram validados por Zod e selecionados pelo serviço
-- de política de senha — e **nenhum código os consumia**. O bloqueio real do
-- login é o rate-limit por IP (`lib/utils/rate-limit.ts`), com valores fixos, e
-- `users` não tem coluna de tentativas falhas.
--
-- Ou seja: dois campos que pareciam uma política de bloqueio de CONTA e não eram
-- nem configuráveis (a procedure de escrita não tem tela) nem por conta.
-- Controle que parece existir e não faz nada é pior que controle ausente, porque
-- cria confiança falsa. Decisão do dono: remover.
--
-- Sem perda de dado: a tabela está VAZIA em produção (0 linhas, medido em
-- 2026-07-29) — a política nunca foi configurada por ninguém.
ALTER TABLE "tenant_security_settings"
  DROP COLUMN IF EXISTS "max_failed_login_attempts",
  DROP COLUMN IF EXISTS "lockout_minutes";
