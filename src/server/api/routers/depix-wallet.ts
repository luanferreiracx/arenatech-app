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
import { isTenantAdmin } from "@/lib/auth/roles";
import {
  updateDepixFeeConfigSchema,
  DEFAULT_DEPIX_FEE,
} from "@/lib/validators/depix-wallet";
import { provisionDepixWallet } from "@/server/services/depix-wallet-provision.service";
import { enforceRateLimit } from "@/server/api/middleware/rate-limit";
import { logger } from "@/lib/logger";
import * as lwk from "@/lib/services/lwk-service";

// Rate-limit das acoes sensiveis de custodia (ADR 0051): expor/derivar a seed e
// trocar passphrase. 5/15min por usuario — defesa contra brute-force da senha
// da carteira.
const rlSensitiveWallet = enforceRateLimit({ limit: 5, windowMs: 15 * 60 * 1000 });

/** Passphrase da carteira (ADR 0051): sem trim (espacos podem ser intencionais). */
const passphraseSchema = z.string().min(1, "Informe a senha da carteira.").max(256);

function decimalToNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

function canManageWallet(ctx: {
  tenantId: string;
  session: {
    user: { isSuperAdmin?: boolean };
    availableTenants: Array<{ id: string; role: string }>;
  };
}): boolean {
  return isTenantAdmin(ctx.session, ctx.tenantId);
}

