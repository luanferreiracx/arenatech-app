ALTER TABLE "users"
  ADD COLUMN "must_change_password" BOOLEAN;

UPDATE "users"
SET "must_change_password" = false
WHERE "must_change_password" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "must_change_password" SET DEFAULT false,
  ALTER COLUMN "must_change_password" SET NOT NULL;
