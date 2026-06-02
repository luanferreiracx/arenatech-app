/**
 * Router de gestao de L-BTC — restrito ao tenant central (Arena Tech).
 *
 * Endpoints:
 *   - list: snapshot dos tenants (saldo L-BTC + ultima recarga)
 *   - refillManual: forca refill de N sats num tenant especifico
 *   - history: lista historico de refills (filtrar por tenant opcional)
 */

import { z } from "zod";
import { createTRPCRouter, centralTenantProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  ensureLbtcFor,
  listLbtcStatus,
  LBTC_LOW_SATS,
  LBTC_REFILL_SATS,
} from "@/server/services/depix-lbtc-refill.service";

export const depixLbtcAdminRouter = createTRPCRouter({
  /** Snapshot: saldo L-BTC + ultima recarga de cada tenant. */
  list: centralTenantProcedure.query(async () => {
    const data = await listLbtcStatus();
    return {
      lowThresholdSats: LBTC_LOW_SATS,
      refillAmountSats: LBTC_REFILL_SATS,
      tenants: data,
    };
  }),

  /** Forca refill num tenant. */
  refillManual: centralTenantProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        /** Override do amount em sats (default = LBTC_REFILL_SATS). */
        amountSats: z.number().int().min(100).max(1_000_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ensureLbtcFor(input.tenantId, {
        source: "manual",
        triggeredBy: ctx.session.user.id,
        overrideSats: input.amountSats,
      });
      return result;
    }),

  /** Historico de refills (mais recentes primeiro). */
  history: centralTenantProcedure
    .input(
      z
        .object({
          tenantId: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const rows = await withAdmin(async (tx) =>
        tx.depixLbtcRefill.findMany({
          where: input?.tenantId ? { tenantId: input.tenantId } : undefined,
          orderBy: { createdAt: "desc" },
          take: input?.limit ?? 50,
        }),
      );
      // Enriquece com nome do tenant.
      const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId)));
      const tenants = await withAdmin(async (tx) =>
        tx.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true },
        }),
      );
      const byId = new Map(tenants.map((t) => [t.id, t]));
      return rows.map((r) => ({
        ...r,
        tenantName: byId.get(r.tenantId)?.name ?? "(?)",
        tenantSlug: byId.get(r.tenantId)?.slug ?? "",
      }));
    }),
});
