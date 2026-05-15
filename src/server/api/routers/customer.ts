import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersSchema,
  normalizeCnpj,
} from "@/lib/validators/customer";
import { normalizeCpf } from "@/lib/validators/cpf";

export const customerRouter = createTRPCRouter({
  // SPEC 4.1: List customers with pagination, search, soft-delete filter
  list: tenantProcedure
    .input(listCustomersSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20; // SPEC: 20 per page
      const sortBy = input.sortBy ?? "name";
      const sortOrder = input.sortOrder ?? "asc";

      return ctx.withTenant(async (tx) => {
        const where: Record<string, unknown> = {};

        // SPEC RN-7: default filter deletedAt IS NULL
        if (!input.includeDeleted) {
          where.deletedAt = null;
        }

        // Filter by type
        if (input.type && input.type !== "ALL") {
          where.type = input.type;
        }

        // SPEC RN-6: search removes punctuation before comparing
        if (input.search && input.search.trim()) {
          const term = input.search.trim();
          const digitsTerm = term.replace(/\D/g, "");

          const orConditions: Record<string, unknown>[] = [
            { name: { contains: term, mode: "insensitive" } },
          ];

          if (digitsTerm.length > 0) {
            orConditions.push({ cpf: { contains: digitsTerm } });
            orConditions.push({ cnpj: { contains: digitsTerm } });
            orConditions.push({ phone: { contains: digitsTerm } });
          }

          if (term.includes("@")) {
            orConditions.push({ email: { contains: term, mode: "insensitive" } });
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

  // SPEC 4.2: Get customer by ID
  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.id },
        });

        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
        }

        // SPEC 4.2: count service orders
        let serviceOrderCount = 0;
        try {
          serviceOrderCount = await tx.serviceOrder.count({
            where: { customerId: input.id },
          });
        } catch {
          // table may not exist yet
        }

        return { ...customer, serviceOrderCount };
      });
    }),

  // SPEC Fluxo 1/2: Create customer
  create: tenantProcedure
    .input(createCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // SPEC RN-4/5: normalize to digits only
        const cpf = input.cpf ? normalizeCpf(input.cpf) : null;
        const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;

        // SPEC RN-1: check uniqueness among non-deleted (partial unique index)
        if (cpf) {
          const existing = await tx.customer.findFirst({
            where: { cpf, deletedAt: null },
          });
          if (existing) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Já existe cliente com este CPF",
            });
          }
        }

        if (cnpj) {
          const existing = await tx.customer.findFirst({
            where: { cnpj, deletedAt: null },
          });
          if (existing) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Já existe cliente com este CNPJ",
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
            tradeName: input.type === "PJ" ? (input.tradeName || null) : null,
            birthDate: input.type === "PF" ? birthDate : null,
            phone: input.phone,
            phoneSecondary: input.phoneSecondary || null,
            email: input.email || null,
            zipCode: input.zipCode || null,
            street: input.street || null,
            streetNumber: input.streetNumber || null,
            complement: input.complement || null,
            neighborhood: input.neighborhood || null,
            city: input.city || null,
            state: input.state || null,
            notes: input.notes || null,
            createdById: ctx.session.user.id,
          },
        });

        return customer;
      });
    }),

  // SPEC Fluxo 3: Update customer
  update: tenantProcedure
    .input(updateCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.customer.findUnique({
          where: { id: input.id },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
        }

        const cpf = input.cpf ? normalizeCpf(input.cpf) : null;
        const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;

        // SPEC RN-1: uniqueness excluding self
        if (cpf) {
          const dup = await tx.customer.findFirst({
            where: { cpf, deletedAt: null, id: { not: input.id } },
          });
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Já existe cliente com este CPF",
            });
          }
        }

        if (cnpj) {
          const dup = await tx.customer.findFirst({
            where: { cnpj, deletedAt: null, id: { not: input.id } },
          });
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Já existe cliente com este CNPJ",
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
            tradeName: input.type === "PJ" ? (input.tradeName || null) : null,
            birthDate: input.type === "PF" ? birthDate : null,
            phone: input.phone,
            phoneSecondary: input.phoneSecondary || null,
            email: input.email || null,
            zipCode: input.zipCode || null,
            street: input.street || null,
            streetNumber: input.streetNumber || null,
            complement: input.complement || null,
            neighborhood: input.neighborhood || null,
            city: input.city || null,
            state: input.state || null,
            notes: input.notes || null,
          },
        });

        return customer;
      });
    }),

  // SPEC Fluxo 4: Soft delete (ADR 0008: manager/owner only)
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // SPEC 6: RBAC — soft delete requires manager or owner
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || !["manager", "owner", "admin"].includes(userRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas gerentes e proprietários podem excluir clientes",
        });
      }

      return ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.id },
        });
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
        }

        await tx.customer.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });

        return { success: true };
      });
    }),

  // SPEC Fluxo 4: Restore (ADR 0008: manager/owner only)
  restore: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || !["manager", "owner", "admin"].includes(userRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas gerentes e proprietários podem restaurar clientes",
        });
      }

      return ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.id },
        });
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
        }

        await tx.customer.update({
          where: { id: input.id },
          data: { deletedAt: null },
        });

        return { success: true };
      });
    }),
});
