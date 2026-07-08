/**
 * backfill-partner-webhook-secret-encryption.ts
 *
 * Cifra em repouso (AES-256-GCM) os secrets de webhook de saída que ainda estão
 * em CLARO no banco (auditoria de segurança S6, 2026-07-08). Antes desta mudança,
 * PartnerWebhookConfig.secret era gravado em texto plano — um dump do banco
 * expunha os secrets HMAC de todos os tenants.
 *
 * O sistema já funciona SEM este backfill (openSecret tolera legado em claro e a
 * próxima rotação cifra), mas rodar aqui cifra os existentes proativamente.
 *
 * Idempotente: pula secrets que já estão no formato cifrado (isSealed).
 *
 * Uso:
 *   NEXTAUTH_SECRET=... DATABASE_URL="postgresql://..." tsx scripts/backfill-partner-webhook-secret-encryption.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sealSecret, isSealed, canSealSecret } from "../src/lib/security/secret-box";

const WEBHOOK_SECRET_CONTEXT = "partner-webhook";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!canSealSecret()) {
    throw new Error("NEXTAUTH_SECRET ausente — necessário para cifrar. Abortando.");
  }

  const configs = await prisma.partnerWebhookConfig.findMany({
    select: { tenantId: true, secret: true },
  });

  let sealed = 0;
  let skipped = 0;

  for (const cfg of configs) {
    if (!cfg.secret) {
      skipped++;
      continue;
    }
    if (isSealed(cfg.secret)) {
      skipped++; // já cifrado
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] cifraria secret do tenant ${cfg.tenantId}`);
      sealed++;
      continue;
    }
    await prisma.partnerWebhookConfig.update({
      where: { tenantId: cfg.tenantId },
      data: { secret: sealSecret(cfg.secret, WEBHOOK_SECRET_CONTEXT) },
    });
    sealed++;
  }

  console.log(
    `Backfill concluído. Cifrados: ${sealed}. Pulados (já cifrados/sem secret): ${skipped}.${dryRun ? " (dry-run)" : ""}`,
  );
}

main()
  .catch((err) => {
    console.error("Backfill falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
