-- Cloudinary passa a ser o provider principal para imagens publicas de produtos/catalogo.
-- Campos nullable preservam compatibilidade com URLs legadas MinIO/Cloudinary/externas.
ALTER TABLE "product_photos"
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_public_id" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "product_variations"
  ADD COLUMN IF NOT EXISTS "image_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "image_provider_public_id" TEXT;

ALTER TABLE "catalog_devices"
  ADD COLUMN IF NOT EXISTS "image_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "image_provider_public_id" TEXT;
