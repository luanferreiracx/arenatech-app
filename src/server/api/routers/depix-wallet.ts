import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  updateDepixFeeConfigSchema,
  DEFAULT_DEPIX_FEE,
} from "@/lib/validators/depix-wallet";
import { provisionDepixWallet } from "@/server/services/depix-wallet-provision.service";
import * as lwk from "@/lib/services/lwk-service";

function decimalToNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

export const depixWalletRouter = createTRPCRouter({
  /** Config de taxa do tenant. Retorna defaults se ainda nao existe. */
  getFeeConfig: tenantProcedure.query(async ({ ctx }) => {
    const cfg = await ctx.withTenant(async (tx) =>
      tx.tenantDepixFeeConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
    );
    if (!cfg) return { ...DEFAULT_DEPIX_FEE };
    return {
      entryFeeFixed: cfg.entryFeeFixed,
      entryFeePercent: decimalToNumber(cfg.entryFeePercent),
      exitFeeFixed: cfg.exitFeeFixed,
      exitFeePercent: decimalToNumber(cfg.exitFeePercent),
    };
  }),

  /** Atualiza a config de taxa do tenant (upsert). */
  updateFeeConfig: tenantProcedure
    .input(updateDepixFeeConfigSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.withTenant(async (tx) =>
        tx.tenantDepixFeeConfig.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...input },
          update: { ...input },
        }),
      );
      return { success: true };
    }),

  /** Info da carteira do tenant (provisionada? endereco mestre?). */
  getWalletInfo: tenantProcedure.query(async ({ ctx }) => {
    const wallet = await ctx.withTenant(async (tx) =>
      tx.tenantDepixWallet.findUnique({ where: { tenantId: ctx.tenantId } }),
    );
    return {
      provisioned: !!wallet?.provisionedAt,
      masterAddress: wallet?.masterAddress ?? null,
      network: wallet?.network ?? null,
    };
  }),

  /** Saldo DePix da carteira do tenant (consulta o LWK). */
  getBalance: tenantProcedure.query(async ({ ctx }) => {
    const res = await lwk.getBalance(ctx.tenantId);
    return {
      success: res.success,
      depixBalance: res.depixBalance ?? 0,
      error: res.error ?? null,
    };
  }),

  /** (Re)provisiona a carteira no LWK. Idempotente — recuperacao de falha. */
  provision: tenantProcedure.mutation(async ({ ctx }) => {
    const res = await provisionDepixWallet(ctx.tenantId);
    return {
      success: res.success,
      masterAddress: res.masterAddress ?? null,
      alreadyProvisioned: res.alreadyProvisioned ?? false,
      error: res.error ?? null,
    };
  }),
});
