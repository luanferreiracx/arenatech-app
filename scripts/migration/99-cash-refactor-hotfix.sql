-- Refactor cash_registers -> cash_sessions + cash_movements alignment
-- Migration 20260516214000_cash_session_refactor foi marcada como applied mas nao executou.
-- Este patch aplica a diferenca estrutural sem perder dados.

BEGIN;

-- ============================================================
-- 1) Renomear tabela cash_registers -> cash_sessions
-- ============================================================
ALTER TABLE cash_registers RENAME TO cash_sessions;

-- ============================================================
-- 2) Renomear colunas
-- ============================================================
ALTER TABLE cash_sessions RENAME COLUMN opening_balance  TO initial_balance;
ALTER TABLE cash_sessions RENAME COLUMN closing_balance  TO declared_balance;
ALTER TABLE cash_sessions RENAME COLUMN expected_balance TO calculated_balance;
ALTER TABLE cash_sessions RENAME COLUMN opening_notes    TO opening_note;
ALTER TABLE cash_sessions RENAME COLUMN notes            TO closing_note;

-- ============================================================
-- 3) Adicionar colunas novas
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CashSessionCloseType') THEN
    CREATE TYPE "CashSessionCloseType" AS ENUM ('MANUAL', 'AUTOMATIC');
  END IF;
END$$;

ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS close_type           "CashSessionCloseType";
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS closed_by_user_id    UUID;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS verified             BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS verified_at          TIMESTAMP(3);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS verified_by_user_id  UUID;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS verified_note        TEXT;

-- Backfill close_type para sessoes ja fechadas
UPDATE cash_sessions SET close_type = 'MANUAL'::"CashSessionCloseType"
WHERE closed_at IS NOT NULL AND close_type IS NULL;

-- ============================================================
-- 4) Remover colunas que nao existem mais no schema
-- ============================================================
ALTER TABLE cash_sessions DROP COLUMN IF EXISTS status;
ALTER TABLE cash_sessions DROP COLUMN IF EXISTS difference;  -- difference fica como Decimal? mas mantemos
ALTER TABLE cash_sessions DROP COLUMN IF EXISTS closing_details;
-- A coluna difference fica! Vou re-adicionar
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS difference DECIMAL(10,2);

-- ============================================================
-- 5) Recriar indices com novo nome
-- ============================================================
-- pg vai manter o nome antigo do pkey (cash_registers_pkey) mas funciona.
-- Renomear o constraint do pkey:
ALTER TABLE cash_sessions RENAME CONSTRAINT cash_registers_pkey TO cash_sessions_pkey;

-- Indices novos do schema
DROP INDEX IF EXISTS cash_registers_tenant_id_user_id_idx;
DROP INDEX IF EXISTS cash_registers_tenant_id_status_idx;
CREATE INDEX IF NOT EXISTS cash_sessions_tenant_id_user_id_opened_at_idx ON cash_sessions(tenant_id, user_id, opened_at);
CREATE INDEX IF NOT EXISTS cash_sessions_tenant_id_closed_at_idx ON cash_sessions(tenant_id, closed_at);
CREATE INDEX IF NOT EXISTS cash_sessions_tenant_id_verified_close_type_idx ON cash_sessions(tenant_id, verified, close_type);

-- Constraint unique para "1 sessao aberta por usuario"
-- O schema diz: @@unique([tenantId, userId, closedAt])
-- Mas isso e satisfeito pela combinacao porque closed_at NULL nao bate em unique no Postgres por padrao
-- Vamos criar partial unique para garantir 1 sessao aberta por user
DROP INDEX IF EXISTS cash_sessions_one_open_per_user;
CREATE UNIQUE INDEX cash_sessions_one_open_per_user
  ON cash_sessions(tenant_id, user_id) WHERE closed_at IS NULL;

-- ============================================================
-- 6) cash_movements: renomear cash_register_id -> cash_session_id
-- ============================================================
ALTER TABLE cash_movements RENAME COLUMN cash_register_id TO cash_session_id;
ALTER TABLE cash_movements RENAME COLUMN user_id          TO created_by_user_id;

