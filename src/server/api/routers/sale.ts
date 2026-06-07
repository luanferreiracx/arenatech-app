import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, publicProcedure } from "@/server/api/trpc";
import { rateLimitMiddleware } from "@/server/api/middleware/rate-limit";
import { withAdmin } from "@/server/db";
import { createOsTechnicianCommission } from "@/server/services/os-commission.service";
import {
  addSaleItemSchema,
  updateSaleItemSchema,
  updateItemPriceSchema,
  applyDiscountSchema,
  finalizeSaleSchema,
  cancelSaleSchema,
  refundSaleSchema,
  listSalesSchema,
  searchProductsSchema,
  createFromOSSchema,
  sendSaleReceiptSchema,
  confirmSalePhysicalSignatureSchema,
  checkSaleSignatureStatusSchema,
  addSaleUpgradeSchema,
  removeSaleUpgradeSchema,
  checkSalePixStatusSchema,
  linkSaleCustomerSchema,
  updateSaleDateSchema,
} from "@/lib/validators/sale";
import { sendTextMessage, sendMediaMessage } from "@/lib/services/whatsapp-service";
import { createDocumentWithLink, getDocumentStatus, extractShortlinkToken } from "@/lib/services/autentique-service";
import { sendPdfWithFallback } from "@/lib/whatsapp/send-with-fallback";
import { isValidLuhn } from "@/lib/validators/imei";
import { createPublicPdfToken } from "@/lib/whatsapp/public-pdf-token";
import { logger } from "@/lib/logger";
import { createDeposit, checkTransactionStatus, createWithdraw } from "@/server/services/depix-transaction.service";
import { evaluateSaleReceiptPolicy } from "@/lib/services/sale-receipt-policy";
import { generatePublicToken } from "@/lib/utils/public-link";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

/**
 * Detecta pagamento em dinheiro de forma robusta. Normaliza acentos/caixa/
 * espacos antes de comparar — antes a checagem batia so em "dinheiro"|"cash"|
 * "DINHEIRO" literais, deixando passar "Dinheiro" / " dinheiro " e burlando a
 * exigencia de caixa aberto.
 */
function isCashMethod(method: string): boolean {
  const norm = method
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  return norm === "dinheiro" || norm === "cash" || norm === "money" || norm === "especie";
}

function isCompletedDepixStatus(status: string): boolean {
  return status === "COMPLETED" || status === "COMPLETED_FEE_PENDING";
}

function isManualDepixPayment(payment: { depixManual?: boolean }): boolean {
  return payment.depixManual === true;
}

function generatePublicLink(): string {
  return generatePublicToken(12);
}

function serializeSale(sale: Record<string, unknown>) {
  const s = sale as Record<string, unknown>;
  return {
    ...s,
    subtotal: decimalToCents(s.subtotal as Prisma.Decimal),
    discountValue: decimalToCents(s.discountValue as Prisma.Decimal),
    discountAmount: decimalToCents(s.discountAmount as Prisma.Decimal),
    totalAmount: decimalToCents(s.totalAmount as Prisma.Decimal),
    refundDueAmount: decimalToCents(s.refundDueAmount as Prisma.Decimal),
    surchargeAmount: decimalToCents(s.surchargeAmount as Prisma.Decimal),
    operatorFeeAmount: decimalToCents(s.operatorFeeAmount as Prisma.Decimal),
    netRevenueAmount: decimalToCents(s.netRevenueAmount as Prisma.Decimal),
    paidAmount: decimalToCents(s.paidAmount as Prisma.Decimal),
    changeAmount: decimalToCents(s.changeAmount as Prisma.Decimal),
    items: Array.isArray(s.items) ? (s.items as Record<string, unknown>[]).map(serializeItem) : [],
    upgrades: Array.isArray(s.upgrades)
      ? (s.upgrades as Record<string, unknown>[]).map(serializeUpgrade)
      : [],
  };
}

function serializeUpgrade(u: Record<string, unknown>) {
  return {
    ...u,
    appraisedValue: decimalToCents(u.appraisedValue as Prisma.Decimal),
    abatedValue: decimalToCents(u.abatedValue as Prisma.Decimal),
  };
}

function serializeItem(item: Record<string, unknown>) {
  return {
    ...item,
    unitPrice: decimalToCents(item.unitPrice as Prisma.Decimal),
    costPrice: decimalToCents(item.costPrice as Prisma.Decimal),
    discount: decimalToCents(item.discount as Prisma.Decimal),
    total: decimalToCents(item.total as Prisma.Decimal),
  };
}

