import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, adminProcedure, publicProcedure } from "@/server/api/trpc";
import { prisma } from "@/server/db";
import { tenantFinancialInit } from "@/server/services/tenant-financial-init.service";
import { provisionDepixWallet } from "@/server/services/depix-wallet-provision.service";
import { rateLimitMiddleware } from "@/server/api/middleware/rate-limit";
import { modulesFromPlanFeatures } from "@/lib/modules";

/**
 * Funde a lista de módulos (gating) dentro do JSON `features` do plano,
 * preservando quaisquer outras chaves já existentes. Quando `modules` é
 * undefined, mantém `features` como veio (sem mexer no gating).
 */
function mergeModulesIntoFeatures(
  features: Record<string, unknown> | null | undefined,
  modules: readonly string[] | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (modules === undefined) {
    return (features as Prisma.InputJsonValue) ?? Prisma.DbNull;
  }
  return { ...(features ?? {}), modules: [...modules] } as Prisma.InputJsonValue;
}
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
import {
  createTenantSchema,
  listWhatsappLogsSchema,
} from "@/lib/validators/subscription";
import {
  createAddonSchema,
  updateAddonSchema,
  listAddonsSchema,
  assignAddonSchema,
  listRefundsSchema,
  processRefundSchema,
  cancelRefundSchema,
  REFUND_STATUS_LABELS,
} from "@/lib/validators/addon";
import { hashPassword } from "@/lib/password";
import { logger } from "@/lib/logger";
import { randomBytes } from "node:crypto";

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
  // 12 bytes -> 16 chars base64url (~96 bits). O prefixo "Arena@" mantem
  // legibilidade para o usuario na hora de comunicar a senha temporaria,
  // mas a entropia toda vem do sufixo aleatorio gerado por CSPRNG.
  const suffix = randomBytes(12).toString("base64url");
  return `Arena@${suffix}`;
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
          // Módulos liberados (resolvidos do features.modules, com fallback padrão).
          modules: modulesFromPlanFeatures(p.features),
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
            features: mergeModulesIntoFeatures(input.features, input.modules),
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
            features: mergeModulesIntoFeatures(input.features, input.modules),
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
      const approved = await ctx.withAdmin(async (tx) => {
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

        // Seed FIXED financial categories (ADR 0034) + fee config DePix
        await tenantFinancialInit(tx as any, tenant.id);

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

      // Provisiona carteira DePix FORA da tx (chamada HTTP ao LWK).
      await provisionDepixWallet(approved.tenantId).catch((err) =>
        logger.error("Falha ao provisionar carteira DePix (approvePreRegistration)", {
          tenantId: approved.tenantId,
          err: String(err),
        }),
      );

      return approved;
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
  // CREATE TENANT (manual)
  // ═══════════════════════════════════════

  createTenant: adminProcedure
    .input(createTenantSchema)
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.withAdmin(async (tx) => {
        const slug = generateSlug(input.name);
        const tempPassword = generateTempPassword();

        const tenant = await tx.tenant.create({
          data: {
            name: input.name,
            slug: `${slug}-${Date.now().toString(36)}`,
            cnpj: input.cnpj ?? null,
            plan: input.planId ?? null,
            status: input.trialDays && input.trialDays > 0 ? "PENDING" : "ACTIVE",
          },
        });

        const existingUser = await tx.user.findUnique({
          where: { cpf: input.ownerCpf.replace(/\D/g, "") },
        });

        let userId: string;
        if (existingUser) {
          userId = existingUser.id;
        } else {
          const user = await tx.user.create({
            data: {
              name: input.ownerName,
              cpf: input.ownerCpf.replace(/\D/g, ""),
              email: input.email,
              passwordHash: hashPassword(tempPassword),
            },
          });
          userId = user.id;
        }

        await tx.userTenant.create({
          data: {
            userId,
            tenantId: tenant.id,
            role: "admin",
          },
        });

        // Seed financeiro + fee config DePix (idempotente, local).
        await tenantFinancialInit(tx as any, tenant.id);

        logger.info("Tenant created manually", {
          tenantId: tenant.id,
          userId,
          byAdmin: ctx.session.user.id,
        });

        return { tenantId: tenant.id, userId, tempPassword: existingUser ? null : tempPassword };
      });

      // Provisiona carteira DePix FORA da tx (chamada HTTP ao LWK). Falha
      // nao reverte o tenant — carteira recuperavel via depixWallet.provision.
      await provisionDepixWallet(created.tenantId).catch((err) =>
        logger.error("Falha ao provisionar carteira DePix (createTenant)", {
          tenantId: created.tenantId,
          err: String(err),
        }),
      );

      return created;
    }),

  deleteTenant: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        await tx.tenant.update({
          where: { id: input.id },
          data: { status: "CANCELLED" },
        });
        logger.info("Tenant deleted (soft)", { tenantId: input.id, byAdmin: ctx.session.user.id });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // WHATSAPP LOGS (cross-tenant)
  // ═══════════════════════════════════════

  listWhatsappLogs: adminProcedure
    .input(listWhatsappLogsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 50;

        const where: Prisma.MessageWhereInput = {
          channel: "WHATSAPP",
        };
        if (input.phone) where.recipientPhone = { contains: input.phone };
        if (input.status) {
          const statusMap: Record<string, string> = { SENT: "SENT", FAILED: "FAILED", OUTSIDE_WINDOW: "FAILED" };
          where.status = statusMap[input.status] as Prisma.EnumMessageStatusFilter;
        }
        if (input.dateFrom || input.dateTo) {
          where.createdAt = {};
          if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
          if (input.dateTo) where.createdAt.lte = new Date(input.dateTo + "T23:59:59");
        }

        const [data, total] = await Promise.all([
          tx.message.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.message.count({ where }),
        ]);

        // Stats (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const statsWhere: Prisma.MessageWhereInput = {
          channel: "WHATSAPP",
          createdAt: { gte: thirtyDaysAgo },
        };
        const [totalLogs, sentLogs, failedLogs] = await Promise.all([
          tx.message.count({ where: statsWhere }),
          tx.message.count({ where: { ...statsWhere, status: "SENT" } }),
          tx.message.count({ where: { ...statsWhere, status: "FAILED" } }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
          stats: { total: totalLogs, sent: sentLogs, failed: failedLogs },
        };
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
  // ADDONS
  // ═══════════════════════════════════════

  listAddons: adminProcedure
    .input(listAddonsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const where: Prisma.AddonWhereInput = {};
        if (input.activeOnly) where.active = true;

        const addons = await tx.addon.findMany({
          where,
          orderBy: { sortOrder: "asc" },
          include: { _count: { select: { purchases: true } } },
        });

        return addons.map((a) => ({
          ...a,
          price: decimalToCents(a.price),
          purchaseCount: a._count.purchases,
        }));
      });
    }),

  getAddon: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const addon = await tx.addon.findUnique({
          where: { id: input.id },
          include: {
            purchases: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
            _count: { select: { purchases: true } },
          },
        });
        if (!addon) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...addon,
          price: decimalToCents(addon.price),
          purchaseCount: addon._count.purchases,
          purchases: addon.purchases.map((p) => ({
            ...p,
            pricePaid: decimalToCents(p.pricePaid),
          })),
        };
      });
    }),

  createAddon: adminProcedure
    .input(createAddonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const baseSlug = generateSlug(input.name);
        let slug = baseSlug;
        let counter = 1;
        while (await tx.addon.findUnique({ where: { slug } })) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }

        const addon = await tx.addon.create({
          data: {
            name: input.name,
            slug,
            description: input.description ?? null,
            queryCount: input.queryCount,
            price: centsToPrisma(input.price),
            validityDays: input.validityDays,
            sortOrder: input.sortOrder ?? 0,
            featured: input.featured ?? false,
            active: input.active ?? true,
          },
        });

        logger.info("Addon created", { id: addon.id, name: addon.name });
        return { id: addon.id };
      });
    }),

  updateAddon: adminProcedure
    .input(updateAddonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const data: Record<string, unknown> = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.description !== undefined) data.description = input.description;
        if (input.queryCount !== undefined) data.queryCount = input.queryCount;
        if (input.price !== undefined) data.price = centsToPrisma(input.price);
        if (input.validityDays !== undefined) data.validityDays = input.validityDays;
        if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
        if (input.featured !== undefined) data.featured = input.featured;
        if (input.active !== undefined) data.active = input.active;

        await tx.addon.update({ where: { id: input.id }, data });
        return { success: true };
      });
    }),

  toggleAddon: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const addon = await tx.addon.findUnique({ where: { id: input.id } });
        if (!addon) throw new TRPCError({ code: "NOT_FOUND" });
        await tx.addon.update({
          where: { id: input.id },
          data: { active: !addon.active },
        });
        return { active: !addon.active };
      });
    }),

  deleteAddon: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const hasPurchases = await tx.addonPurchase.count({ where: { addonId: input.id } });
        if (hasPurchases > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel excluir addon que ja foi vendido. Desative-o.",
          });
        }
        await tx.addon.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  assignAddon: adminProcedure
    .input(assignAddonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const addon = await tx.addon.findUnique({ where: { id: input.addonId } });
        if (!addon) throw new TRPCError({ code: "NOT_FOUND", message: "Addon nao encontrado" });

        const pricePaid = input.pricePaid !== undefined
          ? centsToPrisma(input.pricePaid)
          : addon.price;

        const now = new Date();
        const expiration = new Date(now);
        expiration.setDate(expiration.getDate() + addon.validityDays);

        const purchase = await tx.addonPurchase.create({
          data: {
            tenantId: input.tenantId,
            addonId: addon.id,
            quantityPurchased: addon.queryCount,
            quantityRemaining: addon.queryCount,
            pricePaid,
            purchaseDate: now,
            expirationDate: expiration,
            status: "PAID",
          },
        });

        logger.info("Addon assigned to tenant", {
          purchaseId: purchase.id,
          tenantId: input.tenantId,
          addonId: addon.id,
        });

        return { purchaseId: purchase.id };
      });
    }),

  addonStats: adminProcedure.query(async ({ ctx }) => {
    return ctx.withAdmin(async (tx) => {
      const now = new Date();
      const [totalSold, activeCount, totalRevenueResult] = await Promise.all([
        tx.addonPurchase.count({ where: { status: "PAID" } }),
        tx.addonPurchase.count({
          where: {
            status: "PAID",
            quantityRemaining: { gt: 0 },
            expirationDate: { gt: now },
          },
        }),
        tx.addonPurchase.aggregate({
          where: { status: "PAID" },
          _sum: { pricePaid: true },
        }),
      ]);

      return {
        totalSold,
        activeCount,
        totalRevenue: decimalToCents(totalRevenueResult._sum.pricePaid),
      };
    });
  }),

  // ═══════════════════════════════════════
  // REFUNDS
  // ═══════════════════════════════════════

  listRefunds: adminProcedure
    .input(listRefundsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const page = input.page ?? 1;
        const perPage = input.perPage ?? 20;
        const skip = (page - 1) * perPage;

        const where: Prisma.RefundWhereInput = {};
        if (input.status) {
          where.status = input.status;
        } else {
          where.status = "PENDING";
        }

        const [data, total] = await Promise.all([
          tx.refund.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: perPage,
          }),
          tx.refund.count({ where }),
        ]);

        return {
          data: data.map((r) => ({
            ...r,
            refundAmount: decimalToCents(r.refundAmount),
            statusLabel: REFUND_STATUS_LABELS[r.status] ?? r.status,
          })),
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage),
        };
      });
    }),

  getRefund: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const r = await tx.refund.findUnique({ where: { id: input.id } });
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...r,
          refundAmount: decimalToCents(r.refundAmount),
          statusLabel: REFUND_STATUS_LABELS[r.status] ?? r.status,
        };
      });
    }),

  processRefund: adminProcedure
    .input(processRefundSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const r = await tx.refund.findUnique({ where: { id: input.id } });
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        if (r.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Estorno ja processado ou cancelado" });
        }

        await tx.refund.update({
          where: { id: input.id },
          data: {
            status: "PROCESSED",
            notes: input.notes ?? null,
            processedById: ctx.session.user.id,
            processedAt: new Date(),
          },
        });

        logger.info("Refund processed", { refundId: input.id });
        return { success: true };
      });
    }),

  cancelRefund: adminProcedure
    .input(cancelRefundSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const r = await tx.refund.findUnique({ where: { id: input.id } });
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        if (r.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Estorno ja processado ou cancelado" });
        }

        await tx.refund.update({
          where: { id: input.id },
          data: {
            status: "CANCELLED",
            cancelReason: input.reason,
            cancelledAt: new Date(),
          },
        });

        logger.info("Refund cancelled", { refundId: input.id });
        return { success: true };
      });
    }),

  refundStats: adminProcedure.query(async ({ ctx }) => {
    return ctx.withAdmin(async (tx) => {
      const [total, pending, processed, cancelled, totalPendingResult] = await Promise.all([
        tx.refund.count(),
        tx.refund.count({ where: { status: "PENDING" } }),
        tx.refund.count({ where: { status: "PROCESSED" } }),
        tx.refund.count({ where: { status: "CANCELLED" } }),
        tx.refund.aggregate({
          where: { status: "PENDING" },
          _sum: { refundAmount: true },
        }),
      ]);

      return {
        total,
        pending,
        processed,
        cancelled,
        totalPendingAmount: decimalToCents(totalPendingResult._sum.refundAmount),
      };
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
    // Rate limit: 5 pre-registros por IP a cada 1h. Endpoint publico aberto.
    .use(rateLimitMiddleware({ limit: 5, windowMs: 60 * 60 * 1000 }))
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
