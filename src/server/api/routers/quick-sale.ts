import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createQuickSaleSchema,
  updateQuickSaleSchema,
  listQuickSalesSchema,
} from "@/lib/validators/quick-sale";

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function serializeQuickSale(qs: Record<string, unknown>) {
  return {
    ...qs,
    unitPrice: decimalToCents(qs.unitPrice as Prisma.Decimal),
    discount: decimalToCents(qs.discount as Prisma.Decimal),
    totalAmount: decimalToCents(qs.totalAmount as Prisma.Decimal),
  };
}

export const quickSaleRouter = createTRPCRouter({
  /** List quick sales */
  list: tenantProcedure
    .input(listQuickSalesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.QuickSaleWhereInput = {
          tenantId: ctx.tenantId,
          deletedAt: null,
        };

        if (input.status) {
          where.status = input.status;
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          const digits = term.replace(/\D/g, "");
          where.OR = [
            { buyerName: { contains: term, mode: "insensitive" } },
            { productDescription: { contains: term, mode: "insensitive" } },
            { number: { contains: term, mode: "insensitive" } },
            ...(digits ? [{ cpfCnpj: { contains: digits } }] : []),
          ];
        }

        if (input.dateFrom) {
          where.createdAt = { ...(where.createdAt as object ?? {}), gte: new Date(input.dateFrom) };
        }
        if (input.dateTo) {
          const to = new Date(input.dateTo);
          to.setHours(23, 59, 59, 999);
          where.createdAt = { ...(where.createdAt as object ?? {}), lte: to };
        }

        const [data, total] = await Promise.all([
          tx.quickSale.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.quickSale.count({ where }),
        ]);

        return {
          data: data.map((d) => serializeQuickSale(d as unknown as Record<string, unknown>)),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get quick sale by ID */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const qs = await tx.quickSale.findUnique({
          where: { id: input.id },
        });

        if (!qs || qs.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda avulsa nao encontrada" });
        }

        return serializeQuickSale(qs as unknown as Record<string, unknown>);
      });
    }),

  /** Create quick sale */
  create: tenantProcedure
    .input(createQuickSaleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Generate number: QS{year}{5-digit seq}
        const year = new Date().getFullYear();
        const prefix = `QS${year}`;
        const lastQs = await tx.quickSale.findFirst({
          where: {
            tenantId: ctx.tenantId,
            number: { startsWith: prefix },
          },
          orderBy: { number: "desc" },
          select: { number: true },
        });

        let seq = 1;
        if (lastQs?.number) {
          const lastSeq = parseInt(lastQs.number.replace(prefix, ""), 10);
          if (!isNaN(lastSeq)) seq = lastSeq + 1;
        }
        const number = `${prefix}${String(seq).padStart(5, "0")}`;

        const unitPriceDecimal = new Prisma.Decimal(input.unitPrice / 100);
        const discountDecimal = new Prisma.Decimal((input.discount ?? 0) / 100);
        const subtotal = input.quantity * input.unitPrice;
        const totalCents = Math.max(0, subtotal - (input.discount ?? 0));
        const totalDecimal = new Prisma.Decimal(totalCents / 100);

        const qs = await tx.quickSale.create({
          data: {
            tenantId: ctx.tenantId,
            number,
            buyerName: input.buyerName ?? null,
            cpfCnpj: input.cpfCnpj?.replace(/\D/g, "") ?? null,
            phone: input.phone?.replace(/\D/g, "") ?? null,
            productDescription: input.productDescription,
            quantity: input.quantity,
            unitPrice: unitPriceDecimal,
            discount: discountDecimal,
            totalAmount: totalDecimal,
            createdById: ctx.session.user.id,
          },
        });

        return serializeQuickSale(qs as unknown as Record<string, unknown>);
      });
    }),

  /** Update quick sale (only if AWAITING_PAYMENT) */
  update: tenantProcedure
    .input(updateQuickSaleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.quickSale.findUnique({
          where: { id: input.id },
        });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda avulsa nao encontrada" });
        }
        if (existing.status !== "AWAITING_PAYMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas vendas aguardando pagamento podem ser editadas" });
        }

        const data: Record<string, unknown> = {};

        if (input.buyerName !== undefined) data.buyerName = input.buyerName;
        if (input.cpfCnpj !== undefined) data.cpfCnpj = input.cpfCnpj?.replace(/\D/g, "") ?? null;
        if (input.phone !== undefined) data.phone = input.phone?.replace(/\D/g, "") ?? null;
        if (input.productDescription !== undefined) data.productDescription = input.productDescription;
        if (input.quantity !== undefined) data.quantity = input.quantity;
        if (input.unitPrice !== undefined) data.unitPrice = new Prisma.Decimal(input.unitPrice / 100);
        if (input.discount !== undefined) data.discount = new Prisma.Decimal(input.discount / 100);

        // Recalculate total
        const qty = (input.quantity ?? existing.quantity);
        const unitPriceCents = input.unitPrice ?? decimalToCents(existing.unitPrice);
        const discountCents = input.discount ?? decimalToCents(existing.discount);
        const total = Math.max(0, qty * unitPriceCents - discountCents);
        data.totalAmount = new Prisma.Decimal(total / 100);

        const updated = await tx.quickSale.update({
          where: { id: input.id },
          data,
        });

        return serializeQuickSale(updated as unknown as Record<string, unknown>);
      });
    }),

  /** Mark as paid */
  markPaid: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.quickSale.findUnique({
          where: { id: input.id },
        });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda avulsa nao encontrada" });
        }
        if (existing.status !== "AWAITING_PAYMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Venda nao esta aguardando pagamento" });
        }

        const updated = await tx.quickSale.update({
          where: { id: input.id },
          data: { status: "PAID", paidAt: new Date() },
        });

        return serializeQuickSale(updated as unknown as Record<string, unknown>);
      });
    }),

  /** Cancel quick sale */
  cancel: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.quickSale.findUnique({
          where: { id: input.id },
        });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda avulsa nao encontrada" });
        }
        if (existing.status !== "AWAITING_PAYMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas vendas aguardando pagamento podem ser canceladas" });
        }

        const updated = await tx.quickSale.update({
          where: { id: input.id },
          data: { status: "CANCELLED" },
        });

        return serializeQuickSale(updated as unknown as Record<string, unknown>);
      });
    }),

  /** Stats */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const base = { tenantId: ctx.tenantId, deletedAt: null as Date | null };
      const [total, awaiting, paid, totalPaidAmount] = await Promise.all([
        tx.quickSale.count({ where: base }),
        tx.quickSale.count({ where: { ...base, status: "AWAITING_PAYMENT" } }),
        tx.quickSale.count({ where: { ...base, status: "PAID" } }),
        tx.quickSale.aggregate({
          where: { ...base, status: "PAID" },
          _sum: { totalAmount: true },
        }),
      ]);

      return {
        total,
        awaiting,
        paid,
        totalPaidAmount: decimalToCents(totalPaidAmount._sum.totalAmount),
      };
    });
  }),
});
