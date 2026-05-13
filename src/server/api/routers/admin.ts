import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, adminProcedure, publicProcedure } from "@/server/api/trpc";
import { prisma } from "@/server/db";
import {
  createPlanSchema,
  updatePlanSchema,
  listPlansSchema,
  submitPreRegistrationSchema,
  approvePreRegistrationSchema,
  rejectPreRegistrationSchema,
  listPreRegistrationsSchema,
  listTenantsSchema,
  updateTenantSchema,
} from "@/lib/validators/admin";
import { hashPassword } from "@/lib/password";
import { logger } from "@/lib/logger";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function generateTempPassword(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Arena@${num}`;
}

export const adminRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════

  dashboard: adminProcedure.query(async ({ ctx }) => {
    return ctx.withAdmin(async (tx) => {
      const [tenantCount, userCount, pendingPreRegs, activePlans] = await Promise.all([
        tx.tenant.count(),
        tx.user.count(),
        tx.preRegistration.count({ where: { status: "PENDING" } }),
        tx.plan.count({ where: { status: "ACTIVE" } }),
      ]);

      return { tenantCount, userCount, pendingPreRegs, activePlans };
    });
  }),

  // ═══════════════════════════════════════
  // TENANTS
  // ═══════════════════════════════════════

  listTenants: adminProcedure
    .input(listTenantsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;

        const where: Prisma.TenantWhereInput = {};
        if (input.status) where.status = input.status;
        if (input.search) {
          where.OR = [
            { name: { contains: input.search, mode: "insensitive" } },
            { slug: { contains: input.search, mode: "insensitive" } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.tenant.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.tenant.count({ where }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  getTenant: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: input.id },
          include: {
            users: {
              include: { user: { select: { id: true, name: true, cpf: true } } },
            },
          },
        });
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });
        return tenant;
      });
    }),

  updateTenant: adminProcedure
    .input(updateTenantSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        await tx.tenant.update({
          where: { id: input.id },
          data: {
            name: input.name,
            status: input.status,
            plan: input.plan,
          },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // PLANS
  // ═══════════════════════════════════════

  listPlans: adminProcedure
    .input(listPlansSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const where: Prisma.PlanWhereInput = {};
        if (input.status) where.status = input.status;

        const plans = await tx.plan.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });

        return plans.map((p) => ({
          ...p,
          monthlyPrice: decimalToCents(p.monthlyPrice),
          yearlyPrice: p.yearlyPrice ? decimalToCents(p.yearlyPrice) : null,
        }));
      });
    }),

  createPlan: adminProcedure
    .input(createPlanSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const plan = await tx.plan.create({
          data: {
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            monthlyPrice: centsToPrisma(input.monthlyPrice),
            yearlyPrice: input.yearlyPrice ? centsToPrisma(input.yearlyPrice) : null,
            maxUsers: input.maxUsers,
            maxImeiQueries: input.maxImeiQueries,
            features: (input.features as Prisma.InputJsonValue) ?? Prisma.DbNull,
          },
        });
        return { id: plan.id };
      });
    }),

  updatePlan: adminProcedure
    .input(updatePlanSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        await tx.plan.update({
          where: { id: input.id },
          data: {
            name: input.name,
            description: input.description ?? null,
            monthlyPrice: centsToPrisma(input.monthlyPrice),
            yearlyPrice: input.yearlyPrice ? centsToPrisma(input.yearlyPrice) : null,
            maxUsers: input.maxUsers,
            maxImeiQueries: input.maxImeiQueries,
            features: (input.features as Prisma.InputJsonValue) ?? Prisma.DbNull,
            status: input.status,
          },
        });
        return { success: true };
      });
    }),

  deletePlan: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        await tx.plan.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // PRE-REGISTRATIONS
  // ═══════════════════════════════════════

  listPreRegistrations: adminProcedure
    .input(listPreRegistrationsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;

        const where: Prisma.PreRegistrationWhereInput = {};
        if (input.status) where.status = input.status;
        if (input.search) {
          where.OR = [
            { tradeName: { contains: input.search, mode: "insensitive" } },
            { ownerName: { contains: input.search, mode: "insensitive" } },
            { ownerCpf: { contains: input.search, mode: "insensitive" } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.preRegistration.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.preRegistration.count({ where }),
        ]);

        return { data, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getPreRegistration: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const pr = await tx.preRegistration.findUnique({ where: { id: input.id } });
        if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
        return pr;
      });
    }),

  approvePreRegistration: adminProcedure
    .input(approvePreRegistrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const pr = await tx.preRegistration.findUnique({ where: { id: input.id } });
        if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
        if (pr.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pre-cadastro ja processado" });
        }

        const slug = generateSlug(pr.tradeName);
        const tempPassword = generateTempPassword();

        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: pr.tradeName,
            slug: `${slug}-${Date.now().toString(36)}`,
            plan: input.planId ?? null,
            status: "ACTIVE",
          },
        });

        // Create user
        const user = await tx.user.create({
          data: {
            name: pr.ownerName,
            cpf: pr.ownerCpf.replace(/\D/g, ""),
            passwordHash: hashPassword(tempPassword),
          },
        });

        // Link user to tenant
        await tx.userTenant.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            role: "admin",
          },
        });

        // Update pre-registration
        await tx.preRegistration.update({
          where: { id: input.id },
          data: {
            status: "APPROVED",
            reviewedAt: new Date(),
            reviewedById: ctx.session.user.id,
          },
        });

        logger.info("Pre-registration approved", {
          preRegId: input.id,
          tenantId: tenant.id,
          userId: user.id,
        });

        return { tenantId: tenant.id, userId: user.id, tempPassword };
      });
    }),

  rejectPreRegistration: adminProcedure
    .input(rejectPreRegistrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const pr = await tx.preRegistration.findUnique({ where: { id: input.id } });
        if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
        if (pr.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pre-cadastro ja processado" });
        }

        await tx.preRegistration.update({
          where: { id: input.id },
          data: {
            status: "REJECTED",
            notes: input.reason,
            reviewedAt: new Date(),
            reviewedById: ctx.session.user.id,
          },
        });

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════

  reports: adminProcedure.query(async ({ ctx }) => {
    return ctx.withAdmin(async (tx) => {
      const tenants = await tx.tenant.findMany({
        include: {
          users: { select: { userId: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        plan: t.plan,
        userCount: t.users.length,
        createdAt: t.createdAt,
      }));
    });
  }),

  // ═══════════════════════════════════════
  // PUBLIC (no auth)
  // ═══════════════════════════════════════

  publicPlans: publicProcedure.query(async () => {
    const plans = await prisma.plan.findMany({
      where: { status: "ACTIVE" },
      orderBy: { monthlyPrice: "asc" },
    });

    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      monthlyPrice: decimalToCents(p.monthlyPrice),
      yearlyPrice: p.yearlyPrice ? decimalToCents(p.yearlyPrice) : null,
      maxUsers: p.maxUsers,
      features: p.features,
    }));
  }),

  submitPreRegistration: publicProcedure
    .input(submitPreRegistrationSchema)
    .mutation(async ({ input }) => {
      const pr = await prisma.preRegistration.create({
        data: {
          tradeName: input.tradeName,
          legalName: input.legalName ?? null,
          cnpj: input.cnpj ?? null,
          ownerName: input.ownerName,
          ownerCpf: input.ownerCpf.replace(/\D/g, ""),
          ownerEmail: input.ownerEmail,
          ownerPhone: input.ownerPhone,
          planId: input.planId ?? null,
          notes: input.notes ?? null,
        },
      });
      logger.info("Pre-registration submitted", { id: pr.id });
      return { id: pr.id };
    }),
});
