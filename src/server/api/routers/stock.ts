import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
  adjustStockSchema,
  listMovementsSchema,
  createDevicePurchaseSchema,
  listDevicePurchasesSchema,
} from "@/lib/validators/stock";

export const stockRouter = createTRPCRouter({
  // ── List Products ───────────────────────────────────────────────────────────

  listProducts: tenantProcedure
    .input(listProductsSchema)
    .query(async ({ ctx, input }) => {
      const { search, active, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(active !== undefined ? { active } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { sku: { contains: search, mode: "insensitive" as const } },
                  { barcode: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.product.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          tx.product.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get Product ─────────────────────────────────────────────────────────────

  getProduct: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.product.findFirst({
          where: { id: input.id, deletedAt: null },
        });
      });
    }),

  // ── Create Product ──────────────────────────────────────────────────────────

  createProduct: tenantProcedure
    .input(createProductSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.product.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  // ── Update Product ──────────────────────────────────────────────────────────

  updateProduct: tenantProcedure
    .input(updateProductSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        return tx.product.update({ where: { id }, data });
      });
    }),

  // ── Delete Product (soft) ───────────────────────────────────────────────────

  deleteProduct: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.product.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ── Adjust Stock (atomic) ───────────────────────────────────────────────────

  adjustStock: tenantProcedure
    .input(adjustStockSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findFirst({
          where: { id: input.productId, deletedAt: null },
        });

        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
        }

        // Calculate new stock based on movement type
        let delta: number;
        if (input.type === "ENTRY") {
          delta = input.quantity;
        } else if (input.type === "EXIT") {
          delta = -input.quantity;
        } else {
          // ADJUSTMENT — quantity is the new absolute stock
          delta = input.quantity - product.currentStock;
        }

        // For EXIT: use atomic decrement with WHERE guard to prevent negative stock
        if (input.type === "EXIT") {
          const result = await tx.product.updateMany({
            where: {
              id: input.productId,
              currentStock: { gte: input.quantity },
            },
            data: { currentStock: { decrement: input.quantity } },
          });

          if (result.count === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Estoque insuficiente para esta saída",
            });
          }
        } else {
          await tx.product.update({
            where: { id: input.productId },
            data: { currentStock: { increment: delta } },
          });
        }

        // Create stock movement record
        const movement = await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            type: input.type,
            quantity: input.quantity,
            unitCost: input.unitCost,
            reason: input.reason,
            userId,
          },
        });

        return movement;
      });
    }),

  // ── List Movements ──────────────────────────────────────────────────────────

  listMovements: tenantProcedure
    .input(listMovementsSchema)
    .query(async ({ ctx, input }) => {
      const { productId, type, from, to, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          ...(productId ? { productId } : {}),
          ...(type ? { type } : {}),
          ...(from || to
            ? {
                createdAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.stockMovement.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
            include: { product: { select: { name: true, sku: true } } },
          }),
          tx.stockMovement.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── List Device Purchases ───────────────────────────────────────────────────

  listDevicePurchases: tenantProcedure
    .input(listDevicePurchasesSchema)
    .query(async ({ ctx, input }) => {
      const { search, from, to, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          ...(search
            ? {
                OR: [
                  { brand: { contains: search, mode: "insensitive" as const } },
                  { model: { contains: search, mode: "insensitive" as const } },
                  { imei: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
          ...(from || to
            ? {
                createdAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.devicePurchase.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
          }),
          tx.devicePurchase.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Create Device Purchase ──────────────────────────────────────────────────

  createDevicePurchase: tenantProcedure
    .input(createDevicePurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.create({
          data: { tenantId: ctx.tenantId, ...input },
        });

        // If linked to a product, increment stock and create movement
        if (input.productId) {
          await tx.product.update({
            where: { id: input.productId },
            data: { currentStock: { increment: 1 } },
          });

          const product = await tx.product.findFirst({
            where: { id: input.productId },
            select: { name: true },
          });

          await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: input.productId,
              type: "ENTRY",
              quantity: 1,
              unitCost: input.purchasePrice,
              reason: `Compra de aparelho${input.imei ? ` — IMEI: ${input.imei}` : ""}${product ? ` (${product.name})` : ""}`,
              referenceId: purchase.id,
              referenceType: "DEVICE_PURCHASE",
              userId,
            },
          });
        }

        return purchase;
      });
    }),

  // ── Stock Report ────────────────────────────────────────────────────────────

  stockReport: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const products = await tx.product.findMany({
        where: { deletedAt: null, active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          currentStock: true,
          costPrice: true,
          salePrice: true,
          minStock: true,
        },
      });

      let totalProducts = 0;
      let totalValue = 0;
      let lowStockCount = 0;

      for (const p of products) {
        totalProducts++;
        totalValue += p.currentStock * Number(p.costPrice);
        if (p.currentStock <= p.minStock) lowStockCount++;
      }

      return { products, totalProducts, totalValue, lowStockCount };
    });
  }),

  // ── Low Stock Alert ─────────────────────────────────────────────────────────

  lowStockAlert: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      // Prisma doesn't support column-to-column comparisons directly, so we
      // fetch active products and filter in JS. For large datasets this should
      // be replaced with a raw query, but for typical store sizes this is fine.
      const products = await tx.product.findMany({
        where: { deletedAt: null, active: true },
        orderBy: { name: "asc" },
      });

      return products.filter((p) => p.currentStock <= p.minStock);
    });
  }),
});