export const saleRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // DRAFT MANAGEMENT
  // ═══════════════════════════════════════

  /** Create a new draft sale (idempotent — reuses existing draft for this user) */
  createDraft: tenantProcedure.mutation(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      // Reuse existing DRAFT for the same seller to avoid unique constraint
      // violations and handle React Strict Mode double-invocation
      const existing = await tx.sale.findFirst({
        where: {
          tenantId: ctx.tenantId,
          sellerId: ctx.session.user.id,
          status: "DRAFT",
          deletedAt: null,
          isOSPayment: false,
        },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        return serializeSale(existing as unknown as Record<string, unknown>);
      }

      // Use a unique draft number per seller to avoid unique([tenantId, number]) conflict
      const draftNumber = `DRAFT-${ctx.session.user.id.slice(0, 8)}-${Date.now()}`;

      const sale = await tx.sale.create({
        data: {
          tenantId: ctx.tenantId,
          number: draftNumber,
          sellerId: ctx.session.user.id,
          status: "DRAFT",
          publicLink: generatePublicLink(),
        },
        include: { items: true },
      });
      return serializeSale(sale as unknown as Record<string, unknown>);
    });
  }),

  /** Abandon (delete) all existing common DRAFT sales for the current seller */
  abandonDraft: tenantProcedure.mutation(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      await tx.saleItem.deleteMany({
        where: {
          sale: {
            tenantId: ctx.tenantId,
            sellerId: ctx.session.user.id,
            status: "DRAFT",
            deletedAt: null,
            isOSPayment: false,
          },
        },
      });
      await tx.sale.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          sellerId: ctx.session.user.id,
          status: "DRAFT",
          deletedAt: null,
          isOSPayment: false,
        },
      });
      return { ok: true };
    });
  }),

  /** Get a draft sale by ID */
  getDraft: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: input.id },
          include: { items: true, upgrades: true },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
        }
        // Enriquece items com isDevice — UI usa pra exigir cliente quando
        // tem aparelho no carrinho (rastreabilidade IMEI).
        const productIds = [...new Set(sale.items.map((i) => i.productId))];
        const products = productIds.length
          ? await tx.product.findMany({
              where: { id: { in: productIds } },
              select: { id: true, isDevice: true },
            })
          : [];
        const isDeviceMap = new Map(products.map((p) => [p.id, p.isDevice]));
        const itemsWithDevice = sale.items.map((it) => ({
          ...it,
          isDevice: isDeviceMap.get(it.productId) ?? false,
        }));

        // Pagamento de OS: anexa os itens da OS (read-only) para o PDV exibir.
        // A venda em si nao carrega sale_items (checkout puro — ver createFromOS).
        let osItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }> = [];
        if (sale.isOSPayment && sale.serviceOrderId) {
          const osItemRows = await tx.serviceOrderItem.findMany({
            where: { orderId: sale.serviceOrderId },
            select: { description: true, quantity: true, unitPrice: true, total: true },
          });
          osItems = osItemRows.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: decimalToCents(i.unitPrice),
            total: decimalToCents(i.total),
          }));
        }

        let customerSummary: { customerName: string | null; customerTaxId: string | null } = {
          customerName: sale.customerName ?? null,
          customerTaxId: null,
        };
        if (sale.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: sale.customerId },
            select: { name: true, cpf: true, cnpj: true },
          });
          customerSummary = {
            customerName: customer?.name ?? sale.customerName ?? null,
            customerTaxId: customer?.cpf ?? customer?.cnpj ?? null,
          };
        }

        return {
          ...serializeSale({
            ...sale,
            items: itemsWithDevice,
          } as unknown as Record<string, unknown>),
          ...customerSummary,
          osItems,
        };
      });
    }),

  // ═══════════════════════════════════════
  // CART OPERATIONS
  // ═══════════════════════════════════════

  /** Add item to draft sale (increments quantity if product already in cart) */
  addItem: tenantProcedure
    .input(addSaleItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: input.saleId },
          include: { items: true },
        });
        if (!sale || sale.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Venda nao encontrada ou nao esta em rascunho",
          });
        }

        const product = await tx.product.findUnique({ where: { id: input.productId } });
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });
        }

        // Bloqueia mistura aparelho + acessorio/peca no mesmo carrinho (paridade
        // Laravel PdvCarrinhoService::validarTipoVenda). A "calculadora" de taxas
        // tem comportamentos diferentes pra cada tipo (juros, prazo de recebimento
        // do cartao, politica de absorcao). Misturar tornaria o calculo ambiguo.
        if (sale.items.length > 0) {
          const productIds = [...new Set(sale.items.map((i) => i.productId))];
          const cartProducts = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: { isDevice: true },
          });
          const cartHasDevice = cartProducts.some((p) => p.isDevice);
          const cartHasNonDevice = cartProducts.some((p) => !p.isDevice);
          if (cartHasDevice && !product.isDevice) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Esta venda e de aparelhos. Para vender acessorios/pecas, inicie uma nova venda.",
            });
          }
          if (cartHasNonDevice && product.isDevice) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Esta venda e de acessorios/pecas. Para vender aparelhos, inicie uma nova venda.",
            });
          }
        }

        // Produtos serializados (isSerialized=true) exigem escolha do IMEI
        // especifico — paridade Laravel PdvController::adicionarItem.
        if (product.isSerialized) {
          if (!input.stockItemId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selecione o aparelho (IMEI) para este produto.",
            });
          }
          if (input.quantity !== 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Aparelhos serializados sao vendidos um por vez.",
            });
          }
          const stockItem = await tx.stockItem.findUnique({
            where: { id: input.stockItemId },
            select: {
              id: true, productId: true, status: true, costPrice: true,
              suggestedSalePrice: true, imei: true, serialNumber: true,
              condition: true, batteryHealth: true, warrantyMonths: true,
            },
          });
          if (!stockItem) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Item de estoque nao encontrado" });
          }
          if (stockItem.productId !== input.productId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Item nao pertence a este produto." });
          }
          if (stockItem.status !== "AVAILABLE") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Este aparelho nao esta disponivel para venda.",
            });
          }
          // Para serializados nao consolida em existingItem — cada IMEI eh uma linha.
          const existingStock = sale.items.find((i) => i.stockItemId === input.stockItemId);
          if (existingStock) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Este aparelho ja foi adicionado a venda.",
            });
          }
          const unitPriceCents = input.unitPrice
            || (stockItem.suggestedSalePrice ? decimalToCents(stockItem.suggestedSalePrice) : decimalToCents(product.salePrice));
          // Garantia: usa do StockItem; senao padrao das settings por condicao.
          let warrantyMonths = stockItem.warrantyMonths ?? null;
          if (warrantyMonths == null) {
            const settings = await tx.tenantSettings.findUnique({
              where: { tenantId: ctx.tenantId },
              select: { warrantyNewMonths: true, warrantyUsedMonths: true },
            });
            warrantyMonths = stockItem.condition === "NEW"
              ? (settings?.warrantyNewMonths ?? 12)
              : (settings?.warrantyUsedMonths ?? 3);
          }
          await tx.saleItem.create({
            data: {
              tenantId: ctx.tenantId,
              saleId: input.saleId,
              productId: input.productId,
              stockItemId: input.stockItemId,
              description: product.name,
              quantity: 1,
              unitPrice: centsToPrisma(unitPriceCents),
              costPrice: stockItem.costPrice,
              total: centsToPrisma(unitPriceCents),
              // Snapshot do aparelho no momento da venda.
              imei: stockItem.imei,
              serial: stockItem.serialNumber,
              condition: stockItem.condition,
              batteryHealth: stockItem.batteryHealth,
              warrantyMonths,
            },
          });
          return recalculateSale(tx, input.saleId, ctx.tenantId);
        }

        // Produtos com variacoes (has_variations=true) exigem escolha da variacao
        // — paridade Laravel PdvController::adicionarItem.
        if (product.hasVariations) {
          if (!input.variationId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selecione uma variacao (cor/tamanho) para este produto.",
            });
          }
          const variation = await tx.productVariation.findUnique({
            where: { id: input.variationId },
            include: {
              attributeValues: {
                include: {
                  attributeValue: {
                    include: { attribute: { select: { name: true } } },
                  },
                },
              },
            },
          });
          if (!variation || variation.productId !== input.productId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Variacao nao pertence a este produto.",
            });
          }
          if (!variation.active || variation.deletedAt) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Variacao inativa." });
          }
          // Consolida em linha existente da MESMA variacao.
          const existingVar = sale.items.find(
            (i) => i.productId === input.productId && i.variationId === input.variationId,
          );
          // Preco: prefere variation.salePrice; fallback product.salePrice.
          const fallbackPrice = variation.salePrice
            ? decimalToCents(variation.salePrice)
            : decimalToCents(product.salePrice);
          const unitPriceCents =
            input.unitPrice ||
            (existingVar ? decimalToCents(existingVar.unitPrice) : fallbackPrice);
          // Descricao com atributos: "MOUSE KP-MU028 - Cor: Blue"
          const attrLabel = variation.attributeValues
            .map((pva) => `${pva.attributeValue.attribute.name}: ${pva.attributeValue.value}`)
            .join(", ");
          const desc = attrLabel ? `${product.name} - ${attrLabel}` : product.name;
          if (existingVar) {
            const newQty = existingVar.quantity + input.quantity;
            await tx.saleItem.update({
              where: { id: existingVar.id },
              data: {
                quantity: newQty,
                unitPrice: centsToPrisma(unitPriceCents),
                total: centsToPrisma(unitPriceCents * newQty),
              },
            });
          } else {
            await tx.saleItem.create({
              data: {
                tenantId: ctx.tenantId,
                saleId: input.saleId,
                productId: input.productId,
                variationId: input.variationId,
                description: desc,
                quantity: input.quantity,
                unitPrice: centsToPrisma(unitPriceCents),
                costPrice: variation.costPrice ?? product.costPrice,
                total: centsToPrisma(unitPriceCents * input.quantity),
              },
            });
          }
          return recalculateSale(tx, input.saleId, ctx.tenantId);
        }

        // Produto generico (nao serializado, sem variacao) — consolida em linha existente.
        const existingItem = sale.items.find(
          (i) => i.productId === input.productId && !i.stockItemId && !i.variationId,
        );
        if (existingItem) {
          const newQty = existingItem.quantity + input.quantity;
          const unitPriceCents = input.unitPrice || decimalToCents(existingItem.unitPrice);
          const totalCents = unitPriceCents * newQty;
          await tx.saleItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: newQty,
              unitPrice: centsToPrisma(unitPriceCents),
              total: centsToPrisma(totalCents),
            },
          });
        } else {
          const unitPriceCents = input.unitPrice || decimalToCents(product.salePrice);
          const totalCents = unitPriceCents * input.quantity;
          await tx.saleItem.create({
            data: {
              tenantId: ctx.tenantId,
              saleId: input.saleId,
              productId: input.productId,
              description: product.name,
              quantity: input.quantity,
              unitPrice: centsToPrisma(unitPriceCents),
              costPrice: product.costPrice,
              total: centsToPrisma(totalCents),
            },
          });
        }

        return recalculateSale(tx, input.saleId, ctx.tenantId);
      });
    }),

  /** Update item quantity in cart */
  updateItemQuantity: tenantProcedure
    .input(updateSaleItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale || sale.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Venda nao encontrada ou nao esta em rascunho",
          });
        }

        const item = await tx.saleItem.findUnique({ where: { id: input.itemId } });
        if (!item || item.saleId !== input.saleId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item nao encontrado" });
        }

        // TODO: Estoque-B will handle stock validation via StockItem

        const unitPriceCents = decimalToCents(item.unitPrice);
        const totalCents = unitPriceCents * input.quantity;

        await tx.saleItem.update({
          where: { id: input.itemId },
          data: {
            quantity: input.quantity,
            total: centsToPrisma(totalCents),
          },
        });

        return recalculateSale(tx, input.saleId, ctx.tenantId);
      });
    }),

  /** Remove item from cart */
  removeItem: tenantProcedure
    .input(z.object({ saleId: z.string().uuid(), itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale || sale.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Venda nao encontrada ou nao esta em rascunho",
          });
        }

        await tx.saleItem.delete({ where: { id: input.itemId } });

        return recalculateSale(tx, input.saleId, ctx.tenantId);
      });
    }),

  /** Set customer on draft */
  setCustomer: tenantProcedure
    .input(z.object({
      saleId: z.string().uuid(),
      customerId: z.string().uuid().nullable(),
      // Cliente avulso (sem cadastro). Ignorado se customerId presente.
      customerName: z.string().min(2).max(255).nullable().optional(),
      customerPhone: z.string().min(8).max(30).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            customerId: input.customerId,
            // Quando vinculado a customerId, limpa campos de avulso.
            customerName: input.customerId ? null : (input.customerName ?? null),
            customerPhone: input.customerId ? null : (input.customerPhone ?? null),
          },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // DISCOUNT
  // ═══════════════════════════════════════

  /** Apply discount to draft sale */
  applyDiscount: tenantProcedure
    .input(applyDiscountSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: input.saleId },
          include: { items: true },
        });
        if (!sale || sale.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Venda nao encontrada ou nao esta em rascunho",
          });
        }

        // Pagamento de OS: subtotal vem do total da OS (gravado em sale.subtotal),
        // pois nao ha sale_items. Venda normal: soma dos itens.
        const subtotalCents = sale.isOSPayment
          ? decimalToCents(sale.subtotal)
          : sale.items.reduce((sum, item) => sum + decimalToCents(item.total), 0);

        let discountAmountCents: number;
        if (input.discountType === "percentage") {
          if (input.discountValue > 100) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Percentual de desconto nao pode ser maior que 100%",
            });
          }
          discountAmountCents = Math.round(subtotalCents * (input.discountValue / 100));
        } else {
          // Fixed discount in centavos
          discountAmountCents = Math.round(input.discountValue);
          if (discountAmountCents > subtotalCents) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Desconto nao pode ser maior que o subtotal",
            });
          }
        }

        const totalCents = subtotalCents - discountAmountCents;

        // discountValue armazena: centavos quando fixed; percentual (0-100)
        // quando percentage. NAO usar centsToPrisma aqui (dividiria por 100
        // e zeraria descontos percentuais).
        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            discountType: input.discountType,
            discountValue: new Prisma.Decimal(input.discountValue),
            discountAmount: centsToPrisma(discountAmountCents),
            discountReason: input.discountReason ?? null,
            subtotal: centsToPrisma(subtotalCents),
            totalAmount: centsToPrisma(totalCents),
          },
        });

        const updated = await tx.sale.findUnique({
          where: { id: input.saleId },
          include: { items: true },
        });
        return serializeSale(updated as unknown as Record<string, unknown>);
      });
    }),

  // ═══════════════════════════════════════
  // FINALIZE (ATOMIC)
  // ═══════════════════════════════════════

  /** Finalize sale atomically: generate number, decrement stock, create CashMovement + FinancialTransaction */
  finalize: tenantProcedure
    .input(finalizeSaleSchema)
    .mutation(async ({ ctx, input }) => {
      const txResult = await ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: input.saleId },
          include: { items: true },
        });

        if (!sale || sale.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Venda nao encontrada ou nao esta em rascunho",
          });
        }

        // Pagamento de OS e checkout puro (sem sale_items — o total vem da OS).
        // Para vendas normais, carrinho vazio e erro.
        if (sale.items.length === 0 && !sale.isOSPayment) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Carrinho vazio",
          });
        }
        if (sale.isOSPayment && decimalToCents(sale.totalAmount) <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OS sem valor a receber.",
          });
        }

        // totalAmount AGORA eh liquido pos-upgrade (paridade Laravel
        // PdvService:85-87): sale.totalAmount = subtotal - desconto - upgrade.
        // Quanto o cliente paga em outras formas eh diretamente totalCents.
        const totalCents = decimalToCents(sale.totalAmount);
        const refundDueCents = decimalToCents(sale.refundDueAmount);
        const amountDueAfterUpgradeCents = totalCents;
        const payments = input.payments ?? [];
        const paidCents = payments.reduce((sum, p) => sum + p.amount, 0);

        // DePix via QR so pode finalizar depois de liquidado na wallet. O
        // frontend auto-finaliza quando recebe SSE/polling, mas o servidor
        // revalida para impedir tampering ou corrida com status ainda pendente.
        for (const payment of payments) {
          if (payment.method !== "depix" || isManualDepixPayment(payment)) continue;
          if (!payment.walletTransactionId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "DePix ainda nao confirmado. Aguarde a confirmacao do pagamento.",
            });
          }
          const walletTx = await checkTransactionStatus(ctx.tenantId, payment.walletTransactionId);
          if (!walletTx) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Transacao DePix nao encontrada." });
          }
          if (walletTx.sourceType !== "SALE" || walletTx.sourceId !== sale.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Transacao DePix nao pertence a esta venda.",
            });
          }
          if (!isCompletedDepixStatus(walletTx.status)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "DePix ainda nao liquidado. Aguarde a confirmacao do pagamento.",
            });
          }
        }

        // Calcula breakdown de taxas (paridade Laravel CalculadoraPagamento).
        // Determina tipo da venda: se TODOS os itens sao aparelhos -> APARELHO;
        // se NENHUM -> NAO_APARELHO; misto -> AMBOS.
        const productIds = sale.items.map((i) => i.productId);
        const products = productIds.length > 0
          ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { isDevice: true } })
          : [];
        const allDevices = products.length > 0 && products.every((p) => p.isDevice);
        const noDevices = products.length > 0 && products.every((p) => !p.isDevice);
        const appliesTo: "APARELHO" | "NAO_APARELHO" | "AMBOS" = allDevices
          ? "APARELHO"
          : noDevices ? "NAO_APARELHO" : "AMBOS";

        // Regra de negocio: venda de aparelho exige cliente vinculado
        // (rastreabilidade do IMEI, termo de entrega + DevicePurchase em
        // upgrade). Paridade Laravel `validarClienteParaAparelho`.
        const hasAnyDevice = products.some((p) => p.isDevice);
        if (hasAnyDevice && !input.customerId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Venda com aparelho exige cliente selecionado. Use 'Selecionar Cliente' antes de finalizar.",
          });
        }

        let totalSurcharge = 0;
        let totalOperatorFee = 0;
        let totalNetRevenue = 0;
        let totalPaidByCustomer = 0;

        for (const payment of payments) {
          let breakdown;
          if (payment.paymentMethodId) {
            const { calculatePaymentByMethodId } = await import("@/lib/services/payment-calculator");
            breakdown = await calculatePaymentByMethodId(tx, {
              paymentMethodId: payment.paymentMethodId,
              installments: payment.installments ?? 1,
              valorMercadoria: payment.amount,
              appliesTo,
              totalPaidManual: payment.totalPaidByCustomer ?? null,
            });
            if (breakdown.error) {
              throw new TRPCError({ code: "BAD_REQUEST", message: breakdown.error });
            }
          } else {
            // Sem paymentMethodId — assume LOJA_ABSORVE com taxa 0 (paridade
            // comportamento anterior: dinheiro/pix sem cadastro). Se o
            // operador digitou um totalPaidByCustomer > amount (ex: maquininha
            // passou o acrescimo direto), preserva o excedente como surcharge
            // pra refletir o que o cliente realmente pagou.
            const manualPaid = payment.totalPaidByCustomer ?? payment.amount;
            const surcharge = Math.max(0, manualPaid - payment.amount);
            breakdown = {
              surcharge,
              operatorFee: 0,
              netRevenue: payment.amount,
              totalPaid: payment.amount + surcharge,
            };
          }
          totalSurcharge += breakdown.surcharge;
          totalOperatorFee += breakdown.operatorFee;
          totalNetRevenue += breakdown.netRevenue;
          totalPaidByCustomer += breakdown.totalPaid;
        }

        // Downgrade: upgrade excede o valor da venda. Cliente nao paga nada
        // (total = 0); loja DEVOLVE refundDueCents pela forma escolhida.
        // Paridade Laravel `valor_devolvido_cliente` + `forma_devolucao`.
        if (refundDueCents > 0) {
          if (!input.refundDueMethod) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Informe a forma de devolucao (downgrade).",
            });
          }
          if (payments.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Downgrade nao aceita pagamentos do cliente — apenas devolucao.",
            });
          }
          // DePix saque automatico exige chave + tipo de chave do cliente.
          if (input.refundDueMethod === "depix") {
            if (!input.refundDuePixKey || !input.refundDuePixKeyType) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Para devolucao via DePix informe a chave PIX e o tipo (CPF/CNPJ/EMAIL/PHONE/RANDOM).",
              });
            }
          }
        } else if (paidCents < amountDueAfterUpgradeCents) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Valor pago insuficiente",
          });
        }

        // Bloqueia troco fisico quando ha DePix nao confirmado (pendente).
        // Em split com DePix, operador NAO pode entregar dinheiro de troco
        // se o DePix ainda nao foi pago — caso o cliente nao pague, loja
        // perde o valor do troco.
        const hasPendingDepix = payments.some(
          (p) =>
            p.method === "depix" &&
            !isManualDepixPayment(p) &&
            !p.walletTransactionId,
        );
        // Troco = quanto o cliente pagou alem do que devia (apos upgrade).
        const rawChangeCents = refundDueCents > 0
          ? 0
          : paidCents - amountDueAfterUpgradeCents;
        if (hasPendingDepix && rawChangeCents > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Nao e possivel entregar troco em venda com DePix pendente. Aguarde a confirmacao do DePix ou ajuste os valores.",
          });
        }
        const changeCents = rawChangeCents;

        // Gera numero atomico via sequencia tenant-scoped (M25). Antes era
        // findFirst max + parseInt, sujeito a race condition em concurrency.
        const year = new Date().getFullYear();
        const { nextTenantNumber } = await import("@/server/services/tenant-number-sequence.service");
        const { formatted: saleNumber } = await nextTenantNumber(
          tx as unknown as Parameters<typeof nextTenantNumber>[0],
          ctx.tenantId,
          "sale",
          year,
          { padding: 5, prefix: `VND${year}` },
        );

        // Create stock movements + marca StockItems serializados como SOLD.
        // Paridade Laravel PdvService::baixarEstoque.
        if (sale.items.length > 0) {
          await tx.stockMovement.createMany({
            data: sale.items.map((item) => ({
              tenantId: ctx.tenantId,
              productId: item.productId,
              variationId: item.variationId ?? null,
              type: "EXIT" as const,
              quantity: item.quantity,
              reason: `Venda ${saleNumber}`,
              referenceId: sale.id,
              referenceType: "sale",
              userId: ctx.session.user.id,
            })),
          });

          // Decrementa currentStock: variacao quando item tem variationId,
          // senao produto. Serializados nao decrementam aqui (sao marcados
          // como SOLD na proxima etapa).
          //
          // updateMany com WHERE currentStock >= qty serve como compare-and-set
          // atomico — se outro vendedor pegou o ultimo item paralelamente,
          // count=0 e abortamos. Defesa contra oversell sem SELECT FOR UPDATE.
          for (const item of sale.items) {
            if (item.stockItemId) continue; // serializado, ja tratado abaixo
            if (item.variationId) {
              const r = await tx.productVariation.updateMany({
                where: {
                  id: item.variationId,
                  currentStock: { gte: item.quantity },
                },
                data: { currentStock: { decrement: item.quantity } },
              });
              if (r.count !== 1) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: `Estoque insuficiente para "${item.description}". Atualize o carrinho.`,
                });
              }
            } else {
              const r = await tx.product.updateMany({
                where: {
                  id: item.productId,
                  currentStock: { gte: item.quantity },
                },
                data: { currentStock: { decrement: item.quantity } },
              });
              if (r.count !== 1) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: `Estoque insuficiente para "${item.description}". Atualize o carrinho.`,
                });
              }
            }
          }

          // StockItems serializados: marca como SOLD. updateMany atomico — se
          // outro vendedor finalizou a mesma unidade primeiro, o count vira
          // 0 e a transacao aborta com erro claro.
          const stockItemIds = sale.items
            .map((i) => i.stockItemId)
            .filter((id): id is string => !!id);
          if (stockItemIds.length > 0) {
            const result = await tx.stockItem.updateMany({
              where: {
                id: { in: stockItemIds },
                status: "AVAILABLE", // proteçao contra double-sell
              },
              data: {
                status: "SOLD",
                saleId: sale.id,
                soldAt: new Date(),
              },
            });
            if (result.count !== stockItemIds.length) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Um ou mais aparelhos do carrinho ja foram vendidos. Refaça a venda.",
              });
            }
          }
        }

        // Determine payment method string
        let paymentMethod: string;
        if (refundDueCents > 0) {
          paymentMethod = `downgrade:${input.refundDueMethod}`;
        } else if (payments.length === 1) {
          paymentMethod = payments[0]!.method;
        } else {
          paymentMethod = "misto";
        }

        // Create CashMovement for each payment (if user has open session)
        const openSession = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });

        // Paridade Laravel PdvService::registrarVenda — entrada/saida em DINHEIRO
        // exige caixa aberto. Sem isso, valor entraria fantasma no financeiro.
        const hasCashPayment = payments.some((p) => isCashMethod(p.method));
        const downgradeInCash = refundDueCents > 0 && input.refundDueMethod === "cash";
        if ((hasCashPayment || downgradeInCash) && !openSession) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: downgradeInCash
              ? "Caixa nao esta aberto. Abra um caixa antes de devolver dinheiro (downgrade)."
              : "Caixa nao esta aberto. Abra um caixa antes de receber dinheiro.",
          });
        }

        if (openSession && payments.length > 0) {
          await tx.cashMovement.createMany({
            data: payments.map((payment) => ({
              tenantId: ctx.tenantId,
              cashSessionId: openSession.id,
              type: "SALE" as const,
              amount: centsToPrisma(payment.amount),
              nature: "INCOME" as const,
              paymentMethod: payment.method,
              description: `Venda ${saleNumber}`,
              referenceId: sale.id,
              referenceType: "SALE",
              createdByUserId: ctx.session.user.id,
            })),
          });
        }

        // Downgrade em DINHEIRO: saida do caixa. Paridade Laravel
        // PdvService::registrarDevolucaoDowngrade.
        if (downgradeInCash && openSession) {
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashSessionId: openSession.id,
              type: "WITHDRAWAL",
              amount: centsToPrisma(refundDueCents),
              nature: "OUTCOME",
              paymentMethod: "dinheiro",
              description: `Devolucao downgrade venda ${saleNumber}`,
              referenceId: sale.id,
              referenceType: "SALE_DOWNGRADE",
              createdByUserId: ctx.session.user.id,
            },
          });
        }

        // Create FinancialTransaction (RECEIVABLE) — pulado em downgrade
        // pois nao ha valor a receber, so devolucao em CashMovement.
        const hasInstallments = payments.some(
          (p) => (p.installments ?? 1) > 1,
        );

        if (refundDueCents > 0) {
          // Downgrade: cria PAYABLE para rastrear a devolucao devida ao cliente.
          // Em dinheiro: ja sai do caixa (CashMovement OUTCOME criada acima).
          // Em PIX/DePix: fica pendente ate quitacao (operador marca pago manualmente
          // ou DePix saque automatico — ver `refundDueMethod === "depix"`).
          const refundStatus =
            input.refundDueMethod === "cash" ? "PAID" : "PENDING";
          let customerName = "Cliente";
          if (input.customerId) {
            const c = await tx.customer.findUnique({
              where: { id: input.customerId },
              select: { name: true },
            });
            if (c?.name) customerName = c.name;
          }
          await tx.financialTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              type: "PAYABLE",
              status: refundStatus,
              description: `Devolucao downgrade — venda ${saleNumber}`,
              category: "downgrade",
              totalAmount: centsToPrisma(refundDueCents),
              paidAmount: refundStatus === "PAID" ? centsToPrisma(refundDueCents) : centsToPrisma(0),
              installmentsTotal: 1,
              dueDate: new Date(),
              paidAt: refundStatus === "PAID" ? new Date() : null,
              paymentMethod: input.refundDueMethod ?? "cash",
              supplier: customerName,
              customerId: input.customerId ?? null,
              saleId: sale.id,
              referenceType: "SALE_DOWNGRADE",
              referenceId: sale.id,
              createdByUserId: ctx.session.user.id,
            },
          });
        } else if (hasInstallments) {
          // Create separate transaction for each installment payment
          for (const payment of payments) {
            const installmentCount = payment.installments ?? 1;
            if (installmentCount > 1) {
              const perInstallment = Math.floor(payment.amount / installmentCount);
              const remainder = payment.amount - perInstallment * installmentCount;

              const ft = await tx.financialTransaction.create({
                data: {
                  tenantId: ctx.tenantId,
                  type: "RECEIVABLE",
                  status: "PENDING",
                  description: `Venda ${saleNumber} - ${payment.method}`,
                  category: "venda",
                  totalAmount: centsToPrisma(payment.amount),
                  dueDate: new Date(),
                  paymentMethod: payment.method,
                  // saleId e o link da discriminated union (consultado por
                  // cancelReceivablesFromSale, refund, dashboard). referenceId
                  // permanece para compat com queries antigas.
                  saleId: sale.id,
                  referenceId: sale.id,
                  referenceType: "SALE",
                  customerId: input.customerId ?? null,
                },
              });

              const installments = Array.from({ length: installmentCount }, (_, i) => {
                const dueDate = new Date();
                dueDate.setMonth(dueDate.getMonth() + i + 1);
                const amount = i === installmentCount - 1 ? perInstallment + remainder : perInstallment;
                return {
                  tenantId: ctx.tenantId,
                  transactionId: ft.id,
                  number: i + 1,
                  amount: centsToPrisma(amount),
                  dueDate,
                  status: "PENDING" as const,
                };
              });
              await tx.installment.createMany({ data: installments });
            } else {
              await tx.financialTransaction.create({
                data: {
                  tenantId: ctx.tenantId,
                  type: "RECEIVABLE",
                  status: "PAID",
                  description: `Venda ${saleNumber} - ${payment.method}`,
                  category: "venda",
                  totalAmount: centsToPrisma(payment.amount),
                  paidAmount: centsToPrisma(payment.amount),
                  dueDate: new Date(),
                  paidAt: new Date(),
                  paymentMethod: payment.method,
                  saleId: sale.id,
                  referenceId: sale.id,
                  referenceType: "SALE",
                  customerId: input.customerId ?? null,
                },
              });
            }
          }
        } else {
          // Single payment - mark as paid
          await tx.financialTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              type: "RECEIVABLE",
              status: "PAID",
              description: `Venda ${saleNumber}`,
              category: "venda",
              totalAmount: centsToPrisma(totalCents),
              paidAmount: centsToPrisma(totalCents),
              dueDate: new Date(),
              paidAt: new Date(),
              paymentMethod,
              saleId: sale.id,
              referenceId: sale.id,
              referenceType: "SALE",
              customerId: input.customerId ?? null,
            },
          });
        }

        // Build paymentDetails JSON. Preserva ids DePix para conciliacao
        // wallet-first e compatibilidade com webhook PixPay legado.
        const paymentDetails = payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          installments: p.installments ?? 1,
          ...(p.walletTransactionId
            ? { walletTransactionId: p.walletTransactionId }
            : {}),
          ...(p.depixTransactionId
            ? { depixTransactionId: p.depixTransactionId }
            : {}),
        }));

        // Update the sale record
        const updated = await tx.sale.update({
          where: { id: input.saleId },
          data: {
            number: saleNumber,
            status: "COMPLETED",
            customerId: input.customerId ?? sale.customerId,
            paidAmount: centsToPrisma(paidCents),
            changeAmount: centsToPrisma(changeCents),
            paymentDetails,
            refundDueMethod: refundDueCents > 0 ? input.refundDueMethod ?? null : null,
            surchargeAmount: centsToPrisma(totalSurcharge),
            operatorFeeAmount: centsToPrisma(totalOperatorFee),
            // Net revenue: zero em downgrade (sem receita), senao agrega
            // os breakdowns. Fallback: totalCents (quando sem calculadora).
            netRevenueAmount: centsToPrisma(
              refundDueCents > 0
                ? 0
                : totalNetRevenue > 0
                  ? totalNetRevenue
                  : totalCents,
            ),
            observations: input.observations ?? sale.observations,
            saleDate: new Date(),
          },
          include: { items: true },
        });

        // Se a Sale e um pagamento de OS (isOSPayment), avancar a OS para PAID
        // e propagar pagamento + reciveis (paridade com Laravel `gerarRecebiveisOS`).
        if (sale.isOSPayment && sale.serviceOrderId) {
          const order = await tx.serviceOrder.findUnique({
            where: { id: sale.serviceOrderId },
          });
          if (order && order.status === "COMPLETED") {
            await tx.serviceOrder.update({
              where: { id: sale.serviceOrderId },
              data: {
                status: "PAID",
                paidAmount: centsToPrisma(totalCents),
                paymentMethod,
                paymentDate: new Date(),
              },
            });
            await tx.serviceOrderHistory.create({
              data: {
                tenantId: ctx.tenantId,
                orderId: sale.serviceOrderId,
                userId: ctx.session.user.id,
                previousStatus: order.status,
                newStatus: "PAID",
                notes: `Pagamento via PDV - venda ${saleNumber}`,
              },
            });
            // P4: comissao do tecnico tambem no pagamento via PDV (antes so o
            // registerPayment criava — caminho comum da UI ficava sem comissao).
            await createOsTechnicianCommission(
              tx,
              ctx.tenantId,
              { id: order.id, number: order.number, technicianId: order.technicianId },
              totalCents,
            );
          }
        }

        // Upgrades: cada aparelho de entrada vira (1) DevicePurchase com
        // purchasePrice = valor abatido (o que a loja PAGOU pelo aparelho —
        // nao o valor avaliado), (2) Product generico de seminovo/usado se
        // ainda nao existir, (3) StockItem AVAILABLE para que o aparelho
        // entre IMEDIATAMENTE no estoque vendavel. Paridade Laravel
        // PdvService::finalizarVenda.
        const upgrades = await tx.saleUpgrade.findMany({ where: { saleId: sale.id } });
        for (const upg of upgrades) {
          // Map condition do SaleUpgrade (free string) -> DeviceCondition + StockItemCondition.
          // Enums sao iguais (NEW, SEMI_NEW, USED, DISPLAY).
          const condition: "NEW" | "SEMI_NEW" | "USED" | "DISPLAY" =
            (["NEW", "SEMI_NEW", "USED", "DISPLAY"] as const).includes(
              upg.condition as never,
            )
              ? (upg.condition as "NEW" | "SEMI_NEW" | "USED" | "DISPLAY")
              : "USED";

          const purchase = await tx.devicePurchase.create({
            data: {
              tenantId: ctx.tenantId,
              customerId: sale.customerId,
              sellerType: "customer",
              brand: upg.brand,
              model: upg.model,
              imei: upg.imei,
              serial: upg.serialNumber,
              condition,
              batteryHealth: upg.batteryHealth,
              // BUGFIX: usa valor abatido (o que a loja efetivamente pagou),
              // nao o valor avaliado (que o cliente quis dar pelo aparelho).
              purchasePrice: upg.abatedValue,
              notes:
                `Aparelho de entrada (upgrade) — venda ${saleNumber}.` +
                (upg.notes ? ` ${upg.notes}` : ""),
            },
          });

          await tx.saleUpgrade.update({
            where: { id: upg.id },
            data: { devicePurchaseId: purchase.id },
          });

          // Cria StockItem AVAILABLE — aparelho entra no estoque vendavel.
          // Precisa de um Product (cria generico "Aparelho seminovo / usado"
          // por brand+model se nao existe — paridade Laravel
          // buscarOuCriarProdutoUpgrade).
          const productName = [upg.brand, upg.model].filter(Boolean).join(" ") || "Aparelho seminovo";
          let product = await tx.product.findFirst({
            where: {
              // case-insensitive: evita criar produto duplicado so por
              // diferenca de caixa (ex: "iPhone 12" vs "iphone 12").
              name: { equals: productName, mode: "insensitive" },
              isDevice: true,
              isSerialized: true,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!product) {
            product = await tx.product.create({
              data: {
                tenantId: ctx.tenantId,
                name: productName,
                brand: upg.brand,
                isDevice: true,
                isSerialized: true,
                currentStock: 0,
                costPrice: upg.abatedValue,
                salePrice: upg.appraisedValue, // sugestao inicial
                active: true,
              },
              select: { id: true },
            });
          }

          await tx.stockItem.create({
            data: {
              tenantId: ctx.tenantId,
              productId: product.id,
              imei: upg.imei,
              serialNumber: upg.serialNumber,
              condition,
              batteryHealth: upg.batteryHealth,
              costPrice: upg.abatedValue,
              suggestedSalePrice: upg.appraisedValue,
              status: "AVAILABLE",
              entryDate: new Date(),
              notes: `Recebido em upgrade — venda ${saleNumber}.`,
            },
          });

          // ADR: Product.currentStock NAO e fonte de verdade para
          // produtos serializados. As listagens/dashboards derivam de
          // count(StockItem WHERE status='AVAILABLE') em searchProducts
          // e stockDashboard. Mantemos currentStock=0 nos serializados.

          // Movimento de entrada
          await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: product.id,
              type: "ENTRY",
              quantity: 1,
              reason: `Aparelho recebido em upgrade — venda ${saleNumber}`,
              referenceId: sale.id,
              referenceType: "sale_upgrade",
              userId: ctx.session.user.id,
            },
          });
        }

        logger.info("Sale finalized", {
          saleId: sale.id,
          number: saleNumber,
          total: totalCents,
          userId: ctx.session.user.id,
          upgrades: upgrades.length,
        });

        return {
          updated,
          saleNumber,
          // Flag: depois da tx, dispara saque DePix se for downgrade depix
          shouldTriggerDepixWithdraw:
            refundDueCents > 0 && input.refundDueMethod === "depix",
          refundDueCents,
          customerName: input.customerId
            ? (await tx.customer.findUnique({
                where: { id: input.customerId },
                select: { name: true, cpf: true, cnpj: true },
              }))
            : null,
        };
      });

      // Apos a transacao: se downgrade DePix, dispara saque pela Wallet/LWK.
      const pixKey = input.refundDuePixKey;
      const pixKeyType = input.refundDuePixKeyType;
      if (txResult.shouldTriggerDepixWithdraw && pixKey && pixKeyType) {
        try {
          const taxId = (txResult.customerName?.cpf ?? txResult.customerName?.cnpj ?? "").replace(/\D/g, "");
          if (taxId.length === 11 || taxId.length === 14) {
            const walletTx = await createWithdraw({
              tenantId: ctx.tenantId,
              userId: ctx.session.user.id,
              userName: ctx.session.user.name ?? null,
              pixKeyType,
              pixKey,
              recipientName: txResult.customerName?.name ?? null,
              recipientTaxId: taxId,
              netAmountCents: txResult.refundDueCents,
              sourceType: "SALE",
              sourceId: input.saleId,
              sourceDescription: `Downgrade automatico — venda ${txResult.saleNumber}`,
              idempotencyKey: `${input.saleId}:downgrade-depix-refund`,
            });
            logger.info("Saque DePix Wallet automatico para downgrade enviado", {
              saleId: input.saleId,
              walletTransactionId: walletTx.id,
              number: walletTx.number,
            });
          }
        } catch (e) {
          logger.error("Erro saque DePix Wallet downgrade", {
            saleId: input.saleId,
            error: e instanceof Error ? e.message : String(e),
          });
          // Nao bloqueia a venda — operador acompanha/resolve pendencia pela Wallet DePix.
        }
      }

      return serializeSale(txResult.updated as unknown as Record<string, unknown>);
    }),

  // ═══════════════════════════════════════
  // CANCEL
  // ═══════════════════════════════════════

  /** Cancel a completed sale */
  cancel: tenantProcedure
    .input(cancelSaleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
        }
        // Paridade Laravel: `cancelar` descarta carrinho em rascunho.
        // Vendas finalizadas usam `refund` (que devolve estoque + cancela
        // recebiveis + grava audit). Esta separacao evita sobreposicao
        // de responsabilidades.
        if (sale.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas rascunhos podem ser cancelados. Use 'estornar' para vendas finalizadas.",
          });
        }

        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledById: ctx.session.user.id,
            cancellationReason: input.reason,
          },
        });

        // Auditoria (paridade PdvVendaAuditoria)
        await tx.saleAudit.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: sale.id,
            userId: ctx.session.user.id,
            action: "cancel",
            reason: input.reason,
          },
        });

        logger.info("Sale cancelled", {
          saleId: sale.id,
          reason: input.reason,
          userId: ctx.session.user.id,
        });

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // REFUND
  // ═══════════════════════════════════════

  /** Refund a completed sale (return stock, create refund movements) */
  refund: tenantProcedure
    .input(refundSaleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: input.saleId },
          include: { items: true },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
        }
        if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(sale.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas vendas finalizadas podem ser estornadas",
          });
        }

        // Vendas de pagamento de OS (isOSPayment) nao tem items proprios — o
        // estorno deve ser feito pela OS (que cascateia para a sale via P5b).
        // Sem este guard o operador veria "Nenhum item disponivel" e ficaria
        // confuso; o caminho correto e mais limpo eh forcar pelo serviceOrder.
        if (sale.isOSPayment) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Use 'Estornar OS' na propria Ordem de Servico — o estorno reverte automaticamente esta venda vinculada.",
          });
        }

        // Determina escopo: refund parcial (subset de itens) ou total.
        // Filtra itens ja estornados (total=0) — idempotencia. Segundo
        // refund das mesmas linhas e no-op em vez de duplicar movimento.
        const isPartial = input.itemIds && input.itemIds.length > 0
          && input.itemIds.length < sale.items.length;
        const itemsCandidate = input.itemIds && input.itemIds.length > 0
          ? sale.items.filter((i) => input.itemIds!.includes(i.id))
          : sale.items;
        const itemsToRefund = itemsCandidate.filter(
          (i) => decimalToCents(i.total) > 0,
        );
        if (itemsToRefund.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhum item disponivel para estorno (ja foram estornados anteriormente).",
          });
        }
        // Calcula valor estornado (sum dos totais dos itens estornados)
        const refundedCents = itemsToRefund.reduce(
          (sum, it) => sum + decimalToCents(it.total),
          0,
        );

        // Devolve estoque (paridade Laravel PdvService::estornarEstoque)
        if (input.returnStock !== false) {
          for (const item of itemsToRefund) {
            await tx.stockMovement.create({
              data: {
                tenantId: ctx.tenantId,
                productId: item.productId,
                type: "ENTRY",
                quantity: item.quantity,
                reason: `Estorno venda ${sale.number}${input.returnAsDefect ? " (defeito)" : ""}`,
                referenceId: sale.id,
                referenceType: input.returnAsDefect ? "SALE_REFUND_DEFECT" : "SALE_REFUND",
                userId: ctx.session.user.id,
              },
            });

            // Restitui currentStock — espelha o decrement do finalize.
            // Itens serializados NAO mexem em currentStock (status do
            // StockItem e a fonte de verdade). Itens com defeito tampouco
            // entram no estoque vendavel — vao para DEFECTIVE no StockItem
            // ou descontam baixa permanente.
            if (item.stockItemId || input.returnAsDefect) continue;
            if (item.variationId) {
              await tx.productVariation.update({
                where: { id: item.variationId },
                data: { currentStock: { increment: item.quantity } },
              });
            } else {
              await tx.product.update({
                where: { id: item.productId },
                data: { currentStock: { increment: item.quantity } },
              });
            }
          }
          const stockItemIds = itemsToRefund
            .map((i) => i.stockItemId)
            .filter((id): id is string => !!id);
          if (stockItemIds.length > 0) {
            const result = await tx.stockItem.updateMany({
              where: {
                id: { in: stockItemIds },
                status: "SOLD",
                saleId: sale.id,
                deletedAt: null,
              },
              data: {
                // Defeito: aparelho volta como DEFECTIVE (nao vende mais).
                // Caso contrario: AVAILABLE.
                status: input.returnAsDefect ? "DEFECTIVE" : "AVAILABLE",
                saleId: null,
                soldAt: null,
              },
            });
            if (result.count !== stockItemIds.length) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Um ou mais aparelhos nao estao mais vinculados a esta venda. Atualize e tente novamente.",
              });
            }
          }
        }

        // Cancela DevicePurchases criados pelo upgrade APENAS em estorno total.
        // Estorno parcial nao mexe nos uagrades (paridade Laravel).
        if (!isPartial) {
          const upgrades = await tx.saleUpgrade.findMany({
            where: { saleId: sale.id, devicePurchaseId: { not: null } },
            select: { devicePurchaseId: true },
          });
          if (upgrades.length > 0) {
            const purchaseIds = upgrades
              .map((u) => u.devicePurchaseId)
              .filter((id): id is string => !!id);
            await tx.devicePurchase.updateMany({
              where: { id: { in: purchaseIds } },
              data: {
                cancelledAt: new Date(),
                cancellationReason: `Estorno venda ${sale.number}: ${input.reason}`,
              },
            });
          }
        }

        // CashMovement de estorno (saida do caixa). Valor = total estornado
        // (refundedCents), nao o total da venda — paridade Laravel estornarParcial.
        const openSession = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });
        if (openSession) {
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashSessionId: openSession.id,
              type: "WITHDRAWAL",
              amount: centsToPrisma(refundedCents),
              nature: "OUTCOME",
              paymentMethod: null,
              description: isPartial
                ? `Estorno parcial venda ${sale.number}`
                : `Estorno venda ${sale.number}`,
              referenceId: sale.id,
              referenceType: "SALE_REFUND",
              createdByUserId: ctx.session.user.id,
            },
          });
        } else {
          // Sem caixa aberto nao da pra registrar a saida — antes isso era
          // silencioso (gaveta sub-reportada). Log estruturado pra auditoria.
          logger.warn("Estorno sem caixa aberto — saida nao registrada na gaveta", {
            saleId: sale.id,
            number: sale.number,
            refundedCents,
            userId: ctx.session.user.id,
          });
        }

        // Cancela recebiveis. Em estorno total: cancela tudo. Em parcial:
        // cancela parcelas PENDING ate cobrir refundedCents (a partir das
        // ultimas vencimentos — preserva o que ja foi pago/proximo a pagar).
        let cancelledReceivables = 0;
        const allTx = await tx.financialTransaction.findMany({
          where: { saleId: input.saleId, status: { not: "CANCELLED" } },
          select: { id: true },
        });
        if (allTx.length > 0) {
          const transactionIds = allTx.map((t) => t.id);
          if (!isPartial) {
            // Total: cancela tudo
            await tx.installment.updateMany({
              where: {
                transactionId: { in: transactionIds },
                status: { in: ["PENDING", "OVERDUE"] },
              },
              data: { status: "CANCELLED" },
            });
            await tx.financialTransaction.updateMany({
              where: { id: { in: transactionIds } },
              data: {
                status: "CANCELLED",
                cancelledAt: new Date(),
                cancelledByUserId: ctx.session.user.id,
                cancelReason: input.reason,
              },
            });
            cancelledReceivables = allTx.length;
          } else {
            // Parcial: cancela installments PENDING/OVERDUE comecando pelas
            // ultimas (data mais distante) ate cobrir refundedCents.
            const installments = await tx.installment.findMany({
              where: {
                transactionId: { in: transactionIds },
                status: { in: ["PENDING", "OVERDUE"] },
              },
              orderBy: { dueDate: "desc" },
              select: { id: true, amount: true, paidAmount: true },
            });
            let remainingToCancel = refundedCents;
            const idsToCancel: string[] = [];
            for (const inst of installments) {
              if (remainingToCancel <= 0) break;
              const installmentDueCents =
                decimalToCents(inst.amount) - decimalToCents(inst.paidAmount);
              if (installmentDueCents <= 0) continue;
              idsToCancel.push(inst.id);
              remainingToCancel -= installmentDueCents;
            }
            if (idsToCancel.length > 0) {
              await tx.installment.updateMany({
                where: { id: { in: idsToCancel } },
                data: { status: "CANCELLED" },
              });
              cancelledReceivables = idsToCancel.length;
            }
          }
        }

        // Atualiza venda: PARTIALLY_REFUNDED ou REFUNDED + recalcula total.
        // compare-and-set no status: dois estornos concorrentes da mesma venda
        // serializam no lock de linha do UPDATE; o perdedor ve o status ja
        // alterado (count=0), lanca e faz ROLLBACK de toda a tx (estoque,
        // CashMovement, recebiveis) — evita estorno/saida de caixa em dobro.
        if (isPartial) {
          // Recalcula total = total atual - refundedCents
          const newTotal = decimalToCents(sale.totalAmount) - refundedCents;
          const r = await tx.sale.updateMany({
            where: { id: input.saleId, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] } },
            data: {
              status: "PARTIALLY_REFUNDED",
              totalAmount: centsToPrisma(Math.max(0, newTotal)),
            },
          });
          if (r.count !== 1) {
            throw new TRPCError({ code: "CONFLICT", message: "Venda ja estornada por outra operacao." });
          }
          // Marca itens estornados (paridade Laravel `estornado`): zera total
          // e desconto desse item. Mantem o registro para auditoria.
          await tx.saleItem.updateMany({
            where: { id: { in: itemsToRefund.map((i) => i.id) } },
            data: { total: centsToPrisma(0), discount: centsToPrisma(0) },
          });
        } else {
          const r = await tx.sale.updateMany({
            where: { id: input.saleId, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] } },
            data: {
              status: "REFUNDED",
              cancelledAt: new Date(),
              cancelledById: ctx.session.user.id,
              cancellationReason: input.reason,
            },
          });
          if (r.count !== 1) {
            throw new TRPCError({ code: "CONFLICT", message: "Venda ja estornada por outra operacao." });
          }
        }

        // Auditoria (paridade PdvVendaAuditoria)
        await tx.saleAudit.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: sale.id,
            userId: ctx.session.user.id,
            action: isPartial ? "partial_refund" : "refund",
            previousValue: String(decimalToCents(sale.totalAmount)),
            newValue: String(refundedCents),
            reason: input.reason
              + (input.returnAsDefect ? " [DEFEITO]" : "")
              + (isPartial ? ` [PARCIAL: ${itemsToRefund.length} item(s)]` : ""),
          },
        });

        logger.info("Sale refunded", {
          saleId: sale.id,
          partial: isPartial,
          asDefect: !!input.returnAsDefect,
          itemsRefunded: itemsToRefund.length,
          amountRefunded: refundedCents,
          cancelledReceivables,
          userId: ctx.session.user.id,
        });

        return {
          success: true,
          partial: isPartial,
          itemsRefunded: itemsToRefund.length,
          amountRefunded: refundedCents,
          cancelledReceivables,
        };
      });
    }),

  // ═══════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════

  /** List sales with filtering, sorting, and pagination */
  list: tenantProcedure
    .input(listSalesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;
      const sortBy = input.sortBy ?? "saleDate";
      const sortOrder = input.sortOrder ?? "desc";

      return ctx.withTenant(async (tx) => {
        const where: Prisma.SaleWhereInput = {
          deletedAt: null,
          status: { not: "DRAFT" },
        };

        if (input.status) {
          where.status = input.status;
        }

        if (input.sellerId) {
          where.sellerId = input.sellerId;
        }

        if (input.dateFrom || input.dateTo) {
          const saleDate: Record<string, Date> = {};
          if (input.dateFrom) saleDate.gte = new Date(input.dateFrom);
          if (input.dateTo) {
            const end = new Date(input.dateTo);
            end.setHours(23, 59, 59, 999);
            saleDate.lte = end;
          }
          where.saleDate = saleDate;
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { number: { contains: term, mode: "insensitive" } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.sale.findMany({
            where,
            include: { items: true },
            orderBy: { [sortBy]: sortOrder },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.sale.count({ where }),
        ]);

        // Fetch seller names
        const sellerIds = [...new Set(data.map((s) => s.sellerId))];
        let sellers: Record<string, string> = {};
        if (sellerIds.length > 0) {
          const users = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: sellerIds } },
              select: { id: true, name: true },
            });
          });
          sellers = Object.fromEntries(users.map((u) => [u.id, u.name]));
        }

        // Fetch customer names
        const customerIds = data
          .map((s) => s.customerId)
          .filter((id): id is string => id != null);
        let customers: Record<string, string> = {};
        if (customerIds.length > 0) {
          const custs = await tx.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, name: true },
          });
          customers = Object.fromEntries(custs.map((c) => [c.id, c.name]));
        }

        return {
          data: data.map((sale) => ({
            ...serializeSale(sale as unknown as Record<string, unknown>),
            sellerName: sellers[sale.sellerId] ?? "Desconhecido",
            customerName: sale.customerId ? (customers[sale.customerId] ?? null) : null,
            itemCount: sale.items.length,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get sale by ID */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: input.id },
          include: { items: true, upgrades: { select: { id: true } } },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
        }

        // Calcula politica de impressao do recibo (paridade Laravel).
        const productIds = [...new Set(sale.items.map((i) => i.productId))];
        const products = productIds.length
          ? await tx.product.findMany({
              where: { id: { in: productIds } },
              select: { isDevice: true },
            })
          : [];
        const hasDevice = products.some((p) => p.isDevice);
        const hasUpgrade = sale.upgrades.length > 0;
        const receiptPolicy = evaluateSaleReceiptPolicy({
          status: sale.status,
          hasDevice,
          hasUpgrade,
          deliveryTermSignedAt: sale.signatureSignedAt,
          deliveryTermPhysical: sale.physicalSignature,
        });

        // Fetch seller name
        let sellerName = "Desconhecido";
        try {
          const user = await withAdmin(async (adminTx) => {
            return adminTx.user.findUnique({
              where: { id: sale.sellerId },
              select: { name: true },
            });
          });
          if (user) sellerName = user.name;
        } catch {
          // ignore
        }

        // Fetch customer name + phones (pro modal de envio WhatsApp).
        let customerName: string | null = null;
        let customerPhone: string | null = null;
        let customerPhoneSecondary: string | null = null;
        if (sale.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: sale.customerId },
            select: { name: true, phone: true, phoneSecondary: true },
          });
          if (customer) {
            customerName = customer.name;
            customerPhone = customer.phone ?? null;
            customerPhoneSecondary = customer.phoneSecondary ?? null;
          }
        }

        // Fetch canceller name
        let cancelledByName: string | null = null;
        if (sale.cancelledById) {
          try {
            const canceller = await withAdmin(async (adminTx) => {
              return adminTx.user.findUnique({
                where: { id: sale.cancelledById! },
                select: { name: true },
              });
            });
            if (canceller) cancelledByName = canceller.name;
          } catch {
            // ignore
          }
        }

        return {
          ...serializeSale(sale as unknown as Record<string, unknown>),
          sellerName,
          customerName,
          customerPhone,
          customerPhoneSecondary,
          cancelledByName,
          hasDevice,
          hasUpgrade,
          receiptPolicy,
        };
      });
    }),

  /** Get sale by public link (no auth required) */
  byPublicLink: publicProcedure
    // Rate limit: 30 req/min por IP. Endpoint sem auth que aceita um `link`
    // arbitrario — sem limite, bot consegue enumerar links de venda.
    .use(rateLimitMiddleware({ limit: 30, windowMs: 60_000 }))
    .input(z.object({ link: z.string().min(8).max(64) }))
    .query(async ({ input }) => {
      return withAdmin(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: {
            publicLink: input.link,
            // Vazaria rascunho/cancelada via link enumeravel — restringe
            // ao que tem sentido publico (COMPLETED ou REFUNDED).
            status: { in: ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"] },
            deletedAt: null,
          },
          include: {
            items: { select: { description: true, quantity: true, total: true } },
          },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
        }
        const tenant = await tx.tenant.findUnique({
          where: { id: sale.tenantId },
          select: { name: true },
        });
        // Whitelist explicito — endpoint PUBLICO. Antes `serializeSale(...spread)`
        // vazava tenantId, sellerId, customerId, paymentDetails (com depixTransactionId),
        // cancellationReason, signatureDocumentId, etc.
        return {
          number: sale.number,
          status: sale.status,
          saleDate: sale.saleDate,
          subtotal: decimalToCents(sale.subtotal),
          discountAmount: decimalToCents(sale.discountAmount),
          totalAmount: decimalToCents(sale.totalAmount),
          paidAmount: decimalToCents(sale.paidAmount),
          changeAmount: decimalToCents(sale.changeAmount),
          items: sale.items.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            total: decimalToCents(i.total),
          })),
          customerName: sale.customerName ?? null,
          tenantName: tenant?.name ?? "Arena Tech",
        };
      });
    }),

  /** Stats for today/month */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [todaySales, monthSales, totalAll, totalCompleted, totalCancelled, totalRefunded] = await Promise.all([
        tx.sale.findMany({
          where: {
            status: "COMPLETED",
            saleDate: { gte: startOfDay },
            deletedAt: null,
          },
        }),
        tx.sale.findMany({
          where: {
            status: "COMPLETED",
            saleDate: { gte: startOfMonth },
            deletedAt: null,
          },
        }),
        tx.sale.count({ where: { status: { not: "DRAFT" }, deletedAt: null } }),
        tx.sale.count({ where: { status: "COMPLETED", deletedAt: null } }),
        tx.sale.count({ where: { status: "CANCELLED", deletedAt: null } }),
        tx.sale.count({
          where: {
            status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] },
            deletedAt: null,
          },
        }),
      ]);

      const todayCount = todaySales.length;
      const todayTotal = todaySales.reduce(
        (sum, s) => sum + decimalToCents(s.totalAmount),
        0,
      );

      const monthCount = monthSales.length;
      const monthTotal = monthSales.reduce(
        (sum, s) => sum + decimalToCents(s.totalAmount),
        0,
      );
      const monthAvgTicket = monthCount > 0 ? Math.round(monthTotal / monthCount) : 0;

      return {
        todayCount,
        todayTotal,
        monthCount,
        monthTotal,
        monthAvgTicket,
        totalAll,
        totalCompleted,
        totalCancelled,
        totalRefunded,
      };
    });
  }),

  /** List sellers (users) for filter — scoped to current tenant */
  listSellers: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userTenants = await tx.userTenant.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          user: {
            select: { id: true, name: true },
          },
        },
      });
      return userTenants
        .map((ut) => ut.user)
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }),

  /** Search products for PDV */
  searchProducts: tenantProcedure
    .input(searchProductsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const term = input.query.trim();
        const where: Prisma.ProductWhereInput = {
          active: true,
          deletedAt: null,
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { sku: { contains: term, mode: "insensitive" } },
            { barcode: { contains: term, mode: "insensitive" } },
          ],
        };

        const products = await tx.product.findMany({
          where,
          take: 20,
          orderBy: { name: "asc" },
        });
        if (products.length === 0) return [];

        // Para serializados, agrega StockItem (status=AVAILABLE).
        // Para produtos com variations, soma currentStock de todas as variations.
        // Para nao-serializados sem variations, products.current_stock e a fonte.
        const serializedIds = products.filter((p) => p.isSerialized).map((p) => p.id);
        const variationParentIds = products
          .filter((p) => p.hasVariations && !p.isSerialized)
          .map((p) => p.id);

        const [stockItemCounts, variationStocks] = await Promise.all([
          serializedIds.length
            ? tx.stockItem.groupBy({
                by: ["productId"],
                where: { productId: { in: serializedIds }, status: "AVAILABLE", deletedAt: null },
                _count: { _all: true },
              })
            : Promise.resolve([] as Array<{ productId: string; _count: { _all: number } }>),
          variationParentIds.length
            ? tx.productVariation.groupBy({
                by: ["productId"],
                where: { productId: { in: variationParentIds }, deletedAt: null },
                _sum: { currentStock: true },
              })
            : Promise.resolve([] as Array<{ productId: string; _sum: { currentStock: number | null } }>),
        ]);

        const stockMap = new Map(stockItemCounts.map((c) => [c.productId, c._count._all]));
        const variationMap = new Map(
          variationStocks.map((v) => [v.productId, v._sum.currentStock ?? 0]),
        );

        const mapped = products.map((p) => {
          let currentStock: number;
          if (p.isSerialized) currentStock = stockMap.get(p.id) ?? 0;
          else if (p.hasVariations) currentStock = variationMap.get(p.id) ?? 0;
          else currentStock = p.currentStock;
          return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            brand: p.brand,
            isDevice: p.isDevice,
            salePrice: decimalToCents(p.salePrice),
            costPrice: decimalToCents(p.costPrice),
            currentStock,
            isSerialized: p.isSerialized,
            hasVariations: p.hasVariations,
          };
        });
        // withStock: filtra itens sem estoque ja no servidor (antes o input era
        // ignorado e o filtro vivia so no cliente — produtos zerados voltavam
        // ao PDV). currentStock ja agrega StockItem AVAILABLE / variations.
        return input.withStock ? mapped.filter((p) => p.currentStock > 0) : mapped;
      });
    }),

  /**
   * Verifica historico de um IMEI no tenant. Paridade Laravel
   * /estoque/verificar-imei-historico — usado no modal de upgrade pra alertar
   * operador quando aparelho ja foi vendido pela loja ou ja esta no estoque.
   *
   * Retorna `null` se IMEI nunca foi visto. Caso contrario, retorna estado
   * atual + ultima venda (se houver).
   */
  checkImeiHistory: tenantProcedure
    .input(z.object({ imei: z.string().min(5).max(20) }))
    .query(async ({ ctx, input }) => {
      const cleanImei = input.imei.replace(/\D/g, "");
      if (cleanImei.length < 5) return null;
      return ctx.withTenant(async (tx) => {
        const item = await tx.stockItem.findFirst({
          where: { imei: cleanImei, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            status: true,
            product: { select: { name: true } },
          },
        });
        if (!item) return null;
        // Procura ultima venda com esse stock item — pra alertar
        // "ja vendido pela loja".
        const lastSale = await tx.saleItem.findFirst({
          where: {
            stockItemId: item.id,
            sale: { status: "COMPLETED", deletedAt: null },
          },
          orderBy: { sale: { saleDate: "desc" } },
          select: {
            sale: {
              select: {
                number: true,
                saleDate: true,
                customerId: true,
                customerName: true,
              },
            },
          },
        });
        let lastCustomerName: string | null = lastSale?.sale.customerName ?? null;
        if (lastSale?.sale.customerId && !lastCustomerName) {
          const c = await tx.customer.findUnique({
            where: { id: lastSale.sale.customerId },
            select: { name: true },
          });
          lastCustomerName = c?.name ?? null;
        }
        return {
          status: item.status,
          productName: item.product.name,
          alreadySold: !!lastSale,
          lastSale: lastSale
            ? {
                number: lastSale.sale.number,
                date: lastSale.sale.saleDate,
                customerName: lastCustomerName,
              }
            : null,
        };
      });
    }),

  /**
   * Lista as variacoes ativas de um produto com seus atributos resolvidos
   * (cor: Azul, tamanho: M, etc). Usado pelo PDV para abrir o modal de
   * selecao quando product.has_variations = true.
   */
  listProductVariations: tenantProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: input.productId },
          select: { id: true, name: true, salePrice: true, hasVariations: true },
        });
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Produto nao encontrado" });

        const variations = await tx.productVariation.findMany({
          where: {
            productId: input.productId,
            active: true,
            deletedAt: null,
          },
          orderBy: { createdAt: "asc" },
          include: {
            attributeValues: {
              include: {
                attributeValue: {
                  include: { attribute: { select: { name: true } } },
                },
              },
            },
          },
        });

        const productSalePrice = decimalToCents(product.salePrice);

        return variations.map((v) => {
          // Fallback: se variacao sem preco proprio, usa o do produto pai.
          const varPriceCents = v.salePrice ? decimalToCents(v.salePrice) : 0;
          const effectivePrice = varPriceCents > 0 ? varPriceCents : productSalePrice;
          // Monta label "Cor: Azul, Tamanho: M" a partir dos atributos.
          const attrs = v.attributeValues.map((pva) => ({
            attributeName: pva.attributeValue.attribute.name,
            value: pva.attributeValue.value,
          }));
          const label = attrs.map((a) => `${a.attributeName}: ${a.value}`).join(", ");
          return {
            id: v.id,
            productId: v.productId,
            sku: v.sku,
            barcode: v.barcode,
            salePrice: effectivePrice,
            currentStock: v.currentStock,
            label: label || (v.sku ?? "Variacao"),
            attributes: attrs,
            imageUrl: v.imageUrl,
          };
        });
      });
    }),

  // ═══════════════════════════════════════
  // UPDATE ITEM PRICE (override)
  // ═══════════════════════════════════════

  /** Override unit price for an item in cart (manager/admin) */
  updateItemPrice: tenantProcedure
    .input(updateItemPriceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale || sale.status !== "DRAFT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Venda nao encontrada ou nao esta em rascunho" });
        }
        if (sale.isOSPayment) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Nao e possivel alterar preco em pagamento de OS" });
        }

        const item = await tx.saleItem.findUnique({ where: { id: input.itemId } });
        if (!item || item.saleId !== input.saleId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item nao encontrado" });
        }

        const totalCents = input.unitPrice * item.quantity;

        await tx.saleItem.update({
          where: { id: input.itemId },
          data: {
            unitPrice: centsToPrisma(input.unitPrice),
            total: centsToPrisma(totalCents),
          },
        });

        return recalculateSale(tx, input.saleId, ctx.tenantId);
      });
    }),

  // ═══════════════════════════════════════
  // OS-ORIGINATED SALE
  // ═══════════════════════════════════════

  /** Create a sale from a Service Order (pagamento de OS via PDV) */
  createFromOS: tenantProcedure
    .input(createFromOSSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Load the OS with items
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.serviceOrderId },
          include: { items: true },
        });

        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        if (!["COMPLETED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas OS concluidas podem ser pagas via PDV",
          });
        }

        // Check if there's already a sale for this OS
        const existingSale = await tx.sale.findFirst({
          where: {
            tenantId: ctx.tenantId,
            serviceOrderId: input.serviceOrderId,
            status: { in: ["DRAFT", "COMPLETED"] },
            deletedAt: null,
          },
        });

        if (existingSale) {
          if (existingSale.status === "DRAFT") {
            // Reuse existing draft
            const sale = await tx.sale.findUnique({
              where: { id: existingSale.id },
              include: { items: true },
            });
            return serializeSale(sale as unknown as Record<string, unknown>);
          }
          throw new TRPCError({ code: "CONFLICT", message: "Esta OS ja possui uma venda finalizada" });
        }

        // Pagamento de OS via PDV e um CHECKOUT puro: o PDV nao reabre o
        // carrinho da OS. O estoque dos itens-produto ja foi reservado/baixado
        // quando foram adicionados a OS (reserveStockForOsItem) — copiar para
        // sale_items e baixar de novo no finalize causaria DUPLA baixa.
        //
        // Portanto NAO copiamos itens. Gravamos o total da OS direto na venda;
        // os itens sao exibidos read-only no PDV a partir da propria OS. O
        // finalize trata isOSPayment como pagamento (sem mexer em estoque).
        const osTotal = order.totalAmount;
        const draftNumber = `DRAFT-OS-${order.number}-${Date.now()}`;
        const sale = await tx.sale.create({
          data: {
            tenantId: ctx.tenantId,
            number: draftNumber,
            sellerId: ctx.session.user.id,
            customerId: order.customerId,
            status: "DRAFT",
            serviceOrderId: order.id,
            isOSPayment: true,
            subtotal: osTotal,
            totalAmount: osTotal,
            publicLink: generatePublicLink(),
          },
        });

        return serializeSale(sale as unknown as Record<string, unknown>);
      });
    }),

  /** Cancel OS payment mode — abandons the draft linked to the OS */
  cancelOSMode: tenantProcedure
    .input(z.object({ saleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale || sale.status !== "DRAFT" || !sale.isOSPayment) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Venda nao e pagamento de OS em rascunho" });
        }

        // Cleanup completo: SaleItems, SaleUpgrades (e DevicePurchases
        // orfas vinculadas via upgrade) + a propria Sale. Sem isso,
        // upgrades ficam pendurados no banco apos cancelar fluxo OS.
        const upgrades = await tx.saleUpgrade.findMany({
          where: { saleId: input.saleId, devicePurchaseId: { not: null } },
          select: { devicePurchaseId: true },
        });
        const orphanPurchaseIds = upgrades
          .map((u) => u.devicePurchaseId)
          .filter((id): id is string => !!id);
        if (orphanPurchaseIds.length > 0) {
          // Apaga apenas DevicePurchases criadas neste draft (nunca foram
          // confirmadas como compra real — saleId nunca virou COMPLETED).
          await tx.devicePurchase.deleteMany({
            where: { id: { in: orphanPurchaseIds } },
          });
        }
        await tx.saleUpgrade.deleteMany({ where: { saleId: input.saleId } });
        await tx.saleItem.deleteMany({ where: { saleId: input.saleId } });
        await tx.sale.delete({ where: { id: input.saleId } });

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // RECEIPT (send via WhatsApp)
  // ═══════════════════════════════════════

  /** Send receipt PDF via WhatsApp Cloud (template + fallback). */
  sendReceipt: tenantProcedure
    .input(sendSaleReceiptSchema)
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch tx curta
      const { sale, phone, customerName } = await ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: input.saleId },
          include: { items: true, upgrades: { select: { id: true } } },
        });
        if (!sale || sale.status !== "COMPLETED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Recibo so pode ser enviado apos finalizar" });
        }

        // Bloqueia se termos pendentes (paridade Laravel).
        const productIds = [...new Set(sale.items.map((i) => i.productId))];
        const products = productIds.length
          ? await tx.product.findMany({
              where: { id: { in: productIds } },
              select: { isDevice: true },
            })
          : [];
        const policy = evaluateSaleReceiptPolicy({
          status: sale.status,
          hasDevice: products.some((p) => p.isDevice),
          hasUpgrade: sale.upgrades.length > 0,
          deliveryTermSignedAt: sale.signatureSignedAt,
          deliveryTermPhysical: sale.physicalSignature,
        });
        if (!policy.canPrint) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Recibo bloqueado: ${policy.pendingReasons.join("; ")}.`,
          });
        }
        let phone = input.phone;
        let customerName = "Cliente";
        if (sale.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: sale.customerId },
            select: { name: true, phone: true },
          });
          if (customer?.name) customerName = customer.name;
          if (!phone) phone = customer?.phone ?? null;
        }
        if (!phone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone nao informado e cliente sem telefone cadastrado" });
        }
        return { sale, phone, customerName };
      });

      // ETAPA 2 — IO externo (Meta Cloud template pdv_recibo_pdf + fallback).
      // PDF via rota publica HMAC-tokenizada (Meta consegue baixar sem auth).
      const pdfToken = createPublicPdfToken(ctx.tenantId, input.saleId, 60 * 60 * 1000);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const pdfUrl = `${appUrl}/api/whatsapp-media/sale/pdf/${pdfToken}`;
      const caption = `📄 Recibo - Venda #${sale.number}\n\nOlá, ${customerName}! Segue em anexo o recibo da sua compra.`;
      const wa = await sendPdfWithFallback({
        phone,
        pdfUrl,
        fileName: `Venda_${sale.number}_recibo.pdf`,
        caption,
        contexto: "pdv_recibo_pdf",
        params: [customerName, sale.number],
        log: { tenantId: ctx.tenantId, originType: "sale", originId: input.saleId },
      });

      // ETAPA 3 — persiste sucesso
      if (wa.success) {
        await ctx.withTenant(async (tx) => {
          await tx.sale.update({
            where: { id: input.saleId },
            data: { receiptSent: true, receiptSentAt: new Date() },
          });
        });
        logger.info("Recibo de venda enviado por WhatsApp", {
          saleId: input.saleId, via: wa.via, templateUsed: wa.templateUsed, messageId: wa.messageId,
        });
      } else {
        logger.warn("Falha ao enviar recibo de venda via WhatsApp", {
          saleId: input.saleId, error: wa.error,
        });
      }

      return { success: wa.success };
    }),

  // ═══════════════════════════════════════
  // SIGNATURE — TERMO DE ENTREGA (Autentique + physical)
  // ═══════════════════════════════════════

  /**
   * Envia o TERMO DE ENTREGA para assinatura digital via Autentique +
   * WhatsApp Cloud. Paridade Laravel `enviarTermoEntrega`.
   *
   * Mantido como `sendForSignature` por compatibilidade com UI que ainda
   * usa esse nome. Internamente gera o `buildSaleDeliveryPdf` (nao mais
   * o recibo, que estava trocado).
   */
  sendForSignature: tenantProcedure
    .input(z.object({
      saleId: z.string().uuid(),
      // Numero customizado para envio (override do telefone do cliente).
      whatsappOverride: z.string().min(10).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch em tx curta
      const { sale, customerName, whatsapp, wasResend } = await ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale || sale.status !== "COMPLETED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas vendas finalizadas podem ser assinadas" });
        }
        if (sale.signatureSignedAt || sale.physicalSignature) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Venda ja esta assinada." });
        }
        let customerName = "Cliente";
        let customerPhone: string | null = null;
        if (sale.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: sale.customerId },
            select: { name: true, phone: true, phoneSecondary: true },
          });
          if (customer?.name) customerName = customer.name;
          customerPhone = customer?.phone ?? customer?.phoneSecondary ?? null;
        }
        const whatsapp = input.whatsappOverride || customerPhone;
        if (!whatsapp) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cliente sem telefone cadastrado. Informe um numero.",
          });
        }
        return {
          sale,
          customerName,
          whatsapp,
          wasResend: !!sale.signatureDocumentId,
        };
      });

      // ETAPA 2 — IO externo: gera TERMO DE ENTREGA + envia pro Autentique.
      // (Era buildSaleReceiptPdf mas o conceito sempre foi "termo de entrega"
      // — agora o builder esta correto.)
      const { buildSaleDeliveryPdf } = await import("@/lib/pdf/sale-delivery-builder");
      const pdfBuffer = await buildSaleDeliveryPdf(ctx.tenantId, input.saleId);
      if (!pdfBuffer) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF do termo de entrega" });
      }
      const doc = await createDocumentWithLink(
        `Termo de Entrega — Venda ${sale.number}`,
        [{ name: customerName, whatsapp }],
        pdfBuffer,
      );
      if (!doc.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: doc.error ?? "Erro ao enviar para Autentique",
        });
      }

      // ETAPA 3 — persiste
      await ctx.withTenant(async (tx) => {
        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            signatureDocumentId: doc.documentId ?? null,
            signatureUrl: doc.signatureLink ?? null,
            signatureSentAt: new Date(),
          },
        });
        await tx.saleAudit.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: input.saleId,
            userId: ctx.session.user.id,
            action: wasResend ? "signature_resent" : "signature_sent",
            reason: doc.documentId ?? null,
          },
        });
      });

      // ETAPA 4 — envia via Meta Cloud com template pdv_termo_pdf_link
      if (doc.signatureLink) {
        const pdfToken = createPublicPdfToken(
          ctx.tenantId,
          input.saleId,
          60 * 60 * 1000,
          "delivery",
        );
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const pdfUrl = `${appUrl}/api/whatsapp-media/sale/pdf/${pdfToken}`;
        const autentiqueToken = extractShortlinkToken(doc.signatureLink);
        const caption =
          `📋 *Termo de Entrega - Venda #${sale.number}*\n\n` +
          `Olá, ${customerName}! Para assinar digitalmente:\n${doc.signatureLink}`;
        const wa = await sendPdfWithFallback({
          phone: whatsapp,
          pdfUrl,
          fileName: `Venda_${sale.number}_termo_entrega.pdf`,
          caption,
          contexto: "pdv_termo_pdf_link",
          params: [customerName, sale.number],
          urlButtonParam: autentiqueToken ?? undefined,
          log: { tenantId: ctx.tenantId, originType: "sale", originId: input.saleId },
        });
        if (!wa.success) {
          logger.warn("Falha ao enviar termo de venda via WhatsApp", {
            saleId: input.saleId, error: wa.error,
          });
        } else {
          logger.info("Termo de venda enviado por WhatsApp", {
            saleId: input.saleId, via: wa.via, templateUsed: wa.templateUsed, messageId: wa.messageId,
          });
        }
      }

      return { documentId: doc.documentId, signatureLink: doc.signatureLink };
    }),

  /** Check digital signature status */
  checkSignatureStatus: tenantProcedure
    .input(checkSaleSignatureStatusSchema)
    .query(async ({ ctx, input }) => {
      // ETAPA 1 — fetch tx curta
      const sale = await ctx.withTenant(async (tx) =>
        tx.sale.findUnique({ where: { id: input.saleId } }),
      );
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (!sale.signatureDocumentId) return { signed: false, pending: false };
      if (sale.signatureSignedAt) return { signed: true, pending: false };

      // ETAPA 2 — Autentique HTTP fora da tx
      const status = await getDocumentStatus(sale.signatureDocumentId);

      // ETAPA 3 — persiste se assinado
      if (status.signed) {
        await ctx.withTenant(async (tx) => {
          await tx.sale.update({
            where: { id: input.saleId },
            data: { signatureSignedAt: new Date() },
          });
        });
      }

      return { signed: status.signed, pending: true };
    }),

  /** Confirm physical signature (in-store) */
  confirmPhysicalSignature: tenantProcedure
    .input(confirmSalePhysicalSignatureSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale || sale.status !== "COMPLETED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas vendas finalizadas" });
        }

        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            physicalSignature: true,
            signatureSignedAt: new Date(),
          },
        });

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // DEPIX / PIX INTEGRATION
  // ═══════════════════════════════════════

  /** Generate PIX QR code for a sale (faithful to Laravel gerarPixPdv) */
  generatePix: tenantProcedure
    .input(
      z.object({
        saleId: z.string().uuid(),
        /** CPF/CNPJ do pagador. Obrigatorio quando totalAmount >= R$ 500. */
        taxId: z.string().max(20).optional().nullable(),
        /** Valor em centavos para o QR. Default: total da venda. Usado em
         * split payment (parte em DePix + parte em outra forma). */
        amountCents: z.number().int().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch tx curta (sale + cpf do cliente p/ anti-fraude PixPay).
      // Tambem aceita CPF/CNPJ informado pelo operador no momento da venda
      // (input.taxId), util quando cliente nao tem cadastro mas vai pagar
      // valor >= R$ 500.
      const { sale, customerCpf, customerCnpj } = await ctx.withTenant(async (tx) => {
        const s = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!s) return { sale: null, customerCpf: null, customerCnpj: null };
        let cpf: string | null = null;
        let cnpj: string | null = null;
        if (s.customerId) {
          const c = await tx.customer.findUnique({
            where: { id: s.customerId },
            select: { cpf: true, cnpj: true },
          });
          cpf = c?.cpf ?? null;
          cnpj = c?.cnpj ?? null;
        }
        return { sale: s, customerCpf: cpf, customerCnpj: cnpj };
      });
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["DRAFT", "COMPLETED"].includes(sale.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Venda nao pode receber PIX neste status" });
      }
      const saleTotal = Number(sale.totalAmount);
      // amountCents = valor parcial (split) ou total da venda como fallback.
      const totalAmount = input.amountCents != null
        ? input.amountCents / 100
        : saleTotal;
      if (totalAmount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Valor do PIX deve ser maior que zero" });
      }
      if (input.amountCents != null && totalAmount > saleTotal + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Valor do PIX nao pode ser maior que o total da venda",
        });
      }

      // Regra DePix: valores >= R$ 500,00 exigem CPF/CNPJ do pagador (anti-fraude PixPay).
      // Usa o que vier no input (operador digitou) > cadastro do cliente.
      const taxIdRaw = (input.taxId ?? customerCpf ?? customerCnpj ?? "").replace(/\D/g, "");
      if (totalAmount >= 500 && taxIdRaw.length !== 11 && taxIdRaw.length !== 14) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Para PIX a partir de R$ 500,00 e obrigatorio informar CPF ou CNPJ do pagador.",
        });
      }

      // Validacao de limite por CPF (R$ 5.000/tx).
      if (taxIdRaw && (taxIdRaw.length === 11 || taxIdRaw.length === 14)) {
        const { validateDepixLimit } = await import("@/lib/services/depix-limit-service");
        const limit = await ctx.withTenant(async (tx) =>
          validateDepixLimit(tx, ctx.tenantId, taxIdRaw, totalAmount),
        );
        if (!limit.allowed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: limit.reason ?? "Limite DePix excedido.",
          });
        }
      }

      // ETAPA 2 — deposito wallet DePix fora da tx.
      const isPartial = input.amountCents != null && totalAmount < saleTotal - 0.01;
      const description = isPartial
        ? `Venda ${sale.number} (parcial)`
        : `Venda ${sale.number}`;
      const result = await createDeposit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        userName: ctx.session.user.name ?? null,
        grossAmountCents: Math.round(totalAmount * 100),
        sourceType: "SALE",
        sourceId: sale.id,
        sourceDescription: description,
        payerTaxId: taxIdRaw || null,
      });

      // ETAPA 3 — Persiste transactionId pendente em paymentDetails ja agora
      // (antes do finalize). Sem isso, se o cliente paga antes do operador
      // clicar Finalizar, o webhook chega e nao acha a venda (race finalize-
      // webhook reportado no review #5).
      //
      // Append em paymentDetails JSON array — pode coexistir com pagamentos
      // ja adicionados em split (ex: dinheiro + DePix). finalize sobrescreve
      // paymentDetails depois com a versao definitiva.
      if (result.pixpayDepixId) {
        await ctx.withTenant(async (tx) => {
          const current = (await tx.sale.findUnique({
            where: { id: sale.id },
            select: { paymentDetails: true },
          }))?.paymentDetails;
          const arr = Array.isArray(current)
            ? (current as Array<Record<string, unknown>>)
            : [];
          // Evita duplicar se o operador re-gerou o PIX antes do anterior expirar.
          const existing = arr.findIndex(
            (p) => p?.walletTransactionId === result.id || p?.depixTransactionId === result.pixpayDepixId,
          );
          const entry = {
            method: "depix",
            amount: Math.round(totalAmount * 100),
            walletTransactionId: result.id,
            depixTransactionId: result.pixpayDepixId,
            depixStatus: "pending",
            installments: 1,
          };
          if (existing >= 0) arr[existing] = entry;
          else arr.push(entry);
          await tx.sale.update({
            where: { id: sale.id },
            data: { paymentDetails: arr as unknown as Prisma.InputJsonValue },
          });
        });
      }

      return {
        transactionId: result.pixpayDepixId,
        walletTransactionId: result.id,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        pixKey: result.depositAddress,
      };
    }),

  /** Cancel a pending PIX payment for a sale */
  cancelPix: tenantProcedure
    .input(z.object({
      saleId: z.string().uuid(),
      transactionId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Wallet-only: cancelamento local da transacao PENDING. PixPay nao e mais
      // chamado diretamente por routers de negocio.
      // Remove a entry pendente do paymentDetails do rascunho — senao um QR
      // abandonado deixa lixo no draft (e um webhook tardio acharia a venda).
      // So mexe em DRAFT; venda finalizada tem paymentDetails definitivo.
      await ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: input.saleId },
          select: { status: true, paymentDetails: true },
        });
        if (!sale || sale.status !== "DRAFT" || !Array.isArray(sale.paymentDetails)) return;
        const arr = (sale.paymentDetails as Array<Record<string, unknown>>).filter(
          (p) => p?.depixTransactionId !== input.transactionId && p?.walletTransactionId !== input.transactionId,
        );
        await tx.sale.update({
          where: { id: input.saleId },
          data: { paymentDetails: arr as unknown as Prisma.InputJsonValue },
        });
      });
      return { success: true };
    }),

  /**
   * Consulta o status atual de uma transacao PIX (advisory, read-only). NAO
   * altera a venda — a conclusao e sempre manual pelo operador (finalize).
   * Usado como fallback de polling do DepixQrDialog pra detectar o pagamento.
   * Paridade Laravel `consultarStatusPix`.
   */
  checkPixStatus: tenantProcedure
    .input(checkSalePixStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const walletTransactionId = input.walletTransactionId ?? (input.transactionId.match(/^[0-9a-fA-F-]{36}$/) ? input.transactionId : null);
      if (walletTransactionId) {
        const walletTx = await checkTransactionStatus(ctx.tenantId, walletTransactionId);
        if (!walletTx || walletTx.sourceType !== "SALE" || walletTx.sourceId !== input.saleId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Transacao nao pertence a esta venda." });
        }
        let status: "pending" | "paid" | "expired" | "failed" = "pending";
        if (walletTx.status === "COMPLETED" || walletTx.status === "COMPLETED_FEE_PENDING") status = "paid";
        else if (walletTx.status === "EXPIRED") status = "expired";
        else if (walletTx.status === "FAILED" || walletTx.status === "CANCELLED") status = "failed";
        return { status, isFinal: status !== "pending" };
      }

      // Valida ownership: o transactionId deve estar vinculado a uma sale do
      // tenant atual (gravado em paymentDetails durante finalize, OU em sale
      // ainda em DRAFT que esta no fluxo do DepixQrDialog). Impede que
      // usuario malicioso consulte status de PIX alheios adivinhando o id.
      const allowed = await ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale) return false;
        // Sale em DRAFT ainda nao tem paymentDetails — autoriza por ownership
        // ao tenant (RLS ja restringe).
        if (sale.status === "DRAFT") return true;
        // Sale finalizada: checa se o transactionId esta gravado em paymentDetails.
        const pd = sale.paymentDetails as Array<{ depixTransactionId?: string }> | null;
        return Array.isArray(pd) && pd.some((p) => p.depixTransactionId === input.transactionId);
      });
      if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Transacao nao pertence a esta venda." });
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Venda sem transacao wallet DePix vinculada.",
      });
    }),

  // ═══════════════════════════════════════
  // UPGRADE (aparelho de entrada / trade-in)
  // ═══════════════════════════════════════

  /** Adiciona upgrade ao carrinho (somente DRAFT). */
  addUpgrade: tenantProcedure
    .input(addSaleUpgradeSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale || sale.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Venda nao esta em rascunho.",
          });
        }
        if (sale.isOSPayment) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pagamento de OS nao aceita upgrade.",
          });
        }

        // Valida IMEI: Luhn + duplicidade contra StockItem existente.
        if (input.imei) {
          const imeiDigits = input.imei.replace(/\D/g, "");
          if (imeiDigits.length !== 15 || !isValidLuhn(imeiDigits)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "IMEI invalido (deve ter 15 digitos e passar Luhn).",
            });
          }
          // Duplicidade — paridade Laravel verificar-imei-historico.
          const existing = await tx.stockItem.findFirst({
            where: { imei: imeiDigits, deletedAt: null },
            select: { id: true, status: true, product: { select: { name: true } } },
          });
          if (existing) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                `IMEI ja cadastrado no estoque (${existing.product.name}, status ${existing.status}). ` +
                `Use outro aparelho ou remova o duplicado.`,
            });
          }
          // Tambem nao pode haver outro SaleUpgrade da mesma venda com mesmo IMEI.
          const existingUpgrade = await tx.saleUpgrade.findFirst({
            where: { saleId: input.saleId, imei: imeiDigits },
            select: { id: true },
          });
          if (existingUpgrade) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Este IMEI ja foi adicionado a venda.",
            });
          }
        }

        const upgrade = await tx.saleUpgrade.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: input.saleId,
            brand: input.brand ?? null,
            model: input.model,
            storage: input.storage ?? null,
            color: input.color ?? null,
            imei: input.imei ? input.imei.replace(/\D/g, "") : null,
            serialNumber: input.serialNumber ?? null,
            condition: input.condition,
            batteryHealth: input.batteryHealth ?? null,
            appraisedValue: centsToPrisma(input.appraisedValue),
            abatedValue: centsToPrisma(input.abatedValue),
            notes: input.notes ?? null,
          },
        });

        // Recalcula a venda (abateValue reduz totalAmount no recalc).
        await recalculateSale(tx, input.saleId, ctx.tenantId);

        return { id: upgrade.id };
      });
    }),

  /** Remove upgrade do carrinho. */
  removeUpgrade: tenantProcedure
    .input(removeSaleUpgradeSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const upgrade = await tx.saleUpgrade.findUnique({ where: { id: input.id } });
        if (!upgrade) throw new TRPCError({ code: "NOT_FOUND" });
        const sale = await tx.sale.findUnique({ where: { id: upgrade.saleId } });
        if (!sale || sale.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Upgrade so pode ser removido em venda em rascunho.",
          });
        }
        await tx.saleUpgrade.delete({ where: { id: input.id } });
        await recalculateSale(tx, upgrade.saleId, ctx.tenantId);
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // POST-FINALIZE ADMIN ACTIONS
  // ═══════════════════════════════════════

  /**
   * Vincula um cliente a uma venda ja finalizada (caso o cliente nao foi
   * cadastrado durante a venda). Paridade Laravel `vincularCliente`.
   */
  linkCustomer: tenantProcedure
    .input(linkSaleCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
        if (sale.status !== "COMPLETED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas vendas finalizadas podem ter cliente vinculado.",
          });
        }
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: { id: true, name: true },
        });
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        }
        await tx.sale.update({
          where: { id: input.saleId },
          data: { customerId: input.customerId },
        });
        await tx.saleAudit.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: input.saleId,
            userId: ctx.session.user.id,
            action: "customer_linked",
            field: "customer_id",
            previousValue: sale.customerId ?? null,
            newValue: input.customerId,
          },
        });
        return { success: true, customerName: customer.name };
      });
    }),

  /**
   * Atualiza data da venda (admin only). Requer motivo. Audit log.
   * Paridade Laravel `atualizarData`.
   */
  updateSaleDate: tenantProcedure
    .input(updateSaleDateSchema)
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.isSuperAdmin === true;
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem alterar a data da venda.",
        });
      }
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
        const newDate = new Date(input.saleDate);
        if (isNaN(newDate.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Data invalida." });
        }
        const previousDate = sale.saleDate.toISOString();
        await tx.sale.update({
          where: { id: input.saleId },
          data: { saleDate: newDate },
        });
        await tx.saleAudit.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: input.saleId,
            userId: ctx.session.user.id,
            action: "date_changed",
            field: "sale_date",
            previousValue: previousDate,
            newValue: newDate.toISOString(),
            reason: input.reason,
          },
        });
        return { success: true };
      });
    }),
});

