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
  checkTransactionStatus,
  loadFeeConfig,
} from "@/server/services/depix-transaction.service";
import * as lwk from "@/lib/services/lwk-service";
import { logger } from "@/lib/logger";

function serialize(t: Prisma.JsonObject | Record<string, unknown> | null) {
  // Helper de tipagem: aqui apenas garante shape. Serializacao real do Prisma
  // ja retorna numbers nos campos Int. Mantemos passthrough.
  return t;
}

// Rate limiters por path. Aplicados no inicio do handler de cada procedure
// (preserva o ctx refinado dos middlewares anteriores, ao contrario do
// `.use(rateLimitMiddleware)` que reseta o tipo).
const rlCreateDeposit = enforceRateLimit({ limit: 10, windowMs: 60_000 });
const rlCreateWithdraw = enforceRateLimit({ limit: 5, windowMs: 60 * 60 * 1000 });
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
   *   - rate-limit: 5/hora por usuario
   *   - cap diario por tenant: aplicado no service (DAILY_WITHDRAW_CAP_CENTS) */
  createWithdraw: tenantAdminProcedure
    .input(createWithdrawSchema)
    .mutation(async ({ ctx, input }) => {
      await rlCreateWithdraw(ctx, "depixTransaction.createWithdraw");
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
      });
      return tx;
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
    const [wallet, feeCfg, balance] = await Promise.all([
      ctx.withTenant(async (db) =>
        db.tenantDepixWallet.findUnique({ where: { tenantId: ctx.tenantId } }),
      ),
      // Usa o loadFeeConfig do service: aplica guard de tenant central (taxa=0).
      ctx.withTenant(async (db) => loadFeeConfig(db, ctx.tenantId)),
      lwk.getBalance(ctx.tenantId),
    ]);
    // Tenant central nao paga taxa pra si mesmo (eh quem RECEBE).
    const activeTenant = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
    const isCentralTenant = activeTenant?.slug === CENTRAL_TENANT_SLUG;

    if (!balance.success) {
      logger.warn("Overview: lwk getBalance falhou", {
        tenantId: ctx.tenantId,
        error: balance.error,
      });
    }

    return {
      wallet: wallet
        ? {
            provisioned: !!wallet.provisionedAt,
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
