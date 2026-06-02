/**
 * Gestao de L-BTC (Liquid Bitcoin) das carteiras dos tenants.
 *
 * Toda tx Liquid paga fee de rede em L-BTC. Sem L-BTC, saques falham com
 * "insufficient_lbtc". O tenant central (Arena Tech) mantem L-BTC e
 * reabastece os demais tenants automaticamente apos cada saque sucedido.
 *
 * Usuario final do tenant NAO precisa saber disso — UI nao expoe L-BTC.
 * Apenas admin do tenant central ve via /admin/depix-lbtc.
 *
 * Constantes (env-overridable):
 *   - DEPIX_LBTC_LOW_SATS   (default 1000) — threshold "baixo"
 *   - DEPIX_LBTC_REFILL_SATS (default 5000) — quanto reabastecer
 */

import { logger } from "@/lib/logger";
import { withAdmin, withTenant } from "@/server/db";
import * as lwk from "@/lib/services/lwk-service";
import { LBTC_ASSET_ID } from "@/lib/services/lwk-service";
import { CENTRAL_TENANT_SLUG } from "@/server/api/trpc";

export const LBTC_LOW_SATS = Number(process.env.DEPIX_LBTC_LOW_SATS ?? "1000");
export const LBTC_REFILL_SATS = Number(process.env.DEPIX_LBTC_REFILL_SATS ?? "5000");

interface EnsureOpts {
  source: "auto" | "manual";
  triggeredBy?: string;
  /** Override do amount em sats (so quando manual). */
  overrideSats?: number;
}

export interface EnsureLbtcResult {
  skipped: boolean;
  reason?: string;
  refillId?: string;
  amountSats?: number;
  txid?: string;
  status?: "PENDING" | "COMPLETED" | "FAILED" | "SKIPPED";
}

let _centralIdCache: string | null = null;
async function getCentralTenantId(): Promise<string | null> {
  if (_centralIdCache) return _centralIdCache;
  const t = await withAdmin(async (tx) =>
    tx.tenant.findUnique({
      where: { slug: CENTRAL_TENANT_SLUG },
      select: { id: true },
    }),
  );
  _centralIdCache = t?.id ?? null;
  return _centralIdCache;
}

/**
 * Garante L-BTC minimo na carteira do tenant. Se < LBTC_LOW_SATS, transfere
 * LBTC_REFILL_SATS do central pra carteira do tenant. Idempotente por
 * janela de hora — se ja teve refill PENDING/COMPLETED na mesma hora, pula.
 *
 * NAO faz throw — caller pode chamar em fire-and-forget.
 */
