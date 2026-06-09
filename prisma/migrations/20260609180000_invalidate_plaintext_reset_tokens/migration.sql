-- Password reset tokens are now stored hashed (SHA-256) instead of plaintext.
-- Any token already in the table is a plaintext UUID and is no longer usable
-- (resetPassword hashes the incoming token before lookup, so plaintext rows can
-- never match). Delete them so stale plaintext secrets don't linger at rest.
DELETE FROM "password_reset_tokens" WHERE "used_at" IS NULL;
