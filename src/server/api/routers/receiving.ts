import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, tenantAdminProcedure } from "@/server/api/trpc";
import {
  createReceivingAccountSchema,
  updateReceivingAccountSchema,
  createAcquirerSchema,
  updateAcquirerSchema,
  createCardBrandSchema,
  updateCardBrandSchema,
  toggleActiveSchema,
  upsertAcquirerRatesSchema,
  previewCardSettlementSchema,
} from "@/lib/validators/receiving";
import { computeCardSettlement } from "@/server/services/card-receivable.service";

/** Decimal(10,2) em reais -> centavos inteiros. */
function reaisToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToReais(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const receivingRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // RECEIVING ACCOUNTS (contas de recebimento)
  // ═══════════════════════════════════════

  accounts: createTRPCRouter({
    list: tenantProcedure.query(async ({ ctx }) => {
      return ctx.withTenant(async (tx) => {
        const accounts = await tx.receivingAccount.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
        });
        return accounts.map(serializeAccount);
      });
    }),

    create: tenantAdminProcedure
      .input(createReceivingAccountSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          if (input.isDefault) {
            await tx.receivingAccount.updateMany({
              where: { tenantId: ctx.tenantId, isDefault: true },
              data: { isDefault: false },
            });
          }
          const account = await tx.receivingAccount.create({
            data: {
              tenantId: ctx.tenantId,
              name: input.name,
              type: input.type,
              bankName: input.bankName ?? null,
              agency: input.agency ?? null,
              accountNumber: input.accountNumber ?? null,
              pixKey: input.pixKey ?? null,
              isDefault: input.isDefault ?? false,
            },
          });
          return serializeAccount(account);
        });
      }),

    update: tenantAdminProcedure
      .input(updateReceivingAccountSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          const { id, isDefault, ...rest } = input;
          await assertOwned(tx, "receivingAccount", id, ctx.tenantId);
          if (isDefault) {
            await tx.receivingAccount.updateMany({
              where: { tenantId: ctx.tenantId, isDefault: true, NOT: { id } },
              data: { isDefault: false },
            });
          }
          const account = await tx.receivingAccount.update({
            where: { id },
            data: {
              ...(rest.name !== undefined ? { name: rest.name } : {}),
              ...(rest.type !== undefined ? { type: rest.type } : {}),
              ...(rest.bankName !== undefined ? { bankName: rest.bankName ?? null } : {}),
              ...(rest.agency !== undefined ? { agency: rest.agency ?? null } : {}),
              ...(rest.accountNumber !== undefined ? { accountNumber: rest.accountNumber ?? null } : {}),
              ...(rest.pixKey !== undefined ? { pixKey: rest.pixKey ?? null } : {}),
              ...(isDefault !== undefined ? { isDefault } : {}),
            },
          });
          return serializeAccount(account);
        });
      }),

    toggle: tenantAdminProcedure
      .input(toggleActiveSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          await assertOwned(tx, "receivingAccount", input.id, ctx.tenantId);
          const account = await tx.receivingAccount.update({
            where: { id: input.id },
            data: { active: input.active },
          });
          return serializeAccount(account);
        });
      }),
  }),

  // ═══════════════════════════════════════
  // ACQUIRERS (adquirentes)
  // ═══════════════════════════════════════

  acquirers: createTRPCRouter({
    list: tenantProcedure.query(async ({ ctx }) => {
      return ctx.withTenant(async (tx) => {
        const acquirers = await tx.acquirer.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
        });
        return acquirers.map(serializeAcquirer);
      });
    }),

    create: tenantAdminProcedure
      .input(createAcquirerSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          if (input.receivingAccountId) {
            await assertOwned(tx, "receivingAccount", input.receivingAccountId, ctx.tenantId);
          }
          const acquirer = await tx.acquirer.create({
            data: {
              tenantId: ctx.tenantId,
              name: input.name,
              receivingAccountId: input.receivingAccountId ?? null,
            },
          });
          return serializeAcquirer(acquirer);
        });
      }),

    update: tenantAdminProcedure
      .input(updateAcquirerSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          const { id, receivingAccountId, name } = input;
          await assertOwned(tx, "acquirer", id, ctx.tenantId);
          if (receivingAccountId) {
            await assertOwned(tx, "receivingAccount", receivingAccountId, ctx.tenantId);
          }
          const acquirer = await tx.acquirer.update({
            where: { id },
            data: {
              ...(name !== undefined ? { name } : {}),
              ...(receivingAccountId !== undefined ? { receivingAccountId: receivingAccountId ?? null } : {}),
            },
          });
          return serializeAcquirer(acquirer);
        });
      }),

    toggle: tenantAdminProcedure
      .input(toggleActiveSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          await assertOwned(tx, "acquirer", input.id, ctx.tenantId);
          const acquirer = await tx.acquirer.update({
            where: { id: input.id },
            data: { active: input.active },
          });
          return serializeAcquirer(acquirer);
        });
      }),
  }),

  // ═══════════════════════════════════════
  // CARD BRANDS (bandeiras)
  // ═══════════════════════════════════════

  brands: createTRPCRouter({
    list: tenantProcedure.query(async ({ ctx }) => {
      return ctx.withTenant(async (tx) => {
        const brands = await tx.cardBrand.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
        });
        return brands.map(serializeBrand);
      });
    }),

    create: tenantAdminProcedure
      .input(createCardBrandSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          const brand = await tx.cardBrand.create({
            data: { tenantId: ctx.tenantId, name: input.name },
          });
          return serializeBrand(brand);
        });
      }),

    update: tenantAdminProcedure
      .input(updateCardBrandSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          await assertOwned(tx, "cardBrand", input.id, ctx.tenantId);
          const brand = await tx.cardBrand.update({
            where: { id: input.id },
            data: { ...(input.name !== undefined ? { name: input.name } : {}) },
          });
          return serializeBrand(brand);
        });
      }),

    toggle: tenantAdminProcedure
      .input(toggleActiveSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          await assertOwned(tx, "cardBrand", input.id, ctx.tenantId);
          const brand = await tx.cardBrand.update({
            where: { id: input.id },
            data: { active: input.active },
          });
          return serializeBrand(brand);
        });
      }),
  }),

  // ═══════════════════════════════════════
  // ACQUIRER RATES (taxas por adquirente×bandeira×tipo×parcela)
  // ═══════════════════════════════════════

  rates: createTRPCRouter({
    /** Lista as taxas de uma adquirente. */
    listByAcquirer: tenantProcedure
      .input(z.object({ acquirerId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          await assertOwned(tx, "acquirer", input.acquirerId, ctx.tenantId);
          const rates = await tx.acquirerRate.findMany({
            where: { acquirerId: input.acquirerId },
            orderBy: [{ cardBrandId: "asc" }, { kind: "asc" }, { installments: "asc" }],
          });
          return rates.map(serializeRate);
        });
      }),

    /** Replace-all das taxas de uma adquirente. Idempotente. */
    upsert: tenantAdminProcedure
      .input(upsertAcquirerRatesSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          await assertOwned(tx, "acquirer", input.acquirerId, ctx.tenantId);
          // Valida bandeiras do tenant.
          const brandIds = [...new Set(input.rates.map((r) => r.cardBrandId))];
          if (brandIds.length > 0) {
            const found = await tx.cardBrand.count({
              where: { id: { in: brandIds }, tenantId: ctx.tenantId },
            });
            if (found !== brandIds.length) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Bandeira inválida" });
            }
          }
          await tx.acquirerRate.deleteMany({ where: { acquirerId: input.acquirerId } });
          if (input.rates.length > 0) {
            await tx.acquirerRate.createMany({
              data: input.rates.map((r) => ({
                tenantId: ctx.tenantId,
                acquirerId: input.acquirerId,
                cardBrandId: r.cardBrandId,
                kind: r.kind,
                installments: r.installments,
                feePercent: new Prisma.Decimal(r.feePercent),
                feeFixed: centsToReais(r.feeFixed),
                settlementDays: r.settlementDays,
              })),
            });
          }
          const rates = await tx.acquirerRate.findMany({
            where: { acquirerId: input.acquirerId },
            orderBy: [{ cardBrandId: "asc" }, { kind: "asc" }, { installments: "asc" }],
          });
          return rates.map(serializeRate);
        });
      }),
  }),

  /**
   * Preview da liquidação de cartão: dado adquirente+bandeira+tipo+parcela e o
   * valor bruto, devolve taxa, líquido e data de liquidação esperada.
   * Espelha settings.previewPaymentBreakdown.
   */
  previewCardSettlement: tenantProcedure
    .input(previewCardSettlementSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const rate = await tx.acquirerRate.findFirst({
          where: {
            tenantId: ctx.tenantId,
            acquirerId: input.acquirerId,
            cardBrandId: input.cardBrandId,
            kind: input.kind,
            installments: input.installments,
            active: true,
          },
        });
        if (!rate) {
          return {
            found: false as const,
            grossCents: input.grossCents,
            feeCents: 0,
            netCents: input.grossCents,
            settlementDate: null,
          };
        }
        const settlement = computeCardSettlement(
          {
            feePercent: Number(rate.feePercent),
            feeFixed: reaisToCents(rate.feeFixed),
            settlementDays: rate.settlementDays,
          },
          input.grossCents,
          new Date(),
        );
        return {
          found: true as const,
          grossCents: settlement.grossCents,
          feeCents: settlement.feeCents,
          netCents: settlement.netCents,
          settlementDate: settlement.settlementDate,
        };
      });
    }),
});