export async function ensureLbtcFor(
  tenantId: string,
  opts: EnsureOpts,
): Promise<EnsureLbtcResult> {
  const centralId = await getCentralTenantId();
  if (!centralId) {
    logger.warn("ensureLbtcFor: tenant central nao encontrado");
    return { skipped: true, reason: "central_not_found" };
  }
  // Central nao precisa de refill — eh a fonte.
  if (tenantId === centralId) {
    return { skipped: true, reason: "central_tenant" };
  }

  // 1. Checa saldo L-BTC do tenant.
  const balance = await lwk.getBalance(tenantId);
  if (!balance.success) {
    logger.warn("ensureLbtcFor: getBalance falhou", { tenantId, error: balance.error });
    return { skipped: true, reason: "lwk_unavailable" };
  }
  const currentSats = balance.lbtcSatoshis ?? 0;
  if (!opts.overrideSats && currentSats >= LBTC_LOW_SATS) {
    return { skipped: true, reason: "above_threshold" };
  }

  // 2. Idempotencia: ja teve refill na ultima hora? Pula.
  // (so pra source=auto — manual sempre tenta).
  if (opts.source === "auto") {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await withAdmin(async (tx) =>
      tx.depixLbtcRefill.findFirst({
        where: {
          tenantId,
          createdAt: { gte: oneHourAgo },
          status: { in: ["PENDING", "COMPLETED"] },
        },
      }),
    );
    if (recent) {
      return { skipped: true, reason: "recent_refill", refillId: recent.id };
    }
  }

  // 3. Resolve endereco mestre do tenant (destino do refill).
  const wallet = await withTenant(tenantId, async (tx) =>
    tx.tenantDepixWallet.findUnique({
      where: { tenantId },
      select: { masterAddress: true },
    }),
  );
  if (!wallet?.masterAddress) {
    return { skipped: true, reason: "no_master_address" };
  }

  const amountSats = opts.overrideSats ?? LBTC_REFILL_SATS;

  // 4. Persiste refill PENDING antes da chamada LWK.
  const refill = await withAdmin(async (tx) =>
    tx.depixLbtcRefill.create({
      data: {
        tenantId,
        amountSats,
        status: "PENDING",
        source: opts.source,
        triggeredBy: opts.triggeredBy ?? null,
      },
    }),
  );

  // 5. Transfere L-BTC do CENTRAL pra carteira do tenant.
  //    amountBrl no LWK = unidade do asset; pra L-BTC isso eh BTC (1e-8).
  const amountBtc = amountSats / 1e8;
  try {
    const result = await lwk.transfer(
      centralId,
      [{ to: wallet.masterAddress, amountBrl: amountBtc }],
      {
        assetId: LBTC_ASSET_ID,
        idempotencyKey: `lbtc-refill:${refill.id}`,
      },
    );
    if (!result.success || !result.txid) {
      await withAdmin(async (tx) =>
        tx.depixLbtcRefill.update({
          where: { id: refill.id },
          data: {
            status: "FAILED",
            errorMessage: result.error ?? "transfer falhou",
            completedAt: new Date(),
          },
        }),
      );
      logger.error("ensureLbtcFor: lwk.transfer falhou", {
        tenantId,
        amountSats,
        error: result.error,
      });
      return {
        skipped: false,
        refillId: refill.id,
        amountSats,
        status: "FAILED",
        reason: result.error ?? "transfer_failed",
      };
    }
    await withAdmin(async (tx) =>
      tx.depixLbtcRefill.update({
        where: { id: refill.id },
        data: {
          status: "COMPLETED",
          txid: result.txid,
          completedAt: new Date(),
        },
      }),
    );
    logger.info("ensureLbtcFor: refill concluido", {
      tenantId,
      amountSats,
      txid: result.txid,
      source: opts.source,
    });
    return {
      skipped: false,
      refillId: refill.id,
      amountSats,
      txid: result.txid,
      status: "COMPLETED",
    };
  } catch (err) {
    await withAdmin(async (tx) =>
      tx.depixLbtcRefill.update({
        where: { id: refill.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      }),
    );
    return {
      skipped: false,
      refillId: refill.id,
      amountSats,
      status: "FAILED",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Status agregado de L-BTC pros tenants — usado pelo painel admin.
 * Inclui tenant central (mas marcado).
 */
export async function listLbtcStatus(): Promise<
  Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    isCentral: boolean;
    lbtcSat: number | null;
    balanceError: string | null;
    lastRefillAt: Date | null;
    lastRefillStatus: string | null;
    masterAddress: string | null;
  }>
> {
  const centralId = await getCentralTenantId();

  // Lista todos os tenants que tem carteira DePix provisionada.
  const wallets = await withAdmin(async (tx) =>
    tx.tenantDepixWallet.findMany({
      where: { provisionedAt: { not: null } },
      select: {
        tenantId: true,
        masterAddress: true,
      },
    }),
  );

  const tenantIds = wallets.map((w) => w.tenantId);
  if (tenantIds.length === 0) return [];

  const [tenants, lastRefills] = await Promise.all([
    withAdmin(async (tx) =>
      tx.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true },
      }),
    ),
    withAdmin(async (tx) =>
      tx.depixLbtcRefill.findMany({
        where: { tenantId: { in: tenantIds } },
        orderBy: { createdAt: "desc" },
        select: {
          tenantId: true,
          createdAt: true,
          status: true,
        },
        distinct: ["tenantId"],
      }),
    ),
  ]);

  const refillsByTenant = new Map(lastRefills.map((r) => [r.tenantId, r]));
  const walletByTenant = new Map(wallets.map((w) => [w.tenantId, w]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  // Busca saldo de cada tenant em paralelo.
  const balances = await Promise.all(
    tenantIds.map(async (id) => ({ id, balance: await lwk.getBalance(id) })),
  );

  return balances.map(({ id, balance }) => {
    const t = tenantById.get(id);
    const refill = refillsByTenant.get(id) ?? null;
    return {
      tenantId: id,
      tenantName: t?.name ?? "(?)",
      tenantSlug: t?.slug ?? "",
      isCentral: id === centralId,
      lbtcSat: balance.success ? balance.lbtcSatoshis ?? 0 : null,
      balanceError: balance.success ? null : (balance.error ?? "erro"),
      lastRefillAt: refill?.createdAt ?? null,
      lastRefillStatus: refill?.status ?? null,
      masterAddress: walletByTenant.get(id)?.masterAddress ?? null,
    };
  });
}
