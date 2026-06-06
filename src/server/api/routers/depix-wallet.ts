import { TRPCError } from "@trpc/server";
import { compareSync } from "bcryptjs";
import { z } from "zod";
import {
  createTRPCRouter,
  tenantProcedure,
  tenantAdminProcedure,
  superAdminTenantProcedure,
  CENTRAL_TENANT_SLUG,
} from "@/server/api/trpc";
import {
  updateDepixFeeConfigSchema,
  DEFAULT_DEPIX_FEE,
} from "@/lib/validators/depix-wallet";
import { provisionDepixWallet } from "@/server/services/depix-wallet-provision.service";
import * as lwk from "@/lib/services/lwk-service";

function decimalToNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

function canRevealWalletSecrets(ctx: {
  tenantId: string;
  session: {
    user: { isSuperAdmin?: boolean };
    availableTenants: Array<{ id: string; role?: string | null }>;
  };
}): boolean {
  if (ctx.session.user.isSuperAdmin) return true;
  const activeTenant = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
  return ["OWNER", "MANAGER", "owner", "manager"].includes(activeTenant?.role ?? "");
}

const revealMnemonicSchema = z.object({
  password: z.string().min(1, "Digite sua senha para revelar a frase."),
});

export const depixWalletRouter = createTRPCRouter({
  /** Config de taxa do tenant. Retorna defaults se ainda nao existe.
   *  isCentralTenant=true sinaliza pra UI que o tenant central nao paga
   *  taxa (eh quem RECEBE) — UI deve desabilitar/avisar. */
  getFeeConfig: tenantProcedure.query(async ({ ctx }) => {
    const activeTenant = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
    const isCentralTenant = activeTenant?.slug === CENTRAL_TENANT_SLUG;
    const cfg = await ctx.withTenant(async (tx) =>
      tx.tenantDepixFeeConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
    );
    if (!cfg) return { ...DEFAULT_DEPIX_FEE, isCentralTenant };
    return {
      entryFeeFixed: cfg.entryFeeFixed,
      entryFeePercent: decimalToNumber(cfg.entryFeePercent),
      exitFeeFixed: cfg.exitFeeFixed,
      exitFeePercent: decimalToNumber(cfg.exitFeePercent),
      isCentralTenant,
    };
  }),

  /** Atualiza a config de taxa do tenant (upsert).
   *  Tenant central nao pode mudar (config fixa em zero — ele recebe as
   *  taxas dos demais, nao paga).
   *
   *  Seguranca: so OWNER/MANAGER pode alterar taxa — operador comum nao deve
   *  poder zerar (perda de receita) nem inflar (DoS no saque). */
  // Taxa de intermediação = receita da Arena Tech. SÓ super admin altera
  // (o admin do próprio tenant não pode zerar a margem que paga pra gente).
  updateFeeConfig: superAdminTenantProcedure
    .input(updateDepixFeeConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const activeTenant = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
      if (activeTenant?.slug === CENTRAL_TENANT_SLUG) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant central nao paga taxa pra si mesmo (config fixa em zero).",
        });
      }
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
      canRevealMnemonic: canRevealWalletSecrets(ctx),
    };
  }),

  /** Revela a frase de recuperacao da carteira. Nunca incluir em getWalletInfo. */
  revealMnemonic: tenantAdminProcedure
    .input(revealMnemonicSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.withTenant(async (tx) =>
        tx.user.findUnique({
          where: { id: ctx.session.user.id },
          select: { passwordHash: true },
        }),
      );
      if (!user || !compareSync(input.password, user.passwordHash)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Senha invalida.",
        });
      }

      const wallet = await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.findUnique({ where: { tenantId: ctx.tenantId } }),
      );
      if (!wallet?.provisionedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Carteira DePix ainda nao provisionada.",
        });
      }

      const res = await lwk.revealMnemonic(ctx.tenantId);
      if (!res.success || !res.mnemonic) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: res.error ?? "Falha ao revelar frase de recuperacao.",
        });
      }

      return {
        mnemonic: res.mnemonic,
        wordCount: res.wordCount ?? res.mnemonic.split(/\s+/).filter(Boolean).length,
        network: res.network ?? wallet.network,
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
