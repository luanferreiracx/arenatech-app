import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  updateTenantSettingsSchema,
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
  upsertInstallmentRulesSchema,
  updateIntegrationSchema,
  updateUserRoleSchema,
  inviteUserSchema,
} from "@/lib/validators/settings";
import { normalizeCpf } from "@/lib/validators/cpf";

export const settingsRouter = createTRPCRouter({
  // ── TenantSettings ──────────────────────────────────────────────────────

  getSettings: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.tenantSettings.findUnique({
        where: { tenantId: ctx.tenantId },
      });
    });
  }),

  updateSettings: tenantProcedure
    .input(updateTenantSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.tenantSettings.upsert({
          where: { tenantId: ctx.tenantId },
          update: input,
          create: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  // ── PaymentMethods ───────────────────────────────────────────────────────

  listPaymentMethods: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.paymentMethod.findMany({
        orderBy: { name: "asc" },
        include: { installmentRules: { orderBy: { installments: "asc" } } },
      });
    });
  }),

  createPaymentMethod: tenantProcedure
    .input(createPaymentMethodSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.paymentMethod.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  updatePaymentMethod: tenantProcedure
    .input(updatePaymentMethodSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        return tx.paymentMethod.update({ where: { id }, data });
      });
    }),

  deletePaymentMethod: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.paymentMethod.update({
          where: { id: input.id },
          data: { active: false },
        });
      });
    }),

  // ── InstallmentRules ─────────────────────────────────────────────────────

  listInstallmentRules: tenantProcedure
    .input(z.object({ paymentMethodId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.installmentRule.findMany({
          where: { paymentMethodId: input.paymentMethodId },
          orderBy: { installments: "asc" },
        });
      });
    }),

  upsertInstallmentRules: tenantProcedure
    .input(upsertInstallmentRulesSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Delete existing rules, then re-create
        await tx.installmentRule.deleteMany({
          where: { paymentMethodId: input.paymentMethodId, tenantId: ctx.tenantId },
        });
        if (input.rules.length === 0) return [];
        return tx.installmentRule.createMany({
          data: input.rules.map((r) => ({
            tenantId: ctx.tenantId,
            paymentMethodId: input.paymentMethodId,
            installments: r.installments,
            feePercent: r.feePercent,
            minAmount: r.minAmount,
          })),
        });
      });
    }),

  // ── Integrations ─────────────────────────────────────────────────────────

  listIntegrations: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.tenantIntegration.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { provider: "asc" },
      });
    });
  }),

  updateIntegration: tenantProcedure
    .input(updateIntegrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.tenantIntegration.upsert({
          where: { tenantId_provider: { tenantId: ctx.tenantId, provider: input.provider } },
          update: { enabled: input.enabled, config: input.config },
          create: {
            tenantId: ctx.tenantId,
            provider: input.provider,
            enabled: input.enabled,
            config: input.config,
          },
        });
      });
    }),

  // ── Users ─────────────────────────────────────────────────────────────────

  listUsers: tenantProcedure.query(async ({ ctx }) => {
    // user_roles is tenant-scoped; join with users (global table) via withAdmin
    const tenantId = ctx.tenantId;

    // Fetch user_roles for this tenant (RLS-scoped)
    const roles = await ctx.withTenant(async (tx) => {
      return tx.userRole.findMany({ where: { tenantId } });
    });

    if (roles.length === 0) return [];

    // Fetch user details via admin (global table, no RLS)
    const { withAdmin } = await import("@/server/db");
    const userIds = roles.map((r) => r.userId);
    const users = await withAdmin(async (tx) => {
      return tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, cpf: true, email: true },
      });
    });

    return roles.map((role) => ({
      ...role,
      user: users.find((u) => u.id === role.userId) ?? null,
    }));
  }),

  updateUserRole: tenantProcedure
    .input(updateUserRoleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.userRole.upsert({
          where: { tenantId_userId: { tenantId: ctx.tenantId, userId: input.userId } },
          update: { role: input.role },
          create: { tenantId: ctx.tenantId, userId: input.userId, role: input.role },
        });
      });
    }),

  removeUser: tenantProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { withAdmin } = await import("@/server/db");
      // Remove user_role (tenant-scoped) + user_tenant (global) in parallel
      await Promise.all([
        ctx.withTenant(async (tx) => {
          return tx.userRole.deleteMany({
            where: { tenantId: ctx.tenantId, userId: input.userId },
          });
        }),
        withAdmin(async (tx) => {
          return tx.userTenant.deleteMany({
            where: { tenantId: ctx.tenantId, userId: input.userId },
          });
        }),
      ]);
      return { success: true };
    }),

  inviteUser: tenantProcedure
    .input(inviteUserSchema)
    .mutation(async ({ ctx, input }) => {
      const { withAdmin } = await import("@/server/db");
      const normalizedCpf = normalizeCpf(input.cpf);

      // Find user by CPF in global table
      const user = await withAdmin(async (tx) => {
        return tx.user.findUnique({ where: { cpf: normalizedCpf } });
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Usuário não encontrado com este CPF. Peça ao usuário para se cadastrar primeiro.",
        });
      }

      // Upsert user_tenant link (global)
      await withAdmin(async (tx) => {
        return tx.userTenant.upsert({
          where: { userId_tenantId: { userId: user.id, tenantId: ctx.tenantId } },
          update: { role: input.role },
          create: { userId: user.id, tenantId: ctx.tenantId, role: input.role },
        });
      });

      // Upsert user_role (tenant-scoped)
      await ctx.withTenant(async (tx) => {
        return tx.userRole.upsert({
          where: { tenantId_userId: { tenantId: ctx.tenantId, userId: user.id } },
          update: { role: input.role },
          create: { tenantId: ctx.tenantId, userId: user.id, role: input.role },
        });
      });

      return { success: true, userId: user.id };
    }),
});
