-- 2FA TOTP em users.
-- twoFactorSecret é cifrado em repouso (AES-256-GCM) pela aplicação.
-- twoFactorBackupCodes guarda hashes SHA-256 de uso único.
ALTER TABLE "users"
  ADD COLUMN "two_factor_secret" TEXT,
  ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "two_factor_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "two_factor_backup_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
