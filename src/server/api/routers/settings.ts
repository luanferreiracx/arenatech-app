import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashSync, compareSync } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, tenantAdminProcedure, protectedProcedure, superAdminTenantProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import { isTenantAdmin } from "@/lib/auth/roles";
import { logAudit, pickChanges } from "@/server/services/audit-log.service";
import {
  createTenantUserInTx,
  updateTenantUserInTx,
  removeTenantUserInTx,
  resetTenantUserPasswordInTx,
  resetTenantUserTwoFactorInTx,
} from "@/server/services/tenant-user.service";
import {
  updateGeneralSettingsSchema,
  updatePaymentMethodSchema,
  createPaymentMethodSchema,
  upsertInstallmentRulesSchema,
  upsertPaymentRatesSchema,
  updatePaymentMethodFullSchema,
  updateIntegrationSchema,
  listUsersSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
} from "@/lib/validators/settings";
import {
  listAuditLogsSchema,
  updateFiscalSettingsSchema,
} from "@/lib/validators/subscription";

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

  // RBAC: dados da loja (nome/CNPJ/IE/logo) afetam fiscal — admin do tenant.
  updateGeneral: tenantAdminProcedure
    .input(updateGeneralSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerentes e proprietários podem alterar configurações gerais" });
      }
      return ctx.withTenant(async (tx) => {
        const before = await tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } });
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

        const updated = await tx.tenantSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: {
            tenantId: ctx.tenantId,
            ...data,
          },
          update: data,
        });

        const changes = pickChanges(
          before as never,
          updated as never,
        );
        if (changes) {
          await logAudit(tx as never, {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            action: "updated",
            entity: "tenant_general",
            entityId: ctx.tenantId,
            payload: changes,
          });
        }

        return updated;
      });
    }),

  /**
   * Upload da logo do tenant. Recebe base64 + extensao, processa via Sharp
   * e armazena no MinIO. Atualiza `tenant_settings.logoUrl`.
   */
  uploadLogo: tenantProcedure
    .input(
      z.object({
        /** dataURL completo: "data:image/png;base64,iVBOR..." */
        dataUrl: z.string().min(20).max(3_000_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas gerentes e proprietarios podem alterar a logo",
        });
      }

      const match = input.dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
      if (!match) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato invalido (use data URL)" });
      }
      const mimeType = match[1]!;
      const buffer = Buffer.from(match[2]!, "base64");

      const { uploadTenantLogo, deleteTenantLogo } = await import("@/lib/tenant-logo-service");

      // Apaga a logo antiga (best effort).
      const existing = await ctx.withTenant(async (tx) =>
        tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId }, select: { logoUrl: true } }),
      );
      if (existing?.logoUrl) {
        await deleteTenantLogo(existing.logoUrl).catch(() => undefined);
      }

      const url = await uploadTenantLogo(ctx.tenantId, buffer, mimeType);
      const updated = await ctx.withTenant(async (tx) =>
        tx.tenantSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, logoUrl: url },
          update: { logoUrl: url },
        }),
      );

      return { logoUrl: updated.logoUrl };
    }),

  /** Remove a logo do tenant (deleta do MinIO + zera o campo). */
  deleteLogo: tenantProcedure.mutation(async ({ ctx }) => {
    if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Apenas gerentes e proprietarios podem alterar a logo",
      });
    }
    const settings = await ctx.withTenant(async (tx) =>
      tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId }, select: { logoUrl: true } }),
    );
    if (settings?.logoUrl) {
      const { deleteTenantLogo } = await import("@/lib/tenant-logo-service");
      await deleteTenantLogo(settings.logoUrl).catch(() => undefined);
    }
    await ctx.withTenant(async (tx) =>
      tx.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: { tenantId: ctx.tenantId, logoUrl: null },
        update: { logoUrl: null },
      }),
    );
    return { success: true };
  }),

  // ═══════════════════════════════════════
  // PAYMENT METHODS
  // ═══════════════════════════════════════

  listPaymentMethods: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.paymentMethod.findMany({
        where: { tenantId: ctx.tenantId, active: true },
        include: {
          installmentRules: { orderBy: { installments: "asc" } },
          rates: { where: { active: true }, orderBy: { installments: "asc" } },
        },
        orderBy: { name: "asc" },
      });
    });
  }),

  /**
   * Calcula o breakdown de pagamento em tempo real (UI do PDV).
   * Paridade Laravel endpoint /api/formas-pagamento/calcular.
   */
  previewPaymentBreakdown: tenantProcedure
    .input(z.object({
      paymentMethodId: z.string().uuid(),
      installments: z.number().int().min(1).max(36),
      valorMercadoria: z.number().int().min(0), // centavos
      appliesTo: z.enum(["APARELHO", "NAO_APARELHO", "AMBOS"]).default("AMBOS"),
      totalPaidManual: z.number().int().min(0).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const { calculatePaymentByMethodId } = await import("@/lib/services/payment-calculator");
        return calculatePaymentByMethodId(tx, {
          paymentMethodId: input.paymentMethodId,
          installments: input.installments,
          valorMercadoria: input.valorMercadoria,
          appliesTo: input.appliesTo,
          totalPaidManual: input.totalPaidManual ?? null,
        });
      });
    }),

  createPaymentMethod: tenantProcedure
    .input(createPaymentMethodSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para alterar formas de pagamento" });
      }
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
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para alterar formas de pagamento" });
      }
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
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para alterar formas de pagamento" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.paymentMethod.delete({
          where: { id: input.id },
        });
      });
    }),

  // Taxas/regras de parcelamento = precificação controlada pela Arena Tech.
  // SÓ super admin altera; o tenant não mexe nas próprias taxas.
  upsertInstallmentRules: superAdminTenantProcedure
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

  /**
   * Atualiza TODOS os campos editaveis de PaymentMethod.
   * Usado pela UI de Settings -> Formas de Pagamento (versao completa).
   */
  updatePaymentMethodFull: tenantProcedure
    .input(updatePaymentMethodFullSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para alterar formas de pagamento" });
      }
      return ctx.withTenant(async (tx) => {
        const { id, ...rest } = input;
        return tx.paymentMethod.update({ where: { id }, data: rest });
      });
    }),

  /**
   * Replace-all de PaymentMethodRate de uma forma de pagamento.
   * Apaga as rates existentes e insere as novas. Idempotente.
   * Aceita policy (LOJA_ABSORVE/CLIENTE_PAGA) e appliesTo (APARELHO/NAO_APARELHO/AMBOS)
   * por parcela — paridade Laravel formas_pagamento_taxas.
   */
  // Taxas por forma de pagamento = precificação controlada pela Arena Tech.
  // SÓ super admin altera; o tenant não mexe nas próprias taxas.
  upsertPaymentRates: superAdminTenantProcedure
    .input(upsertPaymentRatesSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.paymentMethodRate.deleteMany({
          where: { paymentMethodId: input.paymentMethodId },
        });
        if (input.rates.length > 0) {
          await tx.paymentMethodRate.createMany({
            data: input.rates.map((r) => ({
              tenantId: ctx.tenantId,
              paymentMethodId: input.paymentMethodId,
              installments: r.installments,
              appliesTo: r.appliesTo,
              policy: r.policy,
              feePercent: r.feePercent,
              feeFixed: r.feeFixed,
              settlementDays: r.settlementDays ?? 0,
              active: r.active,
            })),
          });
        }
        return tx.paymentMethod.findUnique({
          where: { id: input.paymentMethodId },
          include: { rates: { orderBy: [{ appliesTo: "asc" }, { installments: "asc" }] } },
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

  // RBAC: edita credenciais de API (Autentique/DePix/Chatwoot/Nuvem Fiscal/
  // InfinitePay) — operação sensível, restrita a admin do tenant.
  updateIntegration: tenantAdminProcedure
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
          isTechnician: ut.isTechnician,
          isCashier: ut.isCashier,
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
              (digitsTerm ? (u.cpf?.includes(digitsTerm) ?? false) : false)
          );
        }

        // O cliente usa isto para mostrar as ações de gestão só para admins do
        // tenant (o backend reforça via tenantAdminProcedure de qualquer forma).
        const canManage = isTenantAdmin(ctx.session, ctx.tenantId);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
          canManage,
        };
      });
    }),

  // Gestão de usuários DO PRÓPRIO tenant — restrita aos admins do tenant
  // (tenantAdminProcedure). Escopo sempre em ctx.tenantId; usa withAdmin para
  // escrever nas tabelas globais users/user_tenants via o service compartilhado.
  createUser: tenantAdminProcedure
    .input(createUserSchema)
    .mutation(async ({ ctx, input }) => {
      return withAdmin((tx) =>
        createTenantUserInTx(tx, {
          tenantId: ctx.tenantId,
          name: input.name,
          cpf: input.cpf,
          email: input.email,
          phone: input.phone,
          role: input.role,
          isTechnician: input.isTechnician,
          isCashier: input.isCashier,
        }),
      );
    }),

  updateUser: tenantAdminProcedure
    .input(updateUserSchema)
    .mutation(async ({ ctx, input }) => {
      return withAdmin((tx) =>
        updateTenantUserInTx(tx, {
          tenantId: ctx.tenantId,
          userId: input.userId,
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: input.role,
          isTechnician: input.isTechnician,
          isCashier: input.isCashier,
        }),
      );
    }),

  removeUser: tenantAdminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return withAdmin((tx) => removeTenantUserInTx(tx, ctx.tenantId, input.userId));
    }),

  resetUserPassword: tenantAdminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return withAdmin((tx) => resetTenantUserPasswordInTx(tx, ctx.tenantId, input.userId));
    }),

  resetUserTwoFactor: tenantAdminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return withAdmin((tx) => resetTenantUserTwoFactorInTx(tx, ctx.tenantId, input.userId));
    }),

  // ═══════════════════════════════════════
  // SECURITY (Change password)
  // ═══════════════════════════════════════

  // ═══════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════

  listAuditLogs: tenantProcedure
    .input(listAuditLogsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 50;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.AuditLogWhereInput = {
          tenantId: ctx.tenantId,
        };

        if (input.action) where.action = input.action;
        if (input.entity) where.entity = input.entity;
        if (input.dateFrom || input.dateTo) {
          where.createdAt = {};
          if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
          if (input.dateTo) where.createdAt.lte = new Date(input.dateTo + "T23:59:59");
        }

        const [data, total] = await Promise.all([
          tx.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.auditLog.count({ where }),
        ]);

        // Get distinct actions and entities for filter dropdowns
        const [actions, entities] = await Promise.all([
          tx.auditLog.findMany({
            where: { tenantId: ctx.tenantId },
            select: { action: true },
            distinct: ["action"],
          }),
          tx.auditLog.findMany({
            where: { tenantId: ctx.tenantId },
            select: { entity: true },
            distinct: ["entity"],
          }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
          actions: actions.map((a) => a.action),
          entities: entities.map((e) => e.entity),
        };
      });
    }),

  getAuditLog: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const log = await tx.auditLog.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId },
        });
        if (!log) throw new TRPCError({ code: "NOT_FOUND" });
        return log;
      });
    }),

  // ═══════════════════════════════════════
  // FISCAL SETTINGS
  // ═══════════════════════════════════════

  getFiscalSettings: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const fiscal = await tx.tenantFiscalSettings.findUnique({
        where: { tenantId: ctx.tenantId },
      });
      if (!fiscal) return {};
      // Map to the format the frontend page expects (PT field names)
      return {
        razaoSocial: fiscal.legalName,
        nomeFantasia: fiscal.tradeName,
        cnpj: fiscal.cnpj,
        inscricaoEstadual: fiscal.ie,
        cnae: fiscal.cnae,
        regimeTributario: fiscal.taxRegime?.toString(),
        cep: fiscal.zipCode,
        logradouro: fiscal.street,
        numero: fiscal.streetNumber,
        complemento: fiscal.complement,
        bairro: fiscal.neighborhood,
        cidade: fiscal.city,
        uf: fiscal.state,
        codigoMunicipio: fiscal.municipalityCode,
        nfeSerie: fiscal.nfeSeries ? parseInt(fiscal.nfeSeries) : undefined,
        nfceSerie: fiscal.nfceSeries ? parseInt(fiscal.nfceSeries) : undefined,
        nfeAmbiente: fiscal.nfeEnvironment?.toString(),
        habilitado: fiscal.enabled,
        emitirNfAutomatico: fiscal.autoIssue,
      };
    });
  }),

  updateFiscalSettings: tenantProcedure
    .input(updateFiscalSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem alterar configurações fiscais" });
      }
      const data = {
        legalName: input.razaoSocial,
        tradeName: input.nomeFantasia,
        cnpj: input.cnpj,
        ie: input.inscricaoEstadual,
        cnae: input.cnae,
        taxRegime: input.regimeTributario ? parseInt(input.regimeTributario) : undefined,
        zipCode: input.cep,
        street: input.logradouro,
        streetNumber: input.numero,
        complement: input.complemento,
        neighborhood: input.bairro,
        city: input.cidade,
        state: input.uf,
        municipalityCode: input.codigoMunicipio,
        nfeEnvironment: input.nfeAmbiente ? parseInt(input.nfeAmbiente) : undefined,
        nfeSeries: input.nfeSerie?.toString(),
        nfceSeries: input.nfceSerie?.toString(),
        defaultCfop: input.cfopDentroEstado,
        defaultNcm: input.ncmPadrao,
        defaultCsosn: input.csosnPadrao,
        cscId: input.nfceCscId,
        cscToken: input.nfceCscToken,
        enabled: input.habilitado,
        autoIssue: input.emitirNfAutomatico,
      };
      // Remove undefined values
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined)
      );
      return ctx.withTenant(async (tx) => {
        const before = await tx.tenantFiscalSettings.findUnique({ where: { tenantId: ctx.tenantId } });
        const updated = await tx.tenantFiscalSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...cleanData },
          update: cleanData,
        });
        const changes = pickChanges(before as never, updated as never);
        if (changes) {
          await logAudit(tx as never, {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            action: "updated",
            entity: "tenant_fiscal",
            entityId: ctx.tenantId,
            payload: changes,
          });
        }
        return updated;
      });
    }),

  // ═══════════════════════════════════════
  // SUBSCRIPTION (tenant view)
  // ═══════════════════════════════════════

  getSubscription: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const tenant = await withAdmin(async (adminTx) => {
        return adminTx.tenant.findUnique({
          where: { id: ctx.tenantId },
        });
      });

      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      // Get plan info if tenant has one
      let plan = null;
      if (tenant.plan) {
        plan = await withAdmin(async (adminTx) => {
          return adminTx.plan.findFirst({
            where: {
              OR: [
                { id: tenant.plan ?? "__nope__" },
                { slug: tenant.plan ?? "__nope__" },
              ],
            },
          });
        });
      }

      return {
        tenantName: tenant.name,
        status: tenant.status,
        planName: plan?.name ?? tenant.plan ?? "Sem plano",
        planPrice: plan ? Math.round(Number(plan.monthlyPrice) * 100) : 0,
        maxUsers: plan?.maxUsers ?? 5,
        maxImeiQueries: plan?.maxImeiQueries ?? 0,
      };
    });
  }),

  // ═══════════════════════════════════════
  // TEAM (list all users + roles)
  // ═══════════════════════════════════════

  listTeam: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userTenants = await tx.userTenant.findMany({
        where: { tenantId: ctx.tenantId },
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
      });

      // Get user roles if any
      const userRoles = await tx.userRole.findMany({
        where: { tenantId: ctx.tenantId },
      });
      const roleMap = new Map(userRoles.map((r) => [r.userId, r.role]));

      return userTenants.map((ut) => ({
        userId: ut.userId,
        name: ut.user.name,
        cpf: ut.user.cpf,
        email: ut.user.email,
        accessRole: ut.role,
        tenantRole: roleMap.get(ut.userId) ?? null,
        createdAt: ut.user.createdAt,
      }));
    });
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
          data: {
            passwordHash: hashSync(input.newPassword, 10),
            mustChangePassword: false,
          },
        });
      });

      return { success: true };
    }),

  // ═══════════════════════════════════════
  // ASSISTANCE SETTINGS
  // ═══════════════════════════════════════

  getAssistance: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.tenantAssistanceSettings.findUnique({
        where: { tenantId: ctx.tenantId },
      });
    });
  }),

  // RBAC: dados da assistência (endereço/contato/fiscal) — admin do tenant.
  updateAssistance: tenantAdminProcedure
    .input(z.object({
      // Identidade (paridade Laravel configuracoes_assistencia)
      assistanceName: z.string().max(150).nullable().optional(),
      cnpj: z.string().max(18).nullable().optional(),
      phone: z.string().max(20).nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      address: z.string().max(200).nullable().optional(),
      city: z.string().max(100).nullable().optional(),
      state: z.string().max(2).nullable().optional(),
      zipCode: z.string().max(10).nullable().optional(),
      businessHours: z.string().max(200).nullable().optional(),
      termsOfService: z.string().optional(),
      warrantyPolicy: z.string().optional(),
      // Paridade Laravel `configuracoes_assistencia.parcelas_sem_juros` / `desconto_pix`.
      // Usados nos orcamentos de servico via WhatsApp.
      installmentsNoInterest: z.number().int().min(1).max(24).optional(),
      pixDiscount: z.number().min(0).max(100).optional(),
      valuationValidityDays: z.number().int().min(1).max(90).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerentes e proprietários podem alterar configurações de assistência" });
      }
      // Normaliza email vazio → null
      const data = { ...input, email: input.email === "" ? null : input.email };
      return ctx.withTenant(async (tx) => {
        const before = await tx.tenantAssistanceSettings.findUnique({ where: { tenantId: ctx.tenantId } });
        const updated = await tx.tenantAssistanceSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...data },
          update: data,
        });
        const changes = pickChanges(before as never, updated as never);
        if (changes) {
          await logAudit(tx as never, {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            action: "updated",
            entity: "tenant_assistance",
            entityId: ctx.tenantId,
            payload: changes,
          });
        }
        return updated;
      });
    }),

  // ═══════════════════════════════════════
  // RECEIVING SETTINGS
  // ═══════════════════════════════════════

  getReceiving: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.tenantReceivingSettings.findUnique({
        where: { tenantId: ctx.tenantId },
      });
    });
  }),

  updateReceiving: tenantProcedure
    .input(z.object({
      defaultPolicyDevice: z.enum(["STORE_ABSORBS", "CUSTOMER_PAYS"]).optional(),
      defaultPolicyNonDevice: z.enum(["STORE_ABSORBS", "CUSTOMER_PAYS"]).optional(),
      minInstallmentAmount: z.number().int().min(0).optional(),
      requireCpfAbove: z.number().int().min(0).optional(),
      autoCloseTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      monthlySalesGoal: z.number().int().min(0).nullable().optional(),
      defaultDasRate: z.number().min(0).max(100).nullable().optional(),
      defaultIcmsDiffRate: z.number().min(0).max(100).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem alterar configurações de recebimento" });
      }
      return ctx.withTenant(async (tx) => {
        const before = await tx.tenantReceivingSettings.findUnique({ where: { tenantId: ctx.tenantId } });
        const updated = await tx.tenantReceivingSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...input },
          update: input,
        });
        const changes = pickChanges(before as never, updated as never);
        if (changes) {
          await logAudit(tx as never, {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            action: "updated",
            entity: "tenant_receiving",
            entityId: ctx.tenantId,
            payload: changes,
          });
        }
        return updated;
      });
    }),

  // ═══════════════════════════════════════
  // CERTIFICATE MANAGEMENT (.pfx)
  // ═══════════════════════════════════════

  /** Upload encrypted .pfx certificate (Owner only) */
  updateFiscalCertificate: tenantProcedure
    .input(z.object({
      pfxBase64: z.string().min(1, "Certificado obrigatório"),
      password: z.string().min(1, "Senha do certificado obrigatória"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem gerenciar certificados" });
      }

      const { encryptPfx } = await import("@/server/services/pfx-encryption.service");
      const { randomUUID } = await import("node:crypto");

      // Decode base64
      const pfxBuffer = Buffer.from(input.pfxBase64, "base64");
      if (pfxBuffer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo de certificado vazio" });
      }

      // Validate .pfx with password (password is NOT stored)
      const { validatePfx } = await import("@/server/services/pfx-validator.service");
      const validation = validatePfx(pfxBuffer, input.password);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: validation.error ?? "Certificado inválido" });
      }

      // Encrypt (password is discarded after validation)
      const { encrypted, iv, authTag } = encryptPfx(pfxBuffer);

      // Upload to MinIO
      const certId = randomUUID();
      const key = `tenants/${ctx.tenantId}/certificates/${certId}.pfx.enc`;

      try {
        const { uploadProductImage } = await import("@/lib/product-image-service");
        // Reuse MinIO upload infrastructure (upload raw encrypted buffer)
        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
        const client = new S3Client({
          region: "us-east-1",
          endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
            secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
          },
        });
        await client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET || "arenatech",
          Key: key,
          Body: encrypted,
          ContentType: "application/octet-stream",
        }));
      } catch (error) {
        if (process.env.NODE_ENV !== "development") throw error;
        // Dev mode: MinIO may not be available, continue with URL placeholder
      }

      const certificateUrl = `${process.env.S3_ENDPOINT || "http://localhost:9000"}/${process.env.S3_BUCKET || "arenatech"}/${key}`;

      // Update fiscal settings (include metadata from validation)
      return ctx.withTenant(async (tx) => {
        return tx.tenantFiscalSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: {
            tenantId: ctx.tenantId,
            certificateUrl,
            certificateIv: iv,
            certificateAuthTag: authTag,
            certificateUploadedAt: new Date(),
            certificateExpiresAt: validation.expiresAt ?? null,
          },
          update: {
            certificateUrl,
            certificateIv: iv,
            certificateAuthTag: authTag,
            certificateUploadedAt: new Date(),
            certificateExpiresAt: validation.expiresAt ?? null,
          },
        });
      });
    }),

  /** Remove certificate (Owner only) */
  removeFiscalCertificate: tenantProcedure
    .mutation(async ({ ctx }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ctx.withTenant(async (tx) => {
        const settings = await tx.tenantFiscalSettings.findUnique({
          where: { tenantId: ctx.tenantId },
        });

        if (settings?.certificateUrl) {
          // Try to delete from MinIO
          try {
            const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
            const client = new S3Client({
              region: "us-east-1",
              endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
              forcePathStyle: true,
              credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
                secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
              },
            });
            const bucket = process.env.S3_BUCKET || "arenatech";
            const url = settings.certificateUrl;
            const keyIdx = url.indexOf(`/${bucket}/`);
            if (keyIdx !== -1) {
              await client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: url.slice(keyIdx + bucket.length + 2),
              }));
            }
          } catch {
            // Ignore MinIO errors in dev
          }
        }

        return tx.tenantFiscalSettings.update({
          where: { tenantId: ctx.tenantId },
          data: {
            certificateUrl: null,
            certificateIv: null,
            certificateAuthTag: null,
            certificateUploadedAt: null,
            certificateExpiresAt: null,
          },
        });
      });
    }),

  // ═══════════════════════════════════════
  // SECURITY SETTINGS (politica de senha + sessao)
  // ═══════════════════════════════════════

  getSecurity: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return (
        (await tx.tenantSecuritySettings.findUnique({ where: { tenantId: ctx.tenantId } })) ?? {
          tenantId: ctx.tenantId,
          minPasswordLength: 8,
          requireUppercase: false,
          requireNumber: true,
          requireSpecialChar: false,
          passwordExpirationDays: null,
          sessionTimeoutMinutes: null,
          maxFailedLoginAttempts: 5,
          lockoutMinutes: 15,
        }
      );
    });
  }),

  // RBAC: configurações de segurança do tenant — admin do tenant.
  updateSecurity: tenantAdminProcedure
    .input(z.object({
      minPasswordLength: z.number().int().min(6).max(64).optional(),
      requireUppercase: z.boolean().optional(),
      requireNumber: z.boolean().optional(),
      requireSpecialChar: z.boolean().optional(),
      passwordExpirationDays: z.number().int().min(0).max(365).nullable().optional(),
      sessionTimeoutMinutes: z.number().int().min(5).max(1440).nullable().optional(),
      maxFailedLoginAttempts: z.number().int().min(0).max(20).optional(),
      lockoutMinutes: z.number().int().min(0).max(1440).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem alterar políticas de segurança" });
      }
      return ctx.withTenant(async (tx) => {
        const before = await tx.tenantSecuritySettings.findUnique({ where: { tenantId: ctx.tenantId } });
        const updated = await tx.tenantSecuritySettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...input },
          update: input,
        });
        const changes = pickChanges(before as never, updated as never);
        if (changes) {
          await logAudit(tx as never, {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            action: "updated",
            entity: "tenant_security",
            entityId: ctx.tenantId,
            payload: changes,
          });
        }
        return updated;
      });
    }),

  // ═══════════════════════════════════════
  // NOTIFICATION CONFIGS (eventos x canais)
  // ═══════════════════════════════════════

  listNotificationConfigs: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.notificationConfig.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { event: "asc" },
      });
    });
  }),

  upsertNotificationConfig: tenantProcedure
    .input(z.object({
      event: z.enum([
        "OS_CRIADA",
        "OS_PRONTA",
        "OS_ASSINADA",
        "OS_ENTREGUE",
        "ORCAMENTO_ENVIADO",
        "VENDA_FINALIZADA",
        "COBRANCA_VENCIDA",
        "CAIXA_FECHADO",
      ]),
      emailEnabled: z.boolean(),
      whatsappEnabled: z.boolean(),
      template: z.string().max(2000).nullable().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerentes e proprietários podem alterar notificações" });
      }
      return ctx.withTenant(async (tx) => {
        const before = await tx.notificationConfig.findUnique({
          where: { tenantId_event: { tenantId: ctx.tenantId, event: input.event } },
        });
        const updated = await tx.notificationConfig.upsert({
          where: { tenantId_event: { tenantId: ctx.tenantId, event: input.event } },
          create: {
            tenantId: ctx.tenantId,
            event: input.event,
            emailEnabled: input.emailEnabled,
            whatsappEnabled: input.whatsappEnabled,
            template: input.template ?? null,
            active: input.active ?? true,
          },
          update: {
            emailEnabled: input.emailEnabled,
            whatsappEnabled: input.whatsappEnabled,
            template: input.template ?? null,
            active: input.active ?? true,
          },
        });
        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: before ? "updated" : "created",
          entity: "notification_config",
          entityId: updated.id,
          payload: { event: input.event, emailEnabled: input.emailEnabled, whatsappEnabled: input.whatsappEnabled },
        });
        return updated;
      });
    }),

  toggleNotificationConfig: tenantProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.notificationConfig.update({
          where: { id: input.id },
          data: { active: input.active },
        });
      });
    }),
});
