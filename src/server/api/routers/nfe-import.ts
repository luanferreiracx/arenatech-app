/**
 * NF-e Import Router — XML upload, parsing, product linking, inventory import.
 * Faithful to Laravel NfeImportController + NfeImportService.
 */

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc"
import { parseNfeXml, validateAccessKey, allocateCosts } from "@/server/services/nfe-import.service"
import { logger } from "@/lib/logger"

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0
  return Math.round(Number(v) * 100)
}

function toDecimal4(v: number): Prisma.Decimal {
  return new Prisma.Decimal(v)
}

export const nfeImportRouter = createTRPCRouter({
  /** List imported NF-e with filters */
  list: tenantProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(["PENDING", "PROCESSING", "PROCESSED", "ERROR", "CANCELLED"]).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0
        const pageSize = input.pageSize ?? 20
        const where: Record<string, unknown> = {}

        if (input.status) where.status = input.status
        if (input.dateFrom) where.entryDate = { ...(where.entryDate as object ?? {}), gte: new Date(input.dateFrom) }
        if (input.dateTo) where.entryDate = { ...(where.entryDate as object ?? {}), lte: new Date(input.dateTo) }

        if (input.search?.trim()) {
          const term = input.search.trim()
          where.OR = [
            { nfNumber: { contains: term, mode: "insensitive" } },
            { issuerName: { contains: term, mode: "insensitive" } },
            { issuerTradeName: { contains: term, mode: "insensitive" } },
            { accessKey: { contains: term } },
            { issuerCnpj: { contains: term.replace(/\D/g, "") } },
          ]
        }

        const [data, total] = await Promise.all([
          tx.nfeImport.findMany({
            where,
            include: { _count: { select: { items: true } } },
            orderBy: { entryDate: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.nfeImport.count({ where }),
        ])

        return {
          data: data.map((nf) => ({
            ...nf,
            totalProductsValue: decimalToCents(nf.totalProductsValue),
            freightValue: decimalToCents(nf.freightValue),
            itemCount: nf._count.items,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        }
      })
    }),

  /** Get NF-e import by ID with items */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const nf = await tx.nfeImport.findUnique({
          where: { id: input.id },
          include: { items: { orderBy: { itemNumber: "asc" } } },
        })
        if (!nf) throw new TRPCError({ code: "NOT_FOUND" })
        return nf
      })
    }),

  /** Upload and process NF-e XML */
  processXml: tenantProcedure
    .input(z.object({
      xmlContent: z.string().min(100, "XML invalido"),
      confirmMismatch: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Parse XML
        const data = parseNfeXml(input.xmlContent)

        if (!data.accessKey || !validateAccessKey(data.accessKey)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Chave de acesso invalida no XML" })
        }

        // Check duplicate
        const existing = await tx.nfeImport.findFirst({
          where: { accessKey: data.accessKey },
        })
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "NF-e ja importada (chave de acesso duplicada)" })
        }

        // Check recipient CNPJ matches tenant
        const settings = await tx.tenantSettings.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { cnpj: true },
        })
        const tenantCnpj = settings?.cnpj?.replace(/\D/g, "") ?? ""
        const recipientCnpj = data.recipientCnpj.replace(/\D/g, "")

        if (tenantCnpj && recipientCnpj && tenantCnpj !== recipientCnpj && !input.confirmMismatch) {
          return {
            requiresConfirmation: true as const,
            message: `CNPJ destinatario (${data.recipientCnpj}) diferente do CNPJ da loja (${tenantCnpj})`,
            parsedData: data,
          }
        }

        // Try to find supplier by CNPJ
        let supplierId: string | null = null
        if (data.issuerCnpj) {
          const supplier = await tx.supplier.findFirst({
            where: { cnpj: { contains: data.issuerCnpj.replace(/\D/g, "") } },
            select: { id: true },
          })
          supplierId = supplier?.id ?? null
        }

        // Create NF-e import record
        const nfeImport = await tx.nfeImport.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            accessKey: data.accessKey,
            nfNumber: data.nfNumber || null,
            series: data.series || null,
            issueDate: data.issueDate ? new Date(data.issueDate) : null,
            supplierId,
            issuerCnpj: data.issuerCnpj || null,
            issuerName: data.issuerName || null,
            issuerTradeName: data.issuerTradeName || null,
            issuerIe: data.issuerIe || null,
            recipientCnpj: data.recipientCnpj || null,
            recipientName: data.recipientName || null,
            totalProductsValue: new Prisma.Decimal(data.totalProductsValue),
            freightValue: new Prisma.Decimal(data.freightValue),
            insuranceValue: new Prisma.Decimal(data.insuranceValue),
            discountValue: new Prisma.Decimal(data.discountValue),
            otherExpensesValue: new Prisma.Decimal(data.otherExpensesValue),
            effectiveFreight: new Prisma.Decimal(data.freightValue),
            effectiveInsurance: new Prisma.Decimal(data.insuranceValue),
            effectiveOtherExpenses: new Prisma.Decimal(data.otherExpensesValue),
            icmsValue: new Prisma.Decimal(data.icmsValue),
            ipiValue: new Prisma.Decimal(data.ipiValue),
            pisValue: new Prisma.Decimal(data.pisValue),
            cofinsValue: new Prisma.Decimal(data.cofinsValue),
            xmlOriginal: input.xmlContent,
            status: "PENDING",
          },
        })

        // Create items + auto-link por barcode/SKU
        let autoLinkedCount = 0;
        if (data.items.length > 0) {
          // Coleta candidatos (barcode, productCode/SKU) p/ uma única query
          const candidateCodes = Array.from(new Set(
            data.items.flatMap((it) => [it.barcode, it.productCode].filter(Boolean) as string[])
          ));

          const matchedProducts = candidateCodes.length > 0
            ? await tx.product.findMany({
                where: {
                  active: true,
                  deletedAt: null,
                  OR: [
                    { barcode: { in: candidateCodes } },
                    { sku: { in: candidateCodes } },
                  ],
                },
                select: { id: true, barcode: true, sku: true },
              })
            : [];

          const byBarcode = new Map<string, string>();
          const bySku = new Map<string, string>();
          for (const p of matchedProducts) {
            if (p.barcode) byBarcode.set(p.barcode, p.id);
            if (p.sku) bySku.set(p.sku, p.id);
          }

          await tx.nfeImportItem.createMany({
            data: data.items.map((item) => {
              const productId =
                (item.barcode && byBarcode.get(item.barcode)) ||
                (item.productCode && (byBarcode.get(item.productCode) ?? bySku.get(item.productCode))) ||
                null;
              if (productId) autoLinkedCount++;
              return {
                tenantId: ctx.tenantId,
                nfeImportId: nfeImport.id,
                itemNumber: item.itemNumber,
                productCode: item.productCode || null,
                barcode: item.barcode || null,
                description: item.description,
                ncm: item.ncm || null,
                cest: item.cest || null,
                cfop: item.cfop || null,
                unit: item.unit || null,
                quantity: toDecimal4(item.quantity),
                unitPrice: toDecimal4(item.unitPrice),
                totalValue: new Prisma.Decimal(item.totalValue),
                discountValue: new Prisma.Decimal(item.discountValue),
                icmsValue: new Prisma.Decimal(item.icmsValue),
                ipiValue: new Prisma.Decimal(item.ipiValue),
                productId,
                status: productId ? "LINKED" : "PENDING",
              };
            }),
          })
        }

        return {
          id: nfeImport.id,
          itemCount: data.items.length,
          autoLinkedCount,
          requiresConfirmation: false as const,
        };
      })
    }),

  /** Save effective costs and reallocate across items */
  saveCosts: tenantProcedure
    .input(z.object({
      nfeImportId: z.string().uuid(),
      effectiveFreight: z.number().min(0),
      effectiveInsurance: z.number().min(0),
      effectiveOtherExpenses: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const nf = await tx.nfeImport.findUnique({
          where: { id: input.nfeImportId },
          include: { items: { orderBy: { itemNumber: "asc" } } },
        })
        if (!nf || nf.status === "PROCESSED" || nf.status === "CANCELLED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "NF-e nao pode ser editada" })
        }

        // Update effective costs
        await tx.nfeImport.update({
          where: { id: input.nfeImportId },
          data: {
            effectiveFreight: new Prisma.Decimal(input.effectiveFreight),
            effectiveInsurance: new Prisma.Decimal(input.effectiveInsurance),
            effectiveOtherExpenses: new Prisma.Decimal(input.effectiveOtherExpenses),
          },
        })

        // Reallocate costs across items
        const itemsData = nf.items.map((i) => ({
          totalValue: Number(i.totalValue),
          quantity: Number(i.quantity),
        }))

        const allocations = allocateCosts(
          itemsData,
          input.effectiveFreight,
          input.effectiveInsurance,
          input.effectiveOtherExpenses
        )

        for (let idx = 0; idx < nf.items.length; idx++) {
          const item = nf.items[idx]!
          const alloc = allocations[idx]!
          await tx.nfeImportItem.update({
            where: { id: item.id },
            data: {
              allocatedFreight: toDecimal4(alloc.allocatedFreight),
              allocatedInsurance: toDecimal4(alloc.allocatedInsurance),
              allocatedOtherExpenses: toDecimal4(alloc.allocatedOtherExpenses),
              totalUnitCost: toDecimal4(alloc.totalUnitCost),
            },
          })
        }

        return { success: true }
      })
    }),

  /** Link an item to a product */
  linkItem: tenantProcedure
    .input(z.object({
      itemId: z.string().uuid(),
      productId: z.string().uuid(),
      variationId: z.string().uuid().optional().nullable(),
      condition: z.enum(["novo", "seminovo", "usado", "defeito"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.nfeImportItem.update({
          where: { id: input.itemId },
          data: {
            productId: input.productId,
            variationId: input.variationId ?? null,
            condition: input.condition ?? "novo",
            status: "LINKED",
          },
        })
        return { success: true }
      })
    }),

  /** Unlink an item from a product */
  unlinkItem: tenantProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.nfeImportItem.update({
          where: { id: input.itemId },
          data: {
            productId: null,
            variationId: null,
            condition: null,
            status: "PENDING",
          },
        })
        return { success: true }
      })
    }),

  /** Ignore an item (won't be imported) */
  ignoreItem: tenantProcedure
    .input(z.object({
      itemId: z.string().uuid(),
      reason: z.string().max(300).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.nfeImportItem.update({
          where: { id: input.itemId },
          data: {
            status: "IGNORED",
            notes: input.reason ?? null,
          },
        })
        return { success: true }
      })
    }),

  /** Import linked items to inventory (final step) */
  importToInventory: tenantProcedure
    .input(z.object({ nfeImportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const nf = await tx.nfeImport.findUnique({
          where: { id: input.nfeImportId },
          include: { items: true },
        })

        if (!nf) throw new TRPCError({ code: "NOT_FOUND" })
        if (nf.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "NF-e nao esta pendente" })
        }

        // Check all items are linked or ignored
        const pendingItems = nf.items.filter((i) => i.status === "PENDING")
        if (pendingItems.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${pendingItems.length} item(ns) ainda pendente(s) de vinculacao`,
          })
        }

        // Mark as processing
        await tx.nfeImport.update({
          where: { id: input.nfeImportId },
          data: { status: "PROCESSING" },
        })

        try {
          const linkedItems = nf.items.filter((i) => i.status === "LINKED" && i.productId)
          let importedCount = 0

          for (const item of linkedItems) {
            const quantity = Math.round(Number(item.quantity))
            if (quantity <= 0 || !item.productId) continue

            // Get product to check if serialized
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              select: { isSerialized: true, currentStock: true },
            })

            if (!product) continue

            if (!product.isSerialized) {
              // Non-serialized: increment currentStock
              await tx.product.update({
                where: { id: item.productId },
                data: { currentStock: { increment: quantity } },
              })

              // Create stock movement
              await tx.stockMovement.create({
                data: {
                  tenantId: ctx.tenantId,
                  productId: item.productId,
                  variationId: item.variationId ?? null,
                  type: "ENTRY",
                  quantity,
                  quantityBefore: product.currentStock,
                  quantityAfter: product.currentStock + quantity,
                  reason: `Entrada NF-e ${nf.nfNumber ?? nf.accessKey.slice(0, 12)}`,
                  referenceType: "nfe_import",
                  referenceId: nf.id,
                  userId: ctx.session.user.id,
                },
              })
            }

            // Update cost price if totalUnitCost is available
            if (item.totalUnitCost) {
              await tx.product.update({
                where: { id: item.productId },
                data: { costPrice: item.totalUnitCost },
              })
            }

            // Mark item as imported
            await tx.nfeImportItem.update({
              where: { id: item.id },
              data: { status: "IMPORTED" },
            })

            importedCount++
          }

          // Mark NF as processed
          await tx.nfeImport.update({
            where: { id: input.nfeImportId },
            data: {
              status: "PROCESSED",
              processedById: ctx.session.user.id,
              processedAt: new Date(),
            },
          })

          logger.info("NF-e import completed", { nfeImportId: input.nfeImportId, importedCount })
          return { success: true, importedCount }
        } catch (err) {
          // Mark as error
          await tx.nfeImport.update({
            where: { id: input.nfeImportId },
            data: {
              status: "ERROR",
              errorMessage: err instanceof Error ? err.message : "Erro desconhecido",
            },
          })
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao importar itens" })
        }
      })
    }),

  /** Cancel a pending/error NF-e import */
  cancel: tenantProcedure
    .input(z.object({ nfeImportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const nf = await tx.nfeImport.findUnique({ where: { id: input.nfeImportId } })
        if (!nf) throw new TRPCError({ code: "NOT_FOUND" })

        if (!["PENDING", "ERROR"].includes(nf.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas NF-e pendentes ou com erro podem ser canceladas" })
        }

        await tx.nfeImport.update({
          where: { id: input.nfeImportId },
          data: { status: "CANCELLED" },
        })

        return { success: true }
      })
    }),

  /** Delete a pending/cancelled/error NF-e */
  delete: tenantProcedure
    .input(z.object({ nfeImportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const nf = await tx.nfeImport.findUnique({ where: { id: input.nfeImportId } })
        if (!nf) throw new TRPCError({ code: "NOT_FOUND" })

        if (!["PENDING", "CANCELLED", "ERROR"].includes(nf.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "NF-e processada nao pode ser excluida" })
        }

        await tx.nfeImportItem.deleteMany({ where: { nfeImportId: input.nfeImportId } })
        await tx.nfeImport.delete({ where: { id: input.nfeImportId } })

        return { success: true }
      })
    }),

  /** Search products for linking (with variation support) */
  searchProducts: tenantProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const term = input.query.trim()
        const products = await tx.product.findMany({
          where: {
            active: true,
            deletedAt: null,
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { sku: { contains: term, mode: "insensitive" } },
              { barcode: { contains: term, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            isSerialized: true,
            hasVariations: true,
          },
          take: input.limit ?? 20,
          orderBy: { name: "asc" },
        })
        return products
      })
    }),

  /**
   * Suggest products with similarity score to help linking.
   * Strategy: tokenize description, match against product.name; bonus for NCM/brand match.
   * Paridade Laravel NfeImportService::sugerirProdutos.
   */
  suggestProducts: tenantProcedure
    .input(z.object({ itemId: z.string().uuid(), limit: z.number().int().min(1).max(20).optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.nfeImportItem.findUnique({
          where: { id: input.itemId },
          select: { description: true, ncm: true, unitPrice: true, barcode: true, productCode: true },
        });
        if (!item) return [];

        const description = (item.description ?? "").toLowerCase();
        const tokens = description
          .split(/[^a-z0-9áàâãéêíóôõúç]+/i)
          .filter((t) => t.length >= 3)
          .slice(0, 6);

        if (tokens.length === 0) return [];

        const products = await tx.product.findMany({
          where: {
            active: true,
            deletedAt: null,
            OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })),
          },
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            ncm: true,
            brand: true,
            costPrice: true,
            isSerialized: true,
            hasVariations: true,
          },
          take: 50,
        });

        const itemPrice = Number(item.unitPrice ?? 0);
        const itemNcm = item.ncm ?? "";

        type Suggestion = (typeof products)[number] & { score: number; reasons: string[] };

        const scored: Suggestion[] = products.map((p) => {
          const name = p.name.toLowerCase();
          let score = 0;
          const reasons: string[] = [];

          // Token overlap (peso maior)
          const matched = tokens.filter((t) => name.includes(t));
          if (matched.length > 0) {
            score += matched.length * 20;
            reasons.push(`${matched.length} palavra${matched.length > 1 ? "s" : ""} em comum`);
          }

          // NCM match (peso alto — indica família fiscal)
          if (itemNcm && p.ncm && itemNcm.replace(/\D/g, "") === p.ncm.replace(/\D/g, "")) {
            score += 30;
            reasons.push("NCM igual");
          }

          // Preço próximo (±30%)
          if (itemPrice > 0 && Number(p.costPrice) > 0) {
            const ratio = Number(p.costPrice) / itemPrice;
            if (ratio >= 0.7 && ratio <= 1.3) {
              score += 15;
              reasons.push("Preço próximo");
            }
          }

          return { ...p, score, reasons };
        });

        return scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, input.limit ?? 5)
          .map((s) => ({
            id: s.id,
            name: s.name,
            sku: s.sku,
            barcode: s.barcode,
            ncm: s.ncm,
            isSerialized: s.isSerialized,
            hasVariations: s.hasVariations,
            score: s.score,
            reasons: s.reasons,
          }));
      });
    }),

  /** Get product variations for linking */
  getProductVariations: tenantProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const variations = await tx.productVariation.findMany({
          where: { productId: input.productId, active: true },
          select: { id: true, sku: true, barcode: true },
          orderBy: { sku: "asc" },
        })
        return variations
      })
    }),

  /** Stats for NF-e imports dashboard */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const [total, pending, processed, error] = await Promise.all([
        tx.nfeImport.count(),
        tx.nfeImport.count({ where: { status: "PENDING" } }),
        tx.nfeImport.count({ where: { status: "PROCESSED" } }),
        tx.nfeImport.count({ where: { status: "ERROR" } }),
      ])
      return { total, pending, processed, error }
    })
  }),

  /** Download original XML */
  getXml: tenantProcedure
    .input(z.object({ nfeImportId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const nf = await tx.nfeImport.findUnique({
          where: { id: input.nfeImportId },
          select: { xmlOriginal: true, accessKey: true },
        })
        if (!nf?.xmlOriginal) throw new TRPCError({ code: "NOT_FOUND", message: "XML nao disponivel" })
        return { xml: nf.xmlOriginal, filename: `NFe_${nf.accessKey}.xml` }
      })
    }),
})
