-- Paridade Laravel `eh_aparelho`
ALTER TABLE "products" ADD COLUMN "is_device" BOOLEAN NOT NULL DEFAULT false;
