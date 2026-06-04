/**
 * seed-available-devices.ts
 *
 * Popula available_devices com os aparelhos migrados do aparelhos_catalogo do
 * Laravel (prisma/seed-data/available-devices.json, exportado da prod Laravel).
 *
 * Idempotente: usa (tenantId, model, condition, price) como chave lógica — não
 * duplica se rodar de novo. Roda via DATABASE_URL (superuser, bypassa RLS).
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." tsx scripts/seed-available-devices.ts [--dry-run] [--tenant=<uuid>]
 */

import { PrismaClient, type DeviceCondition } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes("--dry-run");
const tenantArg = process.argv.find((a) => a.startsWith("--tenant="))?.split("=")[1];

type LaravelDevice = {
  modelo: string;
  categoria: string;
  condicao: string;
  preco: string;
  observacao: string | null;
  ativo: number | boolean;
};

const CONDITION_MAP: Record<string, DeviceCondition> = {
  novo: "NEW",
  seminovo: "SEMI_NEW",
  usado: "USED",
};

async function main() {
  const tenantId = tenantArg ?? process.env.DEFAULT_TENANT_ID;
  if (!tenantId) {
    throw new Error("Informe o tenant via --tenant=<uuid> ou DEFAULT_TENANT_ID");
  }

  const file = join(process.cwd(), "prisma/seed-data/available-devices.json");
  const devices = JSON.parse(readFileSync(file, "utf8")) as LaravelDevice[];
  console.log(`Carregados ${devices.length} aparelhos do JSON. Tenant: ${tenantId}. dryRun=${dryRun}`);

  let created = 0;
  let skipped = 0;

  for (const device of devices) {
    const condition = CONDITION_MAP[device.condicao] ?? "NEW";
    const price = device.preco;

    const existing = await prisma.availableDevice.findFirst({
      where: { tenantId, model: device.modelo, condition, price },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry] criaria: ${device.modelo} (${condition}) R$ ${price} ativo=${device.ativo}`);
      created++;
      continue;
    }

    await prisma.availableDevice.create({
      data: {
        tenantId,
        model: device.modelo,
        category: device.categoria,
        condition,
        price,
        note: device.observacao,
        active: device.ativo === 1 || device.ativo === true,
      },
    });
    created++;
  }

  console.log(`Concluído: ${created} criados, ${skipped} já existiam.`);
}

main()
  .catch((err) => {
    console.error("Erro:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