const revealMnemonicSchema = z.object({
  // Custodial: senha de login. Non-custodial: ignorado (usa passphrase).
  password: z.string().optional(),
  // Non-custodial: passphrase da carteira. Custodial: ignorado.
  passphrase: z.string().max(256).optional(),
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
      canRevealMnemonic: canManageWallet(ctx),
      canWithdraw: canManageWallet(ctx),
      // ADR 0051: a UI usa isto pra exigir a passphrase no saque (non_custodial)
      // ou oferecer a migracao (custodial). "custodial" por default.
      custodyModel: wallet?.custodyModel ?? "custodial",
    };
  }),

  /** Revela a frase de recuperacao da carteira. Nunca incluir em getWalletInfo.
   *  Custodial: exige a SENHA DE LOGIN. Non-custodial (ADR 0051): exige a
   *  PASSPHRASE da carteira (o servidor nao consegue ler a seed sem ela; nem
   *  superadmin revela seed alheia). */
  revealMnemonic: tenantAdminProcedure
    .input(revealMnemonicSchema)
    .mutation(async ({ ctx, input }) => {
      await rlSensitiveWallet(ctx, "depixWallet.revealMnemonic");

      const wallet = await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.findUnique({ where: { tenantId: ctx.tenantId } }),
      );
      if (!wallet?.provisionedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Carteira DePix ainda nao provisionada.",
        });
      }

      const isNonCustodial = wallet.custodyModel === "non_custodial";
      let res: lwk.LwkMnemonicResult;
      if (isNonCustodial) {
        if (!input.passphrase) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Informe a senha da carteira para ver sua frase de recuperacao.",
          });
        }
        res = await lwk.revealMnemonic(ctx.tenantId, {
          encryptedSeed: wallet.encryptedSeed,
          passphrase: input.passphrase,
        });
      } else {
        // Custodial: a senha de LOGIN protege a revelacao (a seed esta no volume).
        const user = await ctx.withTenant(async (tx) =>
          tx.user.findUnique({
            where: { id: ctx.session.user.id },
            select: { passwordHash: true },
          }),
        );
        if (!user || !input.password || !compareSync(input.password, user.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha invalida." });
        }
        res = await lwk.revealMnemonic(ctx.tenantId);
      }

      if (!res.success || !res.mnemonic) {
        const isWrongPass = res.error === "Senha da carteira incorreta.";
        throw new TRPCError({
          code: isWrongPass
            ? "UNAUTHORIZED"
            : res.error?.includes("endpoint de frase de recuperacao nao encontrado")
              ? "BAD_GATEWAY"
              : "INTERNAL_SERVER_ERROR",
          message: res.error ?? "Falha ao revelar frase de recuperacao.",
        });
      }

      return {
        mnemonic: res.mnemonic,
        wordCount: res.wordCount ?? res.mnemonic.split(/\s+/).filter(Boolean).length,
        network: res.network ?? wallet.network,
      };
    }),

  /**
   * Provisiona a carteira NON-CUSTODIAL no PRIMEIRO ACESSO (ADR 0051).
   * mode "create": gera carteira nova (devolve o mnemonico UMA vez p/ backup).
   * mode "import": importa por 24 palavras (nao devolve o mnemonico).
   * A carteira nasce cifrada com a passphrase do usuario; o servidor nunca ve
   * a seed em claro. Rejeita se ja provisionada ou se for o tenant central.
   */
  setupWallet: tenantAdminProcedure
    .input(
      z
        .object({
          mode: z.enum(["create", "import"]),
          passphrase: passphraseSchema,
          mnemonic: z.string().min(1).max(1000).optional(),
        })
        .refine((v) => v.mode !== "import" || !!v.mnemonic, {
          message: "Informe as 24 palavras para importar.",
          path: ["mnemonic"],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      await rlSensitiveWallet(ctx, "depixWallet.setupWallet");

      // Tenant central usa custodia gerenciada (assina refill L-BTC sem usuario).
      const activeTenant = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
      if (activeTenant?.slug === CENTRAL_TENANT_SLUG) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant central usa custodia gerenciada.",
        });
      }

      const existing = await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.findUnique({ where: { tenantId: ctx.tenantId } }),
      );
      if (existing?.provisionedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Carteira ja provisionada." });
      }

      const res = await lwk.setupWallet(ctx.tenantId, {
        mode: input.mode,
        passphrase: input.passphrase,
        mnemonic: input.mnemonic,
      });
      if (!res.success || !res.encryptedSeed || !res.descriptor || !res.masterAddress) {
        throw new TRPCError({
          code: res.error === "Carteira ja provisionada." ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
          message: res.error ?? "Falha ao configurar a carteira.",
        });
      }

      await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.upsert({
          where: { tenantId: ctx.tenantId },
          create: {
            tenantId: ctx.tenantId,
            liquidDescriptor: res.descriptor!,
            masterAddress: res.masterAddress!,
            network: res.network ?? "mainnet",
            provisionedAt: new Date(),
            custodyModel: "non_custodial",
            encryptedSeed: res.encryptedSeed as never,
            seedKdfVersion: 1,
          },
          update: {
            liquidDescriptor: res.descriptor!,
            masterAddress: res.masterAddress!,
            network: res.network ?? "mainnet",
            provisionedAt: new Date(),
            custodyModel: "non_custodial",
            encryptedSeed: res.encryptedSeed as never,
            seedKdfVersion: 1,
          },
        }),
      );
      logger.info("DePix wallet provisionada non-custodial", {
        tenantId: ctx.tenantId,
        mode: input.mode,
      });
      // mnemonico SO no create (backup unico) — nunca persistido.
      return { success: true, masterAddress: res.masterAddress, mnemonic: res.mnemonic ?? null };
    }),

  /** Troca a passphrase da carteira non-custodial (ADR 0051). */
  rewrapPassphrase: tenantAdminProcedure
    .input(z.object({ oldPassphrase: passphraseSchema, newPassphrase: passphraseSchema }))
    .mutation(async ({ ctx, input }) => {
      await rlSensitiveWallet(ctx, "depixWallet.rewrapPassphrase");

      const wallet = await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.findUnique({ where: { tenantId: ctx.tenantId } }),
      );
      if (wallet?.custodyModel !== "non_custodial" || !wallet.encryptedSeed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Carteira nao e non-custodial." });
      }

      const res = await lwk.rewrapSeed(
        ctx.tenantId,
        wallet.encryptedSeed,
        input.oldPassphrase,
        input.newPassphrase,
      );
      if (!res.success || !res.encryptedSeed) {
        throw new TRPCError({
          code: res.error === "Senha da carteira incorreta." ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
          message: res.error ?? "Falha ao trocar a senha da carteira.",
        });
      }

      await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.update({
          where: { tenantId: ctx.tenantId },
          data: { encryptedSeed: res.encryptedSeed as never },
        }),
      );
      logger.info("DePix wallet: passphrase trocada", { tenantId: ctx.tenantId });
      return { success: true };
    }),

  /**
   * RECUPERACAO por mnemonico (ADR 0051): o operador esqueceu a passphrase mas
   * tem as 24 palavras. Informa o mnemonico + nova passphrase; o LWK valida que
   * deriva o MESMO descriptor (sem mover fundos) e recifra. Sobrescreve o blob.
   */
  recoverNonCustodial: tenantAdminProcedure
    .input(z.object({ mnemonic: z.string().min(1).max(1000), newPassphrase: passphraseSchema }))
    .mutation(async ({ ctx, input }) => {
      await rlSensitiveWallet(ctx, "depixWallet.recoverNonCustodial");

      const wallet = await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.findUnique({ where: { tenantId: ctx.tenantId } }),
      );
      if (!wallet?.provisionedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Carteira ainda nao provisionada." });
      }

      const res = await lwk.recoverWallet(ctx.tenantId, input.mnemonic.trim(), input.newPassphrase);
      if (!res.success || !res.encryptedSeed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: res.error ?? "Falha na recuperacao." });
      }

      await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.update({
          where: { tenantId: ctx.tenantId },
          data: {
            encryptedSeed: res.encryptedSeed as never,
            custodyModel: "non_custodial",
            seedKdfVersion: 1,
          },
        }),
      );
      logger.info("DePix wallet recuperada via mnemonico", { tenantId: ctx.tenantId });
      return { success: true };
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
