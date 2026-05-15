import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersSchema,
  createInterestSchema,
  updateInterestSchema,
  normalizeCnpj,
} from "@/lib/validators/customer";
import { normalizeCpf } from "@/lib/validators/cpf";

export const customerRouter = createTRPCRouter({
  /** List customers with pagination, search, and type filter */
  list: tenantProcedure
    .input(listCustomersSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 10;
      const sortBy = input.sortBy ?? "name";
      const sortOrder = input.sortOrder ?? "asc";

      return ctx.withTenant(async (tx) => {
        const where: Record<string, unknown> = {};

        // Filter deleted
        if (!input.includeDeleted) {
          where.deletedAt = null;
        }

        // Filter by type
        if (input.type && input.type !== "ALL") {
          where.type = input.type;
        }

        // Search
        if (input.search && input.search.trim()) {
          const term = input.search.trim();
          const digitsTerm = term.replace(/\D/g, "");

          const orConditions: Record<string, unknown>[] = [
            { name: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ];

          if (digitsTerm.length > 0) {
            orConditions.push({ cpf: { contains: digitsTerm } });
            orConditions.push({ cnpj: { contains: digitsTerm } });
            orConditions.push({ phone: { contains: digitsTerm } });
          }

          where.OR = orConditions;
        }

        const [data, total] = await Promise.all([
          tx.customer.findMany({
            where,
            orderBy: { [sortBy]: sortOrder },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.customer.count({ where }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get customer by ID with interests and OS count */
  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.id },
          include: {
            interests: {
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        }

        // Count service orders for this customer
        let serviceOrderCount = 0;
        try {
          serviceOrderCount = await tx.serviceOrder.count({
            where: { customerId: input.id },
          });
        } catch {
          // serviceOrder table may not exist yet
        }

        return { ...customer, serviceOrderCount };
      });
    }),

  /** Create a new customer */
  create: tenantProcedure
    .input(createCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Normalize CPF/CNPJ
        const cpf = input.cpf ? normalizeCpf(input.cpf) : null;
        const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;

        // Check uniqueness of CPF
        if (cpf) {
          const existing = await tx.customer.findFirst({
            where: { cpf, deletedAt: null },
          });
          if (existing) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Ja existe um cliente com este CPF",
            });
          }
        }

        // Check uniqueness of CNPJ
        if (cnpj) {
          const existing = await tx.customer.findFirst({
            where: { cnpj, deletedAt: null },
          });
          if (existing) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Ja existe um cliente com este CNPJ",
            });
          }
        }

        // Parse birthDate
        let birthDate: Date | null = null;
        if (input.birthDate && input.birthDate.trim()) {
          birthDate = new Date(input.birthDate);
          if (isNaN(birthDate.getTime())) {
            birthDate = null;
          }
        }

        const customer = await tx.customer.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            name: input.name,
            cpf,
            cnpj,
            email: input.email || null,
            phone: input.phone || null,
            phone2: input.phone2 || null,
            birthDate,
            address: input.address ?? undefined,
            notes: input.notes || null,
            consentAt: input.consentLgpd ? new Date() : null,
          },
        });

        return customer;
      });
    }),

  /** Update an existing customer */
  update: tenantProcedure
    .input(updateCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.customer.findUnique({
          where: { id: input.id },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        }

        const cpf = input.cpf ? normalizeCpf(input.cpf) : null;
        const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;

        // Check CPF uniqueness (exclude self)
        if (cpf) {
          const dup = await tx.customer.findFirst({
            where: { cpf, deletedAt: null, id: { not: input.id } },
          });
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Ja existe um cliente com este CPF",
            });
          }
        }

        // Check CNPJ uniqueness (exclude self)
        if (cnpj) {
          const dup = await tx.customer.findFirst({
            where: { cnpj, deletedAt: null, id: { not: input.id } },
          });
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Ja existe um cliente com este CNPJ",
            });
          }
        }

        let birthDate: Date | null = null;
        if (input.birthDate && input.birthDate.trim()) {
          birthDate = new Date(input.birthDate);
          if (isNaN(birthDate.getTime())) {
            birthDate = null;
          }
        }

        const customer = await tx.customer.update({
          where: { id: input.id },
          data: {
            type: input.type,
            name: input.name,
            cpf,
            cnpj,
            email: input.email || null,
            phone: input.phone || null,
            phone2: input.phone2 || null,
            birthDate,
            address: input.address ?? undefined,
            notes: input.notes || null,
            consentAt: input.consentLgpd ? (existing.consentAt ?? new Date()) : null,
          },
        });

        return customer;
      });
    }),

  /** Soft-delete a customer */
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.id },
        });
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        }

        await tx.customer.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });

        return { success: true };
      });
    }),

  /** Restore a soft-deleted customer */
  restore: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.id },
        });
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        }

        await tx.customer.update({
          where: { id: input.id },
          data: { deletedAt: null },
        });

        return { success: true };
      });
    }),

  // ── Interests ──

  /** List interests for a customer */
  listInterests: tenantProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customerInterest.findMany({
          where: { customerId: input.customerId },
          orderBy: { createdAt: "desc" },
        });
      });
    }),

  /** Create a new interest */
  createInterest: tenantProcedure
    .input(createInterestSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Verify customer exists
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
        });
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        }

        let followUpAt: Date | null = null;
        if (input.followUpAt && input.followUpAt.trim()) {
          followUpAt = new Date(input.followUpAt);
          if (isNaN(followUpAt.getTime())) {
            followUpAt = null;
          }
        }

        return tx.customerInterest.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: input.customerId,
            description: input.description,
            followUpAt,
          },
        });
      });
    }),

  /** Update an interest */
  updateInterest: tenantProcedure
    .input(updateInterestSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.customerInterest.findUnique({
          where: { id: input.id },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse nao encontrado" });
        }

        const data: Record<string, unknown> = {};

        if (input.description !== undefined) {
          data.description = input.description;
        }

        if (input.resolved !== undefined) {
          data.resolved = input.resolved;
        }

        if (input.followUpAt !== undefined) {
          if (input.followUpAt === null) {
            data.followUpAt = null;
          } else if (input.followUpAt.trim()) {
            const date = new Date(input.followUpAt);
            data.followUpAt = isNaN(date.getTime()) ? null : date;
          }
        }

        return tx.customerInterest.update({
          where: { id: input.id },
          data,
        });
      });
    }),

  /** Delete an interest */
  deleteInterest: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.customerInterest.findUnique({
          where: { id: input.id },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse nao encontrado" });
        }

        await tx.customerInterest.delete({
          where: { id: input.id },
        });

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // CPF/CNPJ LOOKUP
  // ═══════════════════════════════════════

  /** Lookup CPF via DirectD API */
  lookupCpf: tenantProcedure
    .input(z.object({ cpf: z.string().min(11).max(14) }))
    .query(async ({ ctx, input }) => {
      const digits = input.cpf.replace(/\D/g, "");
      if (digits.length !== 11) {
        return { found: false, error: "CPF invalido" };
      }

      // Check if already registered
      const existing = await ctx.withTenant(async (tx) => {
        return tx.customer.findFirst({
          where: { cpf: digits, deletedAt: null },
          select: { id: true, name: true },
        });
      });

      if (existing) {
        return {
          found: false,
          alreadyRegistered: true,
          error: "Este CPF ja esta cadastrado no sistema",
          customer: existing,
        };
      }

      // Call DirectD API
      const token = process.env.DIRECTD_TOKEN;
      if (!token) {
        return { found: false, lookupUnavailable: true };
      }

      try {
        const url = `https://apiv3.directd.com.br/api/ReceitaFederalPessoaFisica?Cpf=${digits}&Token=${token}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
          return { found: false, error: "Erro na consulta" };
        }

        const data = await response.json();
        if (data?.nome) {
          return {
            found: true,
            name: data.nome as string,
            birthDate: (data.dataNascimento ?? null) as string | null,
            situation: (data.situacao ?? null) as string | null,
          };
        }

        return { found: false, error: "CPF nao encontrado na Receita Federal" };
      } catch {
        return { found: false, error: "Timeout na consulta" };
      }
    }),

  /** Lookup CNPJ via DirectD API */
  lookupCnpj: tenantProcedure
    .input(z.object({ cnpj: z.string().min(14).max(18) }))
    .query(async ({ ctx, input }) => {
      const digits = input.cnpj.replace(/\D/g, "");
      if (digits.length !== 14) {
        return { found: false, error: "CNPJ invalido" };
      }

      // Check if already registered
      const existing = await ctx.withTenant(async (tx) => {
        return tx.customer.findFirst({
          where: { cnpj: digits, deletedAt: null },
          select: { id: true, name: true },
        });
      });

      if (existing) {
        return {
          found: false,
          alreadyRegistered: true,
          error: "Este CNPJ ja esta cadastrado no sistema",
          customer: existing,
        };
      }

      // Call DirectD API
      const token = process.env.DIRECTD_TOKEN;
      if (!token) {
        return { found: false, lookupUnavailable: true };
      }

      try {
        const url = `https://apiv3.directd.com.br/api/ReceitaFederalPessoaJuridica?Cnpj=${digits}&Token=${token}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
          return { found: false, error: "Erro na consulta" };
        }

        const data = await response.json();
        if (data?.razaoSocial || data?.nomeFantasia) {
          return {
            found: true,
            razaoSocial: (data.razaoSocial ?? null) as string | null,
            nomeFantasia: (data.nomeFantasia ?? null) as string | null,
            situacao: (data.situacao ?? null) as string | null,
            endereco: data.endereco ?? null,
            telefone: (data.telefone ?? null) as string | null,
            email: (data.email ?? null) as string | null,
          };
        }

        return { found: false, error: "CNPJ nao encontrado na Receita Federal" };
      } catch {
        return { found: false, error: "Timeout na consulta" };
      }
    }),
});
