-- Defesa em profundidade: FK composta (tenant_id, id) nas relações de DINHEIRO.
--
-- Auditoria 2026-08-05 (P1-B8). Com dois tenants reais no banco, foi PROVADO que
-- a escrita cross-tenant passa:
--
--   SET LOCAL ROLE app_user;
--   SET LOCAL app.current_tenant_id = '<tenant B>';
--   INSERT INTO cash_movements (..., cash_session_id) VALUES (..., '<sessão do tenant A>');
--   -- INSERT 0 1
--
-- O RLS bloqueia a LEITURA da linha alheia, mas a verificação de FK roda com
-- privilégio interno e ignora RLS. 54 FKs do schema estão nessa condição.
--
-- POR QUE SÓ ESTAS QUATRO: são as que carregam dinheiro. As outras 50 apontam
-- para catálogo, configuração e cadastro — mesmo padrão, blast radius menor.
-- Fazer as 54 seria trabalho especulativo em 50 lugares; estas quatro cobrem o
-- caminho que a auditoria mediu como crítico.
--
-- POR QUE NÃO MEXE NO PRISMA: a FK antiga (simples) permanece e continua sendo a
-- que o Prisma conhece. A composta é ADICIONAL e vive só no banco. Trocar a
-- relação no schema exigiria alterar todas as queries que criam esses
-- registros — muito mais superfície de mudança para a mesma garantia.
--
-- Medido antes de aplicar: 0 violações nas quatro relações em produção.
--
-- ON DELETE ESPELHA A FK EXISTENTE, não é escolha livre. Três das quatro FKs
-- antigas são CASCADE (`installment_payments`, `installments`, `sale_items`) e
-- uma é NO ACTION (`cash_movements`). Uma composta com RESTRICT ao lado de uma
-- simples com CASCADE BLOQUEIA o cascade — o delete da venda passaria a falhar.
-- Verificado em `pg_constraint.confdeltype` antes de escrever.

SET lock_timeout = '5s';

-- ── Pré-requisito: UNIQUE (tenant_id, id) na tabela referenciada ──────────────
-- FK composta exige um índice único que case exatamente com as colunas
-- referenciadas. A PK em `id` sozinha não serve.
--
-- Tabelas pequenas (349 a 2.593 linhas, < 3 MB): o lock do ADD CONSTRAINT é de
-- milissegundos. Em tabela grande isto exigiria CREATE UNIQUE INDEX CONCURRENTLY
-- + ADD CONSTRAINT USING INDEX, que não pode rodar dentro de transação — e
-- migration do Prisma roda em transação.
ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_tenant_id_id_key" UNIQUE ("tenant_id", "id");

ALTER TABLE "installments"
  ADD CONSTRAINT "installments_tenant_id_id_key" UNIQUE ("tenant_id", "id");

ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_tenant_id_id_key" UNIQUE ("tenant_id", "id");

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_tenant_id_id_key" UNIQUE ("tenant_id", "id");

-- ── As FKs compostas ─────────────────────────────────────────────────────────
-- `NOT VALID` + `VALIDATE` em vez de ADD direto: o ADD valida a tabela inteira
-- segurando SHARE ROW EXCLUSIVE, que bloqueia escrita. Com NOT VALID a
-- constraint passa a valer para linhas NOVAS imediatamente, e o VALIDATE depois
-- confere as antigas com lock fraco. Hoje as tabelas são pequenas e a diferença
-- é irrelevante; o padrão está aqui porque elas crescem com cada cliente novo.

ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_tenant_id_cash_session_id_fkey"
  FOREIGN KEY ("tenant_id", "cash_session_id")
  REFERENCES "cash_sessions" ("tenant_id", "id")
  ON UPDATE CASCADE ON DELETE NO ACTION
  NOT VALID;
ALTER TABLE "cash_movements" VALIDATE CONSTRAINT "cash_movements_tenant_id_cash_session_id_fkey";

ALTER TABLE "installment_payments"
  ADD CONSTRAINT "installment_payments_tenant_id_installment_id_fkey"
  FOREIGN KEY ("tenant_id", "installment_id")
  REFERENCES "installments" ("tenant_id", "id")
  ON UPDATE CASCADE ON DELETE CASCADE
  NOT VALID;
ALTER TABLE "installment_payments" VALIDATE CONSTRAINT "installment_payments_tenant_id_installment_id_fkey";

ALTER TABLE "installments"
  ADD CONSTRAINT "installments_tenant_id_transaction_id_fkey"
  FOREIGN KEY ("tenant_id", "transaction_id")
  REFERENCES "financial_transactions" ("tenant_id", "id")
  ON UPDATE CASCADE ON DELETE CASCADE
  NOT VALID;
ALTER TABLE "installments" VALIDATE CONSTRAINT "installments_tenant_id_transaction_id_fkey";

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_tenant_id_sale_id_fkey"
  FOREIGN KEY ("tenant_id", "sale_id")
  REFERENCES "sales" ("tenant_id", "id")
  ON UPDATE CASCADE ON DELETE CASCADE
  NOT VALID;
ALTER TABLE "sale_items" VALIDATE CONSTRAINT "sale_items_tenant_id_sale_id_fkey";