// ── Internal helpers ──

async function recalculateSale(
  tx: Parameters<Parameters<typeof withAdmin>[0]>[0],
  saleId: string,
  _tenantId: string,
) {
  const sale = await tx.sale.findUnique({ where: { id: saleId } });
  if (!sale) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
  }

  const items = await tx.saleItem.findMany({ where: { saleId } });
  // Pagamento de OS e checkout puro (sem sale_items): a base do subtotal e o
  // total da OS, ja gravado em sale.subtotal por createFromOS. Para vendas
  // normais, o subtotal vem da soma dos itens do carrinho.
  const subtotalCents = sale.isOSPayment
    ? decimalToCents(sale.subtotal)
    : items.reduce((sum, item) => sum + decimalToCents(item.total), 0);

  // Upgrades abatem do total (paridade Laravel — `valor_abatido`).
  // Nao se aplicam a pagamento de OS.
  const upgrades = sale.isOSPayment
    ? []
    : await tx.saleUpgrade.findMany({ where: { saleId } });
  const upgradeAbateCents = upgrades.reduce(
    (sum, u) => sum + decimalToCents(u.abatedValue),
    0,
  );

  // Recalculate discount if percentage
  let discountAmountCents = decimalToCents(sale.discountAmount);
  if (sale.discountType === "percentage") {
    const pct = Number(sale.discountValue);
    discountAmountCents = Math.round(subtotalCents * (pct / 100));
  }

  // Paridade Laravel PdvService::registrarVenda (linhas 85-87, 186):
  //   $liquido = subtotal - desconto - upgradesAbatido
  //   $valorMercadoria = max(0, $liquido)
  //   sale.valor_total = $valorMercadoria
  //
  // totalAmount eh o LIQUIDO que o cliente paga em formas de pagamento
  // (dinheiro/PIX/cartao/etc). O upgrade ja abateu a parte mercantil; o
  // restante eh o que falta cobrar. Em downgrade (liquido < 0), totalAmount=0
  // e refundDueAmount = abs(liquido) eh a diferenca que a loja devolve.
  //
  // Antes esse calculo persistia totalAmount BRUTO (subtotal - desconto),
  // levando o operador a cobrar a mais e a UI a mostrar troco inflado.
  const netAfterDiscountAndUpgrade = subtotalCents - discountAmountCents - upgradeAbateCents;
  const totalCents = Math.max(0, netAfterDiscountAndUpgrade);
  const refundDueCents = netAfterDiscountAndUpgrade < 0
    ? Math.abs(netAfterDiscountAndUpgrade)
    : 0;

  const updated = await tx.sale.update({
    where: { id: saleId },
    data: {
      subtotal: centsToPrisma(subtotalCents),
      discountAmount: centsToPrisma(discountAmountCents),
      totalAmount: centsToPrisma(totalCents),
      refundDueAmount: centsToPrisma(refundDueCents),
    },
    include: { items: true },
  });

  return serializeSale(updated as unknown as Record<string, unknown>);
}
