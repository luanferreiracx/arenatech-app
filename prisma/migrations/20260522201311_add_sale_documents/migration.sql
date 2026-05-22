-- Paridade Laravel pdv_termos_recibos
CREATE TABLE "sale_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL REFERENCES "sales"("id") ON DELETE CASCADE,
  "type" VARCHAR(50) NOT NULL,
  "recipient_name" VARCHAR(255),
  "recipient_cpf" VARCHAR(20),
  "recipient_phone" VARCHAR(30),
  "recipient_email" VARCHAR(255),
  "whatsapp_sent" BOOLEAN NOT NULL DEFAULT false,
  "whatsapp_sent_at" TIMESTAMP(3),
  "autentique_sent" BOOLEAN NOT NULL DEFAULT false,
  "autentique_document_id" VARCHAR(100),
  "autentique_link" VARCHAR(500),
  "autentique_sent_at" TIMESTAMP(3),
  "signed" BOOLEAN NOT NULL DEFAULT false,
  "signed_at" TIMESTAMP(3),
  "public_link" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "sale_documents_public_link_key" ON "sale_documents"("public_link");
CREATE INDEX "sale_documents_tenant_sale_idx" ON "sale_documents"("tenant_id", "sale_id");
CREATE INDEX "sale_documents_tenant_type_idx" ON "sale_documents"("tenant_id", "type");