// ── Ownership guard (defesa em profundidade além do RLS) ──

type OwnedModel = "receivingAccount" | "acquirer" | "cardBrand";

async function assertOwned(
  tx: {
    receivingAccount: { findFirst: (a: object) => Promise<{ id: string } | null> };
    acquirer: { findFirst: (a: object) => Promise<{ id: string } | null> };
    cardBrand: { findFirst: (a: object) => Promise<{ id: string } | null> };
  },
  model: OwnedModel,
  id: string,
  tenantId: string,
): Promise<void> {
  const found = await tx[model].findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!found) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });
  }
}

// ── Serializers (não expõe Decimal cru ao cliente) ──

interface AccountRow {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  agency: string | null;
  accountNumber: string | null;
  pixKey: string | null;
  active: boolean;
  isDefault: boolean;
}

function serializeAccount(a: AccountRow) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    bankName: a.bankName,
    agency: a.agency,
    accountNumber: a.accountNumber,
    pixKey: a.pixKey,
    active: a.active,
    isDefault: a.isDefault,
  };
}

interface AcquirerRow {
  id: string;
  name: string;
  active: boolean;
  receivingAccountId: string | null;
}

function serializeAcquirer(a: AcquirerRow) {
  return {
    id: a.id,
    name: a.name,
    active: a.active,
    receivingAccountId: a.receivingAccountId,
  };
}

interface BrandRow {
  id: string;
  name: string;
  active: boolean;
}

function serializeBrand(b: BrandRow) {
  return { id: b.id, name: b.name, active: b.active };
}

interface RateRow {
  id: string;
  acquirerId: string;
  cardBrandId: string;
  kind: string;
  installments: number;
  feePercent: Prisma.Decimal;
  feeFixed: Prisma.Decimal;
  settlementDays: number;
  active: boolean;
}

function serializeRate(r: RateRow) {
  return {
    id: r.id,
    acquirerId: r.acquirerId,
    cardBrandId: r.cardBrandId,
    kind: r.kind,
    installments: r.installments,
    feePercent: Number(r.feePercent),
    feeFixedCents: reaisToCents(r.feeFixed),
    settlementDays: r.settlementDays,
    active: r.active,
  };
}
