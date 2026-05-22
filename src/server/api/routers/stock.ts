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
  posicaoEstoqueSchema,
  movimentacoesReportSchema,
  curvaAbcSchema,
  estoqueMinSchema,
  vendasPeriodoSchema,
  vendasProdutoSchema,
  vendasVendedorSchema,
  upgradesSchema,
  csvImportSchema,
  reportDateRangeSchema,
  createAttributeSchema,
  updateAttributeSchema,
  listAttributesSchema,
  createAttributeValueSchema,
  updateAttributeValueSchema,
  createVariationSchema,
  updateVariationSchema,
  listVariationsSchema,
  createPhotoSchema,
  setPrimaryPhotoSchema,
  searchNcmSchema,
  lookupCnpjSchema,
  duplicateProductSchema,
} from "@/lib/validators/stock";
import { searchNcm, getNcmByCode } from "@/lib/integrations/brasilapi-ncm";
import { suggestNcm } from "@/lib/integrations/ncm-suggest";
import { lookupCnpj as lookupCnpjApi } from "@/lib/integrations/brasilapi-cnpj";
import {
  createDocumentWithLink,
  getDocumentStatus,
  formatWhatsApp,
} from "@/lib/services/autentique-service";
import { logger } from "@/lib/logger";
import {
  createStockItemBatchSchema,
  stockEntryQuantitySchema,
  stockWriteOffSchema,
  stockAdjustmentSchema,
  changeStockItemStatusSchema,
  listStockItemsSchema,
  searchImeiSchema,
  isValidTransition,
} from "@/lib/validators/stock-item";
import {
  entrySerializedItems,
  entryNonSerialized,
  exitNonSerialized,
  adjustInventory,
  changeItemStatus,
} from "@/server/services/stock-item.service";
import { getAvailableQuantity } from "@/server/services/product.service";
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
          // TODO: Estoque-B will handle stock tracking via StockItem
          // For now we can't filter by stock level at the DB level
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

        // TODO: Estoque-B will handle stock tracking via StockItem — stub currentStock as 0
        const withStock = data.map((p) => ({ ...p, currentStock: 0 }));
        const filtered = input.lowStock
          ? withStock.filter((p) => p.minStock > 0)
          : withStock;

        return {
          data: filtered,
          total: input.lowStock ? filtered.length : total,
          pageCount: Math.ceil((input.lowStock ? filtered.length : total) / pageSize),
        };
      });
    }),

  /** Get product by ID with relations */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: input.id },
          include: {
            category: true,
            categories: { include: { category: true } },
            photos: { orderBy: { order: "asc" } },
            variations: {
              where: { deletedAt: null },
              include: {
                attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
              },
            },
            attributeConfigs: { include: { attribute: true }, orderBy: { order: "asc" } },
            movements: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        });

        if (!product || product.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        // TODO: Estoque-B will handle stock tracking via StockItem — stub currentStock as 0
        return { ...product, currentStock: 0 };
      });
    }),

  /** Create product */
  create: tenantProcedure
    .input(createProductSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        // Cria categoria nova inline se solicitado (paridade Laravel nova_categoria)
        let inlineCategoryId: string | null = null;
        if (input.newCategoryName) {
          const existing = await tx.productCategory.findFirst({
            where: { name: { equals: input.newCategoryName, mode: "insensitive" }, deletedAt: null },
            select: { id: true },
          });
          if (existing) {
            inlineCategoryId = existing.id;
          } else {
            const created = await tx.productCategory.create({
              data: { tenantId: ctx.tenantId, name: input.newCategoryName },
              select: { id: true },
            });
            inlineCategoryId = created.id;
          }
        }
        const mergedCategoryIds = inlineCategoryId
          ? [inlineCategoryId, ...(input.categoryIds ?? []).filter((id) => id !== inlineCategoryId)]
          : input.categoryIds;
        const primaryCategoryId = mergedCategoryIds?.[0] || input.categoryId || inlineCategoryId || null;

        const product = await tx.product.create({
          data: {
            tenantId: ctx.tenantId,
            sku: input.sku || null,
            barcode: input.barcode || null,
            name: input.name,
            description: input.description || null,
            brand: input.brand || null,
            ncm: input.ncm || null,
            cest: input.cest || null,
            isSerialized: input.isSerialized ?? false,
            isPremium: input.isPremium ?? false,
            isDevice: input.isDevice ?? false,
            hasVariations: input.hasVariations ?? false,
            icmsDifferentialRate: input.icmsDifferentialRate != null
              ? new Prisma.Decimal(input.icmsDifferentialRate)
              : null,
            costPrice: new Prisma.Decimal(input.costPrice).div(100),
            salePrice: new Prisma.Decimal(input.salePrice).div(100),
            promotionalPrice: input.promotionalPrice != null
              ? new Prisma.Decimal(input.promotionalPrice).div(100)
              : null,
            defaultMargin: input.defaultMargin != null
              ? new Prisma.Decimal(input.defaultMargin)
              : null,
            minStock: input.minStock ?? 0,
            unit: input.unit ?? "un",
            active: input.active ?? true,
            categoryId: primaryCategoryId,
          },
        });

        // Create category pivots (inclui categoria inline criada acima)
        if (mergedCategoryIds && mergedCategoryIds.length > 0) {
          await tx.productCategoryPivot.createMany({
            data: mergedCategoryIds.map((catId, idx) => ({
              tenantId: ctx.tenantId,
              productId: product.id,
              categoryId: catId,
              isPrimary: idx === 0,
            })),
          });
        }

        // Photos — URLs ja uploaded via presigned MinIO. Paridade Laravel
        // ProdutoController::store linhas 199-221.
        if (input.photos && input.photos.length > 0) {
          await tx.productPhoto.createMany({
            data: input.photos.map((p, idx) => ({
              tenantId: ctx.tenantId,
              productId: product.id,
              url: p.url,
              thumbUrl: p.thumbUrl ?? null,
              mediumUrl: p.mediumUrl ?? null,
              order: p.order ?? idx,
              isPrimary: p.isPrimary ?? idx === 0,
            })),
          });
        }

        // ProductAttributeConfig — quais atributos este produto usa
        // (ex: produto X tem cor + capacidade).
        if (input.attributeConfigIds && input.attributeConfigIds.length > 0) {
          await tx.productAttributeConfig.createMany({
            data: input.attributeConfigIds.map((attrId, idx) => ({
              productId: product.id,
              attributeId: attrId,
              order: idx,
            })),
          });
        }

        // Variations — cada variacao tem N valores de atributo (ex: "Azul" + "128GB")
        if (input.variations && input.variations.length > 0) {
          for (const v of input.variations) {
            const variation = await tx.productVariation.create({
              data: {
                tenantId: ctx.tenantId,
                productId: product.id,
                sku: v.sku || null,
                barcode: v.barcode || null,
                costPrice: v.costPrice != null ? new Prisma.Decimal(v.costPrice).div(100) : null,
                salePrice: v.salePrice != null ? new Prisma.Decimal(v.salePrice).div(100) : null,
                promotionalPrice: v.promotionalPrice != null
                  ? new Prisma.Decimal(v.promotionalPrice).div(100)
                  : null,
                minStock: v.minStock ?? 0,
                imageUrl: v.imageUrl ?? null,
                active: v.active ?? true,
              },
            });
            await tx.productVariationAttribute.createMany({
              data: v.attributeValueIds.map((avId) => ({
                variationId: variation.id,
                attributeValueId: avId,
              })),
            });
          }
        }

        return product;
      });
    }),

  /** Update product */
  update: tenantProcedure
    .input(updateProductSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const existing = await tx.product.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        const primaryCategoryId = input.categoryIds?.[0] || input.categoryId || existing.categoryId;

        const product = await tx.product.update({
          where: { id: input.id },
          data: {
            sku: input.sku || null,
            barcode: input.barcode || null,
            name: input.name,
            description: input.description || null,
            brand: input.brand || null,
            ncm: input.ncm || null,
            cest: input.cest || null,
            isSerialized: input.isSerialized ?? false,
            isPremium: input.isPremium ?? false,
            isDevice: input.isDevice ?? false,
            hasVariations: input.hasVariations ?? false,
            icmsDifferentialRate: input.icmsDifferentialRate != null
              ? new Prisma.Decimal(input.icmsDifferentialRate)
              : null,
            costPrice: new Prisma.Decimal(input.costPrice).div(100),
            salePrice: new Prisma.Decimal(input.salePrice).div(100),
            promotionalPrice: input.promotionalPrice != null
              ? new Prisma.Decimal(input.promotionalPrice).div(100)
              : null,
            defaultMargin: input.defaultMargin != null
              ? new Prisma.Decimal(input.defaultMargin)
              : null,
            minStock: input.minStock ?? 0,
            unit: input.unit ?? "un",
            active: input.active ?? true,
            categoryId: primaryCategoryId,
          },
        });

        // Sync category pivots if provided
        if (input.categoryIds) {
          await tx.productCategoryPivot.deleteMany({ where: { productId: input.id } });
          if (input.categoryIds.length > 0) {
            await tx.productCategoryPivot.createMany({
              data: input.categoryIds.map((catId, idx) => ({
                tenantId: ctx.tenantId,
                productId: input.id,
                categoryId: catId,
                isPrimary: idx === 0,
              })),
            });
          }
        }

        // Sync photos: se `photos` for fornecido (array), substitui o set.
        // Se nao for fornecido, preserva (uso normal eh re-enviar a lista
        // completa toda vez que abrir o form).
        if (input.photos !== undefined) {
          await tx.productPhoto.deleteMany({ where: { productId: input.id } });
          if (input.photos.length > 0) {
            await tx.productPhoto.createMany({
              data: input.photos.map((p, idx) => ({
                tenantId: ctx.tenantId,
                productId: input.id,
                url: p.url,
                thumbUrl: p.thumbUrl ?? null,
                mediumUrl: p.mediumUrl ?? null,
                order: p.order ?? idx,
                isPrimary: p.isPrimary ?? idx === 0,
              })),
            });
          }
        }

        // Sync attribute configs
        if (input.attributeConfigIds !== undefined) {
          await tx.productAttributeConfig.deleteMany({ where: { productId: input.id } });
          if (input.attributeConfigIds.length > 0) {
            await tx.productAttributeConfig.createMany({
              data: input.attributeConfigIds.map((attrId, idx) => ({
                productId: input.id,
                attributeId: attrId,
                order: idx,
              })),
            });
          }
        }

        // Sync variations: estrategia delete-all + recreate. Cascade limpa
        // ProductVariationAttribute. NAO mexer em StockItem (cascade aborta
        // se tem stock vinculado — proteção desejada).
        if (input.variations !== undefined) {
          const existingVars = await tx.productVariation.findMany({
            where: { productId: input.id },
            select: { id: true, stockItems: { select: { id: true }, take: 1 } },
          });
          const varsWithStock = existingVars.filter((v) => v.stockItems.length > 0);
          if (varsWithStock.length > 0 && input.variations.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Nao e possivel remover variacoes que ja tem itens no estoque.",
            });
          }
          // Soft delete das variacoes sem stock
          const safeIds = existingVars.filter((v) => v.stockItems.length === 0).map((v) => v.id);
          if (safeIds.length > 0) {
            await tx.productVariation.deleteMany({ where: { id: { in: safeIds } } });
          }
          for (const v of input.variations) {
            const variation = await tx.productVariation.create({
              data: {
                tenantId: ctx.tenantId,
                productId: input.id,
                sku: v.sku || null,
                barcode: v.barcode || null,
                costPrice: v.costPrice != null ? new Prisma.Decimal(v.costPrice).div(100) : null,
                salePrice: v.salePrice != null ? new Prisma.Decimal(v.salePrice).div(100) : null,
                promotionalPrice: v.promotionalPrice != null
                  ? new Prisma.Decimal(v.promotionalPrice).div(100)
                  : null,
                minStock: v.minStock ?? 0,
                imageUrl: v.imageUrl ?? null,
                active: v.active ?? true,
              },
            });
            await tx.productVariationAttribute.createMany({
              data: v.attributeValueIds.map((avId) => ({
                variationId: variation.id,
                attributeValueId: avId,
              })),
            });
          }
        }

        return product;
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

  /** Adjust stock atomically — creates a StockMovement */
  adjustStock: tenantProcedure
    .input(adjustStockSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: input.productId } });
        if (!product || product.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        // TODO: Estoque-B will handle stock tracking via StockItem
        // For now, just create the movement record
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            type: input.quantity > 0 ? "ENTRY" : "EXIT",
            quantity: Math.abs(input.quantity),
            reason: input.reason,
            userId: ctx.session.user.id,
          },
        });

        return product;
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

  /** Create device purchase — atomically adds stock entry and optionally a PAYABLE */
  createPurchase: tenantProcedure
    .input(createDevicePurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId || null,
            customerId: input.customerId || null,
            supplierId: input.supplierId || null,
            sellerType: input.sellerType ?? (input.supplierId ? "supplier" : "customer"),
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

        // If linked to a product, create movement record
        // TODO: Estoque-B will handle stock tracking via StockItem
        if (input.productId) {
          await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: input.productId,
              type: "ENTRY",
              quantity: 1,
              reason: `Compra de aparelho${input.imei ? ` — IMEI: ${input.imei}` : ""}`,
              referenceId: purchase.id,
              referenceType: "device_purchase",
              userId: ctx.session.user.id,
            },
          });
        }

        // Gera PAYABLE quando solicitado
        if (input.generatePayable && input.purchasePrice > 0) {
          let sellerName = "Fornecedor não identificado";
          if (input.supplierId) {
            const sup = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { name: true } });
            sellerName = sup?.name ?? sellerName;
          } else if (input.customerId) {
            const cust = await tx.customer.findUnique({ where: { id: input.customerId }, select: { name: true } });
            sellerName = cust?.name ?? sellerName;
          }
          const installmentsCount = input.payableInstallments ?? 1;
          const firstDate = input.payableFirstDueDate ? new Date(input.payableFirstDueDate) : new Date();
          const totalCents = input.purchasePrice;
          const installmentAmount = Math.round(totalCents / installmentsCount);
          const remainder = totalCents - installmentAmount * installmentsCount;
          const descModel = [input.brand, input.model].filter(Boolean).join(" ");
          const description = `Compra ${descModel || "aparelho"}${input.imei ? ` — IMEI ${input.imei}` : ""}`;

          const transaction = await tx.financialTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              type: "PAYABLE",
              status: "PENDING",
              description,
              supplierId: input.supplierId ?? undefined,
              supplier: sellerName,
              customerId: input.customerId ?? undefined,
              totalAmount: new Prisma.Decimal(totalCents).div(100),
              paidAmount: new Prisma.Decimal(0),
              installmentsTotal: installmentsCount,
              dueDate: firstDate,
              emissionDate: new Date(),
              referenceType: "device_purchase",
              referenceId: purchase.id,
              createdByUserId: ctx.session.user.id,
            },
          });

          const installments = Array.from({ length: installmentsCount }, (_, i) => {
            const dueDate = new Date(firstDate);
            dueDate.setMonth(dueDate.getMonth() + i);
            const amountCents = i === installmentsCount - 1 ? installmentAmount + remainder : installmentAmount;
            return {
              tenantId: ctx.tenantId,
              transactionId: transaction.id,
              number: i + 1,
              amount: new Prisma.Decimal(amountCents).div(100),
              paidAmount: new Prisma.Decimal(0),
              dueDate,
              status: "PENDING" as const,
            };
          });
          await tx.installment.createMany({ data: installments });
        }

        return purchase;
      });
    }),

  /** Get device purchase by ID */
  getPurchaseById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.findUnique({
          where: { id: input.id },
        });
        if (!purchase) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...purchase,
          purchasePrice: Math.round(Number(purchase.purchasePrice) * 100),
          salePrice: purchase.salePrice ? Math.round(Number(purchase.salePrice) * 100) : null,
        };
      });
    }),

  /** Cancel device purchase (faithful to Laravel cancelar) */
  cancelPurchase: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      reason: z.string().min(3).max(300),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.findUnique({ where: { id: input.id } });
        if (!purchase) throw new TRPCError({ code: "NOT_FOUND" });

        if (purchase.cancelledAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Compra ja cancelada" });
        }

        await tx.devicePurchase.update({
          where: { id: input.id },
          data: {
            cancelledAt: new Date(),
            cancellationReason: input.reason,
          },
        });

        // Reverse stock movement if exists
        if (purchase.productId) {
          await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: purchase.productId,
              type: "EXIT",
              quantity: 1,
              reason: `Cancelamento compra — ${input.reason}`,
              referenceId: purchase.id,
              referenceType: "device_purchase_cancel",
              userId: ctx.session.user.id,
            },
          });
        }

        // Cancel related PAYABLE if any (and pending installments)
        const relatedPayables = await tx.financialTransaction.findMany({
          where: {
            tenantId: ctx.tenantId,
            type: "PAYABLE",
            referenceType: "device_purchase",
            referenceId: purchase.id,
            status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
          },
          select: { id: true },
        });
        if (relatedPayables.length > 0) {
          const ids = relatedPayables.map((p) => p.id);
          await tx.financialTransaction.updateMany({
            where: { id: { in: ids } },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              cancelledByUserId: ctx.session.user.id,
              cancelReason: `Compra cancelada — ${input.reason}`,
            },
          });
          await tx.installment.updateMany({
            where: { transactionId: { in: ids }, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
            data: { status: "CANCELLED" },
          });
        }

        return { success: true };
      });
    }),

  /** Update device purchase date */
  updatePurchaseDate: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      purchaseDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.devicePurchase.update({
          where: { id: input.id },
          data: { purchaseDate: new Date(input.purchaseDate) },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // PURCHASE TERM SIGNATURE (paridade Laravel)
  // ═══════════════════════════════════════

  /**
   * Confirma assinatura fisica do termo de responsabilidade da compra.
   * Apenas admin. Paridade `CompraAparelhoController::confirmarAssinaturaFisica`.
   */
  confirmPurchasePhysicalSignature: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.isSuperAdmin === true;
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem confirmar assinatura fisica.",
        });
      }
      return ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.findUnique({
          where: { id: input.id },
        });
        if (!purchase) throw new TRPCError({ code: "NOT_FOUND" });
        if (purchase.termSigned) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo ja foi assinado." });
        }
        await tx.devicePurchase.update({
          where: { id: input.id },
          data: {
            termSigned: true,
            termSignedAt: new Date(),
            termSignedVia: "physical",
            termSignedByUserId: ctx.session.user.id,
          },
        });
        return { success: true };
      });
    }),

  /**
   * Envia termo de responsabilidade para Autentique via WhatsApp.
   * Paridade `CompraAparelhoController::enviarTermoAutentique`.
   */
  sendPurchaseTermAutentique: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch dados em tx curta
      const { sellerName, sellerPhone } = await ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.findUnique({ where: { id: input.id } });
        if (!purchase) throw new TRPCError({ code: "NOT_FOUND" });
        if (purchase.termSigned) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo ja foi assinado." });
        }
        if (purchase.autentiqueDocumentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo ja foi enviado para Autentique." });
        }
        let sellerName = "";
        let sellerPhone: string | null = null;
        if (purchase.sellerType === "customer" && purchase.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: purchase.customerId },
            select: { name: true, phone: true },
          });
          if (customer) { sellerName = customer.name; sellerPhone = customer.phone; }
        } else if (purchase.sellerType === "supplier" && purchase.supplierId) {
          const supplier = await tx.supplier.findUnique({
            where: { id: purchase.supplierId },
            select: { name: true, phone: true },
          });
          if (supplier) { sellerName = supplier.name; sellerPhone = supplier.phone; }
        }
        if (!sellerPhone) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vendedor sem telefone cadastrado para envio via Autentique.",
          });
        }
        return { sellerName, sellerPhone };
      });

      // ETAPA 2 — IO externo (PDF fetch + Autentique) FORA da tx
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const pdfUrl = `${baseUrl}/api/purchases/${input.id}/termo-responsabilidade`;
      let pdfBuffer: Buffer;
      try {
        const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`PDF generation failed: ${res.status}`);
        pdfBuffer = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        logger.error("Failed to fetch purchase term PDF", { purchaseId: input.id, error: err });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Falha ao gerar PDF do termo para assinatura.",
        });
      }

      const result = await createDocumentWithLink(
        `Termo de Responsabilidade - Compra ${input.id.slice(0, 8)}`,
        [{ name: sellerName, whatsapp: formatWhatsApp(sellerPhone) }],
        pdfBuffer,
      );
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Erro ao enviar para Autentique",
        });
      }

      // ETAPA 3 — persiste em tx curta
      await ctx.withTenant(async (tx) => {
        await tx.devicePurchase.update({
          where: { id: input.id },
          data: {
            autentiqueDocumentId: result.documentId ?? null,
            autentiqueLink: result.signatureLink ?? null,
            autentiqueSentAt: new Date(),
          },
        });
      });

      logger.info("Purchase term sent to Autentique", {
        purchaseId: input.id,
        documentId: result.documentId,
      });
      return { success: true, signatureLink: result.signatureLink };
    }),

  /**
   * Consulta status do termo no Autentique e atualiza `termSigned` se assinado.
   * Paridade `CompraAparelhoController::verificarAssinaturaCompra`.
   */
  checkPurchaseSignatureStatus: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch tx curta
      const purchase = await ctx.withTenant(async (tx) =>
        tx.devicePurchase.findUnique({ where: { id: input.id } }),
      );
      if (!purchase) throw new TRPCError({ code: "NOT_FOUND" });
      if (!purchase.autentiqueDocumentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum documento enviado para Autentique." });
      }
      if (purchase.termSigned) return { signed: true, status: "already_signed" };

      // ETAPA 2 — Autentique HTTP fora da tx
      const status = await getDocumentStatus(purchase.autentiqueDocumentId);
      if (!status.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: status.error ?? "Erro ao consultar Autentique",
        });
      }

      // ETAPA 3 — persiste se assinado
      if (status.signed) {
        await ctx.withTenant(async (tx) => {
          await tx.devicePurchase.update({
            where: { id: input.id },
            data: {
              termSigned: true,
              termSignedAt: new Date(),
              termSignedVia: "autentique",
            },
          });
        });
        return { signed: true, status: "signed" };
      }

      return { signed: false, status: "pending" };
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
          minStock: true,
          costPrice: true,
          salePrice: true,
          unit: true,
        },
      });

      // TODO: Estoque-B will handle stock tracking via StockItem — stub currentStock as 0
      const productsWithStock = products.map((p) => ({ ...p, currentStock: 0 }));

      const totalProducts = productsWithStock.length;
      const totalItems = 0;
      const totalCostValue = 0;
      const totalSaleValue = 0;
      const lowStockCount = productsWithStock.filter(
        (p) => p.minStock > 0,
      ).length;
      const outOfStockCount = productsWithStock.length;

      return {
        products: productsWithStock,
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
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          minStock: true,
        },
      });

      // TODO: Estoque-B will handle stock tracking via StockItem — stub currentStock as 0
      return products.map((p) => ({ ...p, currentStock: 0 }));
    });
  }),

  /** Stats for dashboard cards */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const [totalProducts, lowStock] = await Promise.all([
        tx.product.count({ where: { deletedAt: null, active: true } }),
        tx.product.count({
          where: { deletedAt: null, active: true, minStock: { gt: 0 } },
        }),
      ]);

      // TODO: Estoque-B will handle stock tracking via StockItem — stub values as 0
      return {
        totalProducts,
        totalItems: 0,
        totalSaleValue: 0,
        lowStockCount: lowStock,
      };
    });
  }),

  /** Search products for autocomplete (EntitySelector) */
  searchProducts: tenantProcedure
    .input(z.object({ search: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const products = await tx.product.findMany({
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
            salePrice: true,
          },
        });
        // TODO: Estoque-B will handle stock tracking via StockItem — stub currentStock as 0
        return products.map((p) => ({ ...p, currentStock: 0 }));
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
            { cpf: { contains: term, mode: "insensitive" } },
            { cnpj: { contains: term, mode: "insensitive" } },
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
            cpf: input.cpf || null,
            cnpj: input.cnpj || null,
            phone: input.phone || null,
            email: input.email || null,
            zipCode: input.zipCode || null,
            street: input.street || null,
            streetNumber: input.streetNumber || null,
            complement: input.complement || null,
            neighborhood: input.neighborhood || null,
            city: input.city || null,
            state: input.state || null,
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
            cpf: input.cpf || null,
            cnpj: input.cnpj || null,
            phone: input.phone || null,
            email: input.email || null,
            zipCode: input.zipCode || null,
            street: input.street || null,
            streetNumber: input.streetNumber || null,
            complement: input.complement || null,
            neighborhood: input.neighborhood || null,
            city: input.city || null,
            state: input.state || null,
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

  /**
   * Checa duplicidade de CPF/CNPJ no fornecedor (paridade Cliente).
   * Usado pela UI do form para alerta inline antes de salvar.
   */
  checkSupplierDuplicate: tenantProcedure
    .input(z.object({ cpf: z.string().optional(), cnpj: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const cpf = input.cpf ? input.cpf.replace(/\D/g, "") : null;
        const cnpj = input.cnpj ? input.cnpj.replace(/\D/g, "") : null;
        if (cpf && cpf.length !== 11) return { duplicate: false as const };
        if (cnpj && cnpj.length !== 14) return { duplicate: false as const };
        if (!cpf && !cnpj) return { duplicate: false as const };

        const existing = await tx.supplier.findFirst({
          where: {
            deletedAt: null,
            ...(cpf ? { cpf } : {}),
            ...(cnpj ? { cnpj } : {}),
          },
          select: { id: true, name: true },
        });

        if (!existing) return { duplicate: false as const };
        return { duplicate: true as const, supplier: existing };
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
              { cpf: { contains: input.search, mode: "insensitive" } },
              { cnpj: { contains: input.search, mode: "insensitive" } },
            ],
          },
          orderBy: { name: "asc" },
          take: 15,
          select: { id: true, name: true, tradeName: true, cpf: true, cnpj: true },
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

        // TODO: Estoque-B will handle stock tracking via StockItem
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            type: "ENTRY",
            quantity: input.quantity,
            reason: input.reason,
            referenceId: input.supplierId || null,
            referenceType: input.supplierId ? "supplier" : null,
            userId: ctx.session.user.id,
          },
        });

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

        // TODO: Estoque-B will handle stock validation via StockItem
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            type: "EXIT",
            quantity: input.quantity,
            reason: input.reason,
            userId: ctx.session.user.id,
          },
        });

        return { success: true };
      });
    }),

  /** Stock dashboard stats with alerts (enhanced) */
  stockDashboard: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const products = await tx.product.findMany({
        where: { deletedAt: null, active: true },
        select: {
          id: true,
          name: true,
          sku: true,
          minStock: true,
          costPrice: true,
          salePrice: true,
        },
      });

      // Agrega contagem por produto via StockItem (status = AVAILABLE).
      // Paridade Laravel: dashboard mostra valor real do estoque disponivel.
      const stockByProduct = await tx.stockItem.groupBy({
        by: ["productId"],
        where: { status: "AVAILABLE", deletedAt: null },
        _count: { _all: true },
        _sum: { costPrice: true },
      });
      const stockMap = new Map(
        stockByProduct.map((s) => [
          s.productId,
          { qty: s._count._all, cost: Number(s._sum.costPrice ?? 0) },
        ]),
      );

      const productsWithStock = products.map((p) => {
        const s = stockMap.get(p.id);
        return { ...p, currentStock: s?.qty ?? 0 };
      });

      const totalProducts = productsWithStock.length;
      const totalItems = Array.from(stockMap.values()).reduce((s, x) => s + x.qty, 0);
      const totalCostValue = Array.from(stockMap.values()).reduce((s, x) => s + x.cost, 0);
      const totalSaleValue = productsWithStock.reduce(
        (s, p) => s + (stockMap.get(p.id)?.qty ?? 0) * Number(p.salePrice),
        0,
      );
      const lowStockProducts = productsWithStock.filter(
        (p) => p.minStock > 0 && p.currentStock <= p.minStock,
      );
      const outOfStockProducts = productsWithStock.filter((p) => p.currentStock === 0);

      // Recent movements
      const recentMovements = await tx.stockMovement.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          product: { select: { id: true, name: true } },
        },
      });

      // Today stats
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [entriesToday, salesToday, saleItemsToday] = await Promise.all([
        tx.stockMovement.aggregate({
          where: { type: "ENTRY", createdAt: { gte: todayStart, lte: todayEnd } },
          _sum: { quantity: true },
        }),
        tx.sale.findMany({
          where: {
            status: "COMPLETED",
            saleDate: { gte: todayStart, lte: todayEnd },
          },
          select: { totalAmount: true },
        }),
        tx.saleItem.findMany({
          where: {
            sale: { status: "COMPLETED", saleDate: { gte: todayStart, lte: todayEnd } },
          },
          select: { total: true, costPrice: true, quantity: true },
        }),
      ]);

      const vendasHojeQtd = salesToday.length;
      const vendasHojeValor = salesToday.reduce((s, v) => s + Number(v.totalAmount), 0);
      const ticketMedio = vendasHojeQtd > 0 ? vendasHojeValor / vendasHojeQtd : 0;

      // Lucro bruto hoje = soma(total - custo*qtd) dos sale_items.
      // Paridade Laravel `dashboard.lucroHoje` (FinanceiroService).
      const lucroHoje = saleItemsToday.reduce(
        (s, it) => s + (Number(it.total) - Number(it.costPrice) * it.quantity),
        0,
      );

      // Top 5 products this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekSales = await tx.saleItem.findMany({
        where: {
          sale: { status: "COMPLETED", saleDate: { gte: weekStart } },
        },
        select: {
          productId: true,
          description: true,
          quantity: true,
          total: true,
        },
      });

      const topProductsMap = new Map<string, { name: string; qty: number; total: number }>();
      for (const item of weekSales) {
        const existing = topProductsMap.get(item.productId);
        if (existing) {
          existing.qty += item.quantity;
          existing.total += Number(item.total);
        } else {
          topProductsMap.set(item.productId, {
            name: item.description,
            qty: item.quantity,
            total: Number(item.total),
          });
        }
      }
      const topProducts = Array.from(topProductsMap.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      return {
        totalProducts,
        totalItems,
        totalCostValue: Math.round(totalCostValue * 100),
        totalSaleValue: Math.round(totalSaleValue * 100),
        lucroHoje: Math.round(lucroHoje * 100),
        lowStockProducts,
        outOfStockProducts,
        recentMovements,
        entriesToday: entriesToday._sum.quantity ?? 0,
        vendasHojeQtd,
        vendasHojeValor: Math.round(vendasHojeValor * 100),
        ticketMedio: Math.round(ticketMedio * 100),
        topProducts,
      };
    });
  }),

  // ═══════════════════════════════════════
  // REPORTS (8 types like Laravel)
  // ═══════════════════════════════════════

  /** 1. Posicao de Estoque */
  reportPosicao: tenantProcedure
    .input(posicaoEstoqueSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ProductWhereInput = { deletedAt: null, active: true };

        if (input.categoryId) {
          where.categoryId = input.categoryId;
        }

        const products = await tx.product.findMany({
          where,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            sku: true,
            minStock: true,
            costPrice: true,
            salePrice: true,
            unit: true,
            category: { select: { name: true } },
          },
        });

        // TODO: Estoque-B will handle stock tracking via StockItem — stub currentStock as 0
        const productsWithStock = products.map((p) => ({ ...p, currentStock: 0 }));

        const filtered = input.onlyWithStock
          ? productsWithStock.filter((p) => p.currentStock > 0)
          : productsWithStock;

        const totalQtd = filtered.reduce((s, p) => s + p.currentStock, 0);
        const totalValor = filtered.reduce(
          (s, p) => s + p.currentStock * Number(p.salePrice),
          0,
        );

        return {
          products: filtered,
          totals: { quantity: totalQtd, value: Math.round(totalValor * 100) },
        };
      });
    }),

  /** 2. Movimentacoes por periodo */
  reportMovimentacoes: tenantProcedure
    .input(movimentacoesReportSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.StockMovementWhereInput = {};
        if (input.type) where.type = input.type;
        if (input.productId) where.productId = input.productId;
        if (input.dateFrom || input.dateTo) {
          where.createdAt = {};
          if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
          if (input.dateTo) where.createdAt.lte = new Date(input.dateTo + "T23:59:59");
        }

        const movements = await tx.stockMovement.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 500,
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        });

        const entries = movements
          .filter((m) => m.type === "ENTRY")
          .reduce((s, m) => s + m.quantity, 0);
        const exits = movements
          .filter((m) => m.type === "EXIT")
          .reduce((s, m) => s + m.quantity, 0);

        return { movements, totals: { entries, exits } };
      });
    }),

  /** 3. Curva ABC */
  reportCurvaAbc: tenantProcedure
    .input(curvaAbcSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = input.dateFrom
          ? new Date(input.dateFrom)
          : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const dateTo = input.dateTo
          ? new Date(input.dateTo + "T23:59:59")
          : new Date();

        // Get sale items from completed sales in period
        const saleItemsWhere: Prisma.SaleItemWhereInput = {
          sale: {
            status: "COMPLETED",
            saleDate: { gte: dateFrom, lte: dateTo },
          },
        };

        const saleItems = await tx.saleItem.findMany({
          where: saleItemsWhere,
          select: {
            productId: true,
            description: true,
            quantity: true,
            total: true,
          },
        });

        // Aggregate by product
        const productMap = new Map<
          string,
          { id: string; name: string; quantity: number; total: number }
        >();

        for (const item of saleItems) {
          const existing = productMap.get(item.productId);
          if (existing) {
            existing.quantity += item.quantity;
            existing.total += Number(item.total);
          } else {
            productMap.set(item.productId, {
              id: item.productId,
              name: item.description,
              quantity: item.quantity,
              total: Number(item.total),
            });
          }
        }

        // If category filter, filter products
        let productsList = Array.from(productMap.values());
        if (input.categoryId) {
          const productsInCat = await tx.product.findMany({
            where: { categoryId: input.categoryId, deletedAt: null },
            select: { id: true },
          });
          const catIds = new Set(productsInCat.map((p) => p.id));
          productsList = productsList.filter((p) => catIds.has(p.id));
        }

        // Sort by total desc
        productsList.sort((a, b) => b.total - a.total);

        const totalGeral = productsList.reduce((s, p) => s + p.total, 0);

        if (totalGeral <= 0) {
          return {
            products: [],
            totals: { A: 0, B: 0, C: 0 },
            counts: { A: 0, B: 0, C: 0 },
            totalGeral: 0,
          };
        }

        let acumulado = 0;
        const classified = productsList.map((p) => {
          const pct = (p.total / totalGeral) * 100;
          acumulado += pct;
          const classe = acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C";
          return {
            ...p,
            total: Math.round(p.total * 100),
            percentual: Math.round(pct * 100) / 100,
            percentualAcumulado: Math.round(acumulado * 100) / 100,
            classe,
          };
        });

        const totals = { A: 0, B: 0, C: 0 };
        const counts = { A: 0, B: 0, C: 0 };
        for (const p of classified) {
          const c = p.classe as "A" | "B" | "C";
          totals[c] += p.total;
          counts[c]++;
        }

        return {
          products: classified,
          totals,
          counts,
          totalGeral: Math.round(totalGeral * 100),
        };
      });
    }),

  /** 4. Estoque minimo */
  reportEstoqueMin: tenantProcedure
    .input(estoqueMinSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ProductWhereInput = {
          deletedAt: null,
          active: true,
          minStock: { gt: 0 },
        };

        if (input.categoryId) where.categoryId = input.categoryId;

        const products = await tx.product.findMany({
          where,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            sku: true,
            minStock: true,
            category: { select: { name: true } },
          },
        });

        // TODO: Estoque-B will handle stock tracking via StockItem — stub currentStock as 0
        const withStatus = products.map((p) => ({
          ...p,
          currentStock: 0,
          diff: 0 - p.minStock,
          status: 0 < p.minStock ? ("below" as const) : ("ok" as const),
        }));

        const filtered =
          input.onlyBelowMin !== false
            ? withStatus.filter((p) => p.status === "below")
            : withStatus;

        const belowCount = withStatus.filter((p) => p.status === "below").length;
        const okCount = withStatus.filter((p) => p.status === "ok").length;

        return {
          products: filtered,
          totals: { total: withStatus.length, below: belowCount, ok: okCount },
        };
      });
    }),

  /** 5. Vendas por periodo */
  reportVendasPeriodo: tenantProcedure
    .input(vendasPeriodoSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = input.dateFrom
          ? new Date(input.dateFrom)
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const dateTo = input.dateTo
          ? new Date(input.dateTo + "T23:59:59")
          : new Date();

        const where: Prisma.SaleWhereInput = {
          status: "COMPLETED",
          saleDate: { gte: dateFrom, lte: dateTo },
        };

        if (input.sellerId) where.sellerId = input.sellerId;

        const sales = await tx.sale.findMany({
          where,
          orderBy: { saleDate: "desc" },
          select: {
            id: true,
            number: true,
            saleDate: true,
            totalAmount: true,
            discountAmount: true,
            sellerId: true,
            customerId: true,
            paymentDetails: true,
            items: {
              select: {
                costPrice: true,
                quantity: true,
              },
            },
          },
        });

        let totalVendido = 0;
        let totalDesconto = 0;
        let totalCusto = 0;

        const salesData = sales.map((s) => {
          const valor = Number(s.totalAmount);
          const desconto = Number(s.discountAmount);
          const custo = s.items.reduce(
            (sum, i) => sum + Number(i.costPrice) * i.quantity,
            0,
          );
          totalVendido += valor;
          totalDesconto += desconto;
          totalCusto += custo;

          return {
            id: s.id,
            number: s.number,
            saleDate: s.saleDate,
            totalAmount: Math.round(valor * 100),
            discountAmount: Math.round(desconto * 100),
            costTotal: Math.round(custo * 100),
            profit: Math.round((valor - custo) * 100),
            sellerId: s.sellerId,
            customerId: s.customerId,
          };
        });

        const qtd = salesData.length;
        return {
          sales: salesData,
          totals: {
            quantity: qtd,
            totalVendido: Math.round(totalVendido * 100),
            totalDesconto: Math.round(totalDesconto * 100),
            lucroBruto: Math.round((totalVendido - totalCusto) * 100),
            ticketMedio: qtd > 0 ? Math.round((totalVendido / qtd) * 100) : 0,
          },
        };
      });
    }),

  /** 6. Vendas por produto */
  reportVendasProduto: tenantProcedure
    .input(vendasProdutoSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = input.dateFrom
          ? new Date(input.dateFrom)
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const dateTo = input.dateTo
          ? new Date(input.dateTo + "T23:59:59")
          : new Date();

        const saleItems = await tx.saleItem.findMany({
          where: {
            sale: {
              status: "COMPLETED",
              saleDate: { gte: dateFrom, lte: dateTo },
            },
          },
          select: {
            productId: true,
            description: true,
            quantity: true,
            total: true,
            costPrice: true,
            saleId: true,
          },
        });

        // Aggregate
        const map = new Map<
          string,
          {
            id: string;
            name: string;
            qty: number;
            total: number;
            cost: number;
            salesSet: Set<string>;
          }
        >();

        for (const item of saleItems) {
          const existing = map.get(item.productId);
          if (existing) {
            existing.qty += item.quantity;
            existing.total += Number(item.total);
            existing.cost += Number(item.costPrice) * item.quantity;
            existing.salesSet.add(item.saleId);
          } else {
            map.set(item.productId, {
              id: item.productId,
              name: item.description,
              qty: item.quantity,
              total: Number(item.total),
              cost: Number(item.costPrice) * item.quantity,
              salesSet: new Set([item.saleId]),
            });
          }
        }

        let productsList = Array.from(map.values());

        // Category filter
        if (input.categoryId) {
          const productsInCat = await tx.product.findMany({
            where: { categoryId: input.categoryId, deletedAt: null },
            select: { id: true },
          });
          const catIds = new Set(productsInCat.map((p) => p.id));
          productsList = productsList.filter((p) => catIds.has(p.id));
        }

        // Fetch categories for products
        const productIds = productsList.map((p) => p.id);
        const productsWithCat = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, category: { select: { name: true } } },
        });
        const catMap = new Map(
          productsWithCat.map((p) => [p.id, p.category?.name ?? null]),
        );

        productsList.sort((a, b) => b.qty - a.qty);

        const result = productsList.map((p) => ({
          id: p.id,
          name: p.name,
          category: catMap.get(p.id) ?? null,
          quantity: p.qty,
          numSales: p.salesSet.size,
          totalAmount: Math.round(p.total * 100),
          costTotal: Math.round(p.cost * 100),
          profit: Math.round((p.total - p.cost) * 100),
        }));

        const totalQtd = result.reduce((s, p) => s + p.quantity, 0);
        const totalValor = result.reduce((s, p) => s + p.totalAmount, 0);
        const totalLucro = result.reduce((s, p) => s + p.profit, 0);

        return {
          products: result,
          totals: { quantity: totalQtd, totalAmount: totalValor, profit: totalLucro },
        };
      });
    }),

  /** 7. Vendas por vendedor */
  reportVendasVendedor: tenantProcedure
    .input(vendasVendedorSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = input.dateFrom
          ? new Date(input.dateFrom)
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const dateTo = input.dateTo
          ? new Date(input.dateTo + "T23:59:59")
          : new Date();

        const sales = await tx.sale.findMany({
          where: {
            status: "COMPLETED",
            saleDate: { gte: dateFrom, lte: dateTo },
          },
          select: {
            sellerId: true,
            totalAmount: true,
            discountAmount: true,
            items: {
              select: { costPrice: true, quantity: true },
            },
          },
        });

        // Group by seller
        const sellerMap = new Map<
          string,
          { qty: number; total: number; discount: number; cost: number }
        >();

        for (const s of sales) {
          const existing = sellerMap.get(s.sellerId);
          const cost = s.items.reduce(
            (sum, i) => sum + Number(i.costPrice) * i.quantity,
            0,
          );
          if (existing) {
            existing.qty++;
            existing.total += Number(s.totalAmount);
            existing.discount += Number(s.discountAmount);
            existing.cost += cost;
          } else {
            sellerMap.set(s.sellerId, {
              qty: 1,
              total: Number(s.totalAmount),
              discount: Number(s.discountAmount),
              cost,
            });
          }
        }

        // Fetch seller names
        const sellerIds = Array.from(sellerMap.keys());
        const users = await tx.$queryRawUnsafe<
          Array<{ id: string; name: string }>
        >(
          `SELECT id, name FROM users WHERE id = ANY($1::uuid[])`,
          sellerIds,
        );
        const nameMap = new Map(users.map((u) => [u.id, u.name]));

        const result = Array.from(sellerMap.entries())
          .map(([sellerId, data]) => ({
            sellerId,
            sellerName: nameMap.get(sellerId) ?? "Sem vendedor",
            quantity: data.qty,
            totalAmount: Math.round(data.total * 100),
            discountAmount: Math.round(data.discount * 100),
            ticketMedio:
              data.qty > 0 ? Math.round((data.total / data.qty) * 100) : 0,
            profit: Math.round((data.total - data.cost) * 100),
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount);

        const totalQtd = result.reduce((s, v) => s + v.quantity, 0);
        const totalValor = result.reduce((s, v) => s + v.totalAmount, 0);
        const totalLucro = result.reduce((s, v) => s + v.profit, 0);

        return {
          sellers: result,
          totals: { quantity: totalQtd, totalAmount: totalValor, profit: totalLucro },
        };
      });
    }),

  /** 8. Upgrades (device purchases = trade-ins) */
  reportUpgrades: tenantProcedure
    .input(upgradesSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = input.dateFrom
          ? new Date(input.dateFrom)
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const dateTo = input.dateTo
          ? new Date(input.dateTo + "T23:59:59")
          : new Date();

        const purchases = await tx.devicePurchase.findMany({
          where: {
            createdAt: { gte: dateFrom, lte: dateTo },
          },
          orderBy: { createdAt: "desc" },
          include: {
            product: { select: { id: true, name: true } },
          },
        });

        const totalQtd = purchases.length;
        const totalAvaliado = purchases.reduce(
          (s, p) => s + Number(p.purchasePrice),
          0,
        );
        const totalVenda = purchases.reduce(
          (s, p) => s + Number(p.salePrice ?? 0),
          0,
        );

        return {
          purchases: purchases.map((p) => ({
            ...p,
            purchasePrice: Math.round(Number(p.purchasePrice) * 100),
            salePrice: p.salePrice != null ? Math.round(Number(p.salePrice) * 100) : null,
          })),
          totals: {
            quantity: totalQtd,
            totalPurchaseValue: Math.round(totalAvaliado * 100),
            totalSaleValue: Math.round(totalVenda * 100),
          },
        };
      });
    }),

  /** Reports summary (for index page) */
  reportsSummary: tenantProcedure
    .input(reportDateRangeSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = input.dateFrom
          ? new Date(input.dateFrom)
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const dateTo = input.dateTo
          ? new Date(input.dateTo + "T23:59:59")
          : new Date();

        const [sales, entries, exits, purchases] = await Promise.all([
          tx.sale.aggregate({
            where: {
              status: "COMPLETED",
              saleDate: { gte: dateFrom, lte: dateTo },
            },
            _count: true,
            _sum: { totalAmount: true },
          }),
          tx.stockMovement.aggregate({
            where: {
              type: "ENTRY",
              createdAt: { gte: dateFrom, lte: dateTo },
            },
            _sum: { quantity: true },
          }),
          tx.stockMovement.aggregate({
            where: {
              type: { in: ["EXIT"] },
              createdAt: { gte: dateFrom, lte: dateTo },
            },
            _sum: { quantity: true },
          }),
          tx.devicePurchase.count({
            where: { createdAt: { gte: dateFrom, lte: dateTo } },
          }),
        ]);

        return {
          vendas: {
            quantidade: sales._count,
            valorTotal: Math.round(Number(sales._sum.totalAmount ?? 0) * 100),
          },
          estoque: {
            entradas: entries._sum.quantity ?? 0,
            saidas: exits._sum.quantity ?? 0,
          },
          upgrades: purchases,
        };
      });
    }),

  /** CSV Import - process lines */
  importCsv: tenantProcedure
    .input(csvImportSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        let productsCreated = 0;
        let stockEntries = 0;
        let categoriesCreated = 0;
        const errors: string[] = [];
        const categoryCache = new Map<string, string>();

        for (let i = 0; i < input.lines.length; i++) {
          const line = input.lines[i]!;
          try {
            // Resolve category
            let categoryId: string | null = null;
            if (line.category) {
              const catKey = line.category.toLowerCase().trim();
              if (categoryCache.has(catKey)) {
                categoryId = categoryCache.get(catKey)!;
              } else {
                // Try find existing
                const existing = await tx.productCategory.findFirst({
                  where: { name: { equals: line.category, mode: "insensitive" }, deletedAt: null },
                });
                if (existing) {
                  categoryId = existing.id;
                } else {
                  const created = await tx.productCategory.create({
                    data: { tenantId: ctx.tenantId, name: line.category },
                  });
                  categoryId = created.id;
                  categoriesCreated++;
                }
                categoryCache.set(catKey, categoryId);
              }
            }

            // Create product
            const product = await tx.product.create({
              data: {
                tenantId: ctx.tenantId,
                name: line.name,
                sku: line.sku || null,
                barcode: line.barcode || null,
                brand: line.brand || null,
                description: line.description || null,
                isSerialized: line.isSerialized ?? false,
                costPrice: new Prisma.Decimal((line.costPrice ?? 0) / 100),
                salePrice: new Prisma.Decimal((line.salePrice ?? 0) / 100),
                promotionalPrice: line.promotionalPrice != null
                  ? new Prisma.Decimal(line.promotionalPrice / 100)
                  : null,
                minStock: line.minStock ?? 0,
                // TODO: Estoque-B will handle stock tracking via StockItem
                categoryId,
                active: true,
              },
            });
            productsCreated++;

            // Create stock entry if quantity > 0
            if (line.quantity && line.quantity > 0) {
              await tx.stockMovement.create({
                data: {
                  tenantId: ctx.tenantId,
                  productId: product.id,
                  type: "ENTRY",
                  quantity: line.quantity,
                  reason: "Importacao CSV em lote",
                  userId: ctx.session.user.id,
                },
              });
              stockEntries += line.quantity;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(`Linha ${i + 1} (${line.name}): ${msg}`);
          }
        }

        return {
          productsCreated,
          stockEntries,
          categoriesCreated,
          errors,
          success: errors.length === 0,
        };
      });
    }),

  /** List sellers for filters */
  listSellers: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const sellers = await tx.$queryRawUnsafe<
        Array<{ id: string; name: string }>
      >(
        `SELECT DISTINCT u.id, u.name
         FROM users u
         INNER JOIN user_tenants ut ON ut.user_id = u.id
         WHERE ut.tenant_id = current_setting('app.current_tenant_id')::uuid
         AND u.active = true
         ORDER BY u.name`,
      );
      return sellers;
    });
  }),

  // ═══════════════════════════════════════
  // PRODUCT ATTRIBUTES (Estoque-A)
  // ═══════════════════════════════════════

  listAttributes: tenantProcedure
    .input(listAttributesSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ProductAttributeWhereInput = { deletedAt: null };
        if (input.active !== undefined) where.active = input.active;
        return tx.productAttribute.findMany({
          where,
          include: { values: { where: { active: true }, orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        });
      });
    }),

  createAttribute: tenantProcedure
    .input(createAttributeSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const slug = input.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        return tx.productAttribute.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            slug,
            order: input.order ?? 0,
            active: input.active ?? true,
          },
        });
      });
    }),

  updateAttribute: tenantProcedure
    .input(updateAttributeSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.productAttribute.update({
          where: { id: input.id },
          data: {
            name: input.name,
            order: input.order,
            active: input.active,
          },
        });
      });
    }),

  deleteAttribute: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.productAttribute.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ═══════════════════════════════════════
  // PRODUCT ATTRIBUTE VALUES (Estoque-A)
  // ═══════════════════════════════════════

  createAttributeValue: tenantProcedure
    .input(createAttributeValueSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.productAttributeValue.create({
          data: {
            tenantId: ctx.tenantId,
            attributeId: input.attributeId,
            value: input.value,
            displayValue: input.displayValue || input.value,
            code: input.code,
            order: input.order ?? 0,
            active: input.active ?? true,
          },
        });
      });
    }),

  updateAttributeValue: tenantProcedure
    .input(updateAttributeValueSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const { id, ...data } = input;
        return tx.productAttributeValue.update({ where: { id }, data });
      });
    }),

  deleteAttributeValue: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.productAttributeValue.update({
          where: { id: input.id },
          data: { active: false },
        });
      });
    }),

  // ═══════════════════════════════════════
  // PRODUCT VARIATIONS (Estoque-A)
  // ═══════════════════════════════════════

  listVariations: tenantProcedure
    .input(listVariationsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ProductVariationWhereInput = {
          productId: input.productId,
          deletedAt: null,
        };
        if (input.active !== undefined) where.active = input.active;
        return tx.productVariation.findMany({
          where,
          include: {
            attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          },
          orderBy: { createdAt: "asc" },
        });
      });
    }),

  createVariation: tenantProcedure
    .input(createVariationSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const variation = await tx.productVariation.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            sku: input.sku,
            barcode: input.barcode,
            costPrice: input.costPrice ? input.costPrice / 100 : null,
            salePrice: input.salePrice ? input.salePrice / 100 : null,
            promotionalPrice: input.promotionalPrice ? input.promotionalPrice / 100 : null,
            minStock: input.minStock ?? 0,
            active: input.active ?? true,
            attributeValues: {
              create: input.attributeValueIds.map((avId) => ({
                attributeValueId: avId,
              })),
            },
          },
          include: {
            attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          },
        });
        return variation;
      });
    }),

  updateVariation: tenantProcedure
    .input(updateVariationSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const { id, attributeValueIds, ...data } = input;
        const updateData: Prisma.ProductVariationUpdateInput = {};
        if (data.sku !== undefined) updateData.sku = data.sku;
        if (data.barcode !== undefined) updateData.barcode = data.barcode;
        if (data.costPrice !== undefined) updateData.costPrice = data.costPrice ? data.costPrice / 100 : null;
        if (data.salePrice !== undefined) updateData.salePrice = data.salePrice ? data.salePrice / 100 : null;
        if (data.promotionalPrice !== undefined) updateData.promotionalPrice = data.promotionalPrice ? data.promotionalPrice / 100 : null;
        if (data.minStock !== undefined) updateData.minStock = data.minStock;
        if (data.active !== undefined) updateData.active = data.active;

        if (attributeValueIds) {
          await tx.productVariationAttribute.deleteMany({ where: { variationId: id } });
          await tx.productVariationAttribute.createMany({
            data: attributeValueIds.map((avId) => ({ variationId: id, attributeValueId: avId })),
          });
        }

        return tx.productVariation.update({
          where: { id },
          data: updateData,
          include: {
            attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          },
        });
      });
    }),

  deleteVariation: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.productVariation.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ═══════════════════════════════════════
  // PRODUCT PHOTOS (Estoque-A)
  // ═══════════════════════════════════════

  listPhotos: tenantProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.productPhoto.findMany({
          where: { productId: input.productId },
          orderBy: { order: "asc" },
        });
      });
    }),

  createPhoto: tenantProcedure
    .input(createPhotoSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        // Check max 3 photos
        const count = await tx.productPhoto.count({ where: { productId: input.productId } });
        if (count >= 3) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Maximo de 3 fotos por produto" });
        }

        const photo = await tx.productPhoto.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            url: input.url,
            thumbUrl: input.thumbUrl,
            mediumUrl: input.mediumUrl,
            order: input.order ?? count,
            isPrimary: input.isPrimary ?? count === 0, // first photo is primary by default
          },
        });

        // Denormalize imageUrl on product
        if (photo.isPrimary) {
          await tx.product.update({
            where: { id: input.productId },
            data: { imageUrl: photo.thumbUrl || photo.url },
          });
        }

        return photo;
      });
    }),

  deletePhoto: tenantProcedure
    .input(z.object({ id: z.string().uuid(), productId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const photo = await tx.productPhoto.findUnique({ where: { id: input.id } });
        if (!photo) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.productPhoto.delete({ where: { id: input.id } });

        // If deleted photo was primary, make first remaining photo primary
        if (photo.isPrimary) {
          const first = await tx.productPhoto.findFirst({
            where: { productId: input.productId },
            orderBy: { order: "asc" },
          });
          if (first) {
            await tx.productPhoto.update({ where: { id: first.id }, data: { isPrimary: true } });
            await tx.product.update({
              where: { id: input.productId },
              data: { imageUrl: first.thumbUrl || first.url },
            });
          } else {
            await tx.product.update({ where: { id: input.productId }, data: { imageUrl: null } });
          }
        }

        return { success: true };
      });
    }),

  setPrimaryPhoto: tenantProcedure
    .input(setPrimaryPhotoSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        // Reset all photos for this product
        await tx.productPhoto.updateMany({
          where: { productId: input.productId },
          data: { isPrimary: false },
        });
        // Set the chosen one as primary
        const photo = await tx.productPhoto.update({
          where: { id: input.photoId },
          data: { isPrimary: true },
        });
        // Denormalize
        await tx.product.update({
          where: { id: input.productId },
          data: { imageUrl: photo.thumbUrl || photo.url },
        });
        return photo;
      });
    }),

  // ═══════════════════════════════════════
  // NCM SEARCH (Estoque-A)
  // ═══════════════════════════════════════

  searchNcm: tenantProcedure
    .input(searchNcmSchema)
    .query(async ({ input }) => {
      return searchNcm(input.term);
    }),

  /** Sugere NCM por nome/categoria do produto. Paridade Laravel sugerirNcm. */
  suggestNcm: tenantProcedure
    .input(z.object({ text: z.string().max(500) }))
    .query(({ input }) => suggestNcm(input.text)),

  getNcmByCode: tenantProcedure
    .input(z.object({ code: z.string().length(8) }))
    .query(async ({ input }) => {
      return getNcmByCode(input.code);
    }),

  // ═══════════════════════════════════════
  // CNPJ LOOKUP (Estoque-A)
  // ═══════════════════════════════════════

  lookupCnpj: tenantProcedure
    .input(lookupCnpjSchema)
    .query(async ({ input }) => {
      return lookupCnpjApi(input.cnpj);
    }),

  // ═══════════════════════════════════════
  // DUPLICATE PRODUCT (Estoque-A)
  // ═══════════════════════════════════════

  duplicateProduct: tenantProcedure
    .input(duplicateProductSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const source = await tx.product.findUnique({
          where: { id: input.productId },
          include: {
            categories: true,
            variations: { include: { attributeValues: true } },
            attributeConfigs: true,
          },
        });
        if (!source) throw new TRPCError({ code: "NOT_FOUND" });

        const newName = input.newName || `${source.name} (copia)`;

        // Create duplicate product
        const duplicate = await tx.product.create({
          data: {
            tenantId: ctx.tenantId,
            categoryId: source.categoryId,
            sku: input.newSku || null,
            barcode: null,
            name: newName,
            description: source.description,
            brand: source.brand,
            ncm: source.ncm,
            cest: source.cest,
            isSerialized: source.isSerialized,
            isPremium: source.isPremium,
            hasVariations: source.hasVariations,
            icmsDifferentialRate: source.icmsDifferentialRate,
            costPrice: source.costPrice,
            salePrice: source.salePrice,
            promotionalPrice: source.promotionalPrice,
            defaultMargin: source.defaultMargin,
            minStock: source.minStock,
            unit: source.unit,
            active: true,
          },
        });

        // Copy category pivots
        if (source.categories.length > 0) {
          await tx.productCategoryPivot.createMany({
            data: source.categories.map((c) => ({
              tenantId: ctx.tenantId,
              productId: duplicate.id,
              categoryId: c.categoryId,
              isPrimary: c.isPrimary,
            })),
          });
        }

        // Copy attribute configs
        if (source.attributeConfigs.length > 0) {
          await tx.productAttributeConfig.createMany({
            data: source.attributeConfigs.map((ac) => ({
              productId: duplicate.id,
              attributeId: ac.attributeId,
              order: ac.order,
            })),
          });
        }

        // Copy variations (without SKUs)
        for (const v of source.variations) {
          await tx.productVariation.create({
            data: {
              tenantId: ctx.tenantId,
              productId: duplicate.id,
              sku: null, // SKU must be new
              barcode: null,
              costPrice: v.costPrice,
              salePrice: v.salePrice,
              promotionalPrice: v.promotionalPrice,
              minStock: v.minStock,
              active: v.active,
              attributeValues: {
                create: v.attributeValues.map((av) => ({
                  attributeValueId: av.attributeValueId,
                })),
              },
            },
          });
        }

        return duplicate;
      });
    }),

  // ═══════════════════════════════════════
  // ESTOQUE-B: STOCK ITEMS
  // ═══════════════════════════════════════

  listStockItems: tenantProcedure
    .input(listStockItemsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 25;
      return ctx.withTenant(async (tx) => {
        const where: Prisma.StockItemWhereInput = { deletedAt: null };
        if (input.productId) where.productId = input.productId;
        // availableOnly tem prioridade sobre status (paridade Laravel `buscarItensDisponiveis`).
        if (input.availableOnly) {
          where.status = "AVAILABLE";
        } else if (input.status) {
          where.status = input.status;
        }
        if (input.condition) where.condition = input.condition;
        if (input.supplierId) where.supplierId = input.supplierId;
        if (input.search) {
          where.OR = [
            { imei: { contains: input.search, mode: "insensitive" } },
            { serialNumber: { contains: input.search, mode: "insensitive" } },
            { barcode: { contains: input.search, mode: "insensitive" } },
          ];
        }
        // Busca por nome/marca do produto via relacao
        if (input.productSearch?.trim()) {
          const term = input.productSearch.trim();
          where.product = {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { brand: { contains: term, mode: "insensitive" } },
            ],
          };
        }
        const [data, total] = await Promise.all([
          tx.stockItem.findMany({
            where,
            include: { product: { select: { name: true, brand: true } }, supplier: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.stockItem.count({ where }),
        ]);
        return { data, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getStockItem: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.stockItem.findUnique({
          where: { id: input.id },
          include: {
            product: true,
            variation: { include: { attributeValues: { include: { attributeValue: { include: { attribute: true } } } } } },
            supplier: true,
          },
        });
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return item;
      });
    }),

  /** Entry: serialized items (creates StockItem per IMEI) */
  entrySerializedItems: tenantProcedure
    .input(createStockItemBatchSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        return entrySerializedItems(tx as any, ctx.tenantId, ctx.session.user.id, {
          productId: input.productId,
          variationId: input.variationId,
          supplierId: input.supplierId,
          condition: input.condition,
          conservationGrade: input.conservationGrade,
          costPrice: input.costPrice,
          suggestedSalePrice: input.suggestedSalePrice,
          invoiceNumber: input.invoiceNumber,
          items: input.items,
        });
      });
    }),

  /** Entry: non-serialized (quantity-based) */
  entryQuantity: tenantProcedure
    .input(stockEntryQuantitySchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        await entryNonSerialized(tx as any, ctx.tenantId, ctx.session.user.id, {
          productId: input.productId,
          quantity: input.quantity,
          reason: input.reason,
          supplierId: input.supplierId,
          invoiceNumber: input.invoiceNumber,
        });
        return { success: true };
      });
    }),

  /** Write-off (baixa) */
  writeOff: tenantProcedure
    .input(stockWriteOffSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        if (input.stockItemId) {
          // Serialized: soft delete the StockItem
          await tx.stockItem.update({
            where: { id: input.stockItemId },
            data: { deletedAt: new Date() },
          });
          const item = await tx.stockItem.findUnique({ where: { id: input.stockItemId } });
          await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: input.productId,
              stockItemId: input.stockItemId,
              type: "EXIT",
              quantity: 1,
              reason: input.reason,
              referenceType: "write_off",
              userId: ctx.session.user.id,
            },
          });
        } else {
          // Non-serialized
          await exitNonSerialized(tx as any, ctx.tenantId, ctx.session.user.id, {
            productId: input.productId,
            quantity: input.quantity ?? 1,
            reason: input.reason,
            referenceType: "write_off",
          });
        }
        return { success: true };
      });
    }),

  /** Inventory adjustment (non-serialized) */
  adjustInventory: tenantProcedure
    .input(stockAdjustmentSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        await adjustInventory(tx as any, ctx.tenantId, ctx.session.user.id, {
          productId: input.productId,
          newQuantity: input.newQuantity,
          reason: input.reason,
        });
        return { success: true };
      });
    }),

  /** Change StockItem status (state machine validated) */
  changeItemStatus: tenantProcedure
    .input(changeStockItemStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;

      // RBAC: blocking/unblocking requires owner
      if (input.newStatus === "BLOCKED" || input.newStatus === "AVAILABLE") {
        // Unblocking from BLOCKED requires owner
        // Reserving requires at least operator
      }
      if ((input.newStatus === "BLOCKED") && userRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas dono pode bloquear" });
      }
      // Entry/exit/defect requires manager+
      if (["DEFECTIVE", "RETURNED"].includes(input.newStatus) && (!userRole || userRole === "operator")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }

      return ctx.withTenant(async (tx) => {
        await changeItemStatus(tx as any, ctx.tenantId, ctx.session.user.id, {
          stockItemId: input.stockItemId,
          newStatus: input.newStatus,
          reason: input.reason,
          reservedForType: input.reservedForType,
          reservedForId: input.reservedForId,
        });
        return { success: true };
      });
    }),

  /** Search by IMEI */
  searchByImei: tenantProcedure
    .input(searchImeiSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.stockItem.findFirst({
          where: { imei: { contains: input.imei }, deletedAt: null },
          include: {
            product: { select: { name: true, brand: true, isSerialized: true } },
            supplier: { select: { name: true } },
          },
        });
        return item;
      });
    }),

  /** IMEI history (all movements for this IMEI) */
  getImeiHistory: tenantProcedure
    .input(z.object({ imei: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Find the stock item (including soft-deleted for full history)
        const item = await tx.stockItem.findFirst({
          where: { imei: input.imei },
          include: {
            product: { select: { name: true, brand: true } },
            supplier: { select: { name: true } },
          },
        });
        if (!item) return null;

        // Get all movements for this item
        const movements = await tx.stockMovement.findMany({
          where: { stockItemId: item.id },
          orderBy: { createdAt: "desc" },
        });

        return { item, movements };
      });
    }),

  /** Get available quantity (hybrid: currentStock or StockItem count) */
  getAvailableQuantity: tenantProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return getAvailableQuantity(tx as any, ctx.tenantId, input.productId);
      });
    }),
});
