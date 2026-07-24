import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { isTenantAdmin } from "@/lib/auth/roles";
import { logAudit } from "@/server/services/audit-log.service";
import { writeCashMovement, refundNeedsOpenCashSession } from "@/server/services/cash-session.service";
import { addMonthsSafe } from "@/lib/date/add-months-safe";
import { startOfMonthBrt, endOfMonthBrt } from "@/lib/utils/date-range";
import { resolveSupplierId } from "@/server/services/financial-supplier.service";
import { resolveCategoryId } from "@/server/services/financial-category.service";
import { generateInstallments } from "@/server/services/installment-generator.service";

// RBAC helper: operador só vê/cria RECEIVABLE (F8, ADR 0032). Admin do tenant
// (ou superadmin) faz tudo. Retorna "admin" | "operator" para os checks abaixo.
function getUserRole(ctx: {
  session: { user: { isSuperAdmin?: boolean }; availableTenants: Array<{ id: string; role: string }> };
  tenantId: string;
}): "admin" | "operator" {
  return isTenantAdmin(ctx.session, ctx.tenantId) ? "admin" : "operator";
}

/**
 * D1 (auditoria fin 2026-07-10): a FT/parcela representa um pagamento em CARTÃO?
 * Pós-#478 cartão não gera FT — só FT LEGADA de cartão tem estes métodos. Usado
 * na dedup do fluxo de caixa (só a parcela de cartão legado é o double do
 * CardReceivable; crediário/dinheiro/pix não são).
 */
function isCardPaymentMethod(method: string | null | undefined): boolean {
  return method === "cartao_credito" || method === "cartao_debito";
}

import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsSchema,
  payInstallmentSchema,
  reverseInstallmentSchema,
  cashFlowSchema,
  overdueSchema,
  dreSchema,
  projectedCashFlowSchema,
  listReceivablesSchema,
  listPendingSchema,
} from "@/lib/validators/financial";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrismaDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

function serializeTransaction(t: {
  id: string;
  type: string;
  status: string;
  description: string;
  category: string | null;
  supplier: string | null;
  customerName: string | null;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  dueDate: Date;
  emissionDate: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  referenceId: string | null;
  referenceType: string | null;
  customerId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  installments?: Array<{
    id: string;
    number: number;
    amount: Prisma.Decimal;
    dueDate: Date;
    paidAmount: Prisma.Decimal;
    paidAt: Date | null;
    paymentMethod: string | null;
    notes: string | null;
    status: string;
    createdAt: Date;
  }>;
}) {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    description: t.description,
    category: t.category,
    supplier: t.supplier,
    customerName: t.customerName,
    totalAmount: decimalToCents(t.totalAmount),
    paidAmount: decimalToCents(t.paidAmount),
    remainingAmount: decimalToCents(t.totalAmount) - decimalToCents(t.paidAmount),
    dueDate: t.dueDate,
    emissionDate: t.emissionDate,
    paidAt: t.paidAt,
    paymentMethod: t.paymentMethod,
    referenceId: t.referenceId,
    referenceType: t.referenceType,
    customerId: t.customerId,
    notes: t.notes,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    installments: t.installments?.map((inst) => ({
      id: inst.id,
      number: inst.number,
      amount: decimalToCents(inst.amount),
      dueDate: inst.dueDate,
      paidAmount: decimalToCents(inst.paidAmount),
      paidAt: inst.paidAt,
      paymentMethod: inst.paymentMethod,
      notes: inst.notes,
      status: inst.status,
      createdAt: inst.createdAt,
    })),
  };
}

/**
 * Recalculates transaction status based on installment states.
 * Faithfully replicates Laravel's recalcularStatus() logic.
 */
async function recalculateTransactionStatus(
  tx: Prisma.TransactionClient & {
    installment: { count: (args: Record<string, unknown>) => Promise<number>; aggregate: (args: Record<string, unknown>) => Promise<Record<string, unknown>> };
    financialTransaction: { update: (args: Record<string, unknown>) => Promise<unknown> };
  },
  transactionId: string,
) {
  const allInstallments = await (tx as unknown as { installment: { findMany: (a: Record<string, unknown>) => Promise<Array<{ status: string; paidAmount: Prisma.Decimal }>> } }).installment.findMany({
    where: { transactionId },
    select: { status: true, paidAmount: true },
  });

  const totalParcelas = allInstallments.length;
  const parcelasPagas = allInstallments.filter((i: { status: string }) => i.status === "PAID").length;
  const parcelasVencidas = allInstallments.filter((i: { status: string }) => i.status === "OVERDUE").length;

  const totalPago = allInstallments
    .filter((i: { status: string }) => i.status === "PAID")
    .reduce((sum: number, i: { paidAmount: Prisma.Decimal }) => sum + Number(i.paidAmount), 0);

  let newStatus: string;
  if (parcelasPagas >= totalParcelas) {
    newStatus = "PAID";
  } else if (parcelasVencidas > 0) {
    newStatus = parcelasPagas > 0 ? "PARTIALLY_PAID" : "OVERDUE";
  } else if (parcelasPagas > 0) {
    newStatus = "PARTIALLY_PAID";
  } else {
    newStatus = "PENDING";
  }

  await (tx as unknown as { financialTransaction: { update: (a: Record<string, unknown>) => Promise<unknown> } }).financialTransaction.update({
    where: { id: transactionId },
    data: {
      status: newStatus,
      paidAmount: new Prisma.Decimal(totalPago),
      paidAt: newStatus === "PAID" ? new Date() : null,
    },
  });

  return newStatus;
}

