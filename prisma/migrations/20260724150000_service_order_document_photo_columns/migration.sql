-- Fotos do aparelho na OS reusam a infra de imagem do catálogo (3 versões +
-- provider/publicId). Colunas nullable — documentos existentes (NFS-e etc.)
-- ficam com NULL. Seguro em banco limpo.
ALTER TABLE "service_order_documents"
  ADD COLUMN "thumb_url" TEXT,
  ADD COLUMN "medium_url" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "provider_public_id" TEXT;
