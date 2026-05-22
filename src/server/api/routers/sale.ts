import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, publicProcedure } from "@/server/api/trpc";
import { rateLimitMiddleware } from "@/server/api/middleware/rate-limit";
import { withAdmin } from "@/server/db";
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
import { createPublicPdfToken } from "@/lib/whatsapp/public-pdf-token";
import { createPixPayment, cancelPixPayment, getPixStatus } from "@/lib/services/depix-service";
import { logger } from "@/lib/logger";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

function generatePublicLink(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function serializeSale(sale: Record<string, unknown>) {
  const s = sale as Record<string, unknown>;
  return {
    ...s,
    subtotal: decimalToCents(s.subtotal as Prisma.Decimal),
    discountValue: decimalToCents(s.discountValue as Prisma.Decimal),
    discountAmount: decimalToCents(s.discountAmount as Prisma.Decimal),
    totalAmount: decimalToCents(s.totalAmount as Prisma.Decimal),
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

  /** Abandon (delete) all existing DRAFT sales for the current seller */
  abandonDraft: tenantProcedure.mutation(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      await tx.saleItem.deleteMany({
        where: {
          sale: {
            tenantId: ctx.tenantId,
            sellerId: ctx.session.user.id,
            status: "DRAFT",
            deletedAt: null,
          },
        },
      });
      await tx.sale.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          sellerId: ctx.session.user.id,
          status: "DRAFT",
          deletedAt: null,
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
        return serializeSale(sale as unknown as Record<string, unknown>);
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
            select: { id: true, productId: true, status: true, costPrice: true, suggestedSalePrice: true },
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
            },
          });
          return recalculateSale(tx, input.saleId, ctx.tenantId);
        }

        // Produto generico (nao serializado) — consolida em linha existente.
        const existingItem = sale.items.find(
          (i) => i.productId === input.productId && !i.stockItemId,
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
    .input(z.object({ saleId: z.string().uuid(), customerId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.sale.update({
          where: { id: input.saleId },
          data: { customerId: input.customerId },
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

        const subtotalCents = sale.items.reduce(
          (sum, item) => sum + decimalToCents(item.total),
          0,
        );

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

        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            discountType: input.discountType,
            discountValue: centsToPrisma(Math.round(input.discountValue)),
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

        if (sale.items.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Carrinho vazio",
          });
        }

        const totalCents = decimalToCents(sale.totalAmount);
        const refundDueCents = decimalToCents(sale.refundDueAmount);
        const payments = input.payments ?? [];
        const paidCents = payments.reduce((sum, p) => sum + p.amount, 0);

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
            // comportamento anterior: dinheiro/pix sem cadastro).
            breakdown = {
              surcharge: 0,
              operatorFee: 0,
              netRevenue: payment.amount,
              totalPaid: payment.amount,
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
        } else if (paidCents < totalCents) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Valor pago insuficiente",
          });
        }

        const changeCents = refundDueCents > 0 ? 0 : paidCents - totalCents;

        // Generate sequential number: VND{year}{5-digit seq}
        const year = new Date().getFullYear();
        const prefix = `VND${year}`;
        const lastSale = await tx.sale.findFirst({
          where: {
            tenantId: ctx.tenantId,
            number: { startsWith: prefix },
          },
          orderBy: { number: "desc" },
        });
        let seq = 1;
        if (lastSale && lastSale.number.startsWith(prefix)) {
          const numPart = lastSale.number.slice(prefix.length);
          seq = (parseInt(numPart, 10) || 0) + 1;
        }
        const saleNumber = `${prefix}${String(seq).padStart(5, "0")}`;

        // Create stock movements + marca StockItems serializados como SOLD.
        // Paridade Laravel PdvService::baixarEstoque.
        if (sale.items.length > 0) {
          await tx.stockMovement.createMany({
            data: sale.items.map((item) => ({
              tenantId: ctx.tenantId,
              productId: item.productId,
              type: "EXIT" as const,
              quantity: item.quantity,
              reason: `Venda ${saleNumber}`,
              referenceId: sale.id,
              referenceType: "sale",
              userId: ctx.session.user.id,
            })),
          });

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
        const hasCashPayment = payments.some(
          (p) => p.method === "dinheiro" || p.method === "cash" || p.method === "DINHEIRO",
        );
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
          // downgrade: sem receivable
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
              referenceId: sale.id,
              referenceType: "SALE",
              customerId: input.customerId ?? null,
            },
          });
        }

        // Build paymentDetails JSON
        const paymentDetails = payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          installments: p.installments ?? 1,
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
          }
        }

        // Upgrades: criar DevicePurchase para cada aparelho de entrada
        // (paridade Laravel — ao finalizar, upgrade vira compra de aparelho).
        const upgrades = await tx.saleUpgrade.findMany({ where: { saleId: sale.id } });
        for (const upg of upgrades) {
          const purchase = await tx.devicePurchase.create({
            data: {
              tenantId: ctx.tenantId,
              customerId: sale.customerId,
              sellerType: "customer",
              brand: upg.brand,
              model: upg.model,
              imei: upg.imei,
              serial: upg.serialNumber,
              condition: upg.condition === "NEW" ? "NEW" : "USED",
              batteryHealth: upg.batteryHealth,
              purchasePrice: upg.appraisedValue,
              notes:
                `Aparelho de entrada (upgrade) — venda ${saleNumber}.` +
                (upg.notes ? ` ${upg.notes}` : ""),
            },
          });
          await tx.saleUpgrade.update({
            where: { id: upg.id },
            data: { devicePurchaseId: purchase.id },
          });
        }

        logger.info("Sale finalized", {
          saleId: sale.id,
          number: saleNumber,
          total: totalCents,
          userId: ctx.session.user.id,
          upgrades: upgrades.length,
        });

        return serializeSale(updated as unknown as Record<string, unknown>);
      });
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
        if (sale.status !== "COMPLETED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas vendas finalizadas podem ser estornadas",
          });
        }

        // Devolve estoque: cria StockMovement de entrada + reabre StockItems
        // serializados (SOLD → AVAILABLE). Paridade Laravel PdvService::estornarEstoque.
        if (input.returnStock !== false) {
          for (const item of sale.items) {
            await tx.stockMovement.create({
              data: {
                tenantId: ctx.tenantId,
                productId: item.productId,
                type: "ENTRY",
                quantity: item.quantity,
                reason: `Estorno venda ${sale.number}`,
                referenceId: sale.id,
                referenceType: "SALE_REFUND",
                userId: ctx.session.user.id,
              },
            });
          }
          const stockItemIds = sale.items
            .map((i) => i.stockItemId)
            .filter((id): id is string => !!id);
          if (stockItemIds.length > 0) {
            await tx.stockItem.updateMany({
              where: { id: { in: stockItemIds } },
              data: { status: "AVAILABLE", saleId: null, soldAt: null },
            });
          }
        }

        // Cancela DevicePurchases criados pelo upgrade (trade-in) — sem isso,
        // o aparelho de entrada ficaria fantasma no estoque apos o estorno.
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

        // Create refund CashMovement if session is open
        const openSession = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });

        if (openSession) {
          const totalCents = decimalToCents(sale.totalAmount);

          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashSessionId: openSession.id,
              type: "WITHDRAWAL",
              amount: centsToPrisma(totalCents),
              nature: "OUTCOME",
              paymentMethod: null,
              description: `Estorno venda ${sale.number}`,
              referenceId: sale.id,
              referenceType: "SALE_REFUND",
              createdByUserId: ctx.session.user.id,
            },
          });
        }

        // Cancela recebiveis vinculados (paridade Laravel
        // FinanceiroService::cancelarRecebiveisVenda). Sem isso, Installments
        // PENDING ficam orfaos no DRE e nas listagens.
        const transactions = await tx.financialTransaction.findMany({
          where: { saleId: input.saleId, status: { not: "CANCELLED" } },
          select: { id: true },
        });
        if (transactions.length > 0) {
          const transactionIds = transactions.map((t) => t.id);
          await tx.installment.updateMany({
            where: { transactionId: { in: transactionIds }, status: "PENDING" },
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
        }

        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            status: "REFUNDED",
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
            action: "refund",
            previousValue: String(decimalToCents(sale.totalAmount)),
            newValue: "0",
            reason: input.reason,
          },
        });

        logger.info("Sale refunded", {
          saleId: sale.id,
          reason: input.reason,
          cancelledReceivables: transactions.length,
          userId: ctx.session.user.id,
        });

        return { success: true, cancelledReceivables: transactions.length };
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
          include: { items: true },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
        }

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

        // Fetch customer name
        let customerName: string | null = null;
        if (sale.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: sale.customerId },
            select: { name: true },
          });
          if (customer) customerName = customer.name;
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
          cancelledByName,
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
        const sale = await tx.sale.findUnique({
          where: { publicLink: input.link },
          include: { items: true },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
        }
        return serializeSale(sale as unknown as Record<string, unknown>);
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

        // Para serializados, agrega StockItem (status=AVAILABLE). Para nao-serializados
        // a coluna products.current_stock e fonte unica. Padroniza com a mesma
        // logica do dashboard/estoque para nao mostrar quantidades divergentes
        // entre PDV e /stock.
        const serializedIds = products.filter((p) => p.isSerialized).map((p) => p.id);
        const stockMap = new Map<string, number>();
        if (serializedIds.length > 0) {
          const counts = await tx.stockItem.groupBy({
            by: ["productId"],
            where: {
              productId: { in: serializedIds },
              status: "AVAILABLE",
              deletedAt: null,
            },
            _count: { _all: true },
          });
          for (const c of counts) stockMap.set(c.productId, c._count._all);
        }

        return products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          salePrice: decimalToCents(p.salePrice),
          costPrice: decimalToCents(p.costPrice),
          currentStock: p.isSerialized ? (stockMap.get(p.id) ?? 0) : p.currentStock,
          isSerialized: p.isSerialized,
        }));
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

        // Create draft sale linked to OS
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
            publicLink: generatePublicLink(),
          },
        });

        // Copy OS items as sale items.
        // Laravel grava `produto_id NULL` para itens só-serviço; aqui a coluna e
        // NOT NULL no schema atual, entao usamos productId quando existe e caimos
        // em serviceId so quando o item for um servico cadastrado. NUNCA usar
        // `item.id` (ServiceOrderItem.id) — gera ids fantasma em relatorios.
        const osItems = order.items;
        if (osItems.length > 0) {
          const items = osItems.map((item) => {
            const productId = item.productId ?? item.serviceId;
            if (!productId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Item "${item.description}" da OS nao tem produto/servico vinculado e nao pode virar item de venda.`,
              });
            }
            return {
              tenantId: ctx.tenantId,
              saleId: sale.id,
              productId,
              description: item.description,
              quantity: Math.max(1, Math.round(Number(item.quantity))),
              unitPrice: item.unitPrice,
              costPrice: item.costPrice,
              total: item.total,
            };
          });
          await tx.saleItem.createMany({ data: items });
        }

        return recalculateSale(tx, sale.id, ctx.tenantId);
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

        // Delete sale items and the draft
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
        const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
        if (!sale || sale.status !== "COMPLETED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Recibo so pode ser enviado apos finalizar" });
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
  // SIGNATURE (Autentique + physical)
  // ═══════════════════════════════════════

  /** Send sale document for digital signature via Autentique + WhatsApp Cloud. */
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

      // ETAPA 2 — IO externo: gera PDF + Autentique
      const { buildSaleReceiptPdf } = await import("@/lib/pdf/sale-receipt-builder");
      const pdfBuffer = await buildSaleReceiptPdf(ctx.tenantId, input.saleId);
      if (!pdfBuffer) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF da venda" });
      }
      const doc = await createDocumentWithLink(
        `Recibo Venda ${sale.number}`,
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
        const pdfToken = createPublicPdfToken(ctx.tenantId, input.saleId, 60 * 60 * 1000);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const pdfUrl = `${appUrl}/api/whatsapp-media/sale/pdf/${pdfToken}`;
        const autentiqueToken = extractShortlinkToken(doc.signatureLink);
        const caption =
          `📋 *Assinatura - Venda #${sale.number}*\n\n` +
          `Olá, ${customerName}! Para assinar digitalmente:\n${doc.signatureLink}`;
        const wa = await sendPdfWithFallback({
          phone: whatsapp,
          pdfUrl,
          fileName: `Venda_${sale.number}_termo.pdf`,
          caption,
          contexto: "pdv_termo_pdf_link",
          params: [customerName, sale.number],
          urlButtonParam: autentiqueToken ?? undefined,
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
    .input(z.object({ saleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch tx curta
      const sale = await ctx.withTenant(async (tx) =>
        tx.sale.findUnique({ where: { id: input.saleId } }),
      );
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["DRAFT", "COMPLETED"].includes(sale.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Venda nao pode receber PIX neste status" });
      }
      const totalAmount = Number(sale.totalAmount);
      if (totalAmount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Valor da venda deve ser maior que zero" });
      }

      // ETAPA 2 — Depix HTTP fora da tx
      const result = await createPixPayment(totalAmount, `Venda ${sale.number}`, sale.id);
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao gerar PIX" });
      }

      return {
        transactionId: result.transactionId,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        pixKey: result.pixKey,
      };
    }),

  /** Cancel a pending PIX payment for a sale */
  cancelPix: tenantProcedure
    .input(z.object({
      saleId: z.string().uuid(),
      transactionId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await cancelPixPayment(input.transactionId);
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao cancelar PIX" });
      }
      return { success: true };
    }),

  /**
   * Consulta status atual de uma transacao PIX e atualiza a venda quando pago.
   * Paridade Laravel `consultarStatusPix`. Botao manual de "Verificar PIX".
   */
  checkPixStatus: tenantProcedure
    .input(checkSalePixStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await getPixStatus(input.transactionId);
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Erro ao consultar PIX",
        });
      }
      return {
        status: result.status ?? "pending",
        isFinal: result.isFinal ?? false,
      };
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

        const upgrade = await tx.saleUpgrade.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: input.saleId,
            brand: input.brand ?? null,
            model: input.model,
            imei: input.imei ?? null,
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
  const items = await tx.saleItem.findMany({ where: { saleId } });
  const subtotalCents = items.reduce((sum, item) => sum + decimalToCents(item.total), 0);

  // Upgrades abatem do total (paridade Laravel — `valor_abatido`).
  const upgrades = await tx.saleUpgrade.findMany({ where: { saleId } });
  const upgradeAbateCents = upgrades.reduce(
    (sum, u) => sum + decimalToCents(u.abatedValue),
    0,
  );

  const sale = await tx.sale.findUnique({ where: { id: saleId } });
  if (!sale) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada" });
  }

  // Recalculate discount if percentage
  let discountAmountCents = decimalToCents(sale.discountAmount);
  if (sale.discountType === "percentage") {
    const pct = Number(sale.discountValue);
    discountAmountCents = Math.round(subtotalCents * (pct / 100));
  }

  const netAfterDiscount = subtotalCents - discountAmountCents;
  const totalCents = Math.max(0, netAfterDiscount - upgradeAbateCents);
  // Downgrade: upgrade excede valor da venda — diferenca a devolver ao cliente.
  const refundDueCents = Math.max(0, upgradeAbateCents - netAfterDiscount);

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
