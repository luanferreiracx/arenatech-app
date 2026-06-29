import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, adminProcedure, publicProcedure } from "@/server/api/trpc";
import { prisma } from "@/server/db";
import { tenantFinancialInit } from "@/server/services/tenant-financial-init.service";
import { logAudit } from "@/server/services/audit-log.service";
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
  approvePreRegistrationSchema,
  rejectPreRegistrationSchema,
  listPreRegistrationsSchema,
  listTenantsSchema,
  resetTenantUserPasswordSchema,
  resetTenantUserTwoFactorSchema,
  createTenantUserSchema,
  updateTenantUserSchema,
  removeTenantUserSchema,
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

/**
 * Slug OPACO para tenant NO-KYC (ADR 0050): `pdv-<hex>`. Não-sequencial e sem
 * dados do usuário — não revela a contagem de tenants nem a identidade (foco em
 * confidencialidade).
 */
function generateOpaqueSlug(): string {
  return `pdv-${randomBytes(4).toString("hex")}`;
}

function normalizeDigits(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizeRequiredDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

function getObjectProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function isPrismaUniqueError(error: unknown): boolean {
  return getObjectProperty(error, "code") === "P2002";
}

function getUniqueErrorTargets(error: unknown): string[] {
  const meta = getObjectProperty(error, "meta");
  const target = getObjectProperty(meta, "target");
  if (!Array.isArray(target)) return [];
  return target.filter((value): value is string => typeof value === "string");
}

function uniqueErrorMessage(error: unknown): string {
  const targets = getUniqueErrorTargets(error);
  if (targets.includes("cnpj")) return "CNPJ ja cadastrado em outro tenant";
  if (targets.includes("cpf")) return "CPF ja cadastrado por outra operacao";
  if (targets.includes("slug")) return "Slug do tenant ja existe; tente criar novamente";
  if (targets.includes("user_id") || targets.includes("tenant_id") || targets.includes("userId") || targets.includes("tenantId")) {
    return "Responsavel ja esta vinculado a este tenant";
  }
  return "Registro duplicado durante o cadastro";
}

async function mapOnboardingConflicts<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (isPrismaUniqueError(error)) {
      throw new TRPCError({ code: "CONFLICT", message: uniqueErrorMessage(error) });
    }
    throw error;
  }
}

function isWalletOnlyModules(modules: readonly string[]): boolean {
  return modules.length === 1 && modules[0] === "wallet";
}

async function resolveWalletOnlyActivePlanId(
  tx: Prisma.TransactionClient,
  planId: string | null | undefined,
): Promise<string | null> {
  if (!planId) return null;

  const plan = await tx.plan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, status: true, features: true },
  });
  if (!plan) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Plano selecionado nao existe" });
  }
  if (plan.status !== "ACTIVE") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Plano selecionado esta inativo" });
  }

  const modules = modulesFromPlanFeatures(plan.features);
  if (!isWalletOnlyModules(modules)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Onboarding inicial permite apenas planos com Carteira DePix",
    });
  }

  return plan.id;
}

async function assertTenantCnpjAvailable(
  tx: Prisma.TransactionClient,
  cnpj: string | null,
): Promise<void> {
  if (!cnpj) return;
  const existing = await tx.tenant.findUnique({
    where: { cnpj },
    select: { id: true },
  });
  if (existing) {
    throw new TRPCError({ code: "CONFLICT", message: "CNPJ ja cadastrado em outro tenant" });
  }
}

function assertExistingUserCanBeLinked(
  user: { email: string | null; isSuperAdmin: boolean },
  expectedEmail: string,
): void {
  if (user.isSuperAdmin) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "CPF pertence a um usuario interno da Arena Tech",
    });
  }
  if (user.email && normalizeEmail(user.email) !== normalizeEmail(expectedEmail)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "CPF ja existe com outro email",
    });
  }
}

