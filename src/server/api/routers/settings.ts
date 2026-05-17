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

  updateGeneral: tenantProcedure
    .input(updateGeneralSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner" && userRole !== "manager") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerentes e proprietários podem alterar configurações gerais" });
      }
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
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem alterar formas de pagamento" });
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
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem alterar formas de pagamento" });
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
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem alterar formas de pagamento" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.paymentMethod.delete({
          where: { id: input.id },
        });
      });
    }),

  upsertInstallmentRules: tenantProcedure
    .input(upsertInstallmentRulesSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem alterar regras de parcelamento" });
      }
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
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner") {
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
        enabled: input.habilitado,
        autoIssue: input.emitirNfAutomatico,
      };
      // Remove undefined values
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined)
      );
      return ctx.withTenant(async (tx) => {
        return tx.tenantFiscalSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...cleanData },
          update: cleanData,
        });
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
          data: { passwordHash: hashSync(input.newPassword, 10) },
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

  updateAssistance: tenantProcedure
    .input(z.object({
      termsOfService: z.string().optional(),
      warrantyPolicy: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner" && userRole !== "manager") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerentes e proprietários podem alterar configurações de assistência" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.tenantAssistanceSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...input },
          update: input,
        });
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
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem alterar configurações de recebimento" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.tenantReceivingSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...input },
          update: input,
        });
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
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas proprietários podem gerenciar certificados" });
      }

      const { encryptPfx } = await import("@/server/services/pfx-encryption.service");
      const { randomUUID } = await import("node:crypto");

      // Decode base64
      const pfxBuffer = Buffer.from(input.pfxBase64, "base64");
      if (pfxBuffer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo de certificado vazio" });
      }

      // Encrypt
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

      // Update fiscal settings
      return ctx.withTenant(async (tx) => {
        return tx.tenantFiscalSettings.upsert({
          where: { tenantId: ctx.tenantId },
          create: {
            tenantId: ctx.tenantId,
            certificateUrl,
            certificateIv: iv,
            certificateAuthTag: authTag,
            certificateUploadedAt: new Date(),
          },
          update: {
            certificateUrl,
            certificateIv: iv,
            certificateAuthTag: authTag,
            certificateUploadedAt: new Date(),
          },
        });
      });
    }),

  /** Remove certificate (Owner only) */
  removeFiscalCertificate: tenantProcedure
    .mutation(async ({ ctx }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (userRole !== "owner") {
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
});
