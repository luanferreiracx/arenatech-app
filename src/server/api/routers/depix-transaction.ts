import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import {
  createTRPCRouter,
  tenantProcedure,
  tenantAdminProcedure,
  CENTRAL_TENANT_SLUG,
} from "@/server/api/trpc";
import { enforceRateLimit } from "@/server/api/middleware/rate-limit";
import {
  createDepositSchema,
  createWithdrawSchema,
  listTransactionsSchema,
  cancelTransactionSchema,
  DEPIX_TX_STATUS_LABELS,
} from "@/lib/validators/depix-transaction";
import {
  calcDepositFee,
  calcWithdrawFromNet,
} from "@/lib/services/depix-transaction-fee";
import {
  createDeposit,
  createWithdraw,
  createOnchainWithdraw,
  checkTransactionStatus,
  loadFeeConfig,
} from "@/server/services/depix-transaction.service";
import { onchainWithdrawSchema } from "@/lib/validators/depix-onchain";
import * as lwk from "@/lib/services/lwk-service";
import { logger } from "@/lib/logger";
import { verifyUserTwoFactor } from "@/lib/auth/two-factor-verify";

function serialize(t: Prisma.JsonObject | Record<string, unknown> | null) {
  // Helper de tipagem: aqui apenas garante shape. Serializacao real do Prisma
  // ja retorna numbers nos campos Int. Mantemos passthrough.
  return t;
}

// Rate limiters por path. Aplicados no inicio do handler de cada procedure
// (preserva o ctx refinado dos middlewares anteriores, ao contrario do
// `.use(rateLimitMiddleware)` que reseta o tipo).
const rlCreateDeposit = enforceRateLimit({ limit: 10, windowMs: 60_000 });
// Janela CURTA anti-flood (não mais 5/hora): uma recusa da Eulen não pode travar o
// operador por 1h. O anti-drain real vem do 2FA step-up + cap diário por VALOR +
// admin-only. Falhas PÓS-2FA (recusa do provedor/cap) são DEVOLVIDAS (refund) e não
// contam; erro de 2FA ainda conta (anti-brute-force cabe nos 5/min).
const rlCreateWithdraw = enforceRateLimit({ limit: 5, windowMs: 60_000 });
const rlCheckStatus = enforceRateLimit({ limit: 30, windowMs: 60_000 });
const rlSearchRecipients = enforceRateLimit({ limit: 30, windowMs: 60_000 });
const rlPreviewFee = enforceRateLimit({ limit: 60, windowMs: 60_000 });