function assertExistingTenantUserCanBeLinked(
  user: { email: string | null; isSuperAdmin: boolean },
  expectedEmail: string | null,
): void {
  if (user.isSuperAdmin) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "CPF pertence a um usuario interno da Arena Tech",
    });
  }
  if (user.email && expectedEmail && normalizeEmail(user.email) !== expectedEmail) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "CPF ja existe com outro email",
    });
  }
}

async function assertTenantHasAnotherAdmin(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; userId: string },
): Promise<void> {
  const otherAdmins = await tx.userTenant.count({
    where: {
      tenantId: input.tenantId,
      userId: { not: input.userId },
      role: "admin",
    },
  });
  if (otherAdmins === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O tenant precisa manter pelo menos um usuario administrador",
    });
  }
}

async function seedTenantSettings(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    tradeName: string;
    legalName?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    zipCode?: string | null;
    street?: string | null;
    streetNumber?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
  },
): Promise<void> {
  await tx.tenantSettings.upsert({
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      tradeName: input.tradeName,
      legalName: input.legalName ?? input.tradeName,
      cnpj: input.cnpj ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      zipCode: input.zipCode ?? null,
      street: input.street ?? null,
      streetNumber: input.streetNumber ?? null,
      complement: input.complement ?? null,
      neighborhood: input.neighborhood ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
    },
    update: {},
  });
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
              orderBy: { user: { name: "asc" } },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    cpf: true,
                    email: true,
                    phone: true,
                    isSuperAdmin: true,
                    mustChangePassword: true,
                  },
                },
              },
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
        const currentTenant = await tx.tenant.findUnique({
          where: { id: input.id },
          select: { plan: true },
        });
        if (!currentTenant) throw new TRPCError({ code: "NOT_FOUND" });

        const planId = input.plan === currentTenant.plan
          ? currentTenant.plan
          : await resolveWalletOnlyActivePlanId(tx, input.plan);
        await tx.tenant.update({
          where: { id: input.id },
          data: {
            name: input.name,
            status: input.status,
            plan: planId,
            ...(input.apiAccessEnabled !== undefined
              ? { apiAccessEnabled: input.apiAccessEnabled }
              : {}),
          },
        });
        return { success: true };
      });
    }),

  resetTenantUserPassword: adminProcedure
    .input(resetTenantUserPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const membership = await tx.userTenant.findUnique({
          where: {
            userId_tenantId: {
              userId: input.userId,
              tenantId: input.tenantId,
            },
          },
          select: {
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                isSuperAdmin: true,
              },
            },
            tenant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        if (!membership) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Usuario nao encontrado neste tenant",
          });
        }
        if (membership.user.isSuperAdmin) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e permitido resetar senha de superadmin interno",
          });
        }

        const tempPassword = generateTempPassword();
        await tx.user.update({
          where: { id: input.userId },
          data: {
            passwordHash: hashPassword(tempPassword),
            mustChangePassword: true,
          },
        });

        logger.info("Tenant user password reset by superadmin", {
          tenantId: membership.tenant.id,
          userId: membership.user.id,
          role: membership.role,
          byAdmin: ctx.session.user.id,
        });

        // Trilha persistente (audit_logs): operacao admin sensivel sobre credencial
        // — logger e transiente; sem isto nao da pra rastrear quem resetou pos-incidente.
        await logAudit(tx as never, {
          tenantId: membership.tenant.id,
          userId: ctx.session.user.id,
          action: "reset_password",
          entity: "tenant_user",
          entityId: membership.user.id,
          payload: { role: membership.role, bySuperAdmin: true },
        });

        return {
          tempPassword,
          user: {
            id: membership.user.id,
            name: membership.user.name,
          },
          tenant: {
            id: membership.tenant.id,
            name: membership.tenant.name,
          },
        };
      });
    }),

  /** Desativa o 2FA de um usuário de tenant (recuperação de conta travada). */
  resetTenantUserTwoFactor: adminProcedure
    .input(resetTenantUserTwoFactorSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const membership = await tx.userTenant.findUnique({
          where: {
            userId_tenantId: {
              userId: input.userId,
              tenantId: input.tenantId,
            },
          },
          select: {
            role: true,
            user: { select: { id: true, name: true, isSuperAdmin: true, twoFactorEnabled: true } },
            tenant: { select: { id: true, name: true } },
          },
        });

        if (!membership) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Usuario nao encontrado neste tenant",
          });
        }
        if (membership.user.isSuperAdmin) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e permitido resetar 2FA de superadmin interno",
          });
        }

        await tx.user.update({
          where: { id: input.userId },
          data: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorConfirmedAt: null,
            twoFactorBackupCodes: [],
          },
        });

        logger.info("Tenant user 2FA reset by superadmin", {
          tenantId: membership.tenant.id,
          userId: membership.user.id,
          role: membership.role,
          wasEnabled: membership.user.twoFactorEnabled,
          byAdmin: ctx.session.user.id,
        });

        // Trilha persistente (audit_logs): desligar 2FA e remocao de barreira de
        // seguranca — precisa ser auditavel pos-incidente, nao so log transiente.
        await logAudit(tx as never, {
          tenantId: membership.tenant.id,
          userId: ctx.session.user.id,
          action: "reset_two_factor",
          entity: "tenant_user",
          entityId: membership.user.id,
          payload: { role: membership.role, wasEnabled: membership.user.twoFactorEnabled, bySuperAdmin: true },
        });

        return {
          user: { id: membership.user.id, name: membership.user.name },
          tenant: { id: membership.tenant.id, name: membership.tenant.name },
        };
      });
    }),

  createTenantUser: adminProcedure
    .input(createTenantUserSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: input.tenantId },
          select: { id: true, name: true },
        });
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant nao encontrado" });

        const cpf = normalizeRequiredDigits(input.cpf);
        const phone = normalizeDigits(input.phone);
        const email = normalizeOptionalEmail(input.email);
        const tempPassword = generateTempPassword();

        const existingUser = await tx.user.findFirst({
          where: { cpf },
          select: {
            id: true,
            name: true,
            email: true,
            isSuperAdmin: true,
          },
        });
        if (existingUser) {
          assertExistingTenantUserCanBeLinked(existingUser, email);
          const existingMembership = await tx.userTenant.findUnique({
            where: {
              userId_tenantId: {
                userId: existingUser.id,
                tenantId: tenant.id,
              },
            },
            select: { userId: true },
          });
          if (existingMembership) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Usuario ja pertence a este tenant",
            });
          }
        }

        const user = existingUser
          ? await tx.user.update({
              where: { id: existingUser.id },
              data: {
                name: input.name,
                email: existingUser.email ?? email,
                phone,
              },
              select: { id: true, name: true },
            })
          : await tx.user.create({
              data: {
                name: input.name,
                cpf,
                email,
                phone,
                passwordHash: hashPassword(tempPassword),
                mustChangePassword: true,
              },
              select: { id: true, name: true },
            });

        await tx.userTenant.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            role: input.role,
            isTechnician: input.isTechnician ?? false,
            isCashier: input.isCashier ?? false,
          },
        });

        logger.info("Tenant user created by superadmin", {
          tenantId: tenant.id,
          userId: user.id,
          role: input.role,
          byAdmin: ctx.session.user.id,
          reusedExistingUser: Boolean(existingUser),
        });

        return {
          user: {
            id: user.id,
            name: user.name,
          },
          tenant,
          tempPassword: existingUser ? null : tempPassword,
        };
      });
    }),

  updateTenantUser: adminProcedure
    .input(updateTenantUserSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const membership = await tx.userTenant.findUnique({
          where: {
            userId_tenantId: {
              userId: input.userId,
              tenantId: input.tenantId,
            },
          },
          select: {
            role: true,
            user: {
              select: {
                id: true,
                isSuperAdmin: true,
              },
            },
          },
        });
        if (!membership) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado neste tenant" });
        }
        if (membership.user.isSuperAdmin) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e permitido administrar superadmin interno como usuario de tenant",
          });
        }
        if (membership.role === "admin" && input.role !== "admin") {
          await assertTenantHasAnotherAdmin(tx, input);
        }

        const email = normalizeOptionalEmail(input.email);
        const phone = normalizeDigits(input.phone);

        await tx.user.update({
          where: { id: input.userId },
          data: {
            name: input.name,
            email,
            phone,
          },
        });
        await tx.userTenant.update({
          where: {
            userId_tenantId: {
              userId: input.userId,
              tenantId: input.tenantId,
            },
          },
          data: {
            role: input.role,
            isTechnician: input.isTechnician ?? false,
            isCashier: input.isCashier ?? false,
          },
        });

        logger.info("Tenant user updated by superadmin", {
          tenantId: input.tenantId,
          userId: input.userId,
          role: input.role,
          byAdmin: ctx.session.user.id,
        });

        return { success: true };
      });
    }),

  removeTenantUser: adminProcedure
    .input(removeTenantUserSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withAdmin(async (tx) => {
        const membership = await tx.userTenant.findUnique({
          where: {
            userId_tenantId: {
              userId: input.userId,
              tenantId: input.tenantId,
            },
          },
          select: {
            role: true,
            user: {
              select: {
                id: true,
                isSuperAdmin: true,
              },
            },
          },
        });
        if (!membership) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado neste tenant" });
        }
        if (membership.user.isSuperAdmin) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e permitido remover superadmin interno como usuario de tenant",
          });
        }
        if (membership.role === "admin") {
          await assertTenantHasAnotherAdmin(tx, input);
        }

        await tx.userTenant.delete({
          where: {
            userId_tenantId: {
              userId: input.userId,
              tenantId: input.tenantId,
            },
          },
        });

        logger.info("Tenant user removed by superadmin", {
          tenantId: input.tenantId,
          userId: input.userId,
          byAdmin: ctx.session.user.id,
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
      const approved = await mapOnboardingConflicts(() => ctx.withAdmin(async (tx) => {
        const pr = await tx.preRegistration.findUnique({ where: { id: input.id } });
        if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
        if (pr.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pre-cadastro ja processado" });
        }

        const planId = await resolveWalletOnlyActivePlanId(tx, input.planId ?? pr.planId);
        const cnpj = normalizeDigits(pr.cnpj);
        await assertTenantCnpjAvailable(tx, cnpj);

        const ownerPhone = normalizeDigits(pr.ownerPhone);
        // Tipo inferido pela presença de documento (ADR 0050): com CPF = KYC;
        // sem CPF = NO-KYC (login por e-mail, senha definida no cadastro).
        const isNoKyc = !pr.ownerCpf;

        if (isNoKyc) {
          // NO-KYC exige e-mail e telefone já verificados no auto-cadastro.
          if (!pr.emailVerifiedAt || !pr.phoneVerifiedAt) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Pré-cadastro NO-KYC sem e-mail/telefone verificados.",
            });
          }
          if (!pr.passwordHash) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Pré-cadastro NO-KYC sem senha definida.",
            });
          }
        }

        const tempPassword = isNoKyc ? null : generateTempPassword();
        const ownerCpf = pr.ownerCpf ? normalizeRequiredDigits(pr.ownerCpf) : null;

        // Slug opaco no NO-KYC (confidencialidade); derivado do nome no KYC.
        const slug = isNoKyc
          ? generateOpaqueSlug()
          : `${generateSlug(pr.tradeName)}-${Date.now().toString(36)}`;

        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: pr.tradeName,
            slug,
            cnpj,
            plan: planId,
            status: "ACTIVE",
          },
        });

        // Usuário existente: por CPF (KYC) ou por e-mail (NO-KYC).
        const existingUser = await tx.user.findFirst({
          where: ownerCpf ? { cpf: ownerCpf } : { email: pr.ownerEmail },
        });
        if (existingUser) {
          assertExistingUserCanBeLinked(existingUser, pr.ownerEmail);
        }

        const user = existingUser
          ? await tx.user.update({
              where: { id: existingUser.id },
              data: {
                name: existingUser.name || pr.ownerName,
                email: existingUser.email ?? pr.ownerEmail,
                phone: existingUser.phone ?? ownerPhone,
              },
            })
          : await tx.user.create({
              data: {
                name: pr.ownerName,
                cpf: ownerCpf,
                email: pr.ownerEmail,
                phone: ownerPhone,
                // NO-KYC: usa o hash da senha definida no cadastro (sem troca
                // forçada). KYC: senha temporária + troca obrigatória.
                passwordHash: isNoKyc ? pr.passwordHash! : hashPassword(tempPassword!),
                mustChangePassword: !isNoKyc,
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
        await tenantFinancialInit(tx, tenant.id);
        await seedTenantSettings(tx, {
          tenantId: tenant.id,
          tradeName: pr.tradeName,
          legalName: pr.legalName,
          cnpj,
          email: pr.ownerEmail,
          phone: ownerPhone,
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

        return { tenantId: tenant.id, userId: user.id, tempPassword: existingUser ? null : tempPassword };
      }));

      // Carteira DePix nasce non-custodial no 1o acesso (ADR 0051): o tenant
      // escolhe criar/importar e define a passphrase via depixWallet.setupWallet.
      // Nenhuma carteira e provisionada aqui.

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
      const created = await mapOnboardingConflicts(() => ctx.withAdmin(async (tx) => {
        const planId = await resolveWalletOnlyActivePlanId(tx, input.planId);
        const cnpj = normalizeDigits(input.cnpj);
        const ownerCpf = normalizeRequiredDigits(input.ownerCpf);
        const ownerPhone = normalizeDigits(input.phone);
        await assertTenantCnpjAvailable(tx, cnpj);

        const slug = generateSlug(input.name);
        const tempPassword = generateTempPassword();

        const tenant = await tx.tenant.create({
          data: {
            name: input.name,
            slug: `${slug}-${Date.now().toString(36)}`,
            cnpj,
            plan: planId,
            status: "ACTIVE",
          },
        });

        const existingUser = await tx.user.findFirst({
          where: { cpf: ownerCpf },
        });
        if (existingUser) {
          assertExistingUserCanBeLinked(existingUser, input.email);
        }

        let userId: string;
        if (existingUser) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: existingUser.name || input.ownerName,
              email: existingUser.email ?? input.email,
              phone: existingUser.phone ?? ownerPhone,
            },
          });
          userId = existingUser.id;
        } else {
          const user = await tx.user.create({
            data: {
              name: input.ownerName,
              cpf: ownerCpf,
              email: input.email,
              phone: ownerPhone,
              passwordHash: hashPassword(tempPassword),
              mustChangePassword: true,
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
        await tenantFinancialInit(tx, tenant.id);
        await seedTenantSettings(tx, {
          tenantId: tenant.id,
          tradeName: input.name,
          cnpj,
          email: input.email,
          phone: ownerPhone,
          zipCode: normalizeDigits(input.cep),
          street: input.address ?? null,
          streetNumber: input.addressNumber ?? null,
          complement: input.addressComplement ?? null,
          neighborhood: input.neighborhood ?? null,
          city: input.city ?? null,
          state: input.state?.toUpperCase() ?? null,
        });

        logger.info("Tenant created manually", {
          tenantId: tenant.id,
          userId,
          byAdmin: ctx.session.user.id,
        });

        return { tenantId: tenant.id, userId, tempPassword: existingUser ? null : tempPassword };
      }));

      // Carteira DePix nasce non-custodial no 1o acesso (ADR 0051): o tenant
      // escolhe criar/importar e define a passphrase via depixWallet.setupWallet.
      // Nenhuma carteira e provisionada aqui.

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

  // O auto-cadastro público KYC (submitPreRegistration) foi aposentado na Fase 5
  // do ADR 0050: o pré-cadastro público agora é exclusivo do NO-KYC (router
  // `noKyc`); tenant KYC é criado manualmente pelo superadmin (createTenant).
});
