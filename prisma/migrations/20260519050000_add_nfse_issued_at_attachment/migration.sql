-- M3 da audit: registrar timestamp de emissao da NFS-e e suportar anexo
-- (paridade Laravel `OrdemServicoController:351-361`).
ALTER TABLE "service_orders"
  ADD COLUMN IF NOT EXISTS "nfse_issued_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nfse_attachment_path" TEXT;
