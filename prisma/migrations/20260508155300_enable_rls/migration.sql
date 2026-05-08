-- =============================================================================
-- RLS (Row Level Security) Infrastructure for Multi-Tenant Isolation
-- =============================================================================
-- This migration establishes the RLS foundation used by ALL tenant-scoped tables.
--
-- PATTERN: Every table with a tenant_id column gets:
--   1. ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
--   2. ALTER TABLE ... FORCE ROW LEVEL SECURITY; (applies to table owner too)
--   3. Policy "tenant_isolation" — USING + WITH CHECK on tenant_id = current_tenant_id()
--
-- HOW IT WORKS:
--   - Application sets `app.current_tenant_id` via SET LOCAL inside a transaction
--   - current_tenant_id() reads that setting and casts to UUID
--   - RLS policies filter rows automatically — no application-level WHERE needed
--   - Without a tenant_id set, queries return 0 rows (defense in depth)
--
-- ROLES:
--   - app_user: subject to RLS (used by normal application connections)
--   - app_admin: BYPASSRLS (used by super admin operations and migrations)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper function: extracts current tenant_id from session variable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION current_tenant_id() IS
  'Returns the current tenant UUID from the session variable app.current_tenant_id. '
  'Returns NULL if not set. Used by RLS policies for tenant isolation.';

-- ---------------------------------------------------------------------------
-- 2. Database roles
-- ---------------------------------------------------------------------------
-- app_user: normal application role, subject to RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- app_admin: administrative role, bypasses RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- Grant usage on the public schema to both roles
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA public TO app_admin;

-- Grant DML on all current and future tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_admin;

-- Grant usage on sequences (for auto-increment if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_admin;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS on tenant-scoped tables
-- ---------------------------------------------------------------------------
-- NOTE: tenants, users, user_tenants are GLOBAL tables — no RLS.
-- Only tables with tenant_id get RLS.

-- audit_logs — tenant-scoped (Phase 2 test subject)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 4. SQL TEMPLATE for future tenant-scoped tables (copy-paste for each new table)
-- ---------------------------------------------------------------------------
-- Replace <table_name> with the actual table name:
--
--   ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;
--
--   CREATE POLICY tenant_isolation ON <table_name>
--     USING (tenant_id = current_tenant_id())
--     WITH CHECK (tenant_id = current_tenant_id());
--
-- ---------------------------------------------------------------------------
