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
  listCardReceivablesSchema,
  settleCardReceivablesSchema,
  unsettleCardReceivablesSchema,
} from "@/lib/validators/receiving";
import {
  computeCardSettlement,
  reconciliationDifference,
  resolveAcquirerRate,
} from "@/server/services/card-receivable.service";

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
        // Fonte unica da taxa (mesma do breakdown da venda e do recebivel).
        const rate = await resolveAcquirerRate(tx, ctx.tenantId, {
          acquirerId: input.acquirerId,
          cardBrandId: input.cardBrandId,
          kind: input.kind,
          installments: input.installments,
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
        const settlement = computeCardSettlement(rate, input.grossCents, new Date());
        return {
          found: true as const,
          grossCents: settlement.grossCents,
          feeCents: settlement.feeCents,
          netCents: settlement.netCents,
          settlementDate: settlement.settlementDate,
        };
      });
    }),

  // ═══════════════════════════════════════
  // CARD RECEIVABLES (recebíveis de cartão — visão)
  // ═══════════════════════════════════════

  cardReceivables: createTRPCRouter({
    /**
     * Lista recebíveis de cartão com filtro (status, adquirente, intervalo de
     * data de liquidação) + totais (bruto/taxa/líquido) e agregação por
     * adquirente. Página os itens; os totais cobrem o filtro inteiro.
     */
    list: tenantProcedure
      .input(listCardReceivablesSchema)
      .query(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          const where: Prisma.CardReceivableWhereInput = {
            tenantId: ctx.tenantId,
            status: input.status,
            ...(input.acquirerId ? { acquirerId: input.acquirerId } : {}),
          };
          if (input.dateFrom || input.dateTo) {
            const range: Prisma.DateTimeFilter = {};
            if (input.dateFrom) range.gte = new Date(input.dateFrom);
            if (input.dateTo) {
              const end = new Date(input.dateTo);
              end.setHours(23, 59, 59, 999);
              range.lte = end;
            }
            where.expectedSettlementDate = range;
          }
          // Relatório de divergências: só liquidados com diferença != 0.
          if (input.onlyDivergent) {
            where.settledDifference = { not: 0 };
          }

          const [items, total, totals, byAcquirerRaw, acquirers, brands] = await Promise.all([
            tx.cardReceivable.findMany({
              where,
              orderBy: { expectedSettlementDate: "asc" },
              skip: input.page * input.pageSize,
              take: input.pageSize,
            }),
            tx.cardReceivable.count({ where }),
            tx.cardReceivable.aggregate({
              where,
              _sum: {
                grossAmount: true,
                feeAmount: true,
                netAmount: true,
                settledNetAmount: true,
                settledDifference: true,
              },
            }),
            tx.cardReceivable.groupBy({
              by: ["acquirerId"],
              where,
              _sum: { netAmount: true },
              _count: { _all: true },
            }),
            tx.acquirer.findMany({
              where: { tenantId: ctx.tenantId },
              select: { id: true, name: true },
            }),
            tx.cardBrand.findMany({
              where: { tenantId: ctx.tenantId },
              select: { id: true, name: true },
            }),
          ]);

          const acquirerName = new Map(acquirers.map((a) => [a.id, a.name]));
          const brandName = new Map(brands.map((b) => [b.id, b.name]));

          return {
            data: items.map((r) => ({
              id: r.id,
              saleId: r.saleId,
              serviceOrderId: r.serviceOrderId,
              acquirerId: r.acquirerId,
              acquirerName: acquirerName.get(r.acquirerId) ?? "Adquirente",
              cardBrandId: r.cardBrandId,
              cardBrandName: brandName.get(r.cardBrandId) ?? "Bandeira",
              kind: r.kind,
              installmentNumber: r.installmentNumber,
              installmentsTotal: r.installmentsTotal,
              grossCents: reaisToCents(r.grossAmount),
              feeCents: reaisToCents(r.feeAmount),
              netCents: reaisToCents(r.netAmount),
              expectedSettlementDate: r.expectedSettlementDate,
              status: r.status,
              settledAt: r.settledAt,
              settledNetCents: r.settledNetAmount != null ? reaisToCents(r.settledNetAmount) : null,
              settledDifferenceCents:
                r.settledDifference != null ? reaisToCents(r.settledDifference) : null,
            })),
            total,
            pageCount: Math.ceil(total / input.pageSize),
            summary: {
              grossCents: reaisToCents(totals._sum.grossAmount),
              feeCents: reaisToCents(totals._sum.feeAmount),
              netCents: reaisToCents(totals._sum.netAmount),
              settledNetCents: reaisToCents(totals._sum.settledNetAmount),
              settledDifferenceCents: reaisToCents(totals._sum.settledDifference),
            },
            byAcquirer: byAcquirerRaw.map((g) => ({
              acquirerId: g.acquirerId,
              acquirerName: acquirerName.get(g.acquirerId) ?? "Adquirente",
              count: g._count._all,
              netCents: reaisToCents(g._sum.netAmount),
            })),
          };
        });
      }),

    /**
     * Concilia (settle) um ou mais recebíveis PENDING contra o extrato da
     * adquirente. Para cada item, grava o líquido REAL recebido e a diferença
     * vs. o esperado (settledNet − netAmount). Idempotente: só toca PENDING.
     * Operador concilia (tenantProcedure); audit registra a ação.
     */
    settle: tenantProcedure
      .input(settleCardReceivablesSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          const settledAt = input.settledDate ? new Date(input.settledDate) : new Date();
          const ids = input.items.map((i) => i.id);

          // Carrega só os PENDING do tenant entre os ids pedidos (defesa em
          // profundidade além do RLS; ignora os que já não estão PENDING).
          const pending = await tx.cardReceivable.findMany({
            where: { id: { in: ids }, tenantId: ctx.tenantId, status: "PENDING" },
            select: { id: true, netAmount: true, receivingAccountId: true },
          });
          const pendingById = new Map(pending.map((p) => [p.id, p]));

          let settledCount = 0;
          let divergentCount = 0;
          let totalNetCents = 0;
          let totalDifferenceCents = 0;

          for (const item of input.items) {
            const row = pendingById.get(item.id);
            if (!row) continue; // não-PENDING ou de outro tenant — pula
            const expectedNetCents = reaisToCents(row.netAmount);
            const { differenceCents } = reconciliationDifference(
              expectedNetCents,
              item.settledNetCents,
            );
            await tx.cardReceivable.update({
              where: { id: item.id },
              data: {
                status: "SETTLED",
                settledAt,
                settledNetAmount: centsToReais(item.settledNetCents),
                settledDifference: centsToReais(differenceCents),
                settledAccountId: input.accountId ?? row.receivingAccountId,
                settledByUserId: ctx.session.user.id,
                settlementNote: input.note ?? null,
              },
            });
            settledCount++;
            totalNetCents += item.settledNetCents;
            totalDifferenceCents += differenceCents;
            if (differenceCents !== 0) divergentCount++;
          }

          const { logAudit } = await import("@/server/services/audit-log.service");
          await logAudit(tx as never, {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            action: "card_receivable_settle",
            entity: "card_receivable",
            payload: { settledCount, divergentCount, totalNetCents, totalDifferenceCents, ids },
          });

          return { settledCount, divergentCount, totalNetCents, totalDifferenceCents };
        });
      }),

    /**
     * Desfaz a conciliação (volta SETTLED → PENDING e limpa os campos).
     * Só gestor (tenantAdminProcedure) — corrige engano de conciliação.
     */
    unsettle: tenantAdminProcedure
      .input(unsettleCardReceivablesSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.withTenant(async (tx) => {
          const result = await tx.cardReceivable.updateMany({
            where: { id: { in: input.ids }, tenantId: ctx.tenantId, status: "SETTLED" },
            data: {
              status: "PENDING",
              settledAt: null,
              settledNetAmount: null,
              settledDifference: null,
              settledAccountId: null,
              settledByUserId: null,
              settlementNote: null,
            },
          });

          const { logAudit } = await import("@/server/services/audit-log.service");
          await logAudit(tx as never, {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            action: "card_receivable_unsettle",
            entity: "card_receivable",
            payload: { count: result.count, ids: input.ids },
          });

          return { unsettledCount: result.count };
        });
      }),
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
