-- AlterTable: TenantAssistanceSettings ganha campos paridade Laravel
ALTER TABLE "tenant_assistance_settings"
ADD COLUMN "assistance_name" TEXT,
ADD COLUMN "cnpj" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "zip_code" TEXT,
ADD COLUMN "logo_path" TEXT,
ADD COLUMN "business_hours" TEXT;

-- CreateTable: TenantSecuritySettings (singleton por tenant)
CREATE TABLE "tenant_security_settings" (
    "tenant_id" UUID NOT NULL,
    "min_password_length" INTEGER NOT NULL DEFAULT 8,
    "require_uppercase" BOOLEAN NOT NULL DEFAULT false,
    "require_number" BOOLEAN NOT NULL DEFAULT true,
    "require_special_char" BOOLEAN NOT NULL DEFAULT false,
    "password_expiration_days" INTEGER,
    "session_timeout_minutes" INTEGER,
    "max_failed_login_attempts" INTEGER NOT NULL DEFAULT 5,
    "lockout_minutes" INTEGER NOT NULL DEFAULT 15,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_security_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- RLS para TenantSecuritySettings
ALTER TABLE "tenant_security_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_security_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_security_settings"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

-- CreateTable: NotificationConfig
CREATE TABLE "notification_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "template" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_configs_tenant_id_event_key" ON "notification_configs"("tenant_id", "event");
CREATE INDEX "notification_configs_tenant_id_active_idx" ON "notification_configs"("tenant_id", "active");

-- RLS para NotificationConfig
ALTER TABLE "notification_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "notification_configs"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
