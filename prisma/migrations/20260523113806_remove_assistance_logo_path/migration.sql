-- Remove logo_path duplicado de tenant_assistance_settings. O logo do tenant
-- esta unificado em tenant_settings.logo_url. Coluna estava sempre NULL.

ALTER TABLE tenant_assistance_settings DROP COLUMN IF EXISTS logo_path;
