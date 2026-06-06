import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createQuickSaleSchema,
  updateQuickSaleSchema,
  listQuickSalesSchema,
  generateQuickSalePixSchema,
  checkQuickSalePixStatusSchema,
} from "@/lib/validators/quick-sale";
import {
  createDeposit,
  checkTransactionStatus,
} from "@/server/services/depix-transaction.service";
import { validateDepixLimit } from "@/lib/services/depix-limit-service";
import { logger } from "@/lib/logger";

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function isCompletedDepixStatus(status: string): boolean {
  return status === "COMPLETED" || status === "COMPLETED_FEE_PENDING";
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
      // Pre-calculo de total + validacao de regra DePix antes de abrir tx.
      // PIX >= R$ 500 exige CPF/CNPJ do pagador (anti-fraude PixPay).
      const subtotalPre = input.quantity * input.unitPrice;
      const totalCentsPre = Math.max(0, subtotalPre - (input.discount ?? 0));
      const totalReaisPre = totalCentsPre / 100;
      const cpfDigits = (input.cpfCnpj ?? "").replace(/\D/g, "");
      const hasValidTaxId = cpfDigits.length === 11 || cpfDigits.length === 14;
      if (totalReaisPre >= 500 && !hasValidTaxId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Para PIX a partir de R$ 500,00 e obrigatorio informar CPF ou CNPJ do pagador.",
        });
      }

      // ETAPA 1 — cria registro + valida limite (tx curta).
      const { qs, number } = await ctx.withTenant(async (tx) => {
        // Valida limite DePix: R$ 5.000 por transacao por CPF/CNPJ.
        if (hasValidTaxId) {
          const limit = await validateDepixLimit(tx, ctx.tenantId, cpfDigits, totalReaisPre);
          if (!limit.allowed) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: limit.reason ?? "Limite DePix excedido.",
            });
          }
        }

        // Generate number: QS{year}{5-digit seq}
        const year = new Date().getFullYear();
        const { nextTenantNumber } = await import("@/server/services/tenant-number-sequence.service");
        const { formatted: num } = await nextTenantNumber(
          tx as unknown as Parameters<typeof nextTenantNumber>[0],
          ctx.tenantId,
          "quick_sale",
          year,
          { padding: 5, prefix: `QS${year}` },
        );

        const unitPriceDecimal = new Prisma.Decimal(input.unitPrice / 100);
        const discountDecimal = new Prisma.Decimal((input.discount ?? 0) / 100);
        const subtotal = input.quantity * input.unitPrice;
        const totalCents = Math.max(0, subtotal - (input.discount ?? 0));
        const totalDecimal = new Prisma.Decimal(totalCents / 100);

        const created = await tx.quickSale.create({
          data: {
            tenantId: ctx.tenantId,
            number: num,
            buyerName: input.buyerName ?? null,
            cpfCnpj: input.cpfCnpj?.replace(/\D/g, "") ?? null,
            phone: input.phone?.replace(/\D/g, "") ?? null,
            productDescription: input.productDescription,
            quantity: input.quantity,
            unitPrice: unitPriceDecimal,
            discount: discountDecimal,
            totalAmount: totalDecimal,
            createdById: ctx.session.user.id,
            depixStatus: "pending",
          },
        });
        return { qs: created, number: num };
      });

      // ETAPA 2 — gera deposito via Wallet DePix (HTTP externo, fora da tx).
      const walletTx = await createDeposit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        userName: ctx.session.user.name ?? null,
        grossAmountCents: totalCentsPre,
        sourceType: "QUICK_SALE",
        sourceId: qs.id,
        sourceDescription: `Venda ${number}`,
        payerTaxId: cpfDigits || null,
      });

      // ETAPA 3 — persiste vinculo canonico + espelho legado do PixPay/QR.
      const updated = await ctx.withTenant(async (tx) =>
        tx.quickSale.update({
          where: { id: qs.id },
          data: {
            walletTransactionId: walletTx.id,
            depixTransactionId: walletTx.pixpayDepixId ?? null,
            depixStatus: "pending",
            depixQrCode: walletTx.qrCode ?? null,
            depixQrCodeBase64: walletTx.qrCodeBase64 ?? null,
          },
        }),
      );

      logger.info("QuickSale criada + deposito wallet DePix gerado", {
        quickSaleId: qs.id,
        number,
        walletTransactionId: walletTx.id,
        transactionId: walletTx.pixpayDepixId,
        amount: totalReaisPre,
      });

      return serializeQuickSale(updated as unknown as Record<string, unknown>);
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

        if (existing.walletTransactionId) {
          const walletTx = await checkTransactionStatus(ctx.tenantId, existing.walletTransactionId);
          if (!walletTx) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Transacao DePix nao encontrada." });
          }
          if (walletTx.sourceType !== "QUICK_SALE" || walletTx.sourceId !== existing.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Transacao DePix nao pertence a esta venda avulsa.",
            });
          }
          if (!isCompletedDepixStatus(walletTx.status)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "DePix ainda nao liquidado. Use 'Verificar PIX' ou aguarde a confirmacao.",
            });
          }
        } else if (existing.depixTransactionId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Venda avulsa DePix sem transacao wallet confirmada. Use 'Verificar PIX' antes de marcar como paga.",
          });
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

  /**
   * Gera QR Code PIX/DePix para a venda avulsa (paridade Laravel
   * `gerarPixVendaAvulsa`). Persiste depixTransactionId + qrCode na propria
   * row pra o webhook localizar quando o pagamento confirmar.
   */
  generatePix: tenantProcedure
    .input(generateQuickSalePixSchema)
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch + validacoes (tx curta)
      const qs = await ctx.withTenant(async (tx) =>
        tx.quickSale.findUnique({ where: { id: input.id } }),
      );
      if (!qs || qs.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venda avulsa nao encontrada" });
      }
      if (qs.status !== "AWAITING_PAYMENT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Venda nao esta aguardando pagamento",
        });
      }
      const totalReais = Number(qs.totalAmount);
      if (totalReais <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Total deve ser maior que zero" });
      }

      // Regra DePix: >= R$ 500 exige CPF/CNPJ. Usa o que vier no input
      // (operador pode digitar agora) ou o que ja tem cadastrado.
      const taxIdRaw = (input.taxId ?? qs.cpfCnpj ?? "").replace(/\D/g, "");
      const hasValidTaxId = taxIdRaw.length === 11 || taxIdRaw.length === 14;
      if (totalReais >= 500 && !hasValidTaxId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Para PIX a partir de R$ 500,00 e obrigatorio informar CPF ou CNPJ do pagador.",
        });
      }

      // Valida limite por documento (R$ 5.000/tx).
      if (hasValidTaxId) {
        const limit = await ctx.withTenant(async (tx) =>
          validateDepixLimit(tx, ctx.tenantId, taxIdRaw, totalReais),
        );
        if (!limit.allowed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: limit.reason ?? "Limite DePix excedido.",
          });
        }
      }

      // ETAPA 2 — cria deposito via wallet DePix (HTTP, fora de tx).
      const result = await createDeposit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        userName: ctx.session.user.name ?? null,
        grossAmountCents: Math.round(totalReais * 100),
        sourceType: "QUICK_SALE",
        sourceId: qs.id,
        sourceDescription: `Venda ${qs.number}`,
        payerTaxId: taxIdRaw || null,
      });

      // ETAPA 3 — Persiste vinculo canonico + espelho legado do PixPay/QR.
      await ctx.withTenant(async (tx) =>
        tx.quickSale.update({
          where: { id: qs.id },
          data: {
            walletTransactionId: result.id,
            depixTransactionId: result.pixpayDepixId ?? null,
            depixStatus: "pending",
            depixQrCode: result.qrCode ?? null,
            depixQrCodeBase64: result.qrCodeBase64 ?? null,
            // Persiste CPF/CNPJ se o operador digitou no momento de gerar.
            ...(input.taxId && !qs.cpfCnpj ? { cpfCnpj: taxIdRaw } : {}),
          },
        }),
      );

      logger.info("QuickSale deposito wallet DePix gerado", {
        quickSaleId: qs.id,
        number: qs.number,
        walletTransactionId: result.id,
        transactionId: result.pixpayDepixId,
        amount: totalReais,
      });

      return {
        walletTransactionId: result.id,
        transactionId: result.pixpayDepixId,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        pixKey: result.depositAddress,
      };
    }),

  /**
   * Consulta status atual da transacao PIX e marca venda como PAID quando
   * confirmar. Botao manual de "Verificar PIX" + polling do dialog.
   */
  checkPixStatus: tenantProcedure
    .input(checkQuickSalePixStatusSchema)
    .mutation(async ({ ctx, input }) => {
      // Ownership: transactionId deve estar vinculado a uma quick-sale do tenant.
      const qs = await ctx.withTenant(async (tx) =>
        tx.quickSale.findUnique({ where: { id: input.id } }),
      );
      if (!qs || qs.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const walletTransactionId = input.walletTransactionId ?? qs.walletTransactionId;
      if (walletTransactionId) {
        const walletTx = await checkTransactionStatus(ctx.tenantId, walletTransactionId);
        if (!walletTx) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transacao wallet nao encontrada" });
        }
        if (walletTx.sourceType !== "QUICK_SALE" || walletTx.sourceId !== qs.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Transacao wallet nao pertence a esta venda.",
          });
        }

        let status: "pending" | "paid" | "expired" | "failed" = "pending";
        if (walletTx.status === "COMPLETED" || walletTx.status === "COMPLETED_FEE_PENDING") {
          status = "paid";
        } else if (walletTx.status === "EXPIRED") {
          status = "expired";
        } else if (walletTx.status === "FAILED" || walletTx.status === "CANCELLED") {
          status = "failed";
        }

        if (qs.status === "AWAITING_PAYMENT") {
          if (status === "paid") {
            await ctx.withTenant(async (tx) =>
              tx.quickSale.update({
                where: { id: qs.id },
                data: { status: "PAID", paidAt: new Date(), depixStatus: "paid" },
              }),
            );
          } else if (status === "expired") {
            await ctx.withTenant(async (tx) =>
              tx.quickSale.update({
                where: { id: qs.id },
                data: { status: "EXPIRED", depixStatus: "expired" },
              }),
            );
          } else if (status === "failed") {
            await ctx.withTenant(async (tx) =>
              tx.quickSale.update({
                where: { id: qs.id },
                data: { status: "CANCELLED", depixStatus: "failed" },
              }),
            );
          }
        }

        return {
          status,
          isFinal: status !== "pending",
        };
      }

      if (qs.depixTransactionId && qs.depixTransactionId !== input.transactionId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Transacao nao pertence a esta venda.",
        });
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Venda sem transacao wallet DePix vinculada.",
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
