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
      // Clean pix key
      let pixKey = input.pixKey.trim();
      if (input.pixKeyType === "CPF" || input.pixKeyType === "CNPJ" || input.pixKeyType === "PHONE") {
        pixKey = pixKey.replace(/\D/g, "");
      }

      // Clean tax id
      const taxId = input.recipientTaxId.replace(/\D/g, "");
      if (taxId.length !== 11 && taxId.length !== 14) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CPF deve ter 11 digitos e CNPJ 14 digitos" });
      }

      // ETAPA 1: cria registro local em PENDING, gera numero — tx curta.
      const w = await ctx.withTenant(async (tx) => {
        const today = new Date();
        const prefix = `SQ${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-`;
        const lastWithdraw = await tx.depixWithdraw.findFirst({
          where: { number: { startsWith: prefix } },
          orderBy: { number: "desc" },
        });
        let seq = 1;
        if (lastWithdraw) {
          const lastSeq = parseInt(lastWithdraw.number.slice(-5), 10);
          seq = lastSeq + 1;
        }
        const number = `${prefix}${String(seq).padStart(5, "0")}`;

        return tx.depixWithdraw.create({
          data: {
            tenantId: ctx.tenantId,
            number,
            pixKeyType: input.pixKeyType,
            pixKey,
            recipientName: input.recipientName ?? null,
            recipientTaxId: taxId,
            notes: input.notes ?? null,
            requestedAmount: new Prisma.Decimal(input.requestedAmount),
            status: "PENDING",
            userId: ctx.session.user.id,
            userName: ctx.session.user.name ?? null,
          },
        });
      });

      // ETAPA 2: chamada externa PixPay (fora da tx, longa)
      const { createDepixWithdraw } = await import("@/lib/services/depix-service");
      const result = await createDepixWithdraw(
        pixKey,
        input.pixKeyType,
        input.requestedAmount,
        taxId,
      );

      // ETAPA 3: persiste resposta da API
      const updated = await ctx.withTenant(async (tx) => {
        if (!result.success) {
          return tx.depixWithdraw.update({
            where: { id: w.id },
            data: {
              status: "FAILED",
              notes: [w.notes, `Falha API: ${result.error ?? "erro desconhecido"}`]
                .filter(Boolean)
                .join("\n"),
            },
          });
        }
        return tx.depixWithdraw.update({
          where: { id: w.id },
          data: {
            depixId: result.id ?? null,
            depositAddress: result.depositAddress ?? null,
            depositAmount:
              result.depositAmountInCents != null
                ? new Prisma.Decimal(result.depositAmountInCents).div(100)
                : null,
            receivedAmount:
              result.receivedAmount != null
                ? new Prisma.Decimal(result.receivedAmount)
                : null,
            fee: result.fee != null ? new Prisma.Decimal(result.fee) : null,
            expiration: result.expiration ? new Date(result.expiration) : null,
            // PixPay envia "unsent" inicial, vai para "sent" depois.
            status: result.status === "sent" || result.status === "completed"
              ? "SENT"
              : "PROCESSING",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            apiResponse: result.raw as any,
          },
        });
      });

      logger.info("DepixWithdraw processado", {
        id: updated.id,
        number: updated.number,
        amount: input.requestedAmount,
        apiSuccess: result.success,
      });

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Erro ao solicitar saque",
        });
      }

      return serializeWithdraw(updated);
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
          // PixPay status: "unsent" | "sent" | "expired" | "failed"
          let newStatus: typeof w.status = w.status;
          if (result.status === "sent" || result.status === "completed") newStatus = "SENT";
          else if (result.status === "expired") newStatus = "CANCELLED";
          else if (result.status === "failed") newStatus = "FAILED";

          if (newStatus !== w.status) {
            await ctx.withTenant(async (tx) =>
              tx.depixWithdraw.update({
                where: { id: w.id },
                data: { status: newStatus },
              }),
            );
            logger.info("DepixWithdraw status atualizado via API", {
              id: w.id,
              from: w.status,
              to: newStatus,
            });
          }

          const isFinal = ["SENT", "FAILED", "CANCELLED"].includes(newStatus);
          return {
            status: newStatus,
            statusLabel: DEPIX_STATUS_LABELS[newStatus] ?? newStatus,
            receivedAmount: decimalToNumber(w.receivedAmount),
            fee: decimalToNumber(w.fee),
            blockchainTxId: w.blockchainTxId,
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
