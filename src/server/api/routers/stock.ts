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
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersSchema,
  createCategorySchema,
  updateCategorySchema,
  listCategoriesSchema,
  stockEntrySchema,
  stockExitSchema,
} from "@/lib/validators/stock";
import { Prisma } from "@prisma/client";

export const stockRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // PRODUCTS
  // ═══════════════════════════════════════

  /** List products with pagination, search, and filters */
  list: tenantProcedure
    .input(listProductsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 10;
      const sortBy = input.sortBy ?? "name";
      const sortOrder = input.sortOrder ?? "asc";

      return ctx.withTenant(async (tx) => {
        const where: Prisma.ProductWhereInput = { deletedAt: null };

        if (input.active !== undefined) {
          where.active = input.active;
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { name: { contains: term, mode: "insensitive" } },
            { sku: { contains: term, mode: "insensitive" } },
            { barcode: { contains: term, mode: "insensitive" } },
          ];
        }

        if (input.lowStock) {
          where.minStock = { gt: 0 };
          where.currentStock = { lte: Prisma.DbNull } as unknown as Prisma.IntFilter;
          // We'll filter in JS since Prisma can't compare two columns directly
          delete where.currentStock;
        }

        const [data, total] = await Promise.all([
          tx.product.findMany({
            where,
            orderBy: { [sortBy]: sortOrder },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.product.count({ where }),
        ]);

        // Filter low stock in JS if needed (Prisma can't compare columns)
        const filtered = input.lowStock
          ? data.filter((p) => p.minStock > 0 && p.currentStock <= p.minStock)
          : data;

        return {
          data: filtered,
          total: input.lowStock ? filtered.length : total,
          pageCount: Math.ceil((input.lowStock ? filtered.length : total) / pageSize),
        };
      });
    }),

  /** Get product by ID with recent movements */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: input.id },
          include: {
            movements: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        });

        if (!product || product.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        return product;
      });
    }),

  /** Create product */
  create: tenantProcedure
    .input(createProductSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.product.create({
          data: {
            tenantId: ctx.tenantId,
            sku: input.sku || null,
            barcode: input.barcode || null,
            name: input.name,
            description: input.description || null,
            costPrice: new Prisma.Decimal(input.costPrice).div(100),
            salePrice: new Prisma.Decimal(input.salePrice).div(100),
            minStock: input.minStock ?? 0,
            unit: input.unit ?? "un",
            active: input.active ?? true,
          },
        });
      });
    }),

  /** Update product */
  update: tenantProcedure
    .input(updateProductSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.product.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        return tx.product.update({
          where: { id: input.id },
          data: {
            sku: input.sku || null,
            barcode: input.barcode || null,
            name: input.name,
            description: input.description || null,
            costPrice: new Prisma.Decimal(input.costPrice).div(100),
            salePrice: new Prisma.Decimal(input.salePrice).div(100),
            minStock: input.minStock ?? 0,
            unit: input.unit ?? "un",
            active: input.active ?? true,
          },
        });
      });
    }),

  /** Soft-delete product */
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.product.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        await tx.product.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // STOCK ADJUSTMENT (atomic)
  // ═══════════════════════════════════════

  /** Adjust stock atomically — creates a StockMovement and updates currentStock */
  adjustStock: tenantProcedure
    .input(adjustStockSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: input.productId } });
        if (!product || product.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        const newStock = product.currentStock + input.quantity;
        if (newStock < 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Estoque insuficiente. Atual: ${product.currentStock}, ajuste: ${input.quantity}`,
          });
        }

        // Atomic: update stock + create movement in same transaction
        const [updatedProduct] = await Promise.all([
          tx.product.update({
            where: { id: input.productId },
            data: {
              currentStock: { increment: input.quantity },
            },
          }),
          tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: input.productId,
              type: input.quantity > 0 ? "ENTRY" : "EXIT",
              quantity: Math.abs(input.quantity),
              reason: input.reason,
              userId: ctx.session.user.id,
            },
          }),
        ]);

        return updatedProduct;
      });
    }),

  // ═══════════════════════════════════════
  // STOCK MOVEMENTS
  // ═══════════════════════════════════════

  /** List stock movements with filters */
  listMovements: tenantProcedure
    .input(listMovementsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.StockMovementWhereInput = {};

        if (input.productId) {
          where.productId = input.productId;
        }

        if (input.type) {
          where.type = input.type;
        }

        if (input.dateFrom) {
          where.createdAt = {
            ...(where.createdAt as Prisma.DateTimeFilter ?? {}),
            gte: new Date(input.dateFrom),
          };
        }

        if (input.dateTo) {
          where.createdAt = {
            ...(where.createdAt as Prisma.DateTimeFilter ?? {}),
            lte: new Date(input.dateTo + "T23:59:59"),
          };
        }

        const [data, total] = await Promise.all([
          tx.stockMovement.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          }),
          tx.stockMovement.count({ where }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  // ═══════════════════════════════════════
  // DEVICE PURCHASES
  // ═══════════════════════════════════════

  /** List device purchases */
  listPurchases: tenantProcedure
    .input(listDevicePurchasesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 10;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.DevicePurchaseWhereInput = {};

        if (input.condition) {
          where.condition = input.condition;
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { imei: { contains: term, mode: "insensitive" } },
            { serial: { contains: term, mode: "insensitive" } },
            { brand: { contains: term, mode: "insensitive" } },
            { model: { contains: term, mode: "insensitive" } },
          ];
        }

        if (input.dateFrom) {
          where.createdAt = {
            ...(where.createdAt as Prisma.DateTimeFilter ?? {}),
            gte: new Date(input.dateFrom),
          };
        }

        if (input.dateTo) {
          where.createdAt = {
            ...(where.createdAt as Prisma.DateTimeFilter ?? {}),
            lte: new Date(input.dateTo + "T23:59:59"),
          };
        }

        const [data, total] = await Promise.all([
          tx.devicePurchase.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
            include: {
              product: { select: { id: true, name: true } },
            },
          }),
          tx.devicePurchase.count({ where }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Create device purchase — atomically adds stock entry */
  createPurchase: tenantProcedure
    .input(createDevicePurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId || null,
            customerId: input.customerId || null,
            imei: input.imei || null,
            serial: input.serial || null,
            brand: input.brand || null,
            model: input.model || null,
            condition: input.condition,
            batteryHealth: input.batteryHealth ?? null,
            purchasePrice: new Prisma.Decimal(input.purchasePrice).div(100),
            salePrice: input.salePrice != null ? new Prisma.Decimal(input.salePrice).div(100) : null,
            notes: input.notes || null,
          },
        });

        // If linked to a product, increment stock and create movement
        if (input.productId) {
          await Promise.all([
            tx.product.update({
              where: { id: input.productId },
              data: { currentStock: { increment: 1 } },
            }),
            tx.stockMovement.create({
              data: {
                tenantId: ctx.tenantId,
                productId: input.productId,
                type: "ENTRY",
                quantity: 1,
                unitCost: new Prisma.Decimal(input.purchasePrice).div(100),
                reason: `Compra de aparelho${input.imei ? ` — IMEI: ${input.imei}` : ""}`,
                referenceId: purchase.id,
                referenceType: "device_purchase",
                userId: ctx.session.user.id,
              },
            }),
          ]);
        }

        return purchase;
      });
    }),

  // ═══════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════

  /** Inventory report — stock summary by product */
  inventoryReport: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const products = await tx.product.findMany({
        where: { deletedAt: null, active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          currentStock: true,
          minStock: true,
          costPrice: true,
          salePrice: true,
          unit: true,
        },
      });

      const totalProducts = products.length;
      const totalItems = products.reduce((sum, p) => sum + p.currentStock, 0);
      const totalCostValue = products.reduce(
        (sum, p) => sum + p.currentStock * Number(p.costPrice),
        0,
      );
      const totalSaleValue = products.reduce(
        (sum, p) => sum + p.currentStock * Number(p.salePrice),
        0,
      );
      const lowStockCount = products.filter(
        (p) => p.minStock > 0 && p.currentStock <= p.minStock,
      ).length;
      const outOfStockCount = products.filter((p) => p.currentStock === 0).length;

      return {
        products,
        summary: {
          totalProducts,
          totalItems,
          totalCostValue,
          totalSaleValue,
          lowStockCount,
          outOfStockCount,
        },
      };
    });
  }),

  /** Low stock alerts */
  lowStockAlerts: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          deletedAt: null,
          active: true,
          minStock: { gt: 0 },
        },
        orderBy: { currentStock: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          currentStock: true,
          minStock: true,
        },
      });

      return products.filter((p) => p.currentStock <= p.minStock);
    });
  }),

  /** Stats for dashboard cards */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const [totalProducts, totalValue, lowStock] = await Promise.all([
        tx.product.count({ where: { deletedAt: null, active: true } }),
        tx.product.findMany({
          where: { deletedAt: null, active: true },
          select: { currentStock: true, salePrice: true },
        }),
        tx.product.findMany({
          where: { deletedAt: null, active: true, minStock: { gt: 0 } },
          select: { currentStock: true, minStock: true },
        }),
      ]);

      const totalItems = totalValue.reduce((sum, p) => sum + p.currentStock, 0);
      const saleValue = totalValue.reduce(
        (sum, p) => sum + p.currentStock * Number(p.salePrice),
        0,
      );
      const lowStockCount = lowStock.filter(
        (p) => p.currentStock <= p.minStock,
      ).length;

      return {
        totalProducts,
        totalItems,
        totalSaleValue: saleValue,
        lowStockCount,
      };
    });
  }),

  /** Search products for autocomplete (EntitySelector) */
  searchProducts: tenantProcedure
    .input(z.object({ search: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.product.findMany({
          where: {
            deletedAt: null,
            active: true,
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { sku: { contains: input.search, mode: "insensitive" } },
              { barcode: { contains: input.search, mode: "insensitive" } },
            ],
          },
          orderBy: { name: "asc" },
          take: 15,
          select: {
            id: true,
            name: true,
            sku: true,
            currentStock: true,
            salePrice: true,
          },
        });
      });
    }),

  // ═══════════════════════════════════════
  // SUPPLIERS (Fornecedores)
  // ═══════════════════════════════════════

  listSuppliers: tenantProcedure
    .input(listSuppliersSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.SupplierWhereInput = { deletedAt: null };

        if (input.active !== undefined) where.active = input.active;

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { name: { contains: term, mode: "insensitive" } },
            { tradeName: { contains: term, mode: "insensitive" } },
            { cpfCnpj: { contains: term, mode: "insensitive" } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.supplier.findMany({
            where,
            orderBy: { name: "asc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.supplier.count({ where }),
        ]);

        return { data, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getSupplier: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const supplier = await tx.supplier.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!supplier) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor nao encontrado" });
        }
        return supplier;
      });
    }),

  createSupplier: tenantProcedure
    .input(createSupplierSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.supplier.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            name: input.name,
            tradeName: input.tradeName || null,
            cpfCnpj: input.cpfCnpj || null,
            phone: input.phone || null,
            email: input.email || null,
            address: input.address ? (input.address as Prisma.InputJsonValue) : Prisma.JsonNull,
            notes: input.notes || null,
            active: input.active ?? true,
          },
        });
      });
    }),

  updateSupplier: tenantProcedure
    .input(updateSupplierSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.supplier.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor nao encontrado" });
        }
        return tx.supplier.update({
          where: { id: input.id },
          data: {
            type: input.type,
            name: input.name,
            tradeName: input.tradeName || null,
            cpfCnpj: input.cpfCnpj || null,
            phone: input.phone || null,
            email: input.email || null,
            address: input.address ? (input.address as Prisma.InputJsonValue) : Prisma.JsonNull,
            notes: input.notes || null,
            active: input.active ?? true,
          },
        });
      });
    }),

  deleteSupplier: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.supplier.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor nao encontrado" });
        }
        await tx.supplier.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  searchSuppliers: tenantProcedure
    .input(z.object({ search: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.supplier.findMany({
          where: {
            deletedAt: null,
            active: true,
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { tradeName: { contains: input.search, mode: "insensitive" } },
              { cpfCnpj: { contains: input.search, mode: "insensitive" } },
            ],
          },
          orderBy: { name: "asc" },
          take: 15,
          select: { id: true, name: true, tradeName: true, cpfCnpj: true },
        });
      });
    }),

  // ═══════════════════════════════════════
  // PRODUCT CATEGORIES
  // ═══════════════════════════════════════

  listCategories: tenantProcedure
    .input(listCategoriesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 50;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.ProductCategoryWhereInput = { deletedAt: null };

        if (input.search?.trim()) {
          where.name = { contains: input.search.trim(), mode: "insensitive" };
        }

        const [data, total] = await Promise.all([
          tx.productCategory.findMany({
            where,
            orderBy: { name: "asc" },
            skip: page * pageSize,
            take: pageSize,
            include: { _count: { select: { products: true } } },
          }),
          tx.productCategory.count({ where }),
        ]);

        return { data, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  createCategory: tenantProcedure
    .input(createCategorySchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.productCategory.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
          },
        });
      });
    }),

  updateCategory: tenantProcedure
    .input(updateCategorySchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.productCategory.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Categoria nao encontrada" });
        }
        return tx.productCategory.update({
          where: { id: input.id },
          data: { name: input.name },
        });
      });
    }),

  deleteCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.productCategory.findFirst({
          where: { id: input.id, deletedAt: null },
          include: { _count: { select: { products: true } } },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Categoria nao encontrada" });
        }
        if (existing._count.products > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Categoria possui ${existing._count.products} produto(s) vinculado(s)`,
          });
        }
        await tx.productCategory.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // STOCK ENTRY / EXIT (dedicated screens)
  // ═══════════════════════════════════════

  stockEntry: tenantProcedure
    .input(stockEntrySchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findFirst({
          where: { id: input.productId, deletedAt: null },
        });
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        await Promise.all([
          tx.product.update({
            where: { id: input.productId },
            data: { currentStock: { increment: input.quantity } },
          }),
          tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: input.productId,
              type: "ENTRY",
              quantity: input.quantity,
              unitCost: input.unitCost
                ? new Prisma.Decimal(input.unitCost).div(100)
                : null,
              reason: input.reason,
              referenceId: input.supplierId || null,
              referenceType: input.supplierId ? "supplier" : null,
              userId: ctx.session.user.id,
            },
          }),
        ]);

        return { success: true };
      });
    }),

  stockExit: tenantProcedure
    .input(stockExitSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findFirst({
          where: { id: input.productId, deletedAt: null },
        });
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        if (product.currentStock < input.quantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Estoque insuficiente. Atual: ${product.currentStock}`,
          });
        }

        await Promise.all([
          tx.product.update({
            where: { id: input.productId },
            data: { currentStock: { decrement: input.quantity } },
          }),
          tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: input.productId,
              type: "EXIT",
              quantity: input.quantity,
              reason: input.reason,
              userId: ctx.session.user.id,
            },
          }),
        ]);

        return { success: true };
      });
    }),

  /** Stock dashboard stats with alerts */
  stockDashboard: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const products = await tx.product.findMany({
        where: { deletedAt: null, active: true },
        select: {
          id: true,
          name: true,
          sku: true,
          currentStock: true,
          minStock: true,
          costPrice: true,
          salePrice: true,
        },
      });

      const totalProducts = products.length;
      const totalItems = products.reduce((s, p) => s + p.currentStock, 0);
      const totalCostValue = products.reduce(
        (s, p) => s + p.currentStock * Number(p.costPrice),
        0,
      );
      const totalSaleValue = products.reduce(
        (s, p) => s + p.currentStock * Number(p.salePrice),
        0,
      );
      const lowStockProducts = products.filter(
        (p) => p.minStock > 0 && p.currentStock <= p.minStock,
      );
      const outOfStockProducts = products.filter((p) => p.currentStock === 0);

      // Recent movements
      const recentMovements = await tx.stockMovement.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          product: { select: { id: true, name: true } },
        },
      });

      return {
        totalProducts,
        totalItems,
        totalCostValue: Math.round(totalCostValue * 100),
        totalSaleValue: Math.round(totalSaleValue * 100),
        lowStockProducts,
        outOfStockProducts,
        recentMovements,
      };
    });
  }),
});
