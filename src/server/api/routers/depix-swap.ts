// ⚠️ ROUTER DESATIVADO — NÃO registrado no root (src/server/api/root.ts).
// A conversão DePix→USDT (Sideswap) foi pausada: o LWK 0.17 não assina o PSET de
// swap de forma que o Sideswap aceite (rejeita o taker_sign). A solução é assinatura
// manual estilo GDK (wallycore) — projeto à parte. Código mantido pronto para
// retomar; ver a memória `depix-usdt-conversao-sideswap`. Para reativar: reimportar
// e registrar `depixSwap` no root + recriar a UI (/depix-wallet/swap-usdt + botão).
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure, tenantAdminProcedure } from "@/server/api/trpc";
import { enforceRateLimit } from "@/server/api/middleware/rate-limit";
import { verifyUserTwoFactor } from "@/lib/auth/two-factor-verify";
import { previewSwap, executeSwap } from "@/server/services/sideswap-swap.service";
import { swapPreviewSchema, swapExecuteSchema } from "@/lib/validators/depix-swap";

const SATS_PER_UNIT = 100_000_000;

// Cotar é barato (read-only). Executar move ativo on-chain, mas conversão é uma
// operação recorrente de tesouraria (diferente do saque, raro) — janela curta de
// 10 min com folga evita travar o uso legítimo por longos períodos.
const rlPreview = enforceRateLimit({ limit: 30, windowMs: 60_000 });
const rlExecute = enforceRateLimit({ limit: 10, windowMs: 10 * 60 * 1000 });

/**
 * Swap DePix → L-USDt via Sideswap (Fase 2). O L-USDt fica na própria carteira
 * Liquid do tenant. `preview` cota sem executar; `execute` assina e faz o swap.
 *
 * Segurança do execute (espelha o saque on-chain): tenantAdminProcedure (só
 * OWNER/MANAGER), rate-limit 5/h, step-up 2FA obrigatório, passphrase non-custodial.
 */
export const depixSwapRouter = createTRPCRouter({
  /** Cota o swap (quanto de L-USDt recebe, preço e taxas). Não executa. */
  preview: tenantProcedure
    .input(swapPreviewSchema)
    .mutation(async ({ ctx, input }) => {
      await rlPreview(ctx, "depixSwap.preview");
      const result = await previewSwap({
        tenantId: ctx.tenantId,
        amountSats: Math.round(input.amountReais * SATS_PER_UNIT),
      });
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return {
        soldDepixSats: result.soldDepixSats,
        grossUsdtSats: result.grossUsdtSats,
        netUsdtSats: result.netUsdtSats,
        serverFeeSats: result.serverFeeSats,
        fixedFeeSats: result.fixedFeeSats,
        priceDepixPerUsdt: result.priceDepixPerUsdt,
      };
    }),

  /** Executa o swap DePix→L-USDt (assina com a passphrase, Sideswap broadcasta). */
  execute: tenantAdminProcedure
    .input(swapExecuteSchema)
    .mutation(async ({ ctx, input }) => {
      await rlExecute(ctx, "depixSwap.execute");

      // Step-up 2FA: swap move ativo on-chain irreversível. Sem 2FA habilitado,
      // é bloqueado (força o 2FA como pré-requisito) — igual ao saque.
      const stepUp = await verifyUserTwoFactor(ctx.session.user.id, input.twoFactorCode);
      if (!stepUp.ok) {
        if (stepUp.reason === "not_enrolled") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "A conversão exige autenticação de dois fatores (2FA). Habilite o 2FA em Configurações > Segurança antes de converter.",
          });
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Código 2FA inválido." });
      }

      // Carteira non-custodial: precisa do blob cifrado (encryptedSeed) para o LWK
      // assinar decifrando com a passphrase. Custodial não é alvo desta feature.
      const wallet = await ctx.withTenant(async (tx) =>
        tx.tenantDepixWallet.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { custodyModel: true, encryptedSeed: true },
        }),
      );
      if (!wallet) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Carteira DePix não provisionada." });
      }
      if (wallet.custodyModel !== "non_custodial" || !wallet.encryptedSeed) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Conversão disponível apenas para carteira non-custodial (seed cifrada).",
        });
      }

      const result = await executeSwap({
        tenantId: ctx.tenantId,
        amountSats: Math.round(input.amountReais * SATS_PER_UNIT),
        encryptedSeed: wallet.encryptedSeed,
        passphrase: input.walletPassphrase,
        maxPriceDepixPerUsdt: input.maxPriceDepixPerUsdt,
      });

      if (!result.success) {
        if (result.error === "invalid_passphrase") {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Passphrase da carteira inválida." });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }

      return {
        txid: result.txid,
        soldDepixSats: result.soldDepixSats,
        grossUsdtSats: result.grossUsdtSats,
        serverFeeSats: result.serverFeeSats,
        fixedFeeSats: result.fixedFeeSats,
        priceDepixPerUsdt: result.priceDepixPerUsdt,
        explorerUrl: `https://blockstream.info/liquid/tx/${result.txid}`,
      };
    }),
});
