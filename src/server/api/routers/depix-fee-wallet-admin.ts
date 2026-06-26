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
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  ensureFeeWalletProvisioned,
  getFeeWalletTenantId,
  getFeeWalletMasterAddress,
} from "@/server/services/depix-fee-wallet.service";
import { retryRepayment } from "@/server/services/depix-transaction.service";
import * as lwk from "@/lib/services/lwk-service";

const REPAYMENT_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;

export const depixFeeWalletAdminRouter = createTRPCRouter({
  /** Provisiona (idempotente) a carteira de taxas custodial no LWK. */
  provision: adminProcedure.mutation(async () => {
    const res = await ensureFeeWalletProvisioned();
    return res;
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
});
