/**
 * Router da carteira de taxas (ADR 0052) — restrito a SUPER-ADMIN.
 * Acessivel via /admin/depix-fees, gateado por isSuperAdmin.
 *
 * Endpoints:
 *   - provision: provisiona (idempotente) a carteira de taxas custodial.
 *   - status: saldo DePix acumulado (= taxas retidas) + master address.
 *   - listRepayments: repasses (PENDING/FAILED/COMPLETED) com tenant destino.
 *   - retryRepaymentManual: reprocessa um repasse on-demand.
 */

import { z } from "zod";
import { createTRPCRouter, adminProcedure, CENTRAL_TENANT_SLUG, FEE_WALLET_TENANT_SLUG } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  ensureFeeWalletProvisioned,
  getFeeWalletTenantId,
  getFeeWalletMasterAddress,
} from "@/server/services/depix-fee-wallet.service";
import { retryRepayment } from "@/server/services/depix-transaction.service";
import { updateDepixFeeConfigSchema, DEFAULT_DEPIX_FEE } from "@/lib/validators/depix-wallet";
import * as lwk from "@/lib/services/lwk-service";

const REPAYMENT_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;

export const depixFeeWalletAdminRouter = createTRPCRouter({
  /** Provisiona (idempotente) a carteira de taxas custodial no LWK. */
  provision: adminProcedure.mutation(async () => {
    const res = await ensureFeeWalletProvisioned();
    return res;
  }),

  /**
   * Extrato ON-CHAIN da carteira de taxas (ultimas 50 tx). Cada linha traz o
   * delta de DePix (+ = taxa recebida; − = envio/saida) e de L-BTC (refills de
   * gas pros tenants saem daqui). Read-only (watch-only no LWK).
   */
  transactions: adminProcedure.query(async () => {
    const feeTenantId = await getFeeWalletTenantId();
    if (!feeTenantId) return { provisioned: false, transactions: [] };
    const res = await lwk.listTransactions(feeTenantId, 50);
    if (!res.success || !res.transactions) {
      return { provisioned: true, transactions: [], error: res.error ?? "indisponivel" };
    }
    const items = res.transactions.map((t) => {
      let depixDeltaCents = 0;
      let lbtcDeltaSats = 0;
      for (const [assetId, b] of Object.entries(t.balance)) {
        if (b.is_depix) depixDeltaCents += Math.round(b.amount * 100);
        else if (assetId === lwk.LBTC_ASSET_ID) lbtcDeltaSats += b.satoshis;
      }
      // Tipo pela direcao do DePix: entrada = taxa recebida; saida = envio.
      const kind =
        depixDeltaCents > 0 ? "fee_in" : depixDeltaCents < 0 ? "depix_out" : "lbtc_only";
      return {
        txid: t.txid,
        timestamp: t.timestamp,
        confirmations: t.confirmations,
        status: t.status,
        depixDeltaCents,
        lbtcDeltaSats,
        kind,
        explorerUrl: `https://blockstream.info/liquid/tx/${t.txid}`,
      };
    });
    return { provisioned: true, transactions: items };
  }),

  /** Estado da carteira de taxas: provisionada? saldo (= taxas retidas)? */
  status: adminProcedure.query(async () => {
    const feeTenantId = await getFeeWalletTenantId();
    if (!feeTenantId) {
      return { provisioned: false, masterAddress: null, depixBalance: 0, balanceError: null };
    }
    const [masterAddress, balance] = await Promise.all([
      getFeeWalletMasterAddress(),
      lwk.getBalance(feeTenantId),
    ]);
    return {
      provisioned: true,
      masterAddress,
      depixBalance: balance.success ? (balance.depixBalance ?? 0) : 0,
      balanceError: balance.success ? null : (balance.error ?? "indisponivel"),
    };
  }),

  /** Lista repasses (default: PENDING) com o nome do tenant destino. */
  listRepayments: adminProcedure
    .input(
      z
        .object({
          status: z.enum(REPAYMENT_STATUSES).optional(),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .default({ limit: 50 }),
    )
    .query(async ({ input }) => {
      const rows = await withAdmin(async (tx) =>
        tx.depixDepositRepayment.findMany({
          where: input.status ? { status: input.status } : undefined,
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      );
      const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
      const tenants = await withAdmin(async (tx) =>
        tx.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true },
        }),
      );
      const nameById = new Map(tenants.map((t) => [t.id, t.name ?? t.slug]));
      return rows.map((r) => ({
        id: r.id,
        tenantName: nameById.get(r.tenantId) ?? r.tenantId,
        netAmountCents: r.netAmountCents,
        status: r.status,
        attempts: r.attempts,
        lastError: r.lastError,
        repaymentTxId: r.repaymentTxId,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      }));
    }),

  /**
   * Reprocessa um repasse on-demand (mesma idempotencyKey repay:{id}).
   * `manual` reabre um repasse FAILED (esgotado no cron) — override do superadmin.
   */
  retryRepaymentManual: adminProcedure
    .input(z.object({ repaymentId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return retryRepayment(input.repaymentId, { manual: true });
    }),

  /**
   * Lista as taxas DePix de cada tenant (deposito, saque PIX, saque on-chain) pro
   * editor do superadmin. Exclui o central e a carteira de taxas (nao pagam taxa).
   */
  listTenantFees: adminProcedure.query(async () => {
    const [tenants, configs] = await withAdmin(async (tx) => [
      await tx.tenant.findMany({
        where: { slug: { notIn: [CENTRAL_TENANT_SLUG, FEE_WALLET_TENANT_SLUG] } },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      }),
      await tx.tenantDepixFeeConfig.findMany(),
    ]);
    const byTenant = new Map(configs.map((c) => [c.tenantId, c]));
    return tenants.map((t) => {
      const c = byTenant.get(t.id);
      return {
        tenantId: t.id,
        tenantName: t.name ?? t.slug,
        entryFeeFixed: c?.entryFeeFixed ?? DEFAULT_DEPIX_FEE.entryFeeFixed,
        entryFeePercent: Number(c?.entryFeePercent ?? DEFAULT_DEPIX_FEE.entryFeePercent),
        exitFeeFixed: c?.exitFeeFixed ?? DEFAULT_DEPIX_FEE.exitFeeFixed,
        exitFeePercent: Number(c?.exitFeePercent ?? DEFAULT_DEPIX_FEE.exitFeePercent),
        onchainFeeFixed: c?.onchainFeeFixed ?? DEFAULT_DEPIX_FEE.onchainFeeFixed,
        onchainFeePercent: Number(c?.onchainFeePercent ?? DEFAULT_DEPIX_FEE.onchainFeePercent),
      };
    });
  }),

  /** Atualiza (upsert) as taxas DePix de um tenant especifico. Superadmin. */
  updateTenantFee: adminProcedure
    .input(updateDepixFeeConfigSchema.extend({ tenantId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { tenantId, ...fees } = input;
      await withAdmin((tx) =>
        tx.tenantDepixFeeConfig.upsert({
          where: { tenantId },
          create: { tenantId, ...fees },
          update: { ...fees },
        }),
      );
      return { success: true };
    }),
});
