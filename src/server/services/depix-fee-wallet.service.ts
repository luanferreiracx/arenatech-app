/**
 * Carteira de taxas custodial da Arena Tech (`arena-fees`) — ADR 0052.
 *
 * Tenant non-custodial nao consegue assinar a cobranca da taxa no webhook de
 * deposito (sem passphrase do usuario). Solucao: uma carteira CUSTODIAL dedicada
 * recebe o deposito, retem a taxa e repassa o liquido ao tenant. Por ser
 * custodial, ela assina sem usuario presente.
 *
 * Este servico provisiona (idempotente) o tenant tecnico `arena-fees` + sua
 * carteira, e expoe helpers de resolucao (id, master address). A provisao real
 * e disparada pelo painel superadmin (depixFeeWalletAdmin.provision).
 */

import { logger } from "@/lib/logger";
import { withAdmin } from "@/server/db";
import { FEE_WALLET_TENANT_SLUG } from "@/server/api/trpc";
import * as lwk from "@/lib/services/lwk-service";

/** Cache do id do tenant da carteira de taxas — muda raramente (so em recreate). */
let _feeWalletTenantIdCache: string | null = null;

/** Resolve o tenantId da carteira de taxas. null se ainda nao provisionada. */
export async function getFeeWalletTenantId(): Promise<string | null> {
  if (_feeWalletTenantIdCache) return _feeWalletTenantIdCache;
  const t = await withAdmin(async (tx) =>
    tx.tenant.findUnique({ where: { slug: FEE_WALLET_TENANT_SLUG }, select: { id: true } }),
  );
  if (t) _feeWalletTenantIdCache = t.id;
  return t?.id ?? null;
}

/** Endereco mestre da carteira de taxas (recebe os depositos non-custodial). */
export async function getFeeWalletMasterAddress(): Promise<string | null> {
  const feeTenantId = await getFeeWalletTenantId();
  if (!feeTenantId) return null;
  const wallet = await withAdmin(async (tx) =>
    tx.tenantDepixWallet.findUnique({
      where: { tenantId: feeTenantId },
      select: { masterAddress: true },
    }),
  );
  return wallet?.masterAddress ?? null;
}

/**
 * Garante L-BTC (fee de rede Liquid) na carteira de taxas antes de um repasse.
 *
 * O auto-refill pos-saque NUNCA abastece a carteira de taxas (ela nao saca —
 * so repassa), entao sem isto o 1o repasse falharia com "insufficient_lbtc".
 * Chamado antes de cada transfer de repasse. Reusa o ensureLbtcFor generico
 * (o central abastece): a carteira de taxas tem masterAddress e nao e o central,
 * logo e elegivel. Best-effort: se falhar, o transfer pode cair no retry.
 */
export async function ensureFeeWalletLbtc(): Promise<void> {
  const feeTenantId = await getFeeWalletTenantId();
  if (!feeTenantId) return;
  // import dinamico evita ciclo (refill -> transaction -> fee-wallet).
  const { ensureLbtcFor } = await import("./depix-lbtc-refill.service");
  try {
    await ensureLbtcFor(feeTenantId, { source: "auto" });
  } catch (err) {
    logger.warn("ensureFeeWalletLbtc: refill falhou (repasse vai tentar mesmo assim)", {
      feeTenantId,
      err: String(err),
    });
  }
}

export interface ProvisionFeeWalletResult {
  success: boolean;
  tenantId?: string;
  masterAddress?: string;
  alreadyProvisioned?: boolean;
  error?: string;
}

/**
 * Provisiona o tenant tecnico `arena-fees` + sua carteira custodial. Idempotente:
 * se ja provisionada, retorna sem re-chamar o LWK (nao recria carteira existente).
 *
 * Passos: (1) upsert do Tenant; (2) se ja tem carteira provisionada -> no-op;
 * (3) senao, cria a carteira custodial no LWK (grava mnemonic.txt no volume) e
 * persiste o TenantDepixWallet (custodyModel="custodial").
 *
 * Pre-condicao: o servico LWK precisa estar no ar (chamada HTTP `/create`).
 */
export async function ensureFeeWalletProvisioned(): Promise<ProvisionFeeWalletResult> {
  // 1. Garante o tenant tecnico (sem usuarios; nunca paga taxa de si mesmo).
  const tenant = await withAdmin(async (tx) =>
    tx.tenant.upsert({
      where: { slug: FEE_WALLET_TENANT_SLUG },
      update: { status: "ACTIVE" },
      create: {
        slug: FEE_WALLET_TENANT_SLUG,
        name: "Arena Tech — Carteira de Taxas",
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  );
  _feeWalletTenantIdCache = tenant.id;

  // 2. Ja provisionada? Nao recria (idempotencia — protege a carteira existente).
  const existing = await withAdmin(async (tx) =>
    tx.tenantDepixWallet.findUnique({
      where: { tenantId: tenant.id },
      select: { masterAddress: true, provisionedAt: true },
    }),
  );
  if (existing?.provisionedAt) {
    return {
      success: true,
      tenantId: tenant.id,
      masterAddress: existing.masterAddress,
      alreadyProvisioned: true,
    };
  }

  // 3. Cria a carteira CUSTODIAL no LWK (HTTP, fora de tx).
  const wallet = await lwk.createCustodialWallet(tenant.id);
  if (!wallet.success || !wallet.descriptor || !wallet.masterAddress) {
    logger.error("ensureFeeWalletProvisioned: LWK createCustodialWallet falhou", {
      tenantId: tenant.id,
      error: wallet.error,
    });
    return { success: false, error: wallet.error ?? "LWK nao retornou a carteira" };
  }

  // 4. Persiste o vinculo (custodial).
  await withAdmin(async (tx) =>
    tx.tenantDepixWallet.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        liquidDescriptor: wallet.descriptor!,
        masterAddress: wallet.masterAddress!,
        network: wallet.network ?? "mainnet",
        custodyModel: "custodial",
        provisionedAt: new Date(),
      },
      update: {
        liquidDescriptor: wallet.descriptor!,
        masterAddress: wallet.masterAddress!,
        network: wallet.network ?? "mainnet",
        custodyModel: "custodial",
        provisionedAt: new Date(),
      },
    }),
  );

  logger.info("Carteira de taxas provisionada", {
    tenantId: tenant.id,
    masterAddress: wallet.masterAddress,
  });
  return { success: true, tenantId: tenant.id, masterAddress: wallet.masterAddress };
}
