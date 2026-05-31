import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, CENTRAL_TENANT_SLUG } from "@/server/api/trpc";
import {
  createDepositSchema,
  createWithdrawSchema,
  listTransactionsSchema,
  cancelTransactionSchema,
  DEPIX_TX_STATUS_LABELS,
} from "@/lib/validators/depix-transaction";
import {
  calcDepositFee,
  calcWithdrawFee,
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

export const depixTransactionRouter = createTRPCRouter({
  /** Cria deposito (gera QR PIX apontando pra carteira LWK do tenant). */
  createDeposit: tenantProcedure
    .input(createDepositSchema)
    .mutation(async ({ ctx, input }) => {
      const tx = await createDeposit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        userName: ctx.session.user.name ?? null,
        grossAmountCents: input.grossAmountCents,
      });
      return tx;
    }),

  /** Cria saque: 1 tx LWK com 2 outputs (off-ramp PixPay + taxa Arena Tech). */
  createWithdraw: tenantProcedure
    .input(createWithdrawSchema)
    .mutation(async ({ ctx, input }) => {
      const tx = await createWithdraw({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        userName: ctx.session.user.name ?? null,
        pixKeyType: input.pixKeyType,
        pixKey: input.pixKey,
        recipientName: input.recipientName ?? null,
        recipientTaxId: input.recipientTaxId,
        grossAmountCents: input.grossAmountCents,
        idempotencyKey: input.idempotencyKey,
      });
      return tx;
    }),

  /** Polling: consulta status remoto (PixPay/LWK) e atualiza estado local. */
  checkStatus: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
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

  /** Calcula breakdown de taxa (preview pra UI antes de confirmar). */
  previewFee: tenantProcedure
    .input(
      z.object({
        kind: z.enum(["DEPOSIT", "WITHDRAW"]),
        grossAmountCents: z.number().int().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Usa o loadFeeConfig do service (aplica guard de tenant central).
      const feeCfg = await ctx.withTenant(async (db) => loadFeeConfig(db, ctx.tenantId));
      return input.kind === "DEPOSIT"
        ? calcDepositFee(input.grossAmountCents, feeCfg)
        : calcWithdrawFee(input.grossAmountCents, feeCfg);
    }),
});

// Avoid TS unused warning if helper unused.
void serialize;
