-- Um pré-cadastro PENDENTE por e-mail.
--
-- 2026-07-29: `startRegistration` (onboarding NO-KYC) é read-then-write — busca
-- o PENDING do mesmo e-mail e, se não achar, insere. Entre o SELECT e o INSERT
-- existe janela: duas requisições simultâneas do mesmo interessado (duplo-clique,
-- retry do navegador) criavam DUAS linhas PENDING para o mesmo e-mail. A fila de
-- aprovação do superadmin passava a mostrar o mesmo cadastro duas vezes, e só uma
-- delas seguia recebendo os códigos de verificação — a outra ficava presa lá
-- para sempre, indistinguível de um cadastro real.
--
-- A tabela não tinha índice nenhum além da primary key: nem unicidade, nem
-- suporte pra busca por `owner_email`. Este índice resolve as duas coisas.
--
-- Parcial de propósito: APPROVED e REJECTED ficam de fora. Recadastrar depois de
-- ser rejeitado é fluxo normal, e o histórico das tentativas antigas tem que
-- continuar existindo.
--
-- Sem CONCURRENTLY porque o `prisma migrate` roda a migration dentro de uma
-- transação, e CREATE INDEX CONCURRENTLY não pode rodar em transação. A tabela
-- tem 8 linhas em produção — o ACCESS EXCLUSIVE dura microssegundos.

-- Defensivo: a corrida acima era possível até agora, então algum ambiente pode
-- já ter duplicata — e aí o CREATE UNIQUE INDEX falharia, travando o deploy.
-- Mantém a mais recente (exatamente a que a procedure reaproveita) e aposenta as
-- anteriores, deixando o motivo registrado em `notes`. Em produção isso afeta 0
-- linhas; é rede, não expectativa.
UPDATE "pre_registrations" AS antigo
   SET "status" = 'REJECTED',
       "notes" = coalesce(antigo."notes" || ' | ', '')
                 || 'Duplicata de pre-cadastro PENDENTE, aposentada na migration 20260729130000.',
       "updated_at" = now()
 WHERE antigo."status" = 'PENDING'
   AND EXISTS (
     SELECT 1
       FROM "pre_registrations" AS recente
      WHERE recente."owner_email" = antigo."owner_email"
        AND recente."status" = 'PENDING'
        AND (recente."created_at", recente."id") > (antigo."created_at", antigo."id")
   );

CREATE UNIQUE INDEX IF NOT EXISTS "pre_registrations_pending_owner_email_key"
  ON "pre_registrations" ("owner_email")
  WHERE "status" = 'PENDING';
