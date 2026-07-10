import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { can } from "@/lib/auth/capabilities";
import { isTenantAdmin } from "@/lib/auth/roles";

/**
 * A3 (auditoria estoque 2026-07-10, decisão do dono): custo de aquisição e
 * margem são dado gerencial — não vazam para o operador de balcão. Remove
 * `costPrice` do produto serializado quando quem pergunta não é admin/gerente.
 * Mesma classe do A3 já aplicado no PDV/OS.
 */
function stripProductCostForNonAdmin<T extends { costPrice?: unknown }>(product: T, isAdmin: boolean): T {
  if (isAdmin) return product;
  const { costPrice: _costPrice, ...rest } = product;
  return rest as T;
}
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
  stockEntryBatchSchema,
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
  bulkAdjustStockSchema,
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
  stockAdjustmentSchema,
  changeStockItemStatusSchema,
  disposeStockItemSchema,
  listStockItemsSchema,
  searchImeiSchema,
  isRepurchasableStatus,
  isManualStatusChangeAllowed,
  PURCHASE_REVERSIBLE_STATUSES,
} from "@/lib/validators/stock-item";
import {
  entrySerializedItems,
  entryNonSerialized,
  exitNonSerialized,
  adjustInventory,
  changeItemStatus,
  disposeStockItem,
  resolveCurrentStockByProduct,
} from "@/server/services/stock-item.service";
import { getAvailableQuantity } from "@/server/services/product.service";
import { writeCashMovement } from "@/server/services/cash-session.service";
import { deleteProductImage } from "@/lib/product-image-service";
import { Prisma } from "@prisma/client";
import { getAppBaseUrl } from "@/lib/utils/app-url";
import { saleGoodsRevenueCents } from "@/lib/sales/sale-revenue";

/**
 * Libera o StockItem criado por essa compra: BLOCKED -> AVAILABLE.
 * Chamado quando termo de responsabilidade eh assinado (fisica ou Autentique).
 * Match por (productId, imei OU serialNumber) — o StockItem foi criado com esses
 * mesmos campos no createPurchase.
 */
