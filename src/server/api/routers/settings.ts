import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashSync, compareSync } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, protectedProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  updateGeneralSettingsSchema,
  updatePaymentMethodSchema,
  createPaymentMethodSchema,
  upsertInstallmentRulesSchema,
  updateIntegrationSchema,
  listUsersSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
} from "@/lib/validators/settings";

export const settingsRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // GENERAL SETTINGS
  // ═══════════════════════════════════════

  getGeneral: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const settings = await tx.tenantSettings.findUnique({
        where: { tenantId: ctx.tenantId },
      });
      return settings;
    });
  }),

  updateGeneral: tenantProcedure
    .input(updateGeneralSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const data = {
          tradeName: input.tradeName,
          legalName: input.legalName,
          cnpj: input.cnpj,
          phone: input.phone,
          email: input.email,
          address: input.address === null
            ? Prisma.JsonNull
            : input.address !== undefined
              ? (input.address as Prisma.InputJsonValue)
              : undefined,
        };

        return tx.tenantSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: {
            tenantId: ctx.tenantId,
            ...data,
          },
          update: data,
        });
      });
    }),

  // ═══════════════════════════════════════
  // PAYMENT METHODS
  // ═══════════════════════════════════════

  listPaymentMethods: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.paymentMethod.findMany({
        where: { tenantId: ctx.tenantId },
        include: { installmentRules: { orderBy: { installments: "asc" } } },
        orderBy: { name: "asc" },
      });
    });
  }),

  createPaymentMethod: tenantProcedure
    .input(createPaymentMethodSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.paymentMethod.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            type: input.type,
            feePercent: input.feePercent ?? 0,
            active: input.active ?? true,
            acceptsChange: input.acceptsChange ?? false,
          },
        });
      });
    }),

  updatePaymentMethod: tenantProcedure
    .input(updatePaymentMethodSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.paymentMethod.update({
          where: { id: input.id },
          data: {
            active: input.active,
            feePercent: input.feePercent,
          },
        });
      });
    }),

  deletePaymentMethod: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.paymentMethod.delete({
          where: { id: input.id },
        });
      });
    }),

  upsertInstallmentRules: tenantProcedure
    .input(upsertInstallmentRulesSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Delete existing rules first
        await tx.installmentRule.deleteMany({
          where: { paymentMethodId: input.paymentMethodId },
        });

        // Create new rules
        if (input.rules.length > 0) {
          await tx.installmentRule.createMany({
            data: input.rules.map((rule) => ({
              paymentMethodId: input.paymentMethodId,
              tenantId: ctx.tenantId,
              installments: rule.installments,
              feePercent: rule.feePercent,
              minAmount: rule.minAmount ?? 0,
            })),
          });
        }

        return tx.paymentMethod.findUnique({
          where: { id: input.paymentMethodId },
          include: { installmentRules: { orderBy: { installments: "asc" } } },
        });
      });
    }),

  // ═══════════════════════════════════════
  // INTEGRATIONS
  // ═══════════════════════════════════════

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
        const configValue = input.config === null
          ? Prisma.JsonNull
          : input.config !== undefined
            ? (input.config as Prisma.InputJsonValue)
            : undefined;

        return tx.tenantIntegration.upsert({
          where: {
            tenantId_provider: {
              tenantId: ctx.tenantId,
              provider: input.provider,
            },
          },
          create: {
            tenantId: ctx.tenantId,
            provider: input.provider,
            enabled: input.enabled,
            config: configValue,
          },
          update: {
            enabled: input.enabled,
            config: configValue,
          },
        });
      });
    }),

  // ═══════════════════════════════════════
  // USERS (Tenant members)
  // ═══════════════════════════════════════

  listUsers: tenantProcedure
    .input(listUsersSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.UserTenantWhereInput = {
          tenantId: ctx.tenantId,
        };

        if (input.role) {
          where.role = input.role;
        }

        const userTenants = await tx.userTenant.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                cpf: true,
                name: true,
                email: true,
                createdAt: true,
              },
            },
          },
          orderBy: { user: { name: "asc" } },
          skip: page * pageSize,
          take: pageSize,
        });

        const total = await tx.userTenant.count({ where });

        // Filter by search on the application side if needed
        let data = userTenants.map((ut) => ({
          userId: ut.userId,
          tenantId: ut.tenantId,
          role: ut.role,
          name: ut.user.name,
          cpf: ut.user.cpf,
          email: ut.user.email,
          createdAt: ut.user.createdAt,
        }));

        if (input.search?.trim()) {
          const term = input.search.trim().toLowerCase();
          const digitsTerm = term.replace(/\D/g, "");
          data = data.filter(
            (u) =>
              u.name.toLowerCase().includes(term) ||
              (digitsTerm && u.cpf.includes(digitsTerm))
          );
        }

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  createUser: tenantProcedure
    .input(createUserSchema)
    .mutation(async ({ ctx, input }) => {
      // Use withAdmin because we need to create/find a global user
      const result = await withAdmin(async (tx) => {
        // Check if user with this CPF already exists
        let user = await tx.user.findUnique({ where: { cpf: input.cpf } });

        if (!user) {
          // Create user with default password 123456
          user = await tx.user.create({
            data: {
              cpf: input.cpf,
              name: input.name,
              email: null,
              passwordHash: hashSync("123456", 10),
            },
          });
        }

        // Check if user already belongs to this tenant
        const existing = await tx.userTenant.findUnique({
          where: {
            userId_tenantId: { userId: user.id, tenantId: ctx.tenantId },
          },
        });

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Usuario ja pertence a esta loja",
          });
        }

        // Add user to tenant
        await tx.userTenant.create({
          data: {
            userId: user.id,
            tenantId: ctx.tenantId,
            role: input.role,
          },
        });

        return { userId: user.id, name: user.name };
      });

      return result;
    }),

  updateUser: tenantProcedure
    .input(updateUserSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Update the role in the user_tenant relation
        await tx.userTenant.update({
          where: {
            userId_tenantId: { userId: input.userId, tenantId: ctx.tenantId },
          },
          data: { role: input.role },
        });

        // Update name if provided (global update)
        if (input.name) {
          await withAdmin(async (adminTx) => {
            await adminTx.user.update({
              where: { id: input.userId },
              data: { name: input.name },
            });
          });
        }

        return { success: true };
      });
    }),

  removeUser: tenantProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent removing yourself
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Voce nao pode remover a si mesmo",
        });
      }

      return ctx.withTenant(async (tx) => {
        await tx.userTenant.delete({
          where: {
            userId_tenantId: { userId: input.userId, tenantId: ctx.tenantId },
          },
        });
        return { success: true };
      });
    }),

  resetUserPassword: tenantProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await withAdmin(async (tx) => {
        await tx.user.update({
          where: { id: input.userId },
          data: { passwordHash: hashSync("123456", 10) },
        });
      });
      return { success: true };
    }),

  // ═══════════════════════════════════════
  // SECURITY (Change password)
  // ═══════════════════════════════════════

  changePassword: protectedProcedure
    .input(changePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await withAdmin(async (tx) => {
        return tx.user.findUnique({ where: { id: userId } });
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado" });
      }

      if (!compareSync(input.currentPassword, user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha atual incorreta" });
      }

      await withAdmin(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash: hashSync(input.newPassword, 10) },
        });
      });

      return { success: true };
    }),
});
