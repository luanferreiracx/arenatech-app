import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure, publicProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  addSaleItemSchema,
  updateSaleItemSchema,
  applyDiscountSchema,
  finalizeSaleSchema,
  cancelSaleSchema,
  refundSaleSchema,
  listSalesSchema,
  type PaymentDetail,
} from "@/lib/validators/sale";
import crypto from "crypto";

// ── Helpers ──────────────────────────────────────────────────────────────────

function generatePublicLink(): string {
  return crypto.randomBytes(16).toString("hex");
}

type TransactionClient = Parameters<Parameters<typeof import("@/server/db").withAdmin>[0]>[0];

async function generateSaleNumber(tx: TransactionClient, tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `VND${year}`;

  // Retry loop handles concurrent number generation
  for (let attempt = 0; attempt < 3; attempt++) {
    const lastSale = await tx.sale.findFirst({
      where: { tenantId, number: { startsWith: prefix } },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    const lastNum = lastSale ? parseInt(lastSale.number.slice(prefix.length), 10) : 0;
    const newNumber = `${prefix}${String(lastNum + 1).padStart(5, "0")}`;

    // Check if already exists (concurrent conflict)
    const exists = await tx.sale.findFirst({ where: { tenantId, number: newNumber } });
    if (!exists) return newNumber;
  }

  // Fallback: use timestamp-based suffix
  return `${prefix}${Date.now().toString().slice(-5)}`;
}

async function recalculateSaleTotals(
  tx: TransactionClient,
  saleId: string,
  discountType?: string | null,
  discountValue?: number,
): Promise<{ subtotal: number; discountAmount: number; totalAmount: number }> {
  const items = await tx.saleItem.findMany({ where: { saleId } });

  const subtotal = items.reduce((sum, item) => sum + Number(item.total), 0);

  // Get current discount if not provided
  let dType = discountType;
  let dValue = discountValue;
  if (dType === undefined || dValue === undefined) {
    const sale = await tx.sale.findFirst({
      where: { id: saleId },
      select: { discountType: true, discountValue: true },
    });
    if (dType === undefined) dType = sale?.discountType ?? null;
    if (dValue === undefined) dValue = Number(sale?.discountValue ?? 0);
  }

  let discountAmount = 0;
  if (dType === "fixed") {
    discountAmount = dValue ?? 0;
  } else if (dType === "percent") {
    discountAmount = Math.round((subtotal * (dValue ?? 0)) / 100);
  }

  const totalAmount = Math.max(0, subtotal - discountAmount);

  await tx.sale.update({
    where: { id: saleId },
    data: {
      subtotal,
      discountType: dType,
      discountValue: dValue,
      discountAmount,
      totalAmount,
    },
  });

  return { subtotal, discountAmount, totalAmount };
}

// ── Router ───────────────────────────────────────────────────────────────────

export const saleRouter = createTRPCRouter({
  // ── Create Draft ──────────────────────────────────────────────────────────

  createDraft: tenantProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    return ctx.withTenant(async (tx) => {
      const number = await generateSaleNumber(tx, ctx.tenantId);
      const publicLink = generatePublicLink();

      return tx.sale.create({
        data: {
          tenantId: ctx.tenantId,
          number,
          sellerId: userId,
          status: "DRAFT",
          publicLink,
        },
        include: { items: true },
      });
    });
  }),

  // ── Get Draft (active draft for current user) ─────────────────────────────

  getDraft: tenantProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    return ctx.withTenant(async (tx) => {
      return tx.sale.findFirst({
        where: { sellerId: userId, status: "DRAFT", deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { items: true },
      });
    });
  }),

  // ── Add Item ──────────────────────────────────────────────────────────────

  addItem: tenantProcedure
    .input(addSaleItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId, status: "DRAFT", deletedAt: null },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada ou não é rascunho" });
        }

        // Check stock
        const product = await tx.product.findFirst({
          where: { id: input.productId, deletedAt: null, active: true },
        });
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
        }
        if (product.currentStock < input.quantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Estoque insuficiente. Disponível: ${product.currentStock}`,
          });
        }

        // Check if product already in cart — if so, increment quantity
        const existingItem = await tx.saleItem.findFirst({
          where: { saleId: input.saleId, productId: input.productId },
        });

        if (existingItem) {
          const newQty = existingItem.quantity + input.quantity;
          if (product.currentStock < newQty) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Estoque insuficiente. Disponível: ${product.currentStock}`,
            });
          }
          const itemDiscount = input.discount ?? Number(existingItem.discount);
          const total = newQty * input.unitPrice - itemDiscount;
          await tx.saleItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: newQty,
              unitPrice: input.unitPrice,
              discount: itemDiscount,
              total: Math.max(0, total),
            },
          });
        } else {
          const itemDiscount = input.discount ?? 0;
          const total = input.quantity * input.unitPrice - itemDiscount;
          await tx.saleItem.create({
            data: {
              tenantId: ctx.tenantId,
              saleId: input.saleId,
              productId: input.productId,
              description: product.name,
              quantity: input.quantity,
              unitPrice: input.unitPrice,
              costPrice: Number(product.costPrice),
              discount: itemDiscount,
              total: Math.max(0, total),
            },
          });
        }

        await recalculateSaleTotals(tx, input.saleId);

        return tx.sale.findFirst({
          where: { id: input.saleId },
          include: { items: true },
        });
      });
    }),

  // ── Update Item Quantity ──────────────────────────────────────────────────

  updateItemQuantity: tenantProcedure
    .input(updateSaleItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.saleItem.findFirst({
          where: { id: input.itemId },
        });
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
        }

        const sale = await tx.sale.findFirst({
          where: { id: item.saleId, status: "DRAFT", deletedAt: null },
        });
        if (!sale) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Venda não é rascunho" });
        }

        // Check stock
        const product = await tx.product.findFirst({
          where: { id: item.productId, deletedAt: null },
        });
        if (product && product.currentStock < input.quantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Estoque insuficiente. Disponível: ${product.currentStock}`,
          });
        }

        const total = input.quantity * Number(item.unitPrice) - Number(item.discount);
        await tx.saleItem.update({
          where: { id: input.itemId },
          data: { quantity: input.quantity, total: Math.max(0, total) },
        });

        await recalculateSaleTotals(tx, item.saleId);

        return tx.sale.findFirst({
          where: { id: item.saleId },
          include: { items: true },
        });
      });
    }),

  // ── Remove Item ───────────────────────────────────────────────────────────

  removeItem: tenantProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.saleItem.findFirst({
          where: { id: input.itemId },
        });
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
        }

        const sale = await tx.sale.findFirst({
          where: { id: item.saleId, status: "DRAFT", deletedAt: null },
        });
        if (!sale) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Venda não é rascunho" });
        }

        await tx.saleItem.delete({ where: { id: input.itemId } });
        await recalculateSaleTotals(tx, item.saleId);

        return tx.sale.findFirst({
          where: { id: item.saleId },
          include: { items: true },
        });
      });
    }),

  // ── Set Customer ──────────────────────────────────────────────────────────

  setCustomer: tenantProcedure
    .input(z.object({ saleId: z.string().uuid(), customerId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId, status: "DRAFT", deletedAt: null },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
        }

        if (input.customerId) {
          const customer = await tx.customer.findFirst({
            where: { id: input.customerId, deletedAt: null },
          });
          if (!customer) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
          }
        }

        return tx.sale.update({
          where: { id: input.saleId },
          data: { customerId: input.customerId ?? null },
          include: { items: true },
        });
      });
    }),

  // ── Apply Discount ────────────────────────────────────────────────────────

  applyDiscount: tenantProcedure
    .input(applyDiscountSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId, status: "DRAFT", deletedAt: null },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
        }

        await recalculateSaleTotals(tx, input.saleId, input.discountType, input.discountValue);

        // Save discount reason if provided
        if (input.discountReason !== undefined) {
          await tx.sale.update({
            where: { id: input.saleId },
            data: { discountReason: input.discountReason || null },
          });
        }

        return tx.sale.findFirst({
          where: { id: input.saleId },
          include: { items: true },
        });
      });
    }),

  // ── Finalize (ATOMIC) ─────────────────────────────────────────────────────

  finalize: tenantProcedure
    .input(finalizeSaleSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        // 1. Load draft with items
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId, status: "DRAFT", deletedAt: null },
          include: { items: true },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada ou não é rascunho" });
        }
        if (sale.items.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Venda sem itens" });
        }

        // Apply discount if provided
        if (input.discountType && input.discountValue !== undefined) {
          await recalculateSaleTotals(tx, input.saleId, input.discountType, input.discountValue);
        }

        // Re-fetch after discount recalculation
        const updatedSale = await tx.sale.findFirst({
          where: { id: input.saleId },
          include: { items: true },
        });
        if (!updatedSale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
        }

        const totalAmount = Number(updatedSale.totalAmount);

        // Validate payments >= total
        const payments = input.payments as PaymentDetail[];
        const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
        if (paidAmount < totalAmount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Pagamento insuficiente. Total: ${totalAmount}, Pago: ${paidAmount}`,
          });
        }

        // Calculate change
        const changeAmount = Math.max(0, paidAmount - totalAmount);

        // 2. For each item: check stock, decrement, create StockMovement
        for (const item of updatedSale.items) {
          const product = await tx.product.findFirst({
            where: { id: item.productId, deletedAt: null },
          });
          if (!product) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Produto "${item.description}" não encontrado`,
            });
          }
          if (product.currentStock < item.quantity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Estoque insuficiente para "${item.description}". Disponível: ${product.currentStock}, Necessário: ${item.quantity}`,
            });
          }

          // Decrement stock
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { decrement: item.quantity } },
          });

          // Create stock movement
          await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: item.productId,
              type: "SALE",
              quantity: item.quantity,
              unitCost: item.costPrice,
              reason: `Venda ${updatedSale.number}`,
              referenceId: updatedSale.id,
              referenceType: "SALE",
              userId,
            },
          });
        }

        // 3. Update sale status
        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            status: "COMPLETED",
            customerId: input.customerId ?? updatedSale.customerId,
            paidAmount,
            changeAmount,
            paymentDetails: payments,
            saleDate: new Date(),
            observations: input.observations ?? null,
            discountReason: input.discountReason ?? updatedSale.discountReason,
          },
        });

        // 4. Cash movements + financial transactions for each payment
        const openRegister = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
        });

        // Distribute changeAmount across CASH payments proportionally
        let remainingChange = changeAmount;

        for (const payment of payments) {
          // Create cash movement (if register is open)
          if (openRegister) {
            const isCash = payment.method === "CASH" || payment.method === "Dinheiro";
            // For cash payments, subtract change so the register reflects actual sale value
            let movementAmount = payment.amount;
            if (isCash && remainingChange > 0) {
              const deduction = Math.min(remainingChange, payment.amount);
              movementAmount = payment.amount - deduction;
              remainingChange -= deduction;
            }

            if (movementAmount > 0) {
              await tx.cashMovement.create({
                data: {
                  tenantId: ctx.tenantId,
                  cashRegisterId: openRegister.id,
                  type: "SALE",
                  amount: movementAmount,
                  paymentMethod: payment.method,
                  description: `Venda ${updatedSale.number}`,
                  referenceId: updatedSale.id,
                  referenceType: "SALE",
                  userId,
                },
              });
            }
          }

          // Create financial transaction (RECEIVABLE)
          const isImmediate = ["CASH", "PIX", "DEBIT_CARD", "Dinheiro", "Pix", "Débito"].includes(payment.method);
          const installments = payment.installments ?? 1;

          if (installments <= 1) {
            // Single payment
            await tx.financialTransaction.create({
              data: {
                tenantId: ctx.tenantId,
                type: "RECEIVABLE",
                status: isImmediate ? "PAID" : "PENDING",
                description: `Venda ${updatedSale.number} — ${payment.method}`,
                totalAmount: payment.amount,
                paidAmount: isImmediate ? payment.amount : 0,
                dueDate: new Date(),
                paidAt: isImmediate ? new Date() : null,
                referenceId: updatedSale.id,
                referenceType: "SALE",
                customerId: input.customerId ?? updatedSale.customerId,
              },
            });
          } else {
            // Installment payment
            const transaction = await tx.financialTransaction.create({
              data: {
                tenantId: ctx.tenantId,
                type: "RECEIVABLE",
                status: "PENDING",
                description: `Venda ${updatedSale.number} — ${payment.method} (${installments}x)`,
                totalAmount: payment.amount,
                paidAmount: 0,
                dueDate: new Date(),
                referenceId: updatedSale.id,
                referenceType: "SALE",
                customerId: input.customerId ?? updatedSale.customerId,
              },
            });

            const installmentAmount = payment.amount / installments;
            const installmentRecords = Array.from({ length: installments }, (_, i) => {
              const dueDate = new Date();
              dueDate.setMonth(dueDate.getMonth() + i + 1);
              return {
                tenantId: ctx.tenantId,
                transactionId: transaction.id,
                number: i + 1,
                amount: i === installments - 1
                  ? payment.amount - installmentAmount * (installments - 1)
                  : installmentAmount,
                dueDate,
              };
            });

            await tx.installment.createMany({ data: installmentRecords });
          }
        }

        return tx.sale.findFirst({
          where: { id: input.saleId },
          include: { items: true },
        });
      });
    }),

  // ── Cancel (draft only) ───────────────────────────────────────────────────

  cancel: tenantProcedure
    .input(cancelSaleSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId, deletedAt: null },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
        }
        if (sale.status !== "DRAFT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas rascunhos podem ser cancelados" });
        }

        return tx.sale.update({
          where: { id: input.saleId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledById: userId,
            cancellationReason: input.reason ?? null,
          },
        });
      });
    }),

  // ── Refund (completed only) ───────────────────────────────────────────────

  refund: tenantProcedure
    .input(refundSaleSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId, deletedAt: null },
          include: { items: true },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
        }
        if (sale.status !== "COMPLETED" && sale.status !== "PARTIALLY_REFUNDED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas vendas finalizadas podem ser estornadas" });
        }

        // 1. Revert stock for each item
        for (const item of sale.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { increment: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: item.productId,
              type: "RETURN",
              quantity: item.quantity,
              reason: `Estorno venda ${sale.number}`,
              referenceId: sale.id,
              referenceType: "SALE_REFUND",
              userId,
            },
          });
        }

        // 2. Create cash movement for the refund (register the reversal)
        const openRegister = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
        });
        if (openRegister) {
          // Register refund in the cash register for the total amount
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashRegisterId: openRegister.id,
              type: "WITHDRAWAL",
              amount: Number(sale.totalAmount),
              paymentMethod: "REFUND",
              description: `Estorno venda ${sale.number}`,
              referenceId: sale.id,
              referenceType: "SALE_REFUND",
              userId,
            },
          });
        }

        // 3. Cancel related financial transactions
        await tx.financialTransaction.updateMany({
          where: {
            referenceId: sale.id,
            referenceType: "SALE",
            status: { in: ["PENDING", "PAID", "PARTIALLY_PAID"] },
          },
          data: { status: "CANCELLED" },
        });

        // 3b. Cancel pending commissions linked to this sale
        await tx.commission.updateMany({
          where: {
            referenceId: sale.id,
            referenceType: "sale",
            status: "PENDING",
          },
          data: { status: "CANCELLED", notes: `Estorno venda ${sale.number}` },
        });

        // 4. Update sale status
        return tx.sale.update({
          where: { id: input.saleId },
          data: {
            status: "REFUNDED",
            cancelledAt: new Date(),
            cancelledById: userId,
            cancellationReason: input.reason,
          },
          include: { items: true },
        });
      });
    }),

  // ── List ──────────────────────────────────────────────────────────────────

  list: tenantProcedure
    .input(listSalesSchema)
    .query(async ({ ctx, input }) => {
      const { search, status, sellerId, dateFrom, dateTo, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        // If searching, find matching customer IDs first (like Laravel does)
        let customerIdFilter: string[] | undefined;
        if (search) {
          const matchingCustomers = await tx.customer.findMany({
            where: {
              deletedAt: null,
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { cpf: { contains: search, mode: "insensitive" as const } },
              ],
            },
            select: { id: true },
            take: 50,
          });
          customerIdFilter = matchingCustomers.map((c) => c.id);
        }

        const where = {
          deletedAt: null,
          // Exclude DRAFT from listing unless explicitly requested
          ...(status ? { status } : { status: { not: "DRAFT" as const } }),
          ...(sellerId ? { sellerId } : {}),
          ...(dateFrom || dateTo
            ? {
                saleDate: {
                  ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                  ...(dateTo ? { lte: new Date(dateTo) } : {}),
                },
              }
            : {}),
          ...(search
            ? {
                OR: [
                  { number: { contains: search, mode: "insensitive" as const } },
                  ...(customerIdFilter && customerIdFilter.length > 0
                    ? [{ customerId: { in: customerIdFilter } }]
                    : []),
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.sale.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { saleDate: "desc" },
            include: {
              items: { select: { quantity: true } },
            },
          }),
          tx.sale.count({ where }),
        ]);

        // Enrich with customer names
        const customerIds = [...new Set(items.filter((s) => s.customerId).map((s) => s.customerId!))];
        const customers = customerIds.length > 0
          ? await tx.customer.findMany({
              where: { id: { in: customerIds } },
              select: { id: true, name: true, cpf: true },
            })
          : [];
        const customerMap = new Map(customers.map((c) => [c.id, c]));

        // Enrich with seller names (users table is global)
        const sellerIds = [...new Set(items.map((s) => s.sellerId))];
        let sellerMap = new Map<string, { id: string; name: string }>();
        if (sellerIds.length > 0) {
          const sellers = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: sellerIds } },
              select: { id: true, name: true },
            });
          });
          sellerMap = new Map(sellers.map((s) => [s.id, s]));
        }

        const enrichedItems = items.map((sale) => ({
          ...sale,
          itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
          customer: sale.customerId ? customerMap.get(sale.customerId) ?? null : null,
          seller: sellerMap.get(sale.sellerId) ?? null,
        }));

        return { items: enrichedItems, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get By Id ─────────────────────────────────────────────────────────────

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.id, deletedAt: null },
          include: { items: true },
        });

        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
        }

        // Fetch customer
        const customer = sale.customerId
          ? await tx.customer.findFirst({
              where: { id: sale.customerId },
              select: { id: true, name: true, cpf: true, cnpj: true, phone: true, email: true, type: true },
            })
          : null;

        // Fetch seller name
        let seller: { id: string; name: string } | null = null;
        const sellers = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: { id: sale.sellerId },
            select: { id: true, name: true },
          });
        });
        seller = sellers[0] ?? null;

        // Fetch cancelled-by user name if applicable
        let cancelledBy: { id: string; name: string } | null = null;
        if (sale.cancelledById) {
          const cbUsers = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: sale.cancelledById! },
              select: { id: true, name: true },
            });
          });
          cancelledBy = cbUsers[0] ?? null;
        }

        return { ...sale, customer, seller, cancelledBy };
      });
    }),

  // ── Stats ─────────────────────────────────────────────────────────────────

  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [salesToday, salesMonth, revenueTodayRows, revenueMonthRows] = await Promise.all([
        tx.sale.count({
          where: {
            deletedAt: null,
            status: "COMPLETED",
            saleDate: { gte: startOfDay },
          },
        }),
        tx.sale.count({
          where: {
            deletedAt: null,
            status: "COMPLETED",
            saleDate: { gte: startOfMonth },
          },
        }),
        tx.sale.findMany({
          where: {
            deletedAt: null,
            status: "COMPLETED",
            saleDate: { gte: startOfDay },
          },
          select: { totalAmount: true },
        }),
        tx.sale.findMany({
          where: {
            deletedAt: null,
            status: "COMPLETED",
            saleDate: { gte: startOfMonth },
          },
          select: { totalAmount: true },
        }),
      ]);

      const revenueToday = revenueTodayRows.reduce((sum, s) => sum + Number(s.totalAmount), 0);
      const revenueMonth = revenueMonthRows.reduce((sum, s) => sum + Number(s.totalAmount), 0);
      const averageTicket = salesToday > 0 ? revenueToday / salesToday : 0;

      return {
        salesToday,
        revenueToday,
        averageTicket,
        salesMonth,
        revenueMonth,
      };
    });
  }),

  // ── By Public Link (no auth) ──────────────────────────────────────────────

  byPublicLink: publicProcedure
    .input(z.object({ publicLink: z.string().min(1) }))
    .query(async ({ input }) => {
      return withAdmin(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { publicLink: input.publicLink, deletedAt: null },
          select: {
            id: true,
            number: true,
            status: true,
            subtotal: true,
            discountAmount: true,
            totalAmount: true,
            paidAmount: true,
            changeAmount: true,
            paymentDetails: true,
            saleDate: true,
          },
        });

        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Recibo não encontrado" });
        }

        // Fetch items
        const items = await tx.saleItem.findMany({
          where: { saleId: sale.id },
          select: { description: true, quantity: true, unitPrice: true, discount: true, total: true },
        });

        return { ...sale, items };
      });
    }),

  // ── List Sellers (for selectors) ──────────────────────────────────────────

  listSellers: tenantProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userTenants = await tx.userTenant.findMany({
          where: { tenantId: ctx.tenantId },
          select: { userId: true },
        });

        const userIds = userTenants.map((ut) => ut.userId);
        if (userIds.length === 0) return [];

        return withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: {
              id: { in: userIds },
              ...(input?.search
                ? { name: { contains: input.search, mode: "insensitive" as const } }
                : {}),
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          });
        });
      });
    }),
});
