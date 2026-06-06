import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createWithdrawSchema,
  updateWithdrawSchema,
  listWithdrawalsSchema,
  searchRecipientsSchema,
  DEPIX_STATUS_LABELS,
} from "@/lib/validators/depix-withdraw";
import { logger } from "@/lib/logger";
import { createWithdraw as createWalletWithdraw } from "@/server/services/depix-transaction.service";

// ── Helpers ──

function decimalToNumber(v: Prisma.Decimal | null | undefined): number | null {
  if (v == null) return null;
  return Number(v);
}

function serializeWithdraw(w: {
  id: string;
  number: string;
  pixKeyType: string;
  pixKey: string;
  recipientName: string | null;
  recipientTaxId: string | null;
  notes: string | null;
  requestedAmount: Prisma.Decimal;
  receivedAmount: Prisma.Decimal | null;
  fee: Prisma.Decimal | null;
  depositAmount: Prisma.Decimal | null;
  status: string;
  depixId: string | null;
  depositAddress: string | null;
  depositAddressQr: string | null;
  blockchainTxId: string | null;
  expiration: Date | null;
  userId: string;
  userName: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: w.id,
    number: w.number,
    pixKeyType: w.pixKeyType,
    pixKey: w.pixKey,
    recipientName: w.recipientName,
    recipientTaxId: w.recipientTaxId,
    notes: w.notes,
    requestedAmount: Number(w.requestedAmount),
    receivedAmount: decimalToNumber(w.receivedAmount),
    fee: decimalToNumber(w.fee),
    depositAmount: decimalToNumber(w.depositAmount),
    status: w.status,
    statusLabel: DEPIX_STATUS_LABELS[w.status] ?? w.status,
    depixId: w.depixId,
    depositAddress: w.depositAddress,
    depositAddressQr: w.depositAddressQr,
    blockchainTxId: w.blockchainTxId,
    expiration: w.expiration,
    userId: w.userId,
    userName: w.userName,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

export const depixWithdrawRouter = createTRPCRouter({
  list: tenantProcedure
    .input(listWithdrawalsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 1;
        const perPage = input.perPage ?? 20;
        const skip = (page - 1) * perPage;

        const where: Prisma.DepixWithdrawWhereInput = {};
        if (input.status) where.status = input.status;
        if (input.pixKey) where.pixKey = { contains: input.pixKey, mode: "insensitive" };
        if (input.recipientName) where.recipientName = { contains: input.recipientName, mode: "insensitive" };
        if (input.dateFrom) where.createdAt = { ...(where.createdAt as Record<string, unknown> ?? {}), gte: new Date(input.dateFrom) };
        if (input.dateTo) {
          const existing = where.createdAt as Record<string, unknown> ?? {};
          where.createdAt = { ...existing, lte: new Date(input.dateTo + "T23:59:59.999Z") };
        }

        const [items, total] = await Promise.all([
          tx.depixWithdraw.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: perPage,
          }),
          tx.depixWithdraw.count({ where }),
        ]);

        return {
          items: items.map(serializeWithdraw),
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage),
        };
      });
    }),

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const w = await tx.depixWithdraw.findUnique({ where: { id: input.id } });
        if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Saque nao encontrado" });
        return serializeWithdraw(w);
      });
    }),

  create: tenantProcedure
    .input(createWithdrawSchema)
    .mutation(async ({ ctx, input }) => {
      const walletTx = await createWalletWithdraw({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        userName: ctx.session.user.name ?? null,
        pixKeyType: input.pixKeyType,
        pixKey: input.pixKey,
        recipientName: input.recipientName ?? null,
        recipientTaxId: input.recipientTaxId,
        netAmountCents: Math.round(input.requestedAmount * 100),
        sourceType: "WALLET",
        sourceDescription: input.notes ?? "Saque criado pela rota legada /depix/withdrawals",
      });

      logger.info("DepixWithdraw legado redirecionado para wallet", {
        walletTransactionId: walletTx.id,
        number: walletTx.number,
        amount: input.requestedAmount,
      });

      return {
        id: walletTx.id,
        number: walletTx.number,
        pixKeyType: walletTx.pixKeyType,
        pixKey: walletTx.pixKey,
        recipientName: walletTx.recipientName,
        recipientTaxId: walletTx.recipientTaxId,
        notes: walletTx.sourceDescription,
        requestedAmount: (walletTx.netAmountCents ?? walletTx.grossAmountCents) / 100,
        receivedAmount: walletTx.netAmountCents != null ? walletTx.netAmountCents / 100 : null,
        fee:
          walletTx.feePixPayCents != null
            ? walletTx.feePixPayCents / 100
            : null,
        depositAmount: walletTx.grossAmountCents / 100,
        status: walletTx.status === "COMPLETED" ? "SENT" : walletTx.status === "FAILED" ? "FAILED" : "PROCESSING",
        statusLabel: walletTx.status === "COMPLETED" ? "Enviado" : "Processando",
        depixId: walletTx.pixpayDepixId,
        depositAddress: walletTx.pixpayDepositAddress,
        depositAddressQr: null,
        blockchainTxId: walletTx.withdrawTxId,
        expiration: null,
        userId: walletTx.userId,
        userName: walletTx.userName,
        createdAt: walletTx.createdAt,
        updatedAt: walletTx.updatedAt,
        walletTransactionId: walletTx.id,
      };
    }),

  update: tenantProcedure
    .input(updateWithdrawSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const w = await tx.depixWithdraw.findUnique({ where: { id: input.id } });
        if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Saque nao encontrado" });

        const updated = await tx.depixWithdraw.update({
          where: { id: input.id },
          data: {
            recipientName: input.recipientName,
            notes: input.notes,
          },
        });

        return serializeWithdraw(updated);
      });
    }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const [total, pending, sent, totalSentResult] = await Promise.all([
        tx.depixWithdraw.count(),
        tx.depixWithdraw.count({ where: { status: "PENDING" } }),
        tx.depixWithdraw.count({ where: { status: "SENT" } }),
        tx.depixWithdraw.aggregate({
          where: { status: "SENT" },
          _sum: { requestedAmount: true },
        }),
      ]);

      return {
        total,
        pending,
        sent,
        totalSentAmount: Number(totalSentResult._sum.requestedAmount ?? 0),
      };
    });
  }),

  searchRecipients: tenantProcedure
    .input(searchRecipientsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // AND explicito: chave duplicada `recipientName` no objeto fazia o
        // segundo sobrescrever o primeiro, e o OR nao filtrava por nome.
        const results = await tx.depixWithdraw.findMany({
          where: {
            AND: [
              { recipientName: { not: null } },
              {
                OR: [
                  { recipientName: { contains: input.query, mode: "insensitive" } },
                  { pixKey: { contains: input.query, mode: "insensitive" } },
                ],
              },
            ],
          },
          select: {
            pixKey: true,
            pixKeyType: true,
            recipientName: true,
            recipientTaxId: true,
          },
          distinct: ["pixKey", "pixKeyType"],
          orderBy: { recipientName: "asc" },
          take: 15,
        });

        return results;
      });
    }),

  /**
   * Consulta status do saque. Se ainda PROCESSING, chama a API PixPay para
   * checar e atualiza o banco. Paridade Laravel DepixService::consultarStatusSaque.
   */
  checkStatus: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1: fetch
      const w = await ctx.withTenant(async (tx) =>
        tx.depixWithdraw.findUnique({
          where: { id: input.id },
        }),
      );
      if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Saque nao encontrado" });

      // Se ja eh final, retorna direto
      if (["SENT", "FAILED", "CANCELLED"].includes(w.status)) {
        return {
          status: w.status,
          statusLabel: DEPIX_STATUS_LABELS[w.status] ?? w.status,
          receivedAmount: decimalToNumber(w.receivedAmount),
          fee: decimalToNumber(w.fee),
          blockchainTxId: w.blockchainTxId,
          isFinal: true,
        };
      }

      // PROCESSING / PENDING — consulta API
      if (w.depixId) {
        const { getDepixWithdrawStatus } = await import("@/lib/services/depix-service");
        const result = await getDepixWithdrawStatus(w.depixId);
        if (result.success && result.status) {
          // PixPay status: "unsent" | "sending" | "sent" | "send" | "paid"
          // | "completed" | "expired" | "failed" | "error" | "rejected"
          // | "cancelled". Paridade Laravel statusMap linhas 968-979.
          const raw = result.status.toLowerCase();
          let newStatus: typeof w.status = w.status;
          if (
            raw === "sent" ||
            raw === "send" ||
            raw === "sending" ||
            raw === "paid" ||
            raw === "completed"
          ) {
            newStatus = "SENT";
          } else if (raw === "expired") {
            newStatus = "CANCELLED";
          } else if (raw === "failed" || raw === "error" || raw === "rejected") {
            newStatus = "FAILED";
          } else if (raw === "cancelled" || raw === "canceled") {
            newStatus = "CANCELLED";
          }

          // Extrai dados do raw (paridade campos do webhook + Laravel
          // SaqueDepix::comprovante depende de blockchain_tx_id).
          const rawData = result.raw ?? {};
          const blockchainTxId =
            (rawData.blockchain_tx_id as string | undefined) ??
            (rawData.txid as string | undefined) ??
            (rawData.transactionId as string | undefined) ??
            null;
          const receivedAmount =
            (rawData.received_amount as number | string | undefined) ??
            (rawData.receivedAmount as number | string | undefined) ??
            (rawData.amount as number | string | undefined) ??
            null;
          const fee =
            (rawData.fee as number | string | undefined) ??
            (rawData.taxa as number | string | undefined) ??
            null;

          // Atualiza sempre que conseguimos novos dados — nao apenas
          // quando muda status. Operador pode ver receivedAmount mesmo
          // antes do gateway concluir.
          const shouldUpdate =
            newStatus !== w.status ||
            (blockchainTxId && blockchainTxId !== w.blockchainTxId) ||
            (receivedAmount != null && w.receivedAmount == null) ||
            (fee != null && w.fee == null);

          if (shouldUpdate) {
            await ctx.withTenant(async (tx) =>
              tx.depixWithdraw.update({
                where: { id: w.id },
                data: {
                  status: newStatus,
                  blockchainTxId: blockchainTxId ?? undefined,
                  receivedAmount: receivedAmount != null ? Number(receivedAmount) : undefined,
                  fee: fee != null ? Number(fee) : undefined,
                  apiResponse: rawData as never,
                },
              }),
            );
            logger.info("DepixWithdraw atualizado via API", {
              id: w.id,
              fromStatus: w.status,
              toStatus: newStatus,
              hasBlockchainTxId: !!blockchainTxId,
            });
          }

          const isFinal = ["SENT", "FAILED", "CANCELLED"].includes(newStatus);
          return {
            status: newStatus,
            statusLabel: DEPIX_STATUS_LABELS[newStatus] ?? newStatus,
            receivedAmount:
              receivedAmount != null
                ? Number(receivedAmount)
                : decimalToNumber(w.receivedAmount),
            fee: fee != null ? Number(fee) : decimalToNumber(w.fee),
            blockchainTxId: blockchainTxId ?? w.blockchainTxId,
            isFinal,
          };
        }
      }

      // Fallback: retorna status atual sem consulta
      return {
        status: w.status,
        statusLabel: DEPIX_STATUS_LABELS[w.status] ?? w.status,
        receivedAmount: decimalToNumber(w.receivedAmount),
        fee: decimalToNumber(w.fee),
        blockchainTxId: w.blockchainTxId,
        isFinal: false,
      };
    }),
});