export const financialRouter = createTRPCRouter({
  /** List transactions with filters and pagination */
  list: tenantProcedure
    .input(listTransactionsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;
        const sortBy = input.sortBy ?? "createdAt";
        const sortOrder = input.sortOrder ?? "desc";
        const role = getUserRole(ctx);

        const where: Record<string, unknown> = {
          type: role === "operator" ? "RECEIVABLE" : input.type,
          deletedAt: null,
        };

        if (input.status) {
          where.status = input.status;
        }

        if (input.search) {
          where.OR = [
            { description: { contains: input.search, mode: "insensitive" } },
            { customerName: { contains: input.search, mode: "insensitive" } },
            { supplier: { contains: input.search, mode: "insensitive" } },
          ];
        }

        if (input.dateFrom || input.dateTo) {
          const emissionDate: Record<string, Date> = {};
          if (input.dateFrom) emissionDate.gte = new Date(input.dateFrom);
          if (input.dateTo) {
            const end = new Date(input.dateTo);
            end.setHours(23, 59, 59, 999);
            emissionDate.lte = end;
          }
          where.emissionDate = emissionDate;
        }

        const [data, total] = await Promise.all([
          tx.financialTransaction.findMany({
            where,
            include: { installments: { orderBy: { number: "asc" } } },
            orderBy: { [sortBy]: sortOrder },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.financialTransaction.count({ where }),
        ]);

        return {
          data: data.map(serializeTransaction),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get transaction by ID with installments */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const transaction = await tx.financialTransaction.findFirst({
          where: { id: input.id, deletedAt: null },
          include: { installments: { orderBy: { number: "asc" } } },
        });

        if (!transaction) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transacao nao encontrada",
          });
        }

        // RBAC F8: operator cannot see PAYABLE
        const role = getUserRole(ctx);
        if (role === "operator" && transaction.type === "PAYABLE") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a contas a pagar" });
        }

        return serializeTransaction(transaction);
      });
    }),

  /** Create a new financial transaction with installments */
  create: tenantProcedure
    .input(createTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      // RBAC F8: operator cannot create PAYABLE
      const role = getUserRole(ctx);
      if (role === "operator" && input.type === "PAYABLE") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para criar conta a pagar" });
      }
      if (role === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const emissionDate = new Date(input.emissionDate);
        // Primeira parcela: 1 mes apos emissao (paridade Laravel addMonths).
        // Antes era +30 dias naive — fevereiro/marco quebravam o ciclo.
        const firstDueDate = input.firstDueDate
          ? new Date(input.firstDueDate)
          : addMonthsSafe(emissionDate, 1);

        const totalAmountDecimal = centsToPrismaDecimal(input.totalAmount);

        // Fonte única: mesma geração usada no preview das telas de criar conta —
        // garante que o que o usuário vê é exatamente o que é gravado.
        const installments = generateInstallments(
          input.totalAmount,
          input.numInstallments,
          firstDueDate,
        );
        // dueDate da transação = vencimento da última parcela.
        const lastDueDate = installments[installments.length - 1]!.dueDate;

        // Fornecedor: entidade (selecionada/criada/legado) deduplicada. `supplier`
        // (texto) fica como sombra sincronizada. Só em PAYABLE.
        const resolvedSupplier =
          input.type === "PAYABLE"
            ? await resolveSupplierId(tx, ctx.tenantId, input)
            : { supplierId: null, supplierName: null };

        // Categoria: texto (sombra) + FK linkada por lookup de nome+tipo. Antes o
        // categoryId ficava sempre null (FK morta) e nada era categorizável nos
        // relatórios/DRE por categoria.
        const categoryName = input.category?.trim() || null;
        const categoryId = await resolveCategoryId(tx, ctx.tenantId, categoryName, input.type);

        const transaction = await tx.financialTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            status: "PENDING",
            description: input.description,
            category: categoryName,
            categoryId,
            supplierId: resolvedSupplier.supplierId,
            supplier: resolvedSupplier.supplierName,
            customerName: input.customerName ?? null,
            customerId: input.customerId ?? null,
            totalAmount: totalAmountDecimal,
            paidAmount: new Prisma.Decimal(0),
            dueDate: lastDueDate,
            emissionDate,
            paymentMethod: input.paymentMethod ?? null,
            notes: input.notes ?? null,
            // Endpoint user-facing — sem vinculo a sale/OS, marca como manual
            // para a discriminated union (vinculo correto a ausencia de
            // saleId/serviceOrderId).
            isManual: true,
            createdByUserId: ctx.session.user.id,
          },
        });

        // A última parcela absorve o resto (total - parcela*(n-1)) para a soma
        // bater exatamente com o total — lógica centralizada no service.
        for (const parcela of installments) {
          await tx.installment.create({
            data: {
              tenantId: ctx.tenantId,
              transactionId: transaction.id,
              number: parcela.number,
              amount: centsToPrismaDecimal(parcela.amountCents),
              dueDate: parcela.dueDate,
              paidAmount: new Prisma.Decimal(0),
              status: "PENDING",
            },
          });
        }

        const result = await tx.financialTransaction.findUnique({
          where: { id: transaction.id },
          include: { installments: { orderBy: { number: "asc" } } },
        });

        return serializeTransaction(result!);
      });
    }),

  /** Update transaction basic fields (not paid/cancelled) */
  update: tenantProcedure
    .input(updateTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.financialTransaction.findFirst({
          where: { id: input.id, deletedAt: null },
        });

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transacao nao encontrada" });
        }

        // A3 (auditoria fin 2026-07-10): F8 — operador não edita conta a PAGAR.
        // O gate estava em list/getById/create; faltava no update. Espelha getById.
        if (getUserRole(ctx) === "operator" && existing.type === "PAYABLE") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a contas a pagar" });
        }

        if (existing.status === "PAID" || existing.status === "CANCELLED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transacao paga ou cancelada nao pode ser editada",
          });
        }

        // Transactions vinculadas a Sale/ServiceOrder herdam cliente/fornecedor
        // do registro original. Permitir mudar aqui criaria divergencia entre
        // tx.customerName e sale.customer.name — relatorios ficariam errados.
        // Manual transactions (sem saleId/serviceOrderId) podem ter os
        // campos editados livremente.
        const isLinkedToSource = !!existing.saleId || !!existing.serviceOrderId;
        const tryingToChangeParty =
          input.supplier !== undefined || input.customerName !== undefined;
        if (isLinkedToSource && tryingToChangeParty) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Transacao vinculada a venda/OS — altere cliente/fornecedor no registro original.",
          });
        }

        // Fornecedor: em tx não-vinculada, resolve a entidade (select/criar/legado);
        // em tx vinculada, mantém o existente (undefined = não altera).
        const resolvedSupplier = isLinkedToSource
          ? null
          : await resolveSupplierId(tx, ctx.tenantId, input);

        // Categoria: mantém texto (sombra) + re-resolve a FK pelo nome/tipo.
        const categoryName = input.category?.trim() || null;
        const categoryId = await resolveCategoryId(tx, ctx.tenantId, categoryName, existing.type);

        await tx.financialTransaction.update({
          where: { id: input.id },
          data: {
            description: input.description,
            category: categoryName,
            categoryId,
            // Em tx vinculada, mantem cliente/fornecedor existente.
            supplierId: resolvedSupplier ? resolvedSupplier.supplierId : undefined,
            supplier: resolvedSupplier ? resolvedSupplier.supplierName : undefined,
            customerName: isLinkedToSource ? undefined : (input.customerName ?? null),
            notes: input.notes ?? null,
          },
        });

        return { success: true };
      });
    }),

  /** Cancel a transaction and its pending installments */
  cancel: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // RBAC: cancelar uma conta a receber/pagar (e suas parcelas) e operacao de
      // gestao financeira — restringe a admin do tenant, alinhado com
      // `reverseInstallment` (estorno tambem e admin).
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores do tenant podem cancelar transacoes financeiras",
        });
      }
      return ctx.withTenant(async (tx) => {
        const existing = await tx.financialTransaction.findFirst({
          where: { id: input.id, deletedAt: null },
        });

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transacao nao encontrada" });
        }

        if (existing.status === "PAID") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel cancelar uma transacao ja paga",
          });
        }

        // Cancel pending/overdue installments
        await tx.installment.updateMany({
          where: {
            transactionId: input.id,
            status: { in: ["PENDING", "OVERDUE"] },
          },
          data: { status: "CANCELLED" },
        });

        await tx.financialTransaction.update({
          where: { id: input.id },
          data: { status: "CANCELLED" },
        });

        return { success: true };
      });
    }),

  /** Pay an installment (baixar parcela) */
  payInstallment: tenantProcedure
    .input(payInstallmentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const installment = await tx.installment.findFirst({
          where: { id: input.installmentId, tenantId: ctx.tenantId },
          include: { transaction: true },
        });

        if (!installment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parcela nao encontrada" });
        }

        // A2 (auditoria fin 2026-07-10): F8 — operador não pode baixar conta a
        // PAGAR. O gate estava em list/getById/create, mas faltava aqui: um
        // operador que obtivesse o id de uma parcela PAYABLE (via overdue)
        // conseguia efetivá-la e mexer no caixa. Espelha getById.
        if (getUserRole(ctx) === "operator" && installment.transaction.type === "PAYABLE") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a contas a pagar" });
        }

        if (!["PENDING", "OVERDUE"].includes(installment.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Parcela nao pode ser baixada no status atual: ${installment.status}`,
          });
        }

        const currentPaidCents = decimalToCents(installment.paidAmount);
        const amountDueCents = decimalToCents(installment.amount) - currentPaidCents;

        if (input.amountPaid > amountDueCents + 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Valor pago excede o saldo da parcela (R$ ${(amountDueCents / 100).toFixed(2)})`,
          });
        }

        const installmentAmountCents = decimalToCents(installment.amount);
        const newPaidCents = currentPaidCents + input.amountPaid;
        const isPaid = newPaidCents >= installmentAmountCents - 1;

        // Tolerancia de 1 cent: quando fecha a parcela, FORCA paidAmount =
        // amount pra evitar drift acumulado em parcelamentos. Senao,
        // pagamentos parciais repetidos somam 0.99+99.01 = 100.00 mas no
        // banco fica como 100 vs 99.999... — divergencia em relatorios.
        const finalPaidCents = isPaid ? installmentAmountCents : newPaidCents;

        // Atomic update com lock otimista (P1, auditoria fin 2026-07-10): a
        // guarda inclui `paidAmount: installment.paidAmount` (o valor lido), NÃO
        // só o status. Num pagamento PARCIAL a parcela continua PENDING, então
        // guardar só o status deixava dois pagamentos parciais concorrentes
        // passarem os dois — cada um gravava seu paidAmount stale (lost update):
        // dois CashMovement de entrada, mas a parcela creditava um só → dinheiro
        // entrava na gaveta e sumia do razão. Espelha o CAS do reverseInstallment.
        const updateResult = await tx.installment.updateMany({
          where: {
            id: input.installmentId,
            status: { in: ["PENDING", "OVERDUE"] },
            paidAmount: installment.paidAmount,
          },
          data: {
            paidAmount: centsToPrismaDecimal(finalPaidCents),
            paidAt: new Date(),
            paymentMethod: input.paymentMethod ?? null,
            notes: input.notes ?? null,
            status: isPaid ? "PAID" : installment.status,
          },
        });
        if (updateResult.count !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Parcela ja foi baixada por outra operacao. Atualize a tela.",
          });
        }

        // FIN-B2 (auditoria financeira 2026-07-11): grava o EVENTO de pagamento
        // no ledger. `installment.paidAt` guarda só a última data (regime de
        // caixa errado em pagamento multi-mês); o ledger tem uma linha por
        // pagamento com sua própria data → fonte correta de "entrou no mês".
        const paymentPaidAt = new Date();
        await tx.installmentPayment.create({
          data: {
            tenantId: ctx.tenantId,
            installmentId: installment.id,
            transactionId: installment.transactionId,
            amountCents: input.amountPaid,
            paymentMethod: input.paymentMethod ?? null,
            paidAt: paymentPaidAt,
            kind: "payment",
            createdByUserId: ctx.session.user.id,
          },
        });

        // Recalculate transaction status (faithful to Laravel recalcularStatus)
        await recalculateTransactionStatus(tx as never, installment.transactionId);

        // If cash session is open, create a cash movement
        const userId = ctx.session.user.id;
        const openSession = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
        });

        if (openSession) {
          const isReceivable = installment.transaction.type === "RECEIVABLE";

          await writeCashMovement(tx, {
            tenantId: ctx.tenantId,
            cashSessionId: openSession.id,
            type: isReceivable ? "SALE" : "EXPENSE",
            nature: isReceivable ? "INCOME" : "OUTCOME",
            amountCents: input.amountPaid,
            paymentMethod: input.paymentMethod ?? "outros",
            description: `Baixa parcela #${installment.number} - ${installment.transaction.type === "RECEIVABLE" ? "CR" : "CP"}#${installment.transactionId.slice(0, 8)}`,
            referenceType: "installment",
            referenceId: installment.id,
            createdByUserId: userId,
          });
        }

        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "paid",
          entity: "installment",
          entityId: installment.id,
          payload: {
            transactionId: installment.transactionId,
            installmentNumber: installment.number,
            amountPaidCents: input.amountPaid,
            paymentMethod: input.paymentMethod ?? null,
            fullyPaid: isPaid,
          },
        });

        return { success: true };
      });
    }),

  /**
   * Reverse (estornar) an installment payment — supports partial reversal.
   * Se input.amount não for fornecido, estorna o valor pago total.
   * Se for fornecido, estorna apenas esse valor (em centavos) — paridade Laravel
   * ContaReceberParcela::estornoParcial.
   */
  reverseInstallment: tenantProcedure
    .input(reverseInstallmentSchema)
    .mutation(async ({ ctx, input }) => {
      // RBAC: estorno é operacao sensivel — restringe a admin do tenant.
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores do tenant podem estornar parcelas pagas",
        });
      }
      return ctx.withTenant(async (tx) => {
        const installment = await tx.installment.findFirst({
          where: { id: input.installmentId, tenantId: ctx.tenantId },
          include: { transaction: true },
        });

        if (!installment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parcela nao encontrada" });
        }

        // Permite estornar tanto PAID quanto PARTIALLY_PAID (parcelas com pagamento parcial)
        if (!["PAID", "PARTIALLY_PAID"].includes(installment.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas parcelas pagas (integral ou parcialmente) podem ser estornadas",
          });
        }

        const currentPaidCents = decimalToCents(installment.paidAmount);
        if (currentPaidCents <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Parcela não possui valor pago para estornar" });
        }

        const reversedAmount = input.amount ?? currentPaidCents;
        if (reversedAmount > currentPaidCents) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Valor de estorno excede o pago (R$ ${(currentPaidCents / 100).toFixed(2)})`,
          });
        }

        const newPaidCents = currentPaidCents - reversedAmount;
        const isFullReversal = newPaidCents === 0;
        const originalPaymentMethod = installment.paymentMethod;

        // P3 (auditoria fin 2026-07-10): o estorno gera uma saída/entrada de
        // caixa; exige caixa aberto quando há valor a estornar — paridade com o
        // estorno de venda/OS (refundNeedsOpenCashSession). Sem isto, estornar
        // sem caixa aberto pulava silenciosamente o CashMovement e a gaveta
        // sub-reportava a saída. Guard early: antes de mexer na parcela.
        const reverseOpenSession = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });
        if (refundNeedsOpenCashSession(reversedAmount) && !reverseOpenSession) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Caixa nao esta aberto. Abra um caixa antes de estornar (a saida precisa ser registrada na gaveta).",
          });
        }

        // CAS otimista: trava em (status pagável + paidAmount igual ao lido). Se
        // outro estorno concorrente já mexeu na parcela, count=0 → CONFLICT e a
        // tx faz rollback (sem CashMovement de estorno duplicado). Espelha o
        // padrão do payInstallment.
        const reverseResult = await tx.installment.updateMany({
          where: {
            id: input.installmentId,
            status: { in: ["PAID", "PARTIALLY_PAID"] },
            paidAmount: installment.paidAmount,
          },
          data: {
            paidAmount: centsToPrismaDecimal(newPaidCents),
            paidAt: isFullReversal ? null : installment.paidAt,
            paymentMethod: isFullReversal ? null : installment.paymentMethod,
            status: isFullReversal ? "PENDING" : "PARTIALLY_PAID",
            notes: `${installment.notes ?? ""} | Estorno ${isFullReversal ? "total" : "parcial"} R$ ${(reversedAmount / 100).toFixed(2)}: ${input.reason}`.trim(),
          },
        });
        if (reverseResult.count !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Parcela alterada por outra operacao. Atualize a tela e tente novamente.",
          });
        }

        // FIN-B2: registra o estorno no ledger como valor NEGATIVO na data do
        // evento — assim o "recebido/pago no mês" reflete a saída no mês certo.
        await tx.installmentPayment.create({
          data: {
            tenantId: ctx.tenantId,
            installmentId: installment.id,
            transactionId: installment.transactionId,
            amountCents: -reversedAmount,
            paymentMethod: originalPaymentMethod ?? null,
            paidAt: new Date(),
            kind: "reversal",
            createdByUserId: ctx.session.user.id,
          },
        });

        await recalculateTransactionStatus(tx as never, installment.transactionId);

        // Reverse cash movement (reverseOpenSession validado no guard early acima).
        const userId = ctx.session.user.id;
        const openSession = reverseOpenSession;

        if (openSession && reversedAmount > 0) {
          const isReceivable = installment.transaction.type === "RECEIVABLE";

          await writeCashMovement(tx, {
            tenantId: ctx.tenantId,
            cashSessionId: openSession.id,
            // Estorno de recebível = saída (WITHDRAWAL); de pagável = entrada (DEPOSIT).
            type: isReceivable ? "WITHDRAWAL" : "DEPOSIT",
            nature: isReceivable ? "OUTCOME" : "INCOME",
            amountCents: reversedAmount,
            paymentMethod: originalPaymentMethod ?? "outros",
            description: `Estorno ${isFullReversal ? "total" : "parcial"} parcela #${installment.number} - ${isReceivable ? "CR" : "CP"}#${installment.transactionId.slice(0, 8)}`,
            referenceType: "installment_reversal",
            referenceId: installment.id,
            createdByUserId: userId,
          });
        }

        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: isFullReversal ? "reversed_full" : "reversed_partial",
          entity: "installment",
          entityId: installment.id,
          payload: {
            transactionId: installment.transactionId,
            installmentNumber: installment.number,
            reversedAmountCents: reversedAmount,
            reason: input.reason,
          },
        });

        return { success: true, reversedAmount, isFullReversal };
      });
    }),

  /** Get stats for dashboard cards */
  stats: tenantProcedure
    .input(z.object({ type: z.enum(["PAYABLE", "RECEIVABLE"]) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Ancorado em BRT (container roda UTC): mês corrente correto nas bordas.
        // Auditoria 2026-07-13 (E1).
        const now = new Date();
        const startOfMonth = startOfMonthBrt(now);
        const endOfMonth = endOfMonthBrt(now);

        const [pendingResult, overdueResult, paidMonthResult] = await Promise.all([
          tx.financialTransaction.aggregate({
            where: {
              type: input.type,
              status: { in: ["PENDING", "PARTIALLY_PAID"] },
              deletedAt: null,
            },
            _sum: { totalAmount: true, paidAmount: true },
            _count: true,
          }),
          // FIN-B3 (auditoria financeira 2026-07-11): vencidos DERIVADOS de
          // installments, não do status agregado da FT. O cron mark-overdue só
          // promove FT PENDING→OVERDUE; uma conta PARTIALLY_PAID com parcela
          // vencida NUNCA vira OVERDUE (recalculateTransactionStatus a mantém
          // PARTIALLY_PAID), então somava só em pending e a inadimplência exibida
          // ficava subestimada. Aqui conta toda parcela em aberto e vencida,
          // igual às procedures `overdue`/`projectedCashFlow`.
          tx.installment.groupBy({
            by: ["transactionId"],
            where: {
              transaction: { type: input.type, deletedAt: null },
              status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
              dueDate: { lt: now },
            },
            _sum: { amount: true, paidAmount: true },
          }),
          // FIN-B2 (auditoria financeira 2026-07-11): "recebido/pago no mês" no
          // regime de CAIXA vem do LEDGER de pagamentos (installment_payments),
          // não de installment.paidAmount por installment.paidAt. Uma parcela
          // paga R$50 em jan + R$50 em fev tinha só paidAt=fev → os R$50 de jan
          // caíam em fev (D5 só era correto p/ pagamento de uma vez). O ledger
          // tem uma linha por evento com data própria; estornos são negativos,
          // então o SUM já é o líquido que entrou/saiu no mês.
          tx.installmentPayment.aggregate({
            where: {
              installment: { transaction: { type: input.type, deletedAt: null } },
              paidAt: { gte: startOfMonth, lte: endOfMonth },
            },
            _sum: { amountCents: true },
            _count: true,
          }),
        ]);

        // Pending remaining = total - paid
        const pendingTotal = decimalToCents(pendingResult._sum.totalAmount);
        const pendingPaid = decimalToCents(pendingResult._sum.paidAmount);
        const pendingRemaining = pendingTotal - pendingPaid;

        // overdue por installment, agrupado por transação: saldo em aberto
        // (amount - paidAmount) somado; count = nº de contas com parcela vencida.
        const overdueRemaining = overdueResult.reduce(
          (sum, g) => sum + decimalToCents(g._sum.amount) - decimalToCents(g._sum.paidAmount),
          0,
        );
        const overdueCount = overdueResult.length;

        // Ledger já em centavos e líquido (pagamentos − estornos do mês).
        const paidMonthTotal = paidMonthResult._sum.amountCents ?? 0;

        return {
          pendingAmount: pendingRemaining,
          pendingCount: pendingResult._count,
          overdueAmount: overdueRemaining,
          overdueCount,
          paidMonthAmount: paidMonthTotal,
          paidMonthCount: paidMonthResult._count,
        };
      });
    }),

  /** Cash flow report grouped by period */
  cashFlow: tenantProcedure
    .input(cashFlowSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = new Date(input.dateFrom);
        const dateTo = new Date(input.dateTo);
        dateTo.setHours(23, 59, 59, 999);

        // Get all installments in range (both paid and pending)
        const installments = await tx.installment.findMany({
          where: {
            dueDate: { gte: dateFrom, lte: dateTo },
            status: { not: "CANCELLED" },
            transaction: { deletedAt: null },
          },
          include: {
            // saleId: discriminador de cartão (fonte única = CardReceivable).
            // paymentMethod: distingue FT de cartão legado (cartao_*) da FT de
            // crediário — só a de cartão é dedup do CardReceivable (D1).
            transaction: {
              select: { type: true, description: true, saleId: true, paymentMethod: true },
            },
          },
          orderBy: { dueDate: "asc" },
        });

        // Fonte única do dinheiro de cartão = CardReceivable (R4 fase 2). Parcelas
        // de vendas que TÊM CardReceivable são puladas aqui; o cartão entra pelos
        // CardReceivable (líquido, D+N/realizado). Sem isto o mesmo dinheiro
        // contaria 2× (parcela mensal + recebível).
        const cfSaleIds = [
          ...new Set(
            installments
              .map((i) => i.transaction.saleId)
              .filter((id): id is string => !!id),
          ),
        ];
        const cfCardSales =
          cfSaleIds.length > 0
            ? await tx.cardReceivable.findMany({
                // D1: só CardReceivable VIVO (PENDING/SETTLED) deduplica. Um
                // recebível CANCELLED (venda estornada) não representa dinheiro
                // e não pode fazer a parcela sumir da projeção.
                where: { saleId: { in: cfSaleIds }, status: { in: ["PENDING", "SETTLED"] } },
                select: { saleId: true },
                distinct: ["saleId"],
              })
            : [];
        const cfCardSaleIds = new Set(
          cfCardSales.map((c) => c.saleId).filter((id): id is string => !!id),
        );

        // CardReceivable no período: PENDING → projetado (expectedSettlementDate,
        // líquido); SETTLED → realizado (settledAt, líquido efetivo).
        const cfCardReceivables = await tx.cardReceivable.findMany({
          where: {
            OR: [
              { status: "PENDING", expectedSettlementDate: { gte: dateFrom, lte: dateTo } },
              { status: "SETTLED", settledAt: { gte: dateFrom, lte: dateTo } },
            ],
          },
          select: {
            status: true,
            expectedSettlementDate: true,
            settledAt: true,
            netAmount: true,
            settledNetAmount: true,
          },
        });

        // Group by period com separacao realized (paidAt) vs projected
        // (dueDate). Antes misturava no mesmo bucket via paidAt ?? dueDate
        // — operador nao conseguia distinguir o que ja entrou do que esta
        // pra entrar. Agora cada periodo tem 6 valores: realizedReceivable,
        // realizedPayable, projectedReceivable, projectedPayable + totals.
        const groupBy = input.groupBy ?? "day";
        type Bucket = {
          realizedReceivable: number;
          realizedPayable: number;
          projectedReceivable: number;
          projectedPayable: number;
          receivable: number;
          payable: number;
          balance: number;
        };
        const emptyBucket = (): Bucket => ({
          realizedReceivable: 0,
          realizedPayable: 0,
          projectedReceivable: 0,
          projectedPayable: 0,
          receivable: 0,
          payable: 0,
          balance: 0,
        });
        const grouped: Record<string, Bucket> = {};

        const formatKey = (date: Date): string => {
          if (groupBy === "day") return date.toISOString().split("T")[0]!;
          if (groupBy === "week") {
            const d = new Date(date);
            d.setDate(d.getDate() - d.getDay());
            return d.toISOString().split("T")[0]!;
          }
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        };

        for (const inst of installments) {
          // Cartão legado: o dinheiro entra pelo CardReceivable (fonte única).
          // Pula só a parcela de MÉTODO cartão de venda que TEM CardReceivable —
          // preserva o crediário de venda mista (crediário+cartão). (D1)
          if (
            inst.transaction.saleId &&
            isCardPaymentMethod(inst.transaction.paymentMethod) &&
            cfCardSaleIds.has(inst.transaction.saleId)
          ) {
            continue;
          }
          const isPaid = inst.status === "PAID" || inst.status === "PARTIALLY_PAID";
          // Cada parcela aparece em UM bucket — paidAt se realizada,
          // senao dueDate. paidAmount conta no realized; saldo pendente
          // (amount - paidAmount) conta no projected.
          const paidCents = decimalToCents(inst.paidAmount);
          const totalCents = decimalToCents(inst.amount);
          const remainingCents = Math.max(0, totalCents - paidCents);
          const isReceivable = inst.transaction.type === "RECEIVABLE";

          // Realizado (caiu no caixa) — chave por paidAt.
          if (isPaid && paidCents > 0 && inst.paidAt) {
            const keyR = formatKey(inst.paidAt);
            if (!grouped[keyR]) grouped[keyR] = emptyBucket();
            if (isReceivable) {
              grouped[keyR]!.realizedReceivable += paidCents;
              grouped[keyR]!.receivable += paidCents;
            } else {
              grouped[keyR]!.realizedPayable += paidCents;
              grouped[keyR]!.payable += paidCents;
            }
          }

          // Projetado (vai vencer) — chave por dueDate. Se ja totalmente
          // pago, remainingCents=0 e nao entra.
          if (remainingCents > 0) {
            const keyP = formatKey(inst.dueDate);
            if (!grouped[keyP]) grouped[keyP] = emptyBucket();
            if (isReceivable) {
              grouped[keyP]!.projectedReceivable += remainingCents;
              grouped[keyP]!.receivable += remainingCents;
            } else {
              grouped[keyP]!.projectedPayable += remainingCents;
              grouped[keyP]!.payable += remainingCents;
            }
          }
        }

        // Recebíveis de cartão (fonte única): entram como RECEIVABLE, líquido.
        for (const cr of cfCardReceivables) {
          if (cr.status === "SETTLED" && cr.settledAt) {
            const net = decimalToCents(cr.settledNetAmount ?? cr.netAmount);
            const keyR = formatKey(cr.settledAt);
            if (!grouped[keyR]) grouped[keyR] = emptyBucket();
            grouped[keyR]!.realizedReceivable += net;
            grouped[keyR]!.receivable += net;
          } else if (cr.status === "PENDING") {
            const net = decimalToCents(cr.netAmount);
            const keyP = formatKey(cr.expectedSettlementDate);
            if (!grouped[keyP]) grouped[keyP] = emptyBucket();
            grouped[keyP]!.projectedReceivable += net;
            grouped[keyP]!.receivable += net;
          }
        }

        // balance por bucket
        for (const b of Object.values(grouped)) {
          b.balance = b.receivable - b.payable;
        }

        // Sort by period key
        const periods = Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([period, data]) => ({ period, ...data }));

        // Summary totals
        const totalRealizedReceivable = periods.reduce((s, p) => s + p.realizedReceivable, 0);
        const totalRealizedPayable = periods.reduce((s, p) => s + p.realizedPayable, 0);
        const totalProjectedReceivable = periods.reduce((s, p) => s + p.projectedReceivable, 0);
        const totalProjectedPayable = periods.reduce((s, p) => s + p.projectedPayable, 0);
        const totalReceivable = totalRealizedReceivable + totalProjectedReceivable;
        const totalPayable = totalRealizedPayable + totalProjectedPayable;

        return {
          periods,
          summary: {
            totalReceivable,
            totalPayable,
            balance: totalReceivable - totalPayable,
            realized: {
              receivable: totalRealizedReceivable,
              payable: totalRealizedPayable,
              balance: totalRealizedReceivable - totalRealizedPayable,
            },
            projected: {
              receivable: totalProjectedReceivable,
              payable: totalProjectedPayable,
              balance: totalProjectedReceivable - totalProjectedPayable,
            },
          },
        };
      });
    }),

  /** List overdue installments */
  overdue: tenantProcedure
    .input(overdueSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;
        const now = new Date();

        const where: Record<string, unknown> = {
          status: { in: ["PENDING", "OVERDUE"] },
          dueDate: { lt: now },
          transaction: {
            deletedAt: null,
            ...(input.type ? { type: input.type } : {}),
          },
        };

        const [data, total] = await Promise.all([
          tx.installment.findMany({
            where,
            include: {
              transaction: {
                select: {
                  id: true,
                  type: true,
                  description: true,
                  customerName: true,
                  supplier: true,
                },
              },
            },
            orderBy: { dueDate: "asc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.installment.count({ where }),
        ]);

        // Marca como "OVERDUE" so na resposta (status virtual). A persistencia
        // do status fica para o cron `/api/cron/mark-overdue` (SQL direto, cross-tenant).
        // Antes este endpoint, embora `query`, fazia updateMany + loop de
        // recalculate — risco real de race condition e cache invalidation
        // silenciosa no front.
        return {
          data: data.map((inst) => ({
            id: inst.id,
            number: inst.number,
            amount: decimalToCents(inst.amount),
            paidAmount: decimalToCents(inst.paidAmount),
            dueDate: inst.dueDate,
            status: inst.status === "PENDING" ? "OVERDUE" : inst.status,
            transactionId: inst.transactionId,
            transactionType: inst.transaction.type,
            transactionDescription: inst.transaction.description,
            customerName: inst.transaction.customerName,
            supplier: inst.transaction.supplier,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** DRE - Demonstrativo de Resultados do Exercicio */
  dre: tenantProcedure
    .input(dreSchema)
    .query(async ({ ctx, input }) => {
      const year = input.year;
      // G-P1-05: ano e mês do DRE ancorados em BRT (UTC-3). As colunas de data
      // são `timestamp without time zone` (UTC wall-clock); sem converter, os
      // bounds `new Date(year,...)` usavam o fuso do processo (UTC no container)
      // e `EXTRACT(MONTH FROM sale_date)` extraía o mês em UTC — vendas/despesas
      // nas ~3h de borda de mês/ano caíam no bucket errado. A expressão
      // `(col AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')` reinterpreta
      // o instante UTC como horário de parede BRT antes do EXTRACT.

      const monthNames = [
        "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
      ];

      // DRE contabil correto (regime de competencia):
      // - Receita LIQUIDA = (subtotal - desconto) - taxa operadora absorvida.
      //   NAO usamos netRevenueAmount/totalAmount aqui: ambos sao LIQUIDOS do
      //   upgrade (trade-in), o que zera/inverte o lucro em vendas com aparelho
      //   de entrada (e fica negativo em downgrade, onde totalAmount=0). O
      //   trade-in vira ativo de estoque (DevicePurchase) — nao reduz receita.
      //   Ver lib/sales/sale-revenue.
      // - Custo das mercadorias: sum(saleItem.cost * qty) das vendas COMPLETED.
      // - Lucro bruto = receita liquida - custo das mercadorias
      // - Despesas operacionais: ledger installment_payments de PAYABLE (regime
      //   de caixa correto — uma linha por evento, líquido de estornos)
      // - Lucro liquido = lucro bruto - despesas
      // Uma unica transacao com 3 queries serializadas — antes 3 transacoes
      // paralelas (3 conexoes DB abertas). Reduz pressao no pool.
      const { revenueRows, expenseRows, partsCostRows } = await ctx.withTenant(async (tx) => {
        // Inclui vendas PARTIALLY_REFUNDED (antes eram excluídas inteiras, o que
        // subestimava a receita dos itens mantidos). Escala receita pela FRAÇÃO
        // MANTIDA = soma dos sale_items vivos / subtotal (estorno parcial zera o
        // total dos itens devolvidos). COMPLETED tem fração 1 (inalterado);
        // is_os_payment não tem itens (não pode ser parcialmente estornada) →
        // fração 1. Preserva a margem ao escalar receita e custo pela mesma fração.
        const rev = await tx.$queryRaw<Array<{ month: number; total: number | null }>>`
          SELECT EXTRACT(MONTH FROM (s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS month,
                 COALESCE(SUM(
                   (GREATEST(s.subtotal - s.discount_amount, 0) - s.operator_fee_amount)
                   * CASE
                       WHEN s.is_os_payment THEN 1
                       WHEN s.subtotal > 0 THEN LEAST(COALESCE(li.live_total, 0) / s.subtotal, 1)
                       ELSE 1
                     END
                 ), 0)::float AS total
          FROM sales s
          LEFT JOIN (
            -- G1 (auditoria financeira 2026-07-11): recorta o subquery pelo mesmo
            -- ano; antes agregava sale_items do tenant INTEIRO (todos os anos) a
            -- cada request do DRE. Correlaciona por sale_date via join com sales.
            SELECT si2.sale_id, SUM(si2.total) AS live_total
            FROM sale_items si2
            JOIN sales s2 ON s2.id = si2.sale_id
            WHERE s2.deleted_at IS NULL
              AND EXTRACT(YEAR FROM (s2.sale_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')) = ${year}
            GROUP BY si2.sale_id
          ) li ON li.sale_id = s.id
          WHERE s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
            AND s.deleted_at IS NULL
            AND EXTRACT(YEAR FROM (s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')) = ${year}
          GROUP BY 1
        `;
        // G-P1-01: despesas do DRE vêm do LEDGER installment_payments (regime de
        // caixa correto), não de installments.paid_amount por installment.paid_at.
        // Uma parcela paga em 2 meses tinha só o último paid_at → o valor todo
        // caía no último mês; uma PARTIALLY_PAID sumia do DRE até quitar. O ledger
        // tem uma linha por evento (data própria); estornos são negativos, então
        // SUM(amount_cents) já é o líquido que saiu no mês. Espelha stats.paidMonth.
        const exp = await tx.$queryRaw<Array<{ month: number; total: number | null }>>`
          SELECT EXTRACT(MONTH FROM (ip.paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS month,
                 COALESCE(SUM(ip.amount_cents), 0)::float / 100 AS total
          FROM installment_payments ip
          JOIN financial_transactions t ON t.id = ip.transaction_id
          WHERE t.type = 'PAYABLE'
            AND t.deleted_at IS NULL
            AND EXTRACT(YEAR FROM (ip.paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')) = ${year}
          GROUP BY 1
        `;
        // Custo das mercadorias escalado pela mesma fração mantida (margem
        // preservada): numa venda parcialmente estornada, conta só a parte do
        // custo proporcional ao que ficou. COMPLETED → fração 1 (inalterado).
        const parts = await tx.$queryRaw<Array<{ month: number; total: number | null }>>`
          SELECT EXTRACT(MONTH FROM (s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS month,
                 COALESCE(SUM(
                   si.cost_price * si.quantity
                   * CASE
                       WHEN s.subtotal > 0 THEN LEAST(COALESCE(li.live_total, 0) / s.subtotal, 1)
                       ELSE 1
                     END
                 ), 0)::float AS total
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          LEFT JOIN (
            -- G1: mesmo recorte por ano do subquery de receita.
            SELECT si2.sale_id, SUM(si2.total) AS live_total
            FROM sale_items si2
            JOIN sales s2 ON s2.id = si2.sale_id
            WHERE s2.deleted_at IS NULL
              AND EXTRACT(YEAR FROM (s2.sale_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')) = ${year}
            GROUP BY si2.sale_id
          ) li ON li.sale_id = s.id
          WHERE s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
            AND s.deleted_at IS NULL
            AND EXTRACT(YEAR FROM (s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')) = ${year}
          GROUP BY 1
        `;
        return { revenueRows: rev, expenseRows: exp, partsCostRows: parts };
      });

      const revenueByMonth = new Map(revenueRows.map((r) => [r.month, Number(r.total ?? 0)]));
      const expenseByMonth = new Map(expenseRows.map((r) => [r.month, Number(r.total ?? 0)]));
      const partsByMonth = new Map(partsCostRows.map((r) => [r.month, Number(r.total ?? 0)]));

      const months = Array.from({ length: 12 }, (_, m) => {
        const monthN = m + 1;
        const revenue = Math.round((revenueByMonth.get(monthN) ?? 0) * 100);
        const partsCost = Math.round((partsByMonth.get(monthN) ?? 0) * 100);
        const expenses = Math.round((expenseByMonth.get(monthN) ?? 0) * 100);
        const grossProfit = revenue - partsCost;
        const netProfit = grossProfit - expenses;
        return {
          month: monthN,
          monthName: monthNames[m]!,
          revenue,
          partsCost,
          grossProfit,
          expenses,
          netProfit,
        };
      });

      const totals = months.reduce(
        (acc, m) => ({
          revenue: acc.revenue + m.revenue,
          partsCost: acc.partsCost + m.partsCost,
          grossProfit: acc.grossProfit + m.grossProfit,
          expenses: acc.expenses + m.expenses,
          netProfit: acc.netProfit + m.netProfit,
        }),
        { revenue: 0, partsCost: 0, grossProfit: 0, expenses: 0, netProfit: 0 },
      );

      return { months, totals, year };
    }),

  /** Projected Cash Flow based on pending installments */
  projectedCashFlow: tenantProcedure
    .input(projectedCashFlowSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + input.days);
        endDate.setHours(23, 59, 59, 999);

        // Get all pending/overdue installments in range
        const installments = await tx.installment.findMany({
          where: {
            dueDate: { gte: today, lte: endDate },
            status: { in: ["PENDING", "OVERDUE"] },
            transaction: { deletedAt: null },
          },
          include: {
            // saleId: discriminador de cartão. paymentMethod: distingue FT de
            // cartão legado da FT de crediário (D1).
            transaction: { select: { type: true, saleId: true, paymentMethod: true } },
          },
          orderBy: { dueDate: "asc" },
        });

        // Recebíveis de cartão PENDING no período (líquido, D+N real).
        const cardReceivables = await tx.cardReceivable.findMany({
          where: {
            status: "PENDING",
            expectedSettlementDate: { gte: today, lte: endDate },
          },
          select: { expectedSettlementDate: true, netAmount: true },
        });

        // Fonte única do dinheiro de cartão = CardReceivable. As parcelas de
        // vendas que TÊM CardReceivable são puladas — senão o mesmo dinheiro
        // contaria 2× (parcela mensal + recebível D+N). Consulta só os saleIds
        // presentes nas parcelas do período (barato, índice tenantId+saleId).
        const saleIds = [
          ...new Set(
            installments
              .map((i) => i.transaction.saleId)
              .filter((id): id is string => !!id),
          ),
        ];
        const cardSales =
          saleIds.length > 0
            ? await tx.cardReceivable.findMany({
                // D1: só CardReceivable VIVO deduplica (cancelado = venda
                // estornada, não representa dinheiro).
                where: { saleId: { in: saleIds }, status: { in: ["PENDING", "SETTLED"] } },
                select: { saleId: true },
                distinct: ["saleId"],
              })
            : [];
        const cardSaleIds = new Set(
          cardSales.map((c) => c.saleId).filter((id): id is string => !!id),
        );

        const { buildProjectedCashFlow } = await import(
          "@/server/services/cash-flow-projection"
        );
        const { projection, summary } = buildProjectedCashFlow(
          installments.map((i) => ({
            dueDate: i.dueDate,
            remainingCents: decimalToCents(i.amount) - decimalToCents(i.paidAmount),
            type: i.transaction.type as "RECEIVABLE" | "PAYABLE",
            saleId: i.transaction.saleId,
            isCardMethod: isCardPaymentMethod(i.transaction.paymentMethod),
          })),
          cardReceivables.map((cr) => ({
            expectedSettlementDate: cr.expectedSettlementDate,
            netCents: decimalToCents(cr.netAmount),
          })),
          cardSaleIds,
        );

        return { projection, summary, days: input.days };
      });
    }),

  /**
   * Receivables: paid transactions (completed receivables).
   * Maps to Laravel's FinanceiroController@recebimentos.
   */
  receivables: tenantProcedure
    .input(listReceivablesSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;

        const where: Record<string, unknown> = {
          type: "RECEIVABLE",
          status: "PAID",
          deletedAt: null,
        };

        if (input.search) {
          where.OR = [
            { description: { contains: input.search, mode: "insensitive" } },
            { customerName: { contains: input.search, mode: "insensitive" } },
          ];
        }

        if (input.dateFrom || input.dateTo) {
          const paidAt: Record<string, Date> = {};
          if (input.dateFrom) paidAt.gte = new Date(input.dateFrom);
          if (input.dateTo) {
            const end = new Date(input.dateTo);
            end.setHours(23, 59, 59, 999);
            paidAt.lte = end;
          }
          where.paidAt = paidAt;
        }

        if (input.paymentMethod) {
          where.paymentMethod = input.paymentMethod;
        }

        const [data, total, totals] = await Promise.all([
          tx.financialTransaction.findMany({
            where,
            orderBy: { paidAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.financialTransaction.count({ where }),
          tx.financialTransaction.aggregate({
            where: {
              type: "RECEIVABLE",
              status: "PAID",
              deletedAt: null,
              ...(input.dateFrom || input.dateTo
                ? {
                    paidAt: {
                      ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
                      ...(input.dateTo ? { lte: (() => { const e = new Date(input.dateTo); e.setHours(23, 59, 59, 999); return e; })() } : {}),
                    },
                  }
                : {}),
            },
            _sum: { totalAmount: true, paidAmount: true },
            _count: true,
          }),
        ]);

        return {
          data: data.map(serializeTransaction),
          total,
          pageCount: Math.ceil(total / pageSize),
          totals: {
            totalReceived: decimalToCents(totals._sum.paidAmount),
            count: totals._count,
          },
        };
      });
    }),

  /**
   * Pending payments: receivables that have not been fully paid.
   * Maps to Laravel's FinanceiroController@pendentes.
   */
  pending: tenantProcedure
    .input(listPendingSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;

        const where: Record<string, unknown> = {
          type: "RECEIVABLE",
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
          deletedAt: null,
        };

        if (input.status) {
          where.status = input.status;
        }

        if (input.search) {
          where.OR = [
            { description: { contains: input.search, mode: "insensitive" } },
            { customerName: { contains: input.search, mode: "insensitive" } },
          ];
        }

        const [data, total, totals] = await Promise.all([
          tx.financialTransaction.findMany({
            where,
            include: { installments: { orderBy: { number: "asc" } } },
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.financialTransaction.count({ where }),
          tx.financialTransaction.aggregate({
            where: {
              type: "RECEIVABLE",
              status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
              deletedAt: null,
            },
            _sum: { totalAmount: true, paidAmount: true },
            _count: true,
          }),
        ]);

        const totalPending = decimalToCents(totals._sum.totalAmount) - decimalToCents(totals._sum.paidAmount);

        return {
          data: data.map(serializeTransaction),
          total,
          pageCount: Math.ceil(total / pageSize),
          totals: {
            totalPending,
            totalAmount: decimalToCents(totals._sum.totalAmount),
            totalPaid: decimalToCents(totals._sum.paidAmount),
            count: totals._count,
          },
        };
      });
    }),

  // ═══════════════════════════════════════
  // FINANCIAL CATEGORIES (F7)
  // ═══════════════════════════════════════

  listCategories: tenantProcedure
    .input(z.object({ type: z.enum(["RECEITA", "DESPESA"]).optional(), active: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: any = {};
        if (input?.type) where.type = input.type;
        if (input?.active !== undefined) where.active = input.active;
        return tx.financialCategory.findMany({ where, orderBy: { name: "asc" } });
      });
    }),

  createCategory: tenantProcedure
    .input(z.object({
      name: z.string().min(2).max(100),
      type: z.enum(["RECEITA", "DESPESA"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.withTenant(async (tx) => {
        const code = input.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        return tx.financialCategory.create({
          data: { tenantId: ctx.tenantId, name: input.name, code, type: input.type, kind: "CUSTOM" },
        });
      });
    }),

  toggleCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.withTenant(async (tx) => {
        const cat = await tx.financialCategory.findUnique({ where: { id: input.id } });
        if (!cat) throw new TRPCError({ code: "NOT_FOUND" });
        // Admin do tenant pode gerenciar inclusive categorias FIXED do sistema.
        return tx.financialCategory.update({ where: { id: input.id }, data: { active: input.active } });
      });
    }),

  /** Rename + opcionalmente alterar tipo de categoria. FIXED so dono pode. */
  updateCategory: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(2).max(100).optional(),
      type: z.enum(["RECEITA", "DESPESA"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.withTenant(async (tx) => {
        const cat = await tx.financialCategory.findUnique({ where: { id: input.id } });
        if (!cat) throw new TRPCError({ code: "NOT_FOUND" });
        const data: Record<string, unknown> = {};
        if (input.name) {
          data.name = input.name;
          // Re-gera code so para CUSTOM (FIXED tem code estavel para integracoes).
          if (cat.kind === "CUSTOM") {
            data.code = input.name.toLowerCase().normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, "");
          }
        }
        if (input.type) data.type = input.type;
        return tx.financialCategory.update({ where: { id: input.id }, data });
      });
    }),

  deleteCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.withTenant(async (tx) => {
        const cat = await tx.financialCategory.findUnique({ where: { id: input.id } });
        if (!cat) throw new TRPCError({ code: "NOT_FOUND" });
        if (cat.kind === "FIXED") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Categoria do sistema não pode ser excluída — apenas desativada" });
        }
        await tx.financialCategory.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  // getDashboardComparison removida (auditoria financeira 2026-07-11): era
  // procedure morta (0 callers) — a página /financial/dashboard que a consumiria
  // foi deletada por ser stub órfão (#509). Via Negativa.
});