async function releaseStockItemForPurchase(
  tx: Prisma.TransactionClient,
  purchase: {
    productId: string | null;
    imei: string | null;
    serial: string | null;
  },
): Promise<void> {
  if (!purchase.productId) return;
  // Localiza StockItem dessa compra que ainda esta BLOCKED. IMEI eh o
  // identificador preferido; serial fallback.
  const where: Prisma.StockItemWhereInput = {
    productId: purchase.productId,
    status: "BLOCKED",
    deletedAt: null,
  };
  if (purchase.imei) {
    where.imei = purchase.imei;
  } else if (purchase.serial) {
    where.serialNumber = purchase.serial;
  } else {
    // Sem identificador unico — nao da pra ligar com seguranca.
    return;
  }
  await tx.stockItem.updateMany({
    where,
    data: { status: "AVAILABLE", notes: null },
  });
}

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

        if (input.categoryId) {
          where.categoryId = input.categoryId;
        }

        if (input.lowStock) {
          // Pre-filtra por minimo definido no DB; o corte por saldo real
          // (<= minStock) e feito em memoria abaixo, apos resolver o estoque
          // efetivo (serializado/variacoes nao dao pra comparar em SQL puro).
          where.minStock = { gt: 0 };
        }

        const [data, total] = await Promise.all([
          tx.product.findMany({
            where,
            orderBy: { [sortBy]: sortOrder },
            skip: page * pageSize,
            take: pageSize,
            include: {
              photos: {
                orderBy: [{ isPrimary: "desc" }, { order: "asc" }],
                take: 1,
              },
            },
          }),
          tx.product.count({ where }),
        ]);

        // Calcula currentStock real (paridade searchProducts no PDV):
        // - Serializados: count(StockItem WHERE status='AVAILABLE')
        // - Com variations: SUM(productVariations.currentStock)
        // - Simples: usa products.current_stock direto
        // Estoque efetivo por produto — fonte única resolveCurrentStockByProduct
        // (serializado=count AVAILABLE, com variações=SUM active, simples=
        // currentStock). Antes o cálculo era reimplementado inline aqui SEM o
        // filtro active:true nas variações, então a listagem divergia dos
        // relatórios (contava estoque de variação inativa).
        const stockByProduct = await resolveCurrentStockByProduct(tx, data);

        const withStock = data.map((p) => {
          const currentStock = stockByProduct.get(p.id) ?? 0;
          const primaryPhoto = p.photos[0];
          const thumbnailUrl = primaryPhoto?.thumbUrl ?? primaryPhoto?.mediumUrl ?? primaryPhoto?.url ?? p.imageUrl;
          return { ...p, currentStock, thumbnailUrl };
        });

        const filtered = input.lowStock
          ? withStock.filter((p) => p.minStock > 0 && p.currentStock <= p.minStock)
          : withStock;

        const isAdmin = isTenantAdmin(ctx.session, ctx.tenantId);
        const safe = filtered.map((p) => stripProductCostForNonAdmin(p, isAdmin));

        return {
          data: safe,
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

        // Estoque efetivo — mesma fonte única de stock.list e dos relatórios
        // (resolveCurrentStockByProduct). Antes somava as variações carregadas
        // em memória (sem filtro active), divergindo dos demais.
        const stockByProduct = await resolveCurrentStockByProduct(tx, [product]);
        const currentStock = stockByProduct.get(product.id) ?? 0;

        const isAdmin = isTenantAdmin(ctx.session, ctx.tenantId);
        return stripProductCostForNonAdmin({ ...product, currentStock }, isAdmin);
      });
    }),

  /** Create product */
  create: tenantProcedure
    .input(createProductSchema)
    .mutation(async ({ ctx, input }) => {
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        // Dedup SKU/barcode antes de criar (mesma logica do importCsv).
        if (input.sku?.trim()) {
          const dup = await tx.product.findFirst({
            where: { sku: input.sku.trim(), deletedAt: null },
            select: { id: true, name: true },
          });
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `SKU "${input.sku}" ja usado pelo produto "${dup.name}".`,
            });
          }
        }
        if (input.barcode?.trim()) {
          const dup = await tx.product.findFirst({
            where: { barcode: input.barcode.trim(), deletedAt: null },
            select: { id: true, name: true },
          });
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Barcode "${input.barcode}" ja usado pelo produto "${dup.name}".`,
            });
          }
        }

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

        // Photos — URLs ja enviadas pelo provider configurado (Cloudinary por padrao,
        // MinIO como fallback/rollback). Paridade Laravel ProdutoController::store.
        if (input.photos && input.photos.length > 0) {
          await tx.productPhoto.createMany({
            data: input.photos.map((p, idx) => ({
              tenantId: ctx.tenantId,
              productId: product.id,
              url: p.url,
              thumbUrl: p.thumbUrl ?? null,
              mediumUrl: p.mediumUrl ?? null,
              provider: p.provider ?? null,
              providerPublicId: p.providerPublicId ?? null,
              metadata: p.metadata ?? Prisma.JsonNull,
              order: p.order ?? idx,
              isPrimary: p.isPrimary ?? idx === 0,
            })),
          });
          const primaryPhoto = input.photos.find((p) => p.isPrimary) ?? input.photos[0];
          if (primaryPhoto) {
            await tx.product.update({
              where: { id: product.id },
              data: { imageUrl: primaryPhoto.thumbUrl || primaryPhoto.url },
            });
          }
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
                imageProvider: v.imageProvider ?? null,
                imageProviderPublicId: v.imageProviderPublicId ?? null,
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const existing = await tx.product.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        // Bloqueia flip de isSerialized/hasVariations quando ja existe historico.
        // Trocar essas flags corrompe contagem de estoque + sale_items historicos.
        const nextIsSerialized = input.isSerialized ?? false;
        const nextHasVariations = input.hasVariations ?? false;
        if (
          existing.isSerialized !== nextIsSerialized ||
          existing.hasVariations !== nextHasVariations
        ) {
          const hasStockItems = await tx.stockItem.count({
            where: { productId: input.id, deletedAt: null },
          });
          const hasMovements = await tx.stockMovement.count({
            where: { productId: input.id },
          });
          const hasSaleItems = await tx.saleItem.count({
            where: { productId: input.id },
          });
          if (hasStockItems > 0 || hasMovements > 0 || hasSaleItems > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Nao e possivel alterar 'serializado' ou 'tem variacoes' apos haver historico de estoque/vendas. Crie um produto novo.",
            });
          }
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
            isSerialized: nextIsSerialized,
            isPremium: input.isPremium ?? false,
            isDevice: input.isDevice ?? false,
            hasVariations: nextHasVariations,
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
          const oldPhotos = await tx.productPhoto.findMany({ where: { productId: input.id } });
          await tx.productPhoto.deleteMany({ where: { productId: input.id } });
          if (input.photos.length > 0) {
            await tx.productPhoto.createMany({
              data: input.photos.map((p, idx) => ({
                tenantId: ctx.tenantId,
                productId: input.id,
                url: p.url,
                thumbUrl: p.thumbUrl ?? null,
                mediumUrl: p.mediumUrl ?? null,
                provider: p.provider ?? null,
                providerPublicId: p.providerPublicId ?? null,
                metadata: p.metadata ?? Prisma.JsonNull,
                order: p.order ?? idx,
                isPrimary: p.isPrimary ?? idx === 0,
              })),
            });
            const primaryPhoto = input.photos.find((p) => p.isPrimary) ?? input.photos[0];
            if (primaryPhoto) {
              await tx.product.update({
                where: { id: input.id },
                data: { imageUrl: primaryPhoto.thumbUrl || primaryPhoto.url },
              });
            }
          } else {
            await tx.product.update({ where: { id: input.id }, data: { imageUrl: null } });
          }
          for (const photo of oldPhotos) {
            void deleteProductImage({
              url: photo.url,
              provider: photo.provider,
              providerPublicId: photo.providerPublicId,
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
                imageProvider: v.imageProvider ?? null,
                imageProviderPublicId: v.imageProviderPublicId ?? null,
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem excluir produtos." });
      }
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
      // ADR 0053: operador (membro do tenant) ajusta estoque — fluxo do dia a dia.
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: input.productId } });
        if (!product || product.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }
        if (product.isSerialized) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ajuste de estoque so para produtos nao serializados. Use o fluxo de StockItem.",
          });
        }

        const isExit = input.quantity < 0;
        const qty = Math.abs(input.quantity);

        // Produto com variacoes: o saldo real vive em ProductVariation.currentStock
        // (o currentStock do pai eh derivado). Exige a variacao e ajusta ela —
        // sem isso, o ajuste mexia no campo errado. Paridade com stockEntry/Exit.
        if (product.hasVariations) {
          if (!input.variationId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selecione uma variacao para ajustar o estoque.",
            });
          }
          const variation = await tx.productVariation.findFirst({
            where: { id: input.variationId, deletedAt: null },
          });
          if (!variation || variation.productId !== input.productId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Variacao nao pertence a este produto.",
            });
          }

          if (isExit) {
            // where currentStock >= qty evita saldo negativo (mesma guarda do pai).
            const r = await tx.productVariation.updateMany({
              where: { id: input.variationId, currentStock: { gte: qty } },
              data: { currentStock: { decrement: qty } },
            });
            if (r.count !== 1) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Estoque insuficiente: ${variation.currentStock} unidades disponiveis nesta variacao.`,
              });
            }
          } else {
            await tx.productVariation.update({
              where: { id: input.variationId },
              data: { currentStock: { increment: qty } },
            });
          }
        } else if (isExit) {
          // Produto simples — ajusta o proprio currentStock.
          // where currentStock >= qty evita negativo.
          const r = await tx.product.updateMany({
            where: { id: input.productId, currentStock: { gte: qty } },
            data: { currentStock: { decrement: qty } },
          });
          if (r.count !== 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Estoque insuficiente: ${product.currentStock} unidades disponiveis.`,
            });
          }
        } else {
          await tx.product.update({
            where: { id: input.productId },
            data: { currentStock: { increment: qty } },
          });
        }

        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            variationId: input.variationId || null,
            type: isExit ? "EXIT" : "ENTRY",
            quantity: qty,
            reason: input.reason,
            userId: ctx.session.user.id,
          },
        });

        return tx.product.findUnique({ where: { id: input.productId } });
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

        // Resolve nome do vendedor (cliente ou fornecedor) pra exibir na lista.
        const customerIds = [
          ...new Set(data.filter((d) => d.customerId).map((d) => d.customerId!)),
        ];
        const supplierIds = [
          ...new Set(data.filter((d) => d.supplierId).map((d) => d.supplierId!)),
        ];
        const [customers, suppliers] = await Promise.all([
          customerIds.length
            ? tx.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })
            : Promise.resolve([] as Array<{ id: string; name: string }>),
          supplierIds.length
            ? tx.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
            : Promise.resolve([] as Array<{ id: string; name: string }>),
        ]);
        const customerMap = new Map(customers.map((c) => [c.id, c.name]));
        const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

        const dataWithSeller = data.map((d) => ({
          ...d,
          sellerName:
            d.sellerType === "supplier"
              ? supplierMap.get(d.supplierId ?? "") ?? null
              : customerMap.get(d.customerId ?? "") ?? null,
        }));

        return {
          data: dataWithSeller,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Create device purchase — atomically adds stock entry and optionally a PAYABLE */
  createPurchase: tenantProcedure
    .input(createDevicePurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      // ADR 0053: operador (membro do tenant) registra compra de aparelho — dia a dia.
      return ctx.withTenant(async (tx) => {
        // Product OBRIGATORIO. Operador escolhe via combobox (Estoque ->
        // Produtos cadastrados como aparelho serializado). Sem digitacao
        // livre — evita duplicatas e mantem catalogo limpo.
        const product = await tx.product.findFirst({
          where: { id: input.productId, deletedAt: null },
          select: { id: true, name: true, brand: true, isDevice: true, isSerialized: true, hasVariations: true },
        });
        if (!product) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Produto nao encontrado.",
          });
        }
        if (!product.isDevice) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Produto selecionado nao esta marcado como 'Aparelho'. Edite o produto antes.",
          });
        }
        if (!product.isSerialized) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Produto selecionado nao e serializado. Compra de aparelho exige produto serializado.",
          });
        }

        // Vendedor OBRIGATORIO (paridade Laravel CompraAparelhoController:78-81)
        // — cliente (PF revendendo seminovo) ou fornecedor (PJ). Sem isso, o
        // termo de responsabilidade e o financeiro ficam sem contraparte.
        if (input.sellerType === "customer" && !input.customerId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cliente vendedor e obrigatorio.",
          });
        }
        if (input.sellerType === "supplier" && !input.supplierId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Fornecedor e obrigatorio.",
          });
        }

        // Preco minimo R$ 1,00 (defesa em profundidade — validator ja
        // garante, mas backend nao confia no client).
        if (input.purchasePrice < 100) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Preco de compra obrigatorio (minimo R$ 1,00).",
          });
        }

        // IMEI normalizado (so digitos) — usado tanto na checagem quanto no
        // INSERT, garantindo consistencia com a unique constraint
        // (tenant_id, imei) WHERE imei IS NOT NULL AND deleted_at IS NULL.
        // CRITICO: string vazia "" precisa virar NULL. Aparelhos sem IMEI
        // (AirPods, iPad WiFi) mandam "" do form — se salvar "", a constraint
        // (que ignora apenas NULL, nao "") rejeita o 2o aparelho sem IMEI.
        const cleanImei = input.imei && input.imei.replace(/\D/g, "").length > 0
          ? input.imei.replace(/\D/g, "")
          : null;
        // Idem para serial: "" -> null pra nao confundir filtros/relatorios.
        const cleanSerial = input.serial && input.serial.trim().length > 0
          ? input.serial.trim()
          : null;

        // IMEI ou Serial obrigatorio para aparelhos que tem identificador
        // unico (celular). AirPods/acessorios sem IMEI nem serial sao aceitos
        // (nao da pra exigir identificador que o produto nao tem).
        // Mantemos a validacao branda: so exige se NENHUM dos dois vier.
        if (!cleanImei && !cleanSerial) {
          // Permitido para produtos sem identificador (AirPods etc) — apenas
          // loga. Se quiser bloquear no futuro, faca por categoria.
          logger.info("Compra de aparelho sem IMEI/serial", {
            productId: product.id,
            productName: product.name,
          });
        }

        if (cleanImei) {
          const existing = await tx.stockItem.findFirst({
            where: { imei: cleanImei, deletedAt: null },
            select: { id: true, status: true, product: { select: { name: true } } },
          });
          if (existing) {
            // Aparelho que a loja ja vendeu (SOLD) ou descartou (DEFECTIVE) pode
            // ser recomprado do cliente — caso legitimo (cliente revende o que
            // comprou). Arquiva o StockItem antigo (soft delete vira historico)
            // e segue para criar o novo item BLOCKED desta compra. A unique
            // constraint parcial (imei WHERE deleted_at IS NULL) nao quebra.
            // Paridade com o trade-in/upgrade do PDV, que ja recompra IMEI vendido.
            if (isRepurchasableStatus(existing.status)) {
              await tx.stockItem.update({
                where: { id: existing.id },
                data: { deletedAt: new Date() },
              });
              // Cancela DevicePurchase(s) anterior(es) nao-cancelado(s) do mesmo
              // IMEI: se o aparelho ja passou por um ciclo compra->venda->recompra,
              // a compra antiga ainda esta ativa e viola a unique parcial
              // (device_purchases imei WHERE cancelled_at IS NULL).
              await tx.devicePurchase.updateMany({
                where: { imei: cleanImei, cancelledAt: null },
                data: {
                  cancelledAt: new Date(),
                  cancellationReason: "Aparelho recomprado — nova compra registrada",
                },
              });
              logger.info("Recompra de aparelho ja vendido/descartado — item antigo arquivado", {
                stockItemId: existing.id,
                imei: cleanImei,
                previousStatus: existing.status,
              });
            } else {
              // AVAILABLE/RESERVED/BLOCKED: aparelho ainda em circulacao — e
              // duplicidade real (ou tentativa anterior que falhou).
              throw new TRPCError({
                code: "CONFLICT",
                message: `IMEI ${cleanImei} ja esta cadastrado em ${existing.product.name} (status: ${existing.status}). Se foi uma tentativa anterior que falhou, cancele a compra correspondente antes.`,
              });
            }
          }
        }

        // Se o Product tem variacoes, exige variationId. Paridade Laravel:
        // compra_aparelhos.variacao_id obrigatorio quando usa_variacoes=true.
        let variation: { id: string; productId: string } | null = null;
        if (product.hasVariations) {
          if (!input.variationId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selecione a variacao (armazenamento + cor) do aparelho.",
            });
          }
          const v = await tx.productVariation.findFirst({
            where: { id: input.variationId, deletedAt: null },
            select: { id: true, productId: true },
          });
          if (!v || v.productId !== product.id) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Variacao nao pertence a este produto.",
            });
          }
          variation = v;
        }

        const purchase = await tx.devicePurchase.create({
          data: {
            tenantId: ctx.tenantId,
            productId: product.id,
            customerId: input.customerId || null,
            supplierId: input.supplierId || null,
            sellerType: input.sellerType ?? (input.supplierId ? "supplier" : "customer"),
            imei: cleanImei,
            serial: cleanSerial,
            // brand/model em DevicePurchase ficam como snapshot historico
            // — derivados do Product no momento da compra.
            brand: product.brand,
            model: product.name,
            condition: input.condition,
            batteryHealth: input.batteryHealth ?? null,
            purchasePrice: new Prisma.Decimal(input.purchasePrice).div(100),
            salePrice: input.salePrice != null ? new Prisma.Decimal(input.salePrice).div(100) : null,
            notes: input.notes || null,
          },
        });

        // Cria entrada efetiva no estoque: StockMovement + StockItem AVAILABLE.
        // Sempre serializado neste ponto (validacao acima).
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: product.id,
            variationId: variation?.id ?? null,
            type: "ENTRY",
            quantity: 1,
            reason: `Compra de aparelho${cleanImei ? ` — IMEI: ${cleanImei}` : ""}`,
            referenceId: purchase.id,
            referenceType: "device_purchase",
            userId: ctx.session.user.id,
          },
        });

        const conditionMap: Record<string, "NEW" | "SEMI_NEW" | "USED" | "DISPLAY"> = {
          NEW: "NEW",
          SEMI_NEW: "SEMI_NEW",
          USED: "USED",
          DISPLAY: "DISPLAY",
          REFURBISHED: "SEMI_NEW",
          DEFECTIVE: "USED",
        };
        // Aparelho entra BLOQUEADO no estoque ate o termo de responsabilidade
        // ser assinado (fisica ou Autentique). Libera automaticamente em
        // confirmPurchasePhysicalSignature e checkPurchaseSignatureStatus.
        // Operador NAO consegue vender no PDV ate liberar — reduz risco legal.
        await tx.stockItem.create({
          data: {
            tenantId: ctx.tenantId,
            productId: product.id,
            variationId: variation?.id ?? null,
            imei: cleanImei,
            serialNumber: cleanSerial,
            condition: conditionMap[input.condition] ?? "USED",
            batteryHealth: input.batteryHealth ?? null,
            costPrice: new Prisma.Decimal(input.purchasePrice).div(100),
            suggestedSalePrice: input.salePrice != null
              ? new Prisma.Decimal(input.salePrice).div(100)
              : null,
            status: "BLOCKED",
            notes: "Aguardando assinatura do termo de responsabilidade",
          },
        });

        // ── Pagamento da compra ───────────────────────────────────────
        if (input.paymentMode && input.purchasePrice > 0) {
          let sellerName = "Fornecedor não identificado";
          if (input.supplierId) {
            const sup = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { name: true } });
            sellerName = sup?.name ?? sellerName;
          } else if (input.customerId) {
            const cust = await tx.customer.findUnique({ where: { id: input.customerId }, select: { name: true } });
            sellerName = cust?.name ?? sellerName;
          }
          const description = `Compra ${product.name}${input.imei ? ` — IMEI ${input.imei}` : ""}`;
          const totalCents = input.purchasePrice;

          if (input.paymentMode === "now") {
            // Pago agora: forma obrigatoria
            if (!input.paymentMethodId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Selecione a forma de pagamento.",
              });
            }
            const method = await tx.paymentMethod.findFirst({
              where: { id: input.paymentMethodId, active: true },
              select: { id: true, name: true, code: true, type: true },
            });
            if (!method) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Forma de pagamento invalida.",
              });
            }

            await tx.financialTransaction.create({
              data: {
                tenantId: ctx.tenantId,
                type: "PAYABLE",
                status: "PAID",
                description,
                supplierId: input.supplierId ?? undefined,
                supplier: sellerName,
                customerId: input.customerId ?? undefined,
                paymentMethodId: method.id,
                totalAmount: new Prisma.Decimal(totalCents).div(100),
                paidAmount: new Prisma.Decimal(totalCents).div(100),
                installmentsTotal: 1,
                dueDate: new Date(),
                emissionDate: new Date(),
                paidAt: new Date(),
                referenceType: "device_purchase",
                referenceId: purchase.id,
                createdByUserId: ctx.session.user.id,
              },
            });

            // Cash OUTCOME quando dinheiro ou PIX (saida fisica do caixa).
            // Cartao/transferencia/boleto nao mexem em caixa fisico.
            const cashLikeTypes: ReadonlyArray<typeof method.type> = ["CASH", "PIX"];
            if (cashLikeTypes.includes(method.type)) {
              const openSession = await tx.cashSession.findFirst({
                where: { closedAt: null },
                select: { id: true },
              });
              if (openSession) {
                await writeCashMovement(tx, {
                  tenantId: ctx.tenantId,
                  cashSessionId: openSession.id,
                  type: "WITHDRAWAL",
                  nature: "OUTCOME",
                  amountCents: totalCents,
                  paymentMethod: method.code ?? method.type.toLowerCase(),
                  description: `Compra ${product.name}${input.imei ? ` — IMEI ${input.imei}` : ""}`,
                  referenceId: purchase.id,
                  referenceType: "device_purchase",
                  createdByUserId: ctx.session.user.id,
                });
              }
            }
          } else if (input.paymentMode === "payable") {
            // A prazo: gera PAYABLE pendente com parcelas
            const installmentsCount = input.payableInstallments ?? 1;
            const firstDate = input.payableFirstDueDate ? new Date(input.payableFirstDueDate) : new Date();
            const installmentAmount = Math.round(totalCents / installmentsCount);
            const remainder = totalCents - installmentAmount * installmentsCount;

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

            // Carbon-style addMonths (preserva dia ate ultimo dia do mes).
            const addMonthsSafe = (base: Date, months: number): Date => {
              const d = new Date(base);
              const day = d.getDate();
              d.setDate(1);
              d.setMonth(d.getMonth() + months);
              const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
              d.setDate(Math.min(day, last));
              return d;
            };
            const installments = Array.from({ length: installmentsCount }, (_, i) => {
              const dueDate = addMonthsSafe(firstDate, i);
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

        // Carrega dados do vendedor (cliente ou fornecedor) — exibido na view
        // de detalhe e usado pra popular o WhatsappRecipientPicker no envio
        // do termo.
        let sellerName: string | null = null;
        let sellerPhones: Array<{ label: string; value: string }> = [];
        let seller: {
          kind: "customer" | "supplier";
          id: string;
          name: string;
          document: string | null;
          documentType: "CPF" | "CNPJ" | null;
          phone: string | null;
          email: string | null;
        } | null = null;

        if (purchase.sellerType === "customer" && purchase.customerId) {
          const c = await tx.customer.findUnique({
            where: { id: purchase.customerId },
            select: { id: true, name: true, cpf: true, cnpj: true, phone: true, phoneSecondary: true, email: true },
          });
          if (c) {
            sellerName = c.name;
            if (c.phone) sellerPhones.push({ label: `Telefone — ${c.phone}`, value: c.phone });
            if (c.phoneSecondary && c.phoneSecondary !== c.phone) {
              sellerPhones.push({ label: `Secundario — ${c.phoneSecondary}`, value: c.phoneSecondary });
            }
            seller = {
              kind: "customer",
              id: c.id,
              name: c.name,
              document: c.cnpj ?? c.cpf ?? null,
              documentType: c.cnpj ? "CNPJ" : c.cpf ? "CPF" : null,
              phone: c.phone ?? null,
              email: c.email ?? null,
            };
          }
        } else if (purchase.sellerType === "supplier" && purchase.supplierId) {
          const s = await tx.supplier.findUnique({
            where: { id: purchase.supplierId },
            select: { id: true, name: true, cpf: true, cnpj: true, phone: true, email: true },
          });
          if (s) {
            sellerName = s.name;
            if (s.phone) sellerPhones.push({ label: `Telefone — ${s.phone}`, value: s.phone });
            seller = {
              kind: "supplier",
              id: s.id,
              name: s.name,
              document: s.cnpj ?? s.cpf ?? null,
              documentType: s.cnpj ? "CNPJ" : s.cpf ? "CPF" : null,
              phone: s.phone ?? null,
              email: s.email ?? null,
            };
          }
        }

        return {
          ...purchase,
          purchasePrice: Math.round(Number(purchase.purchasePrice) * 100),
          salePrice: purchase.salePrice ? Math.round(Number(purchase.salePrice) * 100) : null,
          sellerName,
          sellerPhones,
          seller,
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
      if (!can(ctx.session, ctx.tenantId, "cancelPurchase")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem cancelar compras." });
      }
      return ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.findUnique({ where: { id: input.id } });
        if (!purchase) throw new TRPCError({ code: "NOT_FOUND" });

        if (purchase.cancelledAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Compra ja cancelada" });
        }

        // I7 (auditoria estoque 2026-07-10): CAS no cancelamento — guarda
        // `cancelledAt: null`. Sem isto, dois cancelamentos concorrentes passavam
        // ambos o read-then-write e revertiam o estoque em DOBRO (o decremento
        // não-serializado `updateMany currentStock >= 1` roda 2×). count 0 = já
        // cancelada por outra operação.
        const cancelClaim = await tx.devicePurchase.updateMany({
          where: { id: input.id, cancelledAt: null },
          data: {
            cancelledAt: new Date(),
            cancellationReason: input.reason,
          },
        });
        if (cancelClaim.count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "Compra ja cancelada por outra operacao." });
        }

        // Reverte estoque APENAS se a compra gerou entrada real. Antes
        // criava EXIT cego, mesmo quando createPurchase nao havia
        // gerado ENTRY (StockItem ausente) — movimento orfao.
        if (purchase.productId) {
          const product = await tx.product.findUnique({
            where: { id: purchase.productId },
            select: { isSerialized: true },
          });
          if (product?.isSerialized) {
            // Marca o StockItem criado por essa compra como removido (soft delete)
            // para liberar o IMEI. createPurchase cria o item como BLOCKED (aguarda
            // termo de responsabilidade) e ele vira AVAILABLE so apos assinar — por
            // isso aceitamos AMBOS os status: cancelar antes de assinar deixava o
            // item BLOCKED orfao, com o IMEI preso e impedindo recadastro.
            // SOLD/RESERVED ficam de fora: ja tem fluxo proprio (venda/reserva).
            const matched = await tx.stockItem.findFirst({
              where: {
                productId: purchase.productId,
                imei: purchase.imei,
                status: { in: [...PURCHASE_REVERSIBLE_STATUSES] },
                deletedAt: null,
              },
              select: { id: true },
            });
            if (matched) {
              await tx.stockItem.update({
                where: { id: matched.id },
                data: { deletedAt: new Date(), status: "BLOCKED" },
              });
              await tx.stockMovement.create({
                data: {
                  tenantId: ctx.tenantId,
                  productId: purchase.productId,
                  stockItemId: matched.id,
                  type: "EXIT",
                  quantity: 1,
                  reason: `Cancelamento compra — ${input.reason}`,
                  referenceId: purchase.id,
                  referenceType: "device_purchase_cancel",
                  userId: ctx.session.user.id,
                },
              });
            }
            // Se nao acha StockItem (createPurchase antigo nao criava),
            // nao emite movimento orfao.
          } else {
            // Nao serializado: decrement currentStock (createPurchase
            // novo faz increment). updateMany com gte:1 evita negativo.
            const r = await tx.product.updateMany({
              where: { id: purchase.productId, currentStock: { gte: 1 } },
              data: { currentStock: { decrement: 1 } },
            });
            if (r.count === 1) {
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
            // Se currentStock < 1 (item ja foi vendido depois), nao
            // emite movimento — evita negativar.
          }
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
      if (!can(ctx.session, ctx.tenantId, "changePurchaseDate")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem alterar a data da compra." });
      }
      const newDate = new Date(input.purchaseDate);
      if (Number.isNaN(newDate.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data invalida." });
      }
      // Compra nao pode ter data no futuro (corrige auditoria/relatorios).
      if (newDate.getTime() > Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A data da compra nao pode ser no futuro." });
      }
      return ctx.withTenant(async (tx) => {
        const existing = await tx.devicePurchase.findUnique({ where: { id: input.id } });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Compra nao encontrada" });
        await tx.devicePurchase.update({
          where: { id: input.id },
          data: { purchaseDate: newDate },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // PURCHASE TERM SIGNATURE (paridade Laravel)
  // ═══════════════════════════════════════

  /**
   * Confirma assinatura fisica do termo de responsabilidade da compra.
   * Qualquer usuario autenticado pode marcar termo como assinado fisicamente
   * (quando o cliente assinou no papel).
   */
  confirmPurchasePhysicalSignature: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — atualiza compra + libera StockItem (BLOCKED -> AVAILABLE)
      const docToCancel = await ctx.withTenant(async (tx) => {
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
        // Libera o StockItem dessa compra (estava BLOCKED aguardando assinatura)
        await releaseStockItemForPurchase(tx, purchase);
        return purchase.autentiqueDocumentId;
      });

      // ETAPA 2 — se ja existia documento Autentique pendente, cancela best-effort
      // (paridade Laravel CompraAparelhoController:371-383). Evita docs orfaos
      // consumindo creditos e elimina a chance do cliente assinar depois do
      // operador ja ter marcado como fisica.
      if (docToCancel) {
        const { cancelDocument } = await import("@/lib/services/autentique-service");
        await cancelDocument(docToCancel).catch((err) => {
          logger.warn("Falha ao cancelar doc Autentique apos confirmar fisica", {
            purchaseId: input.id,
            err: String(err),
          });
        });
      }

      return { success: true };
    }),

  /**
   * Envia termo de responsabilidade para Autentique via WhatsApp.
   * Paridade `CompraAparelhoController::enviarTermoAutentique`.
   */
  sendPurchaseTermAutentique: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      // Numero customizado override (paridade PDV sale.sendForSignature).
      whatsappOverride: z.string().min(10).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch dados em tx curta
      const { sellerName, sellerPhone, wasResend, purchaseNumber } = await ctx.withTenant(async (tx) => {
        const purchase = await tx.devicePurchase.findUnique({ where: { id: input.id } });
        if (!purchase) throw new TRPCError({ code: "NOT_FOUND" });
        if (purchase.termSigned) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo ja foi assinado." });
        }
        // Reenvio permitido (paridade PDV): se ja havia doc, considera resend
        // e sobrescreve com novo. Doc antigo fica orfao no Autentique — best
        // effort cancelar abaixo.
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
        const whatsapp = input.whatsappOverride || sellerPhone;
        if (!whatsapp) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vendedor sem telefone cadastrado. Informe um numero.",
          });
        }
        return {
          sellerName: sellerName || "Vendedor",
          sellerPhone: whatsapp,
          wasResend: !!purchase.autentiqueDocumentId,
          purchaseNumber: input.id.slice(0, 8),
          oldDocId: purchase.autentiqueDocumentId,
        };
      });

      // ETAPA 2 — gera PDF via builder direto (sem HTTP/cookies) e envia
      // ao Autentique.
      const { buildPurchaseTermPdf } = await import("@/lib/pdf/purchase-term-builder");
      const pdfBuffer = await buildPurchaseTermPdf(ctx.tenantId, input.id);
      if (!pdfBuffer) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Falha ao gerar PDF do termo para assinatura.",
        });
      }

      const result = await createDocumentWithLink(
        `Termo de Responsabilidade - Compra ${purchaseNumber}`,
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

      // ETAPA 4 — envia link + PDF via WhatsApp Meta Cloud (paridade PDV
      // sale.sendForSignature). Falha nao bloqueia — operador tem o link
      // na UI pra enviar manualmente se necessario.
      if (result.signatureLink) {
        try {
          const { sendPdfWithFallback } = await import("@/lib/whatsapp/send-with-fallback");
          const { createPublicPdfToken } = await import("@/lib/whatsapp/public-pdf-token");
          const { extractShortlinkToken } = await import("@/lib/services/autentique-service");
          const pdfToken = createPublicPdfToken(
            ctx.tenantId,
            input.id,
            60 * 60 * 1000,
            "purchase_term",
          );
          const appUrl = getAppBaseUrl();
          const pdfUrl = `${appUrl}/api/whatsapp-media/purchase/pdf/${pdfToken}`;
          const autentiqueToken = extractShortlinkToken(result.signatureLink);
          const caption =
            `📋 *Arena Tech - Termo de Responsabilidade*\n\n` +
            `Ola, ${sellerName}! Para assinar digitalmente o termo da venda do seu aparelho:\n${result.signatureLink}`;
          const wa = await sendPdfWithFallback({
            phone: sellerPhone,
            pdfUrl,
            fileName: `Compra_${purchaseNumber}_termo_responsabilidade.pdf`,
            caption,
            contexto: "pdv_termo_pdf_link",
            params: [sellerName, purchaseNumber],
            urlButtonParam: autentiqueToken ?? undefined,
            log: { tenantId: ctx.tenantId, originType: "device_purchase", originId: input.id },
          });
          if (!wa.success) {
            logger.warn("Falha ao enviar termo de compra via WhatsApp", {
              purchaseId: input.id, error: wa.error,
            });
          } else {
            logger.info("Termo de compra enviado por WhatsApp", {
              purchaseId: input.id,
              via: wa.via,
              templateUsed: wa.templateUsed,
            });
          }
        } catch (err) {
          logger.warn("Erro ao despachar WhatsApp do termo de compra", {
            purchaseId: input.id,
            err: String(err),
          });
        }
      }

      logger.info("Purchase term sent to Autentique", {
        purchaseId: input.id,
        documentId: result.documentId,
        wasResend,
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

      // ETAPA 3 — persiste se assinado + libera StockItem
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
          await releaseStockItemForPurchase(tx, purchase);
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
          currentStock: true,
          isSerialized: true,
          hasVariations: true,
        },
      });

      const stockByProduct = await resolveCurrentStockByProduct(tx, products);
      const productsWithStock = products.map((p) => ({
        ...p,
        currentStock: stockByProduct.get(p.id) ?? 0,
      }));

      const totalProducts = productsWithStock.length;
      const totalItems = productsWithStock.reduce((sum, p) => sum + p.currentStock, 0);
      const totalCostValue = productsWithStock.reduce(
        (sum, p) => sum + p.currentStock * Number(p.costPrice),
        0,
      );
      const totalSaleValue = productsWithStock.reduce(
        (sum, p) => sum + p.currentStock * Number(p.salePrice),
        0,
      );
      const lowStockCount = productsWithStock.filter(
        (p) => p.minStock > 0 && p.currentStock <= p.minStock,
      ).length;
      const outOfStockCount = productsWithStock.filter((p) => p.currentStock <= 0).length;

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
          currentStock: true,
          isSerialized: true,
          hasVariations: true,
        },
      });

      const stockByProduct = await resolveCurrentStockByProduct(tx, products);
      return products
        .map((p) => ({ ...p, currentStock: stockByProduct.get(p.id) ?? 0 }))
        .filter((p) => p.currentStock <= p.minStock);
    });
  }),

  /** Stats for dashboard cards */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const products = await tx.product.findMany({
        where: { deletedAt: null, active: true },
        select: {
          id: true,
          currentStock: true,
          hasVariations: true,
          isSerialized: true,
          minStock: true,
          salePrice: true,
        },
      });
      const stockByProduct = await resolveCurrentStockByProduct(tx, products);
      const productsWithStock = products.map((p) => ({
        ...p,
        currentStock: stockByProduct.get(p.id) ?? 0,
      }));
      const totalProducts = productsWithStock.length;
      const totalItems = productsWithStock.reduce((sum, p) => sum + p.currentStock, 0);
      const totalSaleValue = productsWithStock.reduce(
        (sum, p) => sum + p.currentStock * Number(p.salePrice),
        0,
      );
      const lowStockCount = productsWithStock.filter(
        (p) => p.minStock > 0 && p.currentStock <= p.minStock,
      ).length;

      return {
        totalProducts,
        totalItems,
        totalSaleValue: Math.round(totalSaleValue * 100),
        lowStockCount,
      };
    });
  }),

  /** Search products for autocomplete (EntitySelector) */
  searchProducts: tenantProcedure
    .input(
      z.object({
        search: z.string().min(1),
        // Telas que so operam saldo por quantidade (baixa, ajuste por quantidade)
        // passam true: serializados nao tem saldo agregado e sao recusados pelo
        // servidor — esconde-los da busca evita o erro tardio e a confusao.
        excludeSerialized: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const products = await tx.product.findMany({
          where: {
            deletedAt: null,
            active: true,
            ...(input.excludeSerialized ? { isSerialized: false } : {}),
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
            currentStock: true,
            hasVariations: true,
            isSerialized: true,
          },
        });
        // Resolve o saldo REAL: serializados contam StockItem AVAILABLE,
        // produtos com variacoes somam o estoque das variacoes. Sem isto, o
        // currentStock cru ficava errado (sempre 0/desatualizado) para esses
        // tipos — divergindo do PDV, que ja resolve corretamente.
        const stockByProduct = await resolveCurrentStockByProduct(tx, products);
        return products.map((p) => ({
          ...p,
          currentStock: stockByProduct.get(p.id) ?? 0,
        }));
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
      // ADR 0053: operador (membro do tenant) cadastra fornecedor — dia a dia.
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
      // ADR 0053: operador (membro do tenant) edita fornecedor — dia a dia.
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
      if (!can(ctx.session, ctx.tenantId, "deleteSupplier")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem excluir fornecedores." });
      }
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem criar categorias." });
      }
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar categorias." });
      }
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem excluir categorias." });
      }
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
      // ADR 0053: operador (membro do tenant) dá entrada no estoque — dia a dia.
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findFirst({
          where: { id: input.productId, deletedAt: null },
        });
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        // Serializados nao usam currentStock — entrada via StockItem (compra
        // de aparelhos / DevicePurchase).
        if (product.isSerialized) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Produto serializado: registre a entrada pelo fluxo de Compra de Aparelhos (StockItem).",
          });
        }

        // Produto com variacoes exige variationId
        if (product.hasVariations) {
          if (!input.variationId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selecione uma variacao para registrar a entrada.",
            });
          }
          const variation = await tx.productVariation.findUnique({
            where: { id: input.variationId },
          });
          if (!variation || variation.productId !== input.productId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Variacao nao pertence a este produto." });
          }
          await tx.productVariation.update({
            where: { id: input.variationId },
            data: { currentStock: { increment: input.quantity } },
          });
        } else {
          // Produto simples — atualiza current_stock no proprio produto
          await tx.product.update({
            where: { id: input.productId },
            data: { currentStock: { increment: input.quantity } },
          });
        }

        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            variationId: input.variationId || null,
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

  /**
   * Entrada em LOTE: header (fornecedor + motivo) compartilhado + N itens
   * processados numa unica transacao. Se um item falhar (produto nao encontrado,
   * serializado, variacao invalida), tudo faz rollback — operador re-tenta o
   * lote inteiro corrigido. Paridade comportamental com stockEntry singular.
   */
  stockEntryBatch: tenantProcedure
    .input(stockEntryBatchSchema)
    .mutation(async ({ ctx, input }) => {
      // ADR 0053: operador (membro do tenant) dá entrada em lote — dia a dia.
      return ctx.withTenant(async (tx) => {
        // Pre-carrega todos os produtos do lote (1 findMany em vez de N).
        const productIds = [...new Set(input.items.map((it) => it.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, deletedAt: null },
          select: { id: true, isSerialized: true, hasVariations: true, name: true },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        // Mesmo pre-load pras variacoes referenciadas (validacao de ownership).
        const variationIds = input.items
          .map((it) => it.variationId)
          .filter((v): v is string => !!v);
        const variations = variationIds.length
          ? await tx.productVariation.findMany({
              where: { id: { in: variationIds } },
              select: { id: true, productId: true },
            })
          : [];
        const variationMap = new Map(variations.map((v) => [v.id, v]));

        // Valida tudo antes de mutar — falha cedo sem efeito colateral.
        for (let i = 0; i < input.items.length; i++) {
          const it = input.items[i]!;
          const p = productMap.get(it.productId);
          if (!p) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Item ${i + 1}: produto nao encontrado.` });
          }
          if (p.isSerialized) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Item ${i + 1} ("${p.name}"): produto serializado — registre pelo fluxo de Compra de Aparelhos.`,
            });
          }
          if (p.hasVariations) {
            if (!it.variationId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Item ${i + 1} ("${p.name}"): selecione uma variacao.`,
              });
            }
            const v = variationMap.get(it.variationId);
            if (!v || v.productId !== it.productId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Item ${i + 1} ("${p.name}"): variacao nao pertence ao produto.`,
              });
            }
          }
        }

        // Aplica entradas + movimentos (atomico — qualquer erro rollback).
        for (const it of input.items) {
          if (it.variationId) {
            await tx.productVariation.update({
              where: { id: it.variationId },
              data: { currentStock: { increment: it.quantity } },
            });
          } else {
            await tx.product.update({
              where: { id: it.productId },
              data: { currentStock: { increment: it.quantity } },
            });
          }
          await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: it.productId,
              variationId: it.variationId || null,
              type: "ENTRY",
              quantity: it.quantity,
              reason: input.reason,
              referenceId: input.supplierId || null,
              referenceType: input.supplierId ? "supplier" : null,
              userId: ctx.session.user.id,
            },
          });
        }

        return { success: true, count: input.items.length };
      });
    }),

  stockExit: tenantProcedure
    .input(stockExitSchema)
    .mutation(async ({ ctx, input }) => {
      // ADR 0053: operador (membro do tenant) dá saída avulsa — dia a dia.
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findFirst({
          where: { id: input.productId, deletedAt: null },
        });
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }
        if (product.isSerialized) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Produto serializado: registre a baixa via venda ou descarte do StockItem.",
          });
        }

        if (product.hasVariations) {
          if (!input.variationId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selecione uma variacao para registrar a baixa.",
            });
          }
          const variation = await tx.productVariation.findUnique({
            where: { id: input.variationId },
          });
          if (!variation || variation.productId !== input.productId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Variacao nao pertence a este produto." });
          }
          // compare-and-set atomico (evita oversell sob concorrencia)
          const rv = await tx.productVariation.updateMany({
            where: { id: input.variationId, currentStock: { gte: input.quantity } },
            data: { currentStock: { decrement: input.quantity } },
          });
          if (rv.count !== 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Estoque insuficiente para esta variacao (atual: ${variation.currentStock}).`,
            });
          }
        } else {
          // compare-and-set atomico (evita oversell sob concorrencia)
          const rp = await tx.product.updateMany({
            where: { id: input.productId, currentStock: { gte: input.quantity } },
            data: { currentStock: { decrement: input.quantity } },
          });
          if (rp.count !== 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Estoque insuficiente (atual: ${product.currentStock}).`,
            });
          }
        }

        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: input.productId,
            variationId: input.variationId || null,
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
      // Saldo efetivo por produto cobrindo os TRES tipos (antes so contava
      // stock_items, ignorando produtos simples e com variacoes — totais e
      // alertas vinham subestimados e divergiam do card "stats"):
      //  - serializado: COUNT(stock_items AVAILABLE)
      //  - com variacoes: SUM(product_variations.current_stock)
      //  - simples: products.current_stock
      // qty = quantidade disponivel; cost/sale value derivam dela.
      const effectiveStockCte = Prisma.sql`
        SELECT
          p.id,
          p.name,
          p.sku,
          p.min_stock,
          p.cost_price,
          p.sale_price,
          CASE
            WHEN p.is_serialized THEN COALESCE(si.qty, 0)
            WHEN p.has_variations THEN COALESCE(pv.qty, 0)
            ELSE p.current_stock
          END AS qty
        FROM products p
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int AS qty
          FROM stock_items
          WHERE status = 'AVAILABLE' AND deleted_at IS NULL
          GROUP BY product_id
        ) si ON si.product_id = p.id
        LEFT JOIN (
          SELECT product_id, COALESCE(SUM(current_stock), 0)::int AS qty
          FROM product_variations
          -- active = true: mesma regra de resolveCurrentStockByProduct (variação
          -- inativa não conta), senão o dashboard diverge da listagem/relatórios.
          WHERE deleted_at IS NULL AND active = true
          GROUP BY product_id
        ) pv ON pv.product_id = p.id
        WHERE p.deleted_at IS NULL AND p.active = true
      `;

      const [totalProducts, totalsRows] = await Promise.all([
        tx.product.count({ where: { deletedAt: null, active: true } }),
        tx.$queryRaw<Array<{ totalItems: number; totalCost: string | null; totalSale: string | null }>>(
          Prisma.sql`
            SELECT
              COALESCE(SUM(eff.qty), 0)::int AS "totalItems",
              COALESCE(SUM(eff.qty * eff.cost_price), 0)::text AS "totalCost",
              COALESCE(SUM(eff.qty * eff.sale_price), 0)::text AS "totalSale"
            FROM (${effectiveStockCte}) eff
          `,
        ),
      ]);

      const totalItems = Number(totalsRows[0]?.totalItems ?? 0);
      const totalCostValue = Number(totalsRows[0]?.totalCost ?? 0);
      const totalSaleValue = Number(totalsRows[0]?.totalSale ?? 0);

      // Low/out of stock: limita 20 cada — dashboard mostra alerta, nao
      // tabela completa. Usa o mesmo saldo efetivo (cobre os 3 tipos).
      const lowStockProducts = await tx.$queryRaw<
        Array<{ id: string; name: string; sku: string | null; minStock: number; currentStock: number }>
      >(Prisma.sql`
        SELECT eff.id, eff.name, eff.sku, eff.min_stock AS "minStock", eff.qty AS "currentStock"
        FROM (${effectiveStockCte}) eff
        WHERE eff.min_stock > 0 AND eff.qty <= eff.min_stock AND eff.qty > 0
        ORDER BY (eff.qty::float / NULLIF(eff.min_stock, 0)) ASC
        LIMIT 20
      `);

      const outOfStockProducts = await tx.$queryRaw<
        Array<{ id: string; name: string; sku: string | null; minStock: number; currentStock: number }>
      >(Prisma.sql`
        SELECT eff.id, eff.name, eff.sku, eff.min_stock AS "minStock", 0 AS "currentStock"
        FROM (${effectiveStockCte}) eff
        WHERE eff.qty = 0
        ORDER BY eff.name ASC
        LIMIT 20
      `);

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
          // Receita de mercadoria = subtotal - desconto (nao o totalAmount, que
          // e liquido do trade-in). Mantem coerencia com o lucro (item-based).
          select: { subtotal: true, discountAmount: true },
        }),
        tx.saleItem.findMany({
          where: {
            sale: { status: "COMPLETED", saleDate: { gte: todayStart, lte: todayEnd } },
          },
          select: { total: true, costPrice: true, quantity: true },
        }),
      ]);

      const vendasHojeQtd = salesToday.length;
      const vendasHojeValor = salesToday.reduce(
        (s, v) => s + Math.max(0, Number(v.subtotal) - Number(v.discountAmount)),
        0,
      );
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
            currentStock: true,
            isSerialized: true,
            hasVariations: true,
          },
        });

        const stockByProduct = await resolveCurrentStockByProduct(tx, products);
        const productsWithStock = products.map((p) => ({
          ...p,
          currentStock: stockByProduct.get(p.id) ?? 0,
        }));

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

        // R6 (auditoria estoque 2026-07-10): os totais agregam no BANCO sobre
        // TODO o período — antes somavam só as 500 linhas retornadas, subestimando
        // o total em qualquer período com >500 movimentos (sem aviso). Respeita o
        // filtro input.type (se filtrou EXIT, o total de ENTRY é 0).
        const baseWhere: Prisma.StockMovementWhereInput = { ...where };
        delete baseWhere.type;
        const wantEntry = !input.type || input.type === "ENTRY";
        const wantExit = !input.type || input.type === "EXIT";
        const [entriesAgg, exitsAgg] = await Promise.all([
          wantEntry
            ? tx.stockMovement.aggregate({ where: { ...baseWhere, type: "ENTRY" }, _sum: { quantity: true } })
            : Promise.resolve({ _sum: { quantity: 0 } }),
          wantExit
            ? tx.stockMovement.aggregate({ where: { ...baseWhere, type: "EXIT" }, _sum: { quantity: true } })
            : Promise.resolve({ _sum: { quantity: 0 } }),
        ]);
        const entries = entriesAgg._sum.quantity ?? 0;
        const exits = exitsAgg._sum.quantity ?? 0;

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
            currentStock: true,
            isSerialized: true,
            hasVariations: true,
          },
        });

        const stockByProduct = await resolveCurrentStockByProduct(tx, products);
        const withStatus = products.map((p) => {
          const currentStock = stockByProduct.get(p.id) ?? 0;
          return {
            ...p,
            currentStock,
            diff: currentStock - p.minStock,
            status: currentStock < p.minStock ? ("below" as const) : ("ok" as const),
          };
        });

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
            // Receita de mercadoria = subtotal - desconto. NAO usamos totalAmount
            // (liquido do trade-in) — senao o "valor" vira so a diferenca e o
            // lucro fica negativo em vendas com upgrade. Ver lib/sales/sale-revenue.
            subtotal: true,
            discountAmount: true,
            sellerId: true,
            customerId: true,
            items: {
              select: {
                costPrice: true,
                quantity: true,
              },
            },
          },
        });

        let totalVendidoCents = 0;
        let totalDescontoCents = 0;
        let totalCustoCents = 0;

        const salesData = sales.map((s) => {
          const subtotalCents = Math.round(Number(s.subtotal) * 100);
          const descontoCents = Math.round(Number(s.discountAmount) * 100);
          const custoCents = s.items.reduce(
            (sum, i) => sum + Math.round(Number(i.costPrice) * 100) * i.quantity,
            0,
          );
          const valorCents = saleGoodsRevenueCents(subtotalCents, descontoCents);
          totalVendidoCents += valorCents;
          totalDescontoCents += descontoCents;
          totalCustoCents += custoCents;

          return {
            id: s.id,
            number: s.number,
            saleDate: s.saleDate,
            totalAmount: valorCents,
            discountAmount: descontoCents,
            costTotal: custoCents,
            profit: valorCents - custoCents,
            sellerId: s.sellerId,
            customerId: s.customerId,
          };
        });

        const qtd = salesData.length;
        return {
          sales: salesData,
          totals: {
            quantity: qtd,
            totalVendido: totalVendidoCents,
            totalDesconto: totalDescontoCents,
            lucroBruto: totalVendidoCents - totalCustoCents,
            ticketMedio: qtd > 0 ? Math.round(totalVendidoCents / qtd) : 0,
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
              // R1 (auditoria estoque 2026-07-10): inclui PARTIALLY_REFUNDED. O
              // estorno parcial ZERA o `total` dos itens devolvidos (mantém os
              // retidos) — então somar item.total pega exatamente a receita
              // retida. Antes o filtro só-COMPLETED sumia com a venda inteira,
              // escondendo a receita dos itens que o cliente ficou.
              status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] },
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
            // Receita de mercadoria = subtotal - desconto (centavos), NÃO
            // totalAmount (líquido do trade-in). Espelha reportVendasPeriodo:
            // usar totalAmount subestimava receita/lucro do vendedor em vendas
            // com upgrade (podia ficar negativo) e não batia com o relatório por
            // período. Ver lib/sales/sale-revenue.
            subtotal: true,
            discountAmount: true,
            items: {
              select: { costPrice: true, quantity: true },
            },
          },
        });

        // Group by seller — tudo em centavos (evita drift de float).
        const sellerMap = new Map<
          string,
          { qty: number; total: number; discount: number; cost: number }
        >();

        for (const s of sales) {
          const subtotalCents = Math.round(Number(s.subtotal) * 100);
          const discountCents = Math.round(Number(s.discountAmount) * 100);
          const revenueCents = saleGoodsRevenueCents(subtotalCents, discountCents);
          const costCents = s.items.reduce(
            (sum, i) => sum + Math.round(Number(i.costPrice) * 100) * i.quantity,
            0,
          );
          const existing = sellerMap.get(s.sellerId);
          if (existing) {
            existing.qty++;
            existing.total += revenueCents;
            existing.discount += discountCents;
            existing.cost += costCents;
          } else {
            sellerMap.set(s.sellerId, {
              qty: 1,
              total: revenueCents,
              discount: discountCents,
              cost: costCents,
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
            // data.* já estão em centavos.
            totalAmount: data.total,
            discountAmount: data.discount,
            ticketMedio: data.qty > 0 ? Math.round(data.total / data.qty) : 0,
            profit: data.total - data.cost,
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
          // R3 (auditoria estoque 2026-07-10): receita = subtotal − desconto
          // (mercadoria), NÃO totalAmount (líquido do trade-in). Alinha o card de
          // resumo ao reportVendasPeriodo/DRE — antes o "valor total" do resumo
          // ficava menor/negativo em vendas com aparelho de entrada.
          tx.sale.aggregate({
            where: {
              status: "COMPLETED",
              saleDate: { gte: dateFrom, lte: dateTo },
            },
            _count: true,
            _sum: { subtotal: true, discountAmount: true },
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
            valorTotal:
              Math.round(Number(sales._sum.subtotal ?? 0) * 100) -
              Math.round(Number(sales._sum.discountAmount ?? 0) * 100),
          },
          estoque: {
            entradas: entries._sum.quantity ?? 0,
            saidas: exits._sum.quantity ?? 0,
          },
          upgrades: purchases,
        };
      });
    }),

  /**
   * Preview server-side de importacao CSV: valida cada linha com Zod e
   * reporta duplicidades (SKU/barcode ja existentes ou repetidos no arquivo).
   * Paridade Laravel ImportacaoProdutoController::preview.
   */
  previewCsvImport: tenantProcedure
    .input(csvImportSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        type LineIssue = { line: number; field?: string; message: string };
        const errors: LineIssue[] = [];
        const warnings: LineIssue[] = [];

        // Detecta SKU/barcode duplicados no proprio arquivo
        const skuMap = new Map<string, number[]>();
        const barcodeMap = new Map<string, number[]>();
        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i]!;
          if (l.sku) {
            const arr = skuMap.get(l.sku) ?? [];
            arr.push(i + 1);
            skuMap.set(l.sku, arr);
          }
          if (l.barcode) {
            const arr = barcodeMap.get(l.barcode) ?? [];
            arr.push(i + 1);
            barcodeMap.set(l.barcode, arr);
          }
        }
        for (const [sku, lines] of skuMap.entries()) {
          if (lines.length > 1) {
            for (const ln of lines) {
              errors.push({ line: ln, field: "sku", message: `SKU duplicado no arquivo: ${sku}` });
            }
          }
        }
        for (const [barcode, lines] of barcodeMap.entries()) {
          if (lines.length > 1) {
            for (const ln of lines) {
              errors.push({ line: ln, field: "barcode", message: `Codigo de barras duplicado no arquivo: ${barcode}` });
            }
          }
        }

        // Detecta SKU/barcode ja existentes no banco
        const skus = [...skuMap.keys()];
        const barcodes = [...barcodeMap.keys()];
        const [existingSkus, existingBarcodes] = await Promise.all([
          skus.length > 0
            ? tx.product.findMany({
                where: { sku: { in: skus }, deletedAt: null },
                select: { sku: true },
              })
            : Promise.resolve([]),
          barcodes.length > 0
            ? tx.product.findMany({
                where: { barcode: { in: barcodes }, deletedAt: null },
                select: { barcode: true },
              })
            : Promise.resolve([]),
        ]);
        const existingSkuSet = new Set(existingSkus.map((p) => p.sku).filter(Boolean));
        const existingBarcodeSet = new Set(existingBarcodes.map((p) => p.barcode).filter(Boolean));

        // Avisos por linha
        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i]!;
          if (l.sku && existingSkuSet.has(l.sku)) {
            warnings.push({ line: i + 1, field: "sku", message: `SKU ${l.sku} ja existe no banco — sera duplicado` });
          }
          if (l.barcode && existingBarcodeSet.has(l.barcode)) {
            warnings.push({ line: i + 1, field: "barcode", message: `Codigo de barras ${l.barcode} ja existe no banco — sera duplicado` });
          }
          // Serializado pode entrar com preco 0 (preco real vem por unidade).
          if (!l.isSerialized && l.salePrice <= 0) {
            errors.push({ line: i + 1, field: "salePrice", message: "Preço de venda deve ser maior que zero" });
          }
          if (l.costPrice != null && l.costPrice > l.salePrice) {
            warnings.push({ line: i + 1, field: "costPrice", message: "Custo maior que preço de venda (margem negativa)" });
          }
        }

        return {
          totalLines: input.lines.length,
          validLines: input.lines.length - new Set(errors.map((e) => e.line)).size,
          errors,
          warnings,
          canProceed: errors.length === 0,
        };
      });
    }),

  /**
   * Gera CSV-template para importacao (cabecalho + 2 linhas de exemplo).
   * Paridade Laravel ImportacaoProdutoController::downloadTemplate.
   * BOM UTF-8 + separador `;` para abertura direta no Excel BR.
   */
  getCsvImportTemplate: tenantProcedure.query(() => {
    const header = [
      "nome", "sku", "barcode", "marca", "categoria",
      "preco_custo", "preco_venda", "preco_promocional",
      "estoque_minimo", "quantidade", "controla_imei", "descricao",
    ];
    const sample1 = [
      "Capa iPhone 15 Pro Silicone Preta", "CAP-IPH15-PRE", "7891234567890", "Apple", "Capas",
      "25.00", "59.90", "49.90", "5", "20", "false", "Capa silicone com cabo magsafe",
    ];
    const sample2 = [
      "Carregador USB-C 20W Branco", "CAR-USBC-20W", "7899876543210", "Generico", "Carregadores",
      "15.50", "39.90", "", "10", "50", "false", "",
    ];
    const csv = "﻿"
      + [header, sample1, sample2].map((row) => row.join(";")).join("\n");
    return {
      csv,
      fileName: `template-importacao-produtos-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }),

  /** CSV Import - process lines */
  importCsv: tenantProcedure
    .input(csvImportSchema)
    .mutation(async ({ ctx, input }) => {
      // A1 (auditoria estoque 2026-07-10, decisão do dono): import de catálogo é
      // curadoria = admin, alinhado com `create`/`createCategory` (manageCatalog).
      // Antes era operador (importCatalogCsv), o que contornava o gate admin do
      // cadastro unitário — operador criava produtos+categorias em lote via CSV.
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem importar catalogo." });
      }
      return ctx.withTenant(async (tx) => {
        let productsCreated = 0;
        let stockEntries = 0;
        let categoriesCreated = 0;
        const errors: string[] = [];
        const categoryCache = new Map<string, string>();

        // Pre-pass: detecta duplicatas dentro do proprio CSV (SKU/barcode
        // repetidos no mesmo arquivo).
        const seenSku = new Set<string>();
        const seenBarcode = new Set<string>();
        const lineErrors = new Map<number, string>();
        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i]!;
          if (l.sku) {
            const k = l.sku.trim().toLowerCase();
            if (seenSku.has(k)) lineErrors.set(i, `SKU "${l.sku}" duplicado no CSV`);
            seenSku.add(k);
          }
          if (l.barcode) {
            const k = l.barcode.trim();
            if (seenBarcode.has(k)) lineErrors.set(i, `Barcode "${l.barcode}" duplicado no CSV`);
            seenBarcode.add(k);
          }
        }

        // Dedup contra DB sem N+1: 1 findMany pra todos os SKUs/barcodes do CSV
        // (antes era 2 findFirst por linha — centenas de queries num arquivo grande).
        const csvSkus = input.lines.map((l) => l.sku).filter((s): s is string => !!s);
        const csvBarcodes = input.lines.map((l) => l.barcode).filter((b): b is string => !!b);
        const existingProducts =
          csvSkus.length || csvBarcodes.length
            ? await tx.product.findMany({
                where: {
                  deletedAt: null,
                  OR: [
                    ...(csvSkus.length ? [{ sku: { in: csvSkus } }] : []),
                    ...(csvBarcodes.length ? [{ barcode: { in: csvBarcodes } }] : []),
                  ],
                },
                select: { sku: true, barcode: true },
              })
            : [];
        const existingSku = new Set(
          existingProducts.map((p) => p.sku).filter((s): s is string => !!s),
        );
        const existingBarcode = new Set(
          existingProducts.map((p) => p.barcode).filter((b): b is string => !!b),
        );

        for (let i = 0; i < input.lines.length; i++) {
          const line = input.lines[i]!;
          if (lineErrors.has(i)) {
            errors.push(`Linha ${i + 1} (${line.name}): ${lineErrors.get(i)}`);
            continue;
          }
          try {
            // Dedup contra DB (via Sets pre-carregados — sem query por linha).
            if (line.sku && existingSku.has(line.sku)) {
              errors.push(`Linha ${i + 1} (${line.name}): SKU "${line.sku}" ja existe`);
              continue;
            }
            if (line.barcode && existingBarcode.has(line.barcode)) {
              errors.push(`Linha ${i + 1} (${line.name}): Barcode "${line.barcode}" ja existe`);
              continue;
            }

            // Resolve category
            let categoryId: string | null = null;
            if (line.category) {
              const catKey = line.category.toLowerCase().trim();
              if (categoryCache.has(catKey)) {
                categoryId = categoryCache.get(catKey)!;
              } else {
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

            const initialQty = line.quantity && line.quantity > 0 && !line.isSerialized
              ? line.quantity
              : 0;

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
                currentStock: initialQty,
                categoryId,
                active: true,
              },
            });
            productsCreated++;

            // Stock movement de entrada inicial (so quando ha qty + nao serializado).
            if (initialQty > 0) {
              await tx.stockMovement.create({
                data: {
                  tenantId: ctx.tenantId,
                  productId: product.id,
                  type: "ENTRY",
                  quantity: initialQty,
                  reason: "Importacao CSV em lote",
                  userId: ctx.session.user.id,
                },
              });
              stockEntries += initialQty;
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        // A4 (auditoria estoque 2026-07-10): não excluir atributo em uso por
        // variação viva — deixaria a variação com referência órfã e o label
        // quebrado (assimétrico com deleteVariation/deleteCategory, que já
        // checam vínculo). Conta ProductVariationAttribute → valor → atributo.
        const inUse = await tx.productVariationAttribute.count({
          where: { attributeValue: { attributeId: input.id }, variation: { deletedAt: null } },
        });
        if (inUse > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Atributo em uso por variacoes ativas. Remova as variacoes antes de excluir.",
          });
        }
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        // A4: não desativar valor de atributo em uso por variação viva.
        const inUse = await tx.productVariationAttribute.count({
          where: { attributeValueId: input.id, variation: { deletedAt: null } },
        });
        if (inUse > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Valor de atributo em uso por variacoes ativas.",
          });
        }
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
        const variations = await tx.productVariation.findMany({
          where,
          include: {
            attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          },
          orderBy: { createdAt: "asc" },
        });
        // Adiciona `label` pronto para UI (ex: "Cor: Azul, Tamanho: M")
        return variations.map((v) => {
          const attrs = v.attributeValues.map((pva) => ({
            attributeName: pva.attributeValue.attribute.name,
            value: pva.attributeValue.value,
          }));
          const label = attrs.map((a) => `${a.attributeName}: ${a.value}`).join(", ");
          return {
            ...v,
            label: label || (v.sku ?? "Variacao"),
          };
        });
      });
    }),

  createVariation: tenantProcedure
    .input(createVariationSchema)
    .mutation(async ({ ctx, input }) => {
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        // Nao deletar variacao que ainda tem itens no estoque — deixaria
        // StockItems orfaos. Mesma protecao do update do produto.
        const hasStock = await tx.stockItem.findFirst({
          where: { variationId: input.id, deletedAt: null },
          select: { id: true },
        });
        if (hasStock) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel excluir uma variacao que tem itens no estoque.",
          });
        }
        return tx.productVariation.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  /** Define a imagem de uma variacao (Cloudinary por padrao, MinIO como fallback). */
  setVariationImage: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      imageUrl: z.string().url(),
      imageProvider: z.enum(["cloudinary", "minio", "external"]).optional().nullable(),
      imageProviderPublicId: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.productVariation.update({
          where: { id: input.id },
          data: {
            imageUrl: input.imageUrl,
            imageProvider: input.imageProvider ?? null,
            imageProviderPublicId: input.imageProviderPublicId ?? null,
          },
        });
      });
    }),

  /** Remove a imagem de uma variacao. Paridade Laravel removerImagemVariacao. */
  removeVariationImage: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const variation = await tx.productVariation.findUnique({ where: { id: input.id } });
        const updated = await tx.productVariation.update({
          where: { id: input.id },
          data: { imageUrl: null, imageProvider: null, imageProviderPublicId: null },
        });
        if (variation?.imageUrl) {
          void deleteProductImage({
            url: variation.imageUrl,
            provider: variation.imageProvider,
            providerPublicId: variation.imageProviderPublicId,
          });
        }
        return updated;
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
            provider: input.provider ?? null,
            providerPublicId: input.providerPublicId ?? null,
            metadata: input.metadata ?? Prisma.JsonNull,
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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

        void deleteProductImage({
          url: photo.url,
          provider: photo.provider,
          providerPublicId: photo.providerPublicId,
        });

        return { success: true };
      });
    }),

  setPrimaryPhoto: tenantProcedure
    .input(setPrimaryPhotoSchema)
    .mutation(async ({ ctx, input }) => {
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
      if (!can(ctx.session, ctx.tenantId, "manageCatalog")) {
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
      // ADR 0053: operador (membro do tenant) dá entrada de itens serializados — dia a dia.
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
      // ADR 0053: operador (membro do tenant) dá entrada por quantidade — dia a dia.
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

  /** Inventory adjustment (non-serialized) */
  adjustInventory: tenantProcedure
    .input(stockAdjustmentSchema)
    .mutation(async ({ ctx, input }) => {
      // ADR 0053: operador (membro do tenant) ajusta inventário — dia a dia.
      return ctx.withTenant(async (tx) => {
        await adjustInventory(tx as any, ctx.tenantId, ctx.session.user.id, {
          productId: input.productId,
          newQuantity: input.newQuantity,
          reason: input.reason,
        });
        return { success: true };
      });
    }),

  /** Bulk inventory adjustment — paridade Laravel ajuste-em-massa. */
  bulkAdjust: tenantProcedure
    .input(bulkAdjustStockSchema)
    .mutation(async ({ ctx, input }) => {
      // ADR 0053: operador (membro do tenant) faz ajuste em massa — dia a dia.
      // Ajusta cada produto sequencialmente, dentro de UMA transacao — falha
      // num item aborta todos (atomicidade vs Laravel que rodava em DB::transaction).
      const result = await ctx.withTenant(async (tx) => {
        const updated: Array<{ productId: string; newQuantity: number }> = [];
        for (const item of input.items) {
          await adjustInventory(tx as any, ctx.tenantId, ctx.session.user.id, {
            productId: item.productId,
            variationId: item.variationId ?? null,
            newQuantity: item.newQuantity,
            reason: input.reason,
          });
          updated.push(item);
        }
        return updated;
      });
      logger.info("Bulk stock adjustment", {
        count: result.length,
        userId: ctx.session.user.id,
      });
      return { success: true, count: result.length };
    }),

  /** Change StockItem status (state machine validated) */
  changeItemStatus: tenantProcedure
    .input(changeStockItemStatusSchema)
    .mutation(async ({ ctx, input }) => {
      // SOLD/RETURNED pertencem ao fluxo de venda/estorno, não ao endpoint
      // manual — ver isManualStatusChangeAllowed. Bloqueado no boundary (o
      // serviço changeItemStatus só é alcançado por esta procedure).
      if (!isManualStatusChangeAllowed(input.newStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Baixa por venda/devolução acontece no PDV. Aqui só reserva, defeito, disponível ou bloqueio.",
        });
      }

      // ADR 0053: operador pode marcar defeito/devolução (movimento do dia a dia).
      // Bloquear item é perda/segurança — continua exigindo admin do tenant.
      if (input.newStatus === "BLOCKED" && !can(ctx.session, ctx.tenantId, "disposeStock")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores do tenant podem bloquear" });
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

  /** Baixa/descarte de uma unidade serializada (soft delete + movimento EXIT). */
  disposeStockItem: tenantProcedure
    .input(disposeStockItemSchema)
    .mutation(async ({ ctx, input }) => {
      // Baixa de patrimonio (perda) exige admin do tenant.
      if (!can(ctx.session, ctx.tenantId, "disposeStock")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para dar baixa em itens." });
      }
      return ctx.withTenant(async (tx) => {
        await disposeStockItem(tx as any, ctx.tenantId, ctx.session.user.id, {
          stockItemId: input.stockItemId,
          reason: input.reason,
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
        return getAvailableQuantity(tx, ctx.tenantId, input.productId);
      });
    }),
});
