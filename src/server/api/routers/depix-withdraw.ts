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
      return ctx.withTenant(async (tx) => {
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

        // Generate number
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

        // Create withdraw (API integration is a mock for now)
        const w = await tx.depixWithdraw.create({
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

        logger.info("DepixWithdraw created", { id: w.id, number: w.number, amount: input.requestedAmount });

        return serializeWithdraw(w);
      });
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
        const results = await tx.depixWithdraw.findMany({
          where: {
            OR: [
              { recipientName: { contains: input.query, mode: "insensitive" } },
              { pixKey: { contains: input.query, mode: "insensitive" } },
            ],
            recipientName: { not: null },
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

  checkStatus: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const w = await tx.depixWithdraw.findUnique({
          where: { id: input.id },
          select: {
            status: true,
            receivedAmount: true,
            fee: true,
            blockchainTxId: true,
          },
        });
        if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Saque nao encontrado" });

        const isFinal = ["SENT", "FAILED", "CANCELLED"].includes(w.status);
        return {
          status: w.status,
          statusLabel: DEPIX_STATUS_LABELS[w.status] ?? w.status,
          receivedAmount: decimalToNumber(w.receivedAmount),
          fee: decimalToNumber(w.fee),
          blockchainTxId: w.blockchainTxId,
          isFinal,
        };
      });
    }),
});
