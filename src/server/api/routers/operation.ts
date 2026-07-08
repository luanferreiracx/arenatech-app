import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { isTenantAdmin } from "@/lib/auth/roles";
import {
  createDeliveryPersonSchema,
  updateDeliveryPersonSchema,
  createExternalLabSchema,
  updateExternalLabSchema,
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  createServiceProviderSchema,
  updateServiceProviderSchema,
  listDeliveryPersonsSchema,
  listExternalLabsSchema,
  listLabOrdersSchema,
  listServiceProvidersSchema,
} from "@/lib/validators/operation";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const operationRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // DELIVERY PERSONS
  // ═══════════════════════════════════════

  listDeliveryPersons: tenantProcedure
    .input(listDeliveryPersonsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.DeliveryPersonWhereInput = { deletedAt: null };
        if (input.active !== undefined) where.active = input.active;
        if (input.search) {
          where.name = { contains: input.search, mode: "insensitive" };
        }
        return tx.deliveryPerson.findMany({ where, orderBy: { name: "asc" } });
      });
    }),

  createDeliveryPerson: tenantProcedure
    .input(createDeliveryPersonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const person = await tx.deliveryPerson.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            phone: input.phone ?? null,
            email: input.email ?? null,
            notes: input.notes ?? null,
          },
        });
        return { id: person.id };
      });
    }),

  updateDeliveryPerson: tenantProcedure
    .input(updateDeliveryPersonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deliveryPerson.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entregador nao encontrado" });
        }
        await tx.deliveryPerson.update({
          where: { id: input.id },
          data: {
            name: input.name,
            phone: input.phone ?? null,
            email: input.email ?? null,
            active: input.active,
            notes: input.notes ?? null,
          },
        });
        return { success: true };
      });
    }),

  deleteDeliveryPerson: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.deliveryPerson.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // EXTERNAL LABS
  // ═══════════════════════════════════════

  listExternalLabs: tenantProcedure
    .input(listExternalLabsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ExternalLabWhereInput = { deletedAt: null };
        if (input.active !== undefined) where.active = input.active;
        if (input.search) {
          where.name = { contains: input.search, mode: "insensitive" };
        }
        return tx.externalLab.findMany({ where, orderBy: { name: "asc" } });
      });
    }),

  createExternalLab: tenantProcedure
    .input(createExternalLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const lab = await tx.externalLab.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            contact: input.contact ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: input.address ?? Prisma.DbNull,
            notes: input.notes ?? null,
          },
        });
        return { id: lab.id };
      });
    }),

  updateExternalLab: tenantProcedure
    .input(updateExternalLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.externalLab.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Laboratorio nao encontrado" });
        }
        await tx.externalLab.update({
          where: { id: input.id },
          data: {
            name: input.name,
            contact: input.contact ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: input.address ?? Prisma.DbNull,
            active: input.active,
            notes: input.notes ?? null,
          },
        });
        return { success: true };
      });
    }),

  deleteExternalLab: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.externalLab.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // LAB ORDERS
  // ═══════════════════════════════════════

  listLabOrders: tenantProcedure
    .input(listLabOrdersSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.LabOrderWhereInput = {};
        if (input.status) where.status = input.status;
        if (input.labId) where.labId = input.labId;

        const [data, total] = await Promise.all([
          tx.labOrder.findMany({
            where,
            include: { lab: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.labOrder.count({ where }),
        ]);

        return {
          data: data.map((lo) => ({
            ...lo,
            estimatedCost: lo.estimatedCost ? decimalToCents(lo.estimatedCost) : null,
            finalCost: lo.finalCost ? decimalToCents(lo.finalCost) : null,
            labName: lo.lab.name,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  createLabOrder: tenantProcedure
    .input(createLabOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const lab = await tx.externalLab.findUnique({ where: { id: input.labId } });
        if (!lab) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Laboratorio nao encontrado" });
        }

        const order = await tx.labOrder.create({
          data: {
            tenantId: ctx.tenantId,
            labId: input.labId,
            serviceOrderId: input.serviceOrderId ?? null,
            deliveryPersonId: input.deliveryPersonId ?? null,
            deviceDescription: input.deviceDescription ?? null,
            problem: input.problem ?? null,
            estimatedCost: input.estimatedCost != null ? centsToPrisma(input.estimatedCost) : null,
            notes: input.notes ?? null,
            status: "SENT",
            sentAt: new Date(),
          },
        });
        return { id: order.id };
      });
    }),

  updateLabOrderStatus: tenantProcedure
    .input(updateLabOrderStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.labOrder.findUnique({
          where: { id: input.id },
          include: { lab: { select: { name: true } } },
        });
        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Envio nao encontrado" });
        }

        const data: Record<string, unknown> = {
          status: input.status,
          notes: input.notes ?? order.notes,
        };

        // Set timestamps based on status
        if (input.status === "RECEIVED") data.receivedAt = new Date();
        if (input.status === "COMPLETED") data.completedAt = new Date();
        if (input.status === "RETURNED") data.returnedAt = new Date();
        if (input.finalCost != null) data.finalCost = centsToPrisma(input.finalCost);

        // Gerar PAYABLE quando lab devolve com finalCost > 0 e ainda não há PAYABLE
        const shouldGeneratePayable =
          (input.status === "RETURNED" || input.status === "COMPLETED") &&
          input.finalCost != null &&
          input.finalCost > 0 &&
          !order.payableTransactionId;

        if (shouldGeneratePayable) {
          const labName = order.lab?.name ?? "Laboratório externo";
          const description = `Servico lab ${labName}${order.serviceOrderId ? ` — OS ${order.serviceOrderId.slice(0, 8)}` : ""}`;
          const ft = await tx.financialTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              type: "PAYABLE",
              status: "PENDING",
              description,
              supplier: labName,
              totalAmount: centsToPrisma(input.finalCost!),
              paidAmount: 0,
              installmentsTotal: 1,
              dueDate: new Date(),
              emissionDate: new Date(),
              referenceType: "lab_order",
              referenceId: order.id,
              createdByUserId: ctx.session.user.id,
            },
          });
          await tx.installment.create({
            data: {
              tenantId: ctx.tenantId,
              transactionId: ft.id,
              number: 1,
              amount: centsToPrisma(input.finalCost!),
              dueDate: new Date(),
              status: "PENDING",
            },
          });
          data.payableTransactionId = ft.id;
        }

        await tx.labOrder.update({ where: { id: input.id }, data });

        // Quando lab termina, marcar a OS relacionada (se houver) com labReceived=true
        if (input.status === "RETURNED" && order.serviceOrderId) {
          await tx.serviceOrder.updateMany({
            where: { id: order.serviceOrderId },
            data: { labReceived: true },
          });
        }

        return { success: true, payableGenerated: shouldGeneratePayable };
      });
    }),

  // ═══════════════════════════════════════
  // SERVICE PROVIDERS
  // ═══════════════════════════════════════

  listServiceProviders: tenantProcedure
    .input(listServiceProvidersSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceProviderWhereInput = { deletedAt: null };
        if (input.active !== undefined) where.active = input.active;
        if (input.type) where.type = input.type;
        if (input.search) {
          where.name = { contains: input.search, mode: "insensitive" };
        }

        const providers = await tx.serviceProvider.findMany({
          where,
          orderBy: { name: "asc" },
        });

        return providers.map((p) => ({
          ...p,
          commissionRate: p.commissionRate ? Number(p.commissionRate) : null,
        }));
      });
    }),

  createServiceProvider: tenantProcedure
    .input(createServiceProviderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const provider = await tx.serviceProvider.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            type: input.type,
            cpfCnpj: input.cpfCnpj ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            commissionRate: input.commissionRate != null ? new Prisma.Decimal(input.commissionRate) : null,
            contractDetails: (input.contractDetails as Prisma.InputJsonValue) ?? Prisma.DbNull,
            isTechnician: input.isTechnician ?? false,
            notes: input.notes ?? null,
          },
        });
        return { id: provider.id };
      });
    }),

  updateServiceProvider: tenantProcedure
    .input(updateServiceProviderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.serviceProvider.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Prestador nao encontrado" });
        }
        await tx.serviceProvider.update({
          where: { id: input.id },
          data: {
            name: input.name,
            type: input.type,
            cpfCnpj: input.cpfCnpj ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            commissionRate: input.commissionRate != null ? new Prisma.Decimal(input.commissionRate) : null,
            contractDetails: (input.contractDetails as Prisma.InputJsonValue) ?? Prisma.DbNull,
            active: input.active,
            isTechnician: input.isTechnician ?? false,
            notes: input.notes ?? null,
          },
        });
        return { success: true };
      });
    }),

  deleteServiceProvider: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceProvider.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // EXPENSES (despesas operacionais)
  // ═══════════════════════════════════════

  listExpenses: tenantProcedure
    .input(z.object({
      status: z.enum(["PENDING_APPROVAL", "APPROVED", "PAID", "REJECTED", "CANCELLED"]).optional(),
      category: z.enum([
        "TRAVEL", "MEALS", "SUPPLIES", "MAINTENANCE", "UTILITIES",
        "RENT", "SOFTWARE", "MARKETING", "TAXES", "OTHER",
      ]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ExpenseWhereInput = { deletedAt: null };
        if (input.status) where.status = input.status;
        if (input.category) where.category = input.category;
        if (input.from || input.to) {
          where.createdAt = {};
          if (input.from) where.createdAt.gte = new Date(input.from);
          if (input.to) where.createdAt.lte = new Date(input.to);
        }
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;
        const [data, total] = await Promise.all([
          tx.expense.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.expense.count({ where }),
        ]);
        return {
          data: data.map((e) => ({ ...e, amount: Number(e.amount) })),
          total,
          page,
          pageSize,
        };
      });
    }),

  createExpense: tenantProcedure
    .input(z.object({
      category: z.enum([
        "TRAVEL", "MEALS", "SUPPLIES", "MAINTENANCE", "UTILITIES",
        "RENT", "SOFTWARE", "MARKETING", "TAXES", "OTHER",
      ]),
      description: z.string().min(3).max(300),
      amount: z.number().int().min(1), // centavos
      dueDate: z.string().optional(),
      attachmentUrl: z.string().url().nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
      // Owner/manager pode aprovar direto na criacao
      autoApprove: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canAutoApprove = Boolean(input.autoApprove) && isTenantAdmin(ctx.session, ctx.tenantId);
      return ctx.withTenant(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            tenantId: ctx.tenantId,
            createdByUserId: ctx.session.user.id,
            category: input.category,
            description: input.description,
            amount: centsToPrisma(input.amount),
            status: canAutoApprove ? "APPROVED" : "PENDING_APPROVAL",
            approvedByUserId: canAutoApprove ? ctx.session.user.id : null,
            approvedAt: canAutoApprove ? new Date() : null,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            attachmentUrl: input.attachmentUrl ?? null,
            notes: input.notes ?? null,
          },
        });
        return { id: expense.id, status: expense.status };
      });
    }),

  approveExpense: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      generatePayable: z.boolean().optional(),
      payableDueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerentes e proprietários podem aprovar despesas" });
      }
      return ctx.withTenant(async (tx) => {
        const expense = await tx.expense.findUnique({ where: { id: input.id } });
        if (!expense) throw new TRPCError({ code: "NOT_FOUND" });
        if (expense.status !== "PENDING_APPROVAL") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Despesa nao esta pendente (status: ${expense.status})` });
        }

        // OP-1 (CAS): claim atômico PENDING_APPROVAL→APPROVED ANTES de gerar o
        // payable. Sem isto, duplo-clique/concorrência aprovava a MESMA despesa 2x
        // e criava DOIS PAYABLE (obrigação de pagamento em dobro).
        const claimed = await tx.expense.updateMany({
          where: { id: input.id, status: "PENDING_APPROVAL" },
          data: {
            status: "APPROVED",
            approvedByUserId: ctx.session.user.id,
            approvedAt: new Date(),
          },
        });
        if (claimed.count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "Despesa já foi processada por outra operação." });
        }

        let payableId: string | null = null;
        if (input.generatePayable) {
          const dueDate = input.payableDueDate ? new Date(input.payableDueDate) : (expense.dueDate ?? new Date());
          const ft = await tx.financialTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              type: "PAYABLE",
              status: "PENDING",
              description: `Despesa: ${expense.description}`,
              totalAmount: expense.amount,
              paidAmount: 0,
              installmentsTotal: 1,
              dueDate,
              emissionDate: new Date(),
              referenceType: "expense",
              referenceId: expense.id,
              createdByUserId: ctx.session.user.id,
            },
          });
          await tx.installment.create({
            data: {
              tenantId: ctx.tenantId,
              transactionId: ft.id,
              number: 1,
              amount: expense.amount,
              dueDate,
              status: "PENDING",
            },
          });
          payableId = ft.id;
        }

        // status/approvedBy/approvedAt já foram setados atomicamente no claim;
        // aqui só linka o payable gerado (se houver).
        if (payableId) {
          await tx.expense.update({
            where: { id: input.id },
            data: { payableTransactionId: payableId },
          });
        }

        return { success: true, payableTransactionId: payableId };
      });
    }),

  rejectExpense: tenantProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.withTenant(async (tx) => {
        const expense = await tx.expense.findUnique({ where: { id: input.id } });
        if (!expense) throw new TRPCError({ code: "NOT_FOUND" });
        if (expense.status !== "PENDING_APPROVAL") {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
        await tx.expense.update({
          where: { id: input.id },
          data: {
            status: "REJECTED",
            approvedByUserId: ctx.session.user.id,
            approvedAt: new Date(),
            rejectedReason: input.reason,
          },
        });
        return { success: true };
      });
    }),

  deleteExpense: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.withTenant(async (tx) => {
        await tx.expense.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  expenseStats: tenantProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const groups = await tx.expense.groupBy({
          by: ["category", "status"],
          where: {
            deletedAt: null,
            createdAt: { gte: new Date(input.from), lte: new Date(input.to) },
          },
          _sum: { amount: true },
          _count: true,
        });
        return groups.map((g) => ({
          category: g.category,
          status: g.status,
          totalCents: Math.round(Number(g._sum.amount ?? 0) * 100),
          count: g._count,
        }));
      });
    }),
});
