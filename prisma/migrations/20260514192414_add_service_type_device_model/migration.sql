-- AlterTable
ALTER TABLE "services" ADD COLUMN     "device_model" TEXT,
ADD COLUMN     "service_type" TEXT;

-- CreateIndex
CREATE INDEX "services_tenant_id_service_type_idx" ON "services"("tenant_id", "service_type");

-- DataMigration: populate service_type and device_model from name (format: "Type - Model")
UPDATE services
SET service_type = trim(split_part(name, ' - ', 1)),
    device_model = CASE
      WHEN position(' - ' in name) > 0 THEN trim(substring(name from position(' - ' in name) + 3))
      ELSE NULL
    END
WHERE service_type IS NULL AND deleted_at IS NULL;
