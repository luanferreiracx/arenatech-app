-- CreateTable
CREATE TABLE "device_valuations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "modelo" TEXT NOT NULL,
    "armazenamento" TEXT NOT NULL,
    "saude_bateria" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "validade_dias" INTEGER NOT NULL DEFAULT 7,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_valuations_tenant_id_modelo_idx" ON "device_valuations"("tenant_id", "modelo");

-- CreateIndex
CREATE INDEX "device_valuations_tenant_id_modelo_armazenamento_idx" ON "device_valuations"("tenant_id", "modelo", "armazenamento");
