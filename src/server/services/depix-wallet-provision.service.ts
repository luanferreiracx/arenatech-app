/**
 * Provisionamento da carteira DePix (LWK) de um tenant.
 *
 * Separado de `tenantFinancialInit` porque envolve uma chamada HTTP externa
 * (LWK) — que NUNCA deve rodar dentro de uma transacao Prisma. Padrao:
 *   1. chama o LWK (fora de tx)
 *   2. persiste o resultado numa tx curta
 *
 * Idempotente: se a carteira ja foi provisionada, retorna sem re-chamar.
 * Se o LWK estiver fora do ar, loga e retorna erro — o tenant continua
 * existindo e a carteira pode ser recuperada depois via depixWallet.provision.
 */

import { withTenant } from "@/server/db";
import { logger } from "@/lib/logger";
import { ensureWallet } from "@/lib/services/lwk-service";

export interface ProvisionResult {
  success: boolean;
  masterAddress?: string;
  alreadyProvisioned?: boolean;
  error?: string;
}

export async function provisionDepixWallet(
  tenantId: string,
): Promise<ProvisionResult> {
  // 1. Ja provisionado? (tx curta de leitura)
  const existing = await withTenant(tenantId, async (tx) =>
    tx.tenantDepixWallet.findUnique({ where: { tenantId } }),
  );
  if (existing?.provisionedAt) {
    return {
      success: true,
      masterAddress: existing.masterAddress,
      alreadyProvisioned: true,
    };
  }

  // 2. Chama o LWK (HTTP, FORA de qualquer tx).
  const wallet = await ensureWallet(tenantId);
  if (!wallet.success || !wallet.descriptor || !wallet.masterAddress) {
    logger.error("Provisionamento DePix falhou", {
      tenantId,
      error: wallet.error,
    });
    return { success: false, error: wallet.error ?? "LWK nao retornou wallet" };
  }

  // 3. Persiste (tx curta). upsert idempotente.
  await withTenant(tenantId, async (tx) =>
    tx.tenantDepixWallet.upsert({
      where: { tenantId },
      create: {
        tenantId,
        liquidDescriptor: wallet.descriptor!,
        masterAddress: wallet.masterAddress!,
        network: wallet.network ?? "mainnet",
        provisionedAt: new Date(),
      },
      update: {
        liquidDescriptor: wallet.descriptor!,
        masterAddress: wallet.masterAddress!,
        network: wallet.network ?? "mainnet",
        provisionedAt: new Date(),
      },
    }),
  );

  logger.info("Carteira DePix provisionada", {
    tenantId,
    masterAddress: wallet.masterAddress,
  });
  return { success: true, masterAddress: wallet.masterAddress };
}
