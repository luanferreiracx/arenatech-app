import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { createTRPCRouter, adminProcedure, publicProcedure } from "@/server/api/trpc";
import { rateLimitMiddleware } from "@/server/api/middleware/rate-limit";
import {
  createPlanSchema,
  updatePlanSchema,
  listPlansSchema,
  listTenantsSchema,
  updateTenantStatusSchema,
  updateTenantPlanSchema,
  createPreRegistrationSchema,
  listPreRegistrationsSchema,
  approvePreRegistrationSchema,
  rejectPreRegistrationSchema,
  adminReportSchema,
} from "@/lib/validators/admin";
import { randomBytes } from "crypto";
import { hashPassword } from "@/lib/password";

export const adminRouter = createTRPCRouter({
  // ── Dashboard ─────────────────────────────────────────────────────────────

  dashboard: adminProcedure.query(async ({ ctx }) => {
    return ctx.withAdmin(async (tx) => {
      const [
        totalTenants,
        activeTenants,
        suspendedTenants,
        cancelledTenants,
        pendingTenants,
        totalUsers,
        pendingPreRegistrations,
        plans,
      ] = await Promise.all([
        tx.tenant.count(),
        tx.tenant.count({ where: { status: "ACTIVE" } }),
        tx.tenant.count({ where: { status: "SUSPENDED" } }),
        tx.tenant.count({ where: { status: "CANCELLED" } }),
        tx.tenant.count({ where: { status: "PENDING" } }),
        tx.user.count(),
        tx.preRegistration.count({ where: { status: "PENDING" } }),
        tx.plan.findMany({ where: { status: "ACTIVE" } }),
      ]);

      // Estimated revenue: sum(plan.monthlyPrice * count of active tenants on that plan)
      const activeTenantsByPlan = await tx.tenant.groupBy({
        by: ["plan"],
        _count: { _all: true },
        where: { status: "ACTIVE", plan: { not: null } },
      });
      const planCountMap = new Map(
        activeTenantsByPlan.map((g) => [g.plan, g._count._all]),
      );

      const estimatedRevenue = plans.reduce(
        (sum, plan) => sum + Number(plan.monthlyPrice) * (planCountMap.get(plan.slug) ?? 0),
        0,
      );

      return {
        totalTenants,
        activeTenants,
        suspendedTenants,
        cancelledTenants,
        pendingTenants,
        totalUsers,
        pendingPreRegistrations,
        estimatedRevenue,
      };
    });
  }),

  // ── Tenants ───────────────────────────────────────────────────────────────

  listTenants: adminProcedure
    .input(listTenantsSchema)
    .query(async ({ ctx, input }) => {
      const { search, status, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withAdmin(async (tx) => {
        const where = {
          ...(status ? { status } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { slug: { contains: search, mode: "insensitive" as const } },
                  { cnpj: { contains: search } },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.tenant.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
            include: {
              _count: { select: { users: true } },
            },
          }),
          tx.tenant.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
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
              include: { user: { select: { id: true, name: true, cpf: true, email: true } } },
            },
          },
        });
        if (!tenant) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tenant não encontrado" });
        }
        return tenant;
      });
    }),

  updateTenantStatus: adminProcedure
    .input(updateTenantStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const tenant = await tx.tenant.findUnique({ where: { id: input.id } });
        if (!tenant) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tenant não encontrado" });
        }
        return tx.tenant.update({
          where: { id: input.id },
          data: { status: input.status },
        });
      });
    }),

  updateTenantPlan: adminProcedure
    .input(updateTenantPlanSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const tenant = await tx.tenant.findUnique({ where: { id: input.id } });
        if (!tenant) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tenant não encontrado" });
        }
        return tx.tenant.update({
          where: { id: input.id },
          data: { plan: input.plan },
        });
      });
    }),

  // ── Plans ─────────────────────────────────────────────────────────────────

  listPlans: adminProcedure
    .input(listPlansSchema)
    .query(async ({ ctx, input }) => {
      const { status, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withAdmin(async (tx) => {
        const where = {
          ...(status ? { status } : {}),
        };

        const [items, total] = await Promise.all([
          tx.plan.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { monthlyPrice: "asc" },
          }),
          tx.plan.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  createPlan: adminProcedure
    .input(createPlanSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        // Verify slug uniqueness
        const existing = await tx.plan.findUnique({ where: { slug: input.slug } });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Slug já existe" });
        }
        return tx.plan.create({
          data: {
            ...input,
            features: input.features as Prisma.InputJsonValue | undefined,
          },
        });
      });
    }),

  updatePlan: adminProcedure
    .input(updatePlanSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withAdmin(async (tx) => {
        const existing = await tx.plan.findUnique({ where: { id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado" });
        }
        // If slug changed, check uniqueness
        if (data.slug && data.slug !== existing.slug) {
          const slugExists = await tx.plan.findUnique({ where: { slug: data.slug } });
          if (slugExists) {
            throw new TRPCError({ code: "CONFLICT", message: "Slug já existe" });
          }
        }
        return tx.plan.update({
          where: { id },
          data: {
            ...data,
            features: data.features as Prisma.InputJsonValue | undefined,
          },
        });
      });
    }),

  deletePlan: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const existing = await tx.plan.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado" });
        }
        return tx.plan.update({
          where: { id: input.id },
          data: { status: "INACTIVE" },
        });
      });
    }),

  // ── Pre-Registrations ─────────────────────────────────────────────────────

  listPreRegistrations: adminProcedure
    .input(listPreRegistrationsSchema)
    .query(async ({ ctx, input }) => {
      const { status, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withAdmin(async (tx) => {
        const where = {
          ...(status ? { status } : {}),
        };

        const [items, total] = await Promise.all([
          tx.preRegistration.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
          }),
          tx.preRegistration.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getPreRegistration: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const reg = await tx.preRegistration.findUnique({ where: { id: input.id } });
        if (!reg) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pré-cadastro não encontrado" });
        }
        return reg;
      });
    }),

  approvePreRegistration: adminProcedure
    .input(approvePreRegistrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const reg = await tx.preRegistration.findUnique({ where: { id: input.id } });
        if (!reg) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pré-cadastro não encontrado" });
        }
        if (reg.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pré-cadastro já foi processado" });
        }

        // Create slug from trade name
        const slug = reg.tradeName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        // Check slug uniqueness and append suffix if needed
        let finalSlug = slug;
        let counter = 1;
        while (await tx.tenant.findUnique({ where: { slug: finalSlug } })) {
          finalSlug = `${slug}-${counter}`;
          counter++;
        }

        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: reg.tradeName,
            slug: finalSlug,
            cnpj: reg.cnpj,
            status: "ACTIVE",
            plan: reg.planId ?? null,
          },
        });

        // Normalize CPF
        const normalizedCpf = reg.ownerCpf.replace(/\D/g, "");

        // Check if user already exists
        let user = await tx.user.findUnique({ where: { cpf: normalizedCpf } });
        let tempPassword: string | undefined;

        if (!user) {
          // Generate cryptographically random temporary password
          tempPassword = randomBytes(12).toString("base64url");
          const passwordHash = hashPassword(tempPassword);

          user = await tx.user.create({
            data: {
              cpf: normalizedCpf,
              name: reg.ownerName,
              email: reg.ownerEmail,
              passwordHash,
              isSuperAdmin: false,
            },
          });
        }

        // Create user-tenant link
        await tx.userTenant.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            role: "admin",
          },
        });

        // Update pre-registration status
        await tx.preRegistration.update({
          where: { id: input.id },
          data: {
            status: "APPROVED",
            notes: input.notes,
            reviewedAt: new Date(),
            reviewedById: ctx.session.user.id,
          },
        });

        // Include tempPassword so admin can communicate it to the tenant owner
        return { tenant, user, ...(tempPassword ? { tempPassword } : {}) };
      });
    }),

  rejectPreRegistration: adminProcedure
    .input(rejectPreRegistrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const reg = await tx.preRegistration.findUnique({ where: { id: input.id } });
        if (!reg) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pré-cadastro não encontrado" });
        }
        if (reg.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pré-cadastro já foi processado" });
        }

        return tx.preRegistration.update({
          where: { id: input.id },
          data: {
            status: "REJECTED",
            notes: input.notes,
            reviewedAt: new Date(),
            reviewedById: ctx.session.user.id,
          },
        });
      });
    }),

  // ── Public Plans (for pre-registration form) ──────────────────────────────

  publicPlans: publicProcedure.query(async () => {
    // Import prisma directly for public access (no admin/tenant context)
    const { prisma } = await import("@/server/db");
    return prisma.plan.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, slug: true, description: true, monthlyPrice: true },
      orderBy: { monthlyPrice: "asc" },
    });
  }),

  // ── Public Pre-Registration ───────────────────────────────────────────────

  submitPreRegistration: publicProcedure
    .use(rateLimitMiddleware({ limit: 3, windowMs: 3_600_000 })) // 3 per IP per hour
    .input(createPreRegistrationSchema)
    .mutation(async ({ input }) => {
      const { prisma } = await import("@/server/db");
      return prisma.preRegistration.create({
        data: {
          ...input,
          status: "PENDING",
        },
      });
    }),

  // ── Reports ───────────────────────────────────────────────────────────────

  reports: adminProcedure
    .input(adminReportSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const dateFilter = {
          ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
          ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
        };
        const hasDateFilter = input.dateFrom || input.dateTo;

        // Get tenants with counts
        const tenants = await tx.tenant.findMany({
          where: { status: "ACTIVE" },
          include: {
            _count: { select: { users: true } },
          },
          orderBy: { name: "asc" },
        });

        // Get OS counts per tenant
        const serviceOrders = await tx.serviceOrder.groupBy({
          by: ["tenantId"],
          _count: { id: true },
          ...(hasDateFilter ? { where: { createdAt: dateFilter } } : {}),
        });

        // Get sales counts per tenant
        const sales = await tx.sale.groupBy({
          by: ["tenantId"],
          _count: { _all: true },
          _sum: { totalAmount: true },
          ...(hasDateFilter ? { where: { createdAt: dateFilter } } : {}),
        });

        const osMap = new Map(serviceOrders.map((o) => [o.tenantId, o._count.id]));
        const saleMap = new Map(
          sales.map((s) => [s.tenantId, { count: s._count._all, total: Number(s._sum?.totalAmount ?? 0) }]),
        );

        return tenants.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          plan: t.plan,
          usersCount: t._count.users,
          osCount: osMap.get(t.id) ?? 0,
          salesCount: saleMap.get(t.id)?.count ?? 0,
          salesTotal: saleMap.get(t.id)?.total ?? 0,
        }));
      });
    }),
});