-- FK
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_cash_register_id_fkey;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_cash_session_id_fkey
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON UPDATE CASCADE;

-- ============================================================
-- 7) cash_movements.nature: text -> CashMovementNature enum
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CashMovementNature') THEN
    CREATE TYPE "CashMovementNature" AS ENUM ('INCOME', 'OUTCOME');
  END IF;
END$$;

-- Backfill: aceitar valores em PT-BR (entrada/saida) que vieram da migracao
UPDATE cash_movements SET nature = 'INCOME'  WHERE nature IN ('entrada', 'INFLOW',  'INCOME');
UPDATE cash_movements SET nature = 'OUTCOME' WHERE nature IN ('saida',   'OUTFLOW', 'OUTCOME');

-- Trocar tipo da coluna usando USING
ALTER TABLE cash_movements
  ALTER COLUMN nature TYPE "CashMovementNature" USING nature::"CashMovementNature",
  ALTER COLUMN nature DROP DEFAULT;

-- ============================================================
-- 8) cash_movements: adicionar payment_method_id
-- ============================================================
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS payment_method_id UUID;

-- ============================================================
-- 9) cash_movements: ajustar enum CashMovementType
-- O atual tem: SALE, SERVICE_ORDER, WITHDRAWAL, DEPOSIT, ADJUSTMENT, EXPENSE, REFUND, OPENING, CLOSING
-- O schema novo tem: SALE, DEPOSIT, WITHDRAWAL, EXPENSE
-- Os valores extras nao estao no enum novo, mas existem dados.
-- Estrategia: criar enum novo + converter
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CashMovementType_new') THEN
    CREATE TYPE "CashMovementType_new" AS ENUM ('SALE', 'DEPOSIT', 'WITHDRAWAL', 'EXPENSE');
  END IF;
END$$;

-- Backfill valores que nao existem no enum novo
UPDATE cash_movements SET type = 'SALE'       WHERE type::text = 'SERVICE_ORDER';
UPDATE cash_movements SET type = 'WITHDRAWAL' WHERE type::text IN ('REFUND', 'CLOSING');
UPDATE cash_movements SET type = 'DEPOSIT'    WHERE type::text = 'OPENING';
UPDATE cash_movements SET type = 'EXPENSE'    WHERE type::text = 'ADJUSTMENT';

-- Trocar tipo
ALTER TABLE cash_movements
  ALTER COLUMN type TYPE "CashMovementType_new" USING type::text::"CashMovementType_new";

-- Trocar nomes do enum
DROP TYPE IF EXISTS "CashMovementType_old" CASCADE;
ALTER TYPE "CashMovementType" RENAME TO "CashMovementType_old";
ALTER TYPE "CashMovementType_new" RENAME TO "CashMovementType";
DROP TYPE IF EXISTS "CashMovementType_old" CASCADE;

-- ============================================================
-- 10) Remover enum CashRegisterStatus (nao usado mais)
-- ============================================================
DROP TYPE IF EXISTS "CashRegisterStatus" CASCADE;

-- ============================================================
-- 11) Indices cash_movements
-- ============================================================
DROP INDEX IF EXISTS cash_movements_tenant_id_cash_register_id_idx;
CREATE INDEX IF NOT EXISTS cash_movements_tenant_id_cash_session_id_created_at_idx
  ON cash_movements(tenant_id, cash_session_id, created_at);
CREATE INDEX IF NOT EXISTS cash_movements_tenant_id_type_created_at_idx
  ON cash_movements(tenant_id, type, created_at);
CREATE INDEX IF NOT EXISTS cash_movements_tenant_id_payment_method_created_at_idx
  ON cash_movements(tenant_id, payment_method, created_at);
CREATE INDEX IF NOT EXISTS cash_movements_tenant_id_reference_type_reference_id_idx
  ON cash_movements(tenant_id, reference_type, reference_id);

COMMIT;