export const depixTransactionRouter = createTRPCRouter({
  /** Cria deposito (gera QR PIX apontando pra carteira LWK do tenant).
   *  Rate-limit: 10/min por usuario — evita flood de enderecos LWK e QR PixPay. */
  createDeposit: tenantProcedure
    .input(createDepositSchema)
    .mutation(async ({ ctx, input }) => {
      await rlCreateDeposit(ctx, "depixTransaction.createDeposit");
      const tx = await createDeposit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        userName: ctx.session.user.name ?? null,
        grossAmountCents: input.grossAmountCents,
        sourceType: input.sourceType ?? "WALLET",
        sourceId: input.sourceId ?? null,
        sourceDescription: input.sourceDescription ?? null,
        payerTaxId: input.payerTaxId ?? null,
        payerPhone: input.payerPhone ?? null,
      });
      return tx;
    }),

  /** Cria saque: usuario informa valor LIQUIDO (quanto o destinatario recebe);
   *  sistema calcula o bruto a debitar. 1 tx LWK com 2 outputs (off-ramp
   *  PixPay + taxa Arena Tech).
   *
   *  Seguranca:
   *   - tenantAdminProcedure: so OWNER/MANAGER (saque move dinheiro on-chain
   *     irreversivel; nao queremos operador comum drenando carteira via
   *     sessao roubada/XSS)
   *   - rate-limit: janela curta anti-flood (falha pos-2FA nao conta)
   *   - cap diario por tenant: aplicado no service (DAILY_WITHDRAW_CAP_CENTS) */
  createWithdraw: tenantAdminProcedure
    .input(createWithdrawSchema)
    .mutation(async ({ ctx, input }) => {
      const rl = await rlCreateWithdraw(ctx, "depixTransaction.createWithdraw");

      // Step-up 2FA: saque move dinheiro on-chain irreversivel. Alem de ser
      // admin (tenantAdminProcedure), o usuario re-confirma a identidade com
      // um codigo 2FA. Sem 2FA habilitado, o saque eh BLOQUEADO (forca o 2FA
      // como pre-requisito) — defesa contra sessao roubada/XSS.
      // 2FA falho NAO devolve o token (conta contra os 5/min — anti-brute-force).
      const stepUp = await verifyUserTwoFactor(ctx.session.user.id, input.twoFactorCode);
      if (!stepUp.ok) {
        if (stepUp.reason === "not_enrolled") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Saque exige autenticacao de dois fatores (2FA). Habilite o 2FA em Configuracoes > Seguranca antes de sacar.",
          });
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Codigo 2FA invalido." });
      }

      // 2FA passou: uma falha daqui pra frente (recusa do provedor, cap, etc.) NAO
      // é culpa do operador — devolve o token pra ele poder tentar de novo na hora.
      try {
        const tx = await createWithdraw({
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          userName: ctx.session.user.name ?? null,
          pixKeyType: input.pixKeyType,
          pixKey: input.pixKey,
          recipientName: input.recipientName ?? null,
          recipientTaxId: input.recipientTaxId,
          netAmountCents: input.netAmountCents,
          idempotencyKey: input.idempotencyKey,
          // Non-custodial (ADR 0051): repassa a passphrase da carteira. O service
          // exige-a se o tenant for non_custodial; ignora se custodial.
          passphrase: input.walletPassphrase,
        });
        return tx;
      } catch (err) {
        await rl.refund();
        throw err;
      }
    }),

  /** Saque DePix ON-CHAIN para um endereco Liquid externo (Sideswap, hardware
   *  wallet). Sem PIX/Eulen — envio direto via LWK. IRREVERSIVEL.
   *
   *  Seguranca (igual ao saque PIX + 2ª etapa):
   *   - tenantAdminProcedure (so OWNER/MANAGER)
   *   - rate-limit: janela curta anti-flood (falha pos-2FA nao conta)
   *   - step-up 2FA obrigatorio
   *   - confirmacao: endereco colado + conferido (acknowledgedAddress no schema)
   *   - cap diario + advisory lock no service */
  createOnchainWithdraw: tenantAdminProcedure
    .input(onchainWithdrawSchema)
    .mutation(async ({ ctx, input }) => {
      const rl = await rlCreateWithdraw(ctx, "depixTransaction.createOnchainWithdraw");

      // 2FA falho NAO devolve o token (conta contra os 5/min — anti-brute-force).
      const stepUp = await verifyUserTwoFactor(ctx.session.user.id, input.twoFactorCode);
      if (!stepUp.ok) {
        if (stepUp.reason === "not_enrolled") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Saque exige autenticacao de dois fatores (2FA). Habilite o 2FA em Configuracoes > Seguranca antes de sacar.",
          });
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Codigo 2FA invalido." });
      }

      // 2FA passou: falha posterior (provedor/cap/LWK) devolve o token pra retry na hora.
      try {
        const tx = await createOnchainWithdraw({
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          userName: ctx.session.user.name ?? null,
          toAddress: input.toAddress,
          amountCents: Math.round(input.amountReais * 100),
          passphrase: input.passphrase,
        });
        return {
          id: tx.id,
          number: tx.number,
          status: tx.status,
          withdrawTxId: tx.withdrawTxId,
          onchainAddress: tx.onchainAddress,
          amountCents: tx.netAmountCents,
          grossAmountCents: tx.grossAmountCents,
          explorerUrl: tx.withdrawTxId
            ? `https://blockstream.info/liquid/tx/${tx.withdrawTxId}`
            : null,
        };
      } catch (err) {
        await rl.refund();
        throw err;
      }
    }),

  /** Polling: consulta status remoto (PixPay/LWK) e atualiza estado local.
   *  Rate-limit alto pq UI faz polling automatico (5s). 30/min comporta isso. */
  checkStatus: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await rlCheckStatus(ctx, "depixTransaction.checkStatus");
      const tx = await checkTransactionStatus(ctx.tenantId, input.id);
      return tx;
    }),

  /** Detalhe de uma transacao. */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = await ctx.withTenant(async (db) =>
        db.tenantDepixTransaction.findUnique({
          where: { id: input.id },
          include: {
            feeLedgerEntries: {
              select: {
                id: true,
                kind: true,
                amountCents: true,
                status: true,
                settlementTxId: true,
                settledAt: true,
              },
            },
          },
        }),
      );
      if (!tx) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...tx,
        statusLabel: DEPIX_TX_STATUS_LABELS[tx.status] ?? tx.status,
      };
    }),

  /** Listagem paginada. */
  list: tenantProcedure
    .input(listTransactionsSchema.optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 20;
      const where: Prisma.TenantDepixTransactionWhereInput = {};
      if (input?.kind && input.kind !== "ALL") where.kind = input.kind;
      if (input?.status && input.status !== "ALL") where.status = input.status;
      if (input?.dateFrom) where.createdAt = { ...(where.createdAt as object | undefined), gte: new Date(input.dateFrom) };
      if (input?.dateTo) where.createdAt = { ...(where.createdAt as object | undefined), lte: new Date(input.dateTo) };

      const [data, total] = await ctx.withTenant(async (db) =>
        Promise.all([
          db.tenantDepixTransaction.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          db.tenantDepixTransaction.count({ where }),
        ]),
      );
      return {
        data: data.map((t) => ({
          ...t,
          statusLabel: DEPIX_TX_STATUS_LABELS[t.status] ?? t.status,
        })),
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
      };
    }),

  /** Cancela uma tx ainda PENDING (so deposito; saque ja foi transmitido). */
  cancel: tenantProcedure
    .input(cancelTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const tx = await ctx.withTenant(async (db) => {
        const row = await db.tenantDepixTransaction.findUnique({ where: { id: input.id } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (row.status !== "PENDING") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas transacoes PENDING podem ser canceladas",
          });
        }
        return db.tenantDepixTransaction.update({
          where: { id: input.id },
          data: {
            status: "CANCELLED",
            errorMessage: input.reason ?? "Cancelado pelo operador",
            completedAt: new Date(),
          },
        });
      });
      return tx;
    }),

  /** Autocomplete de saques recentes pro wizard.
   *  Distinct por (pix_key, pix_key_type), ordenado pela ultima
   *  transacao desse destinatario. Limit 10.
   *
   *  Seguranca:
   *   - tenantAdminProcedure: vazaria CPF/CNPJ/chave PIX de N destinatarios
   *     se exposto pra operator. So OWNER/MANAGER.
   *   - rate-limit: 30/min evita enumeracao brute-force.
   *   - query exige min(3) chars (ou vazia pros 10 mais recentes) — barra
   *     enumeracao por letra-a-letra.
   *   - CPF/CNPJ mascarado no retorno. */
  searchRecipients: tenantAdminProcedure
    .input(
      z
        .object({
          query: z.string().max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await rlSearchRecipients(ctx, "depixTransaction.searchRecipients");
      const q = input?.query?.trim() ?? "";
      // Query nao-vazia exige min 3 chars (anti-enumeracao).
      if (q.length > 0 && q.length < 3) {
        return [];
      }
      const where: Prisma.TenantDepixTransactionWhereInput = {
        tenantId: ctx.tenantId,
        kind: "WITHDRAW",
        pixKey: { not: null },
      };
      if (q.length >= 3) {
        where.OR = [
          { pixKey: { contains: q, mode: "insensitive" } },
          { recipientName: { contains: q, mode: "insensitive" } },
          { recipientTaxId: { contains: q.replace(/\D/g, "") } },
        ];
      }
      const rows = await ctx.withTenant(async (db) =>
        db.tenantDepixTransaction.findMany({
          where,
          select: {
            pixKey: true,
            pixKeyType: true,
            recipientName: true,
            recipientTaxId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      );
      // Dedup por (pixKeyType, pixKey) mantendo o mais recente.
      const seen = new Set<string>();
      const result: Array<{
        pixKey: string;
        pixKeyType: string;
        recipientName: string | null;
        recipientTaxId: string | null;
        lastUsedAt: Date;
      }> = [];
      for (const r of rows) {
        if (!r.pixKey || !r.pixKeyType) continue;
        const key = `${r.pixKeyType}:${r.pixKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          // tenantAdminProcedure ja restringe acesso a OWNER/MANAGER (pessoas
          // autorizadas a ver os destinatarios). UI usa esses valores pra
          // auto-fill no form de saque — mascarar quebraria o fluxo.
          pixKey: r.pixKey,
          pixKeyType: r.pixKeyType,
          recipientName: r.recipientName,
          recipientTaxId: r.recipientTaxId,
          lastUsedAt: r.createdAt,
        });
        if (result.length >= 10) break;
      }
      return result;
    }),

  /** Breakdown de taxas + saldo + master address pra UI. */
  getOverview: tenantProcedure.query(async ({ ctx }) => {
    const [wallet, feeCfg] = await Promise.all([
      ctx.withTenant(async (db) =>
        db.tenantDepixWallet.findUnique({ where: { tenantId: ctx.tenantId } }),
      ),
      // Usa o loadFeeConfig do service: aplica guard de tenant central (taxa=0).
      ctx.withTenant(async (db) => loadFeeConfig(db, ctx.tenantId)),
    ]);
    // Tenant central nao paga taxa pra si mesmo (eh quem RECEBE).
    const activeTenant = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
    const isCentralTenant = activeTenant?.slug === CENTRAL_TENANT_SLUG;

    // So consulta o LWK quando a carteira ja foi provisionada. Consultar o
    // saldo de um tenant sem carteira faria o LWK AUTO-CRIAR uma carteira
    // custodial (load_or_create_wallet grava mnemonic.txt), gerando uma
    // carteira fantasma que depois bloqueia o setup non-custodial (guard 409).
    const provisioned = !!wallet?.provisionedAt;
    const balance = provisioned
      ? await lwk.getBalance(ctx.tenantId)
      : { success: true as const, depixBalance: 0, error: null };

    if (!balance.success) {
      logger.warn("Overview: lwk getBalance falhou", {
        tenantId: ctx.tenantId,
        error: balance.error,
      });
    }

    return {
      wallet: wallet
        ? {
            provisioned,
            masterAddress: wallet.masterAddress,
            network: wallet.network,
          }
        : { provisioned: false, masterAddress: null, network: null },
      feeConfig: feeCfg,
      isCentralTenant,
      balance: {
        depix: balance.depixBalance ?? 0,
        success: balance.success,
        error: balance.error ?? null,
      },
    };
  }),

  /** Calcula breakdown de taxa (preview pra UI antes de confirmar).
   *  - DEPOSIT: usuario informa o BRUTO (cliente paga X via PIX); calcula
   *    o liquido que cai na carteira do tenant.
   *  - WITHDRAW: usuario informa o LIQUIDO (destinatario recebe X via PIX);
   *    calcula o bruto que sai da carteira do tenant. */
  previewFee: tenantProcedure
    .input(
      z.object({
        kind: z.enum(["DEPOSIT", "WITHDRAW"]),
        amountCents: z.number().int().min(1).max(100_000_000),
      }),
    )
    .query(async ({ ctx, input }) => {
      await rlPreviewFee(ctx, "depixTransaction.previewFee");
      // Usa o loadFeeConfig do service (aplica guard de tenant central).
      const feeCfg = await ctx.withTenant(async (db) => loadFeeConfig(db, ctx.tenantId));
      return input.kind === "DEPOSIT"
        ? calcDepositFee(input.amountCents, feeCfg)
        : calcWithdrawFromNet(input.amountCents, feeCfg);
    }),
});

// Avoid TS unused warning if helper unused.
void serialize;
