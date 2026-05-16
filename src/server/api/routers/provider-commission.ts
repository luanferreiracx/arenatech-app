import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  createProviderSchema,
  updateProviderSchema,
  listProvidersSchema,
  createContractSchema,
  updateProviderRulesSchema,
  apurarProviderSchema,
  closeApuracaoSchema,
  createReversalSchema,
  deleteReversalSchema,
  toggleUncoveredDaySchema,
  getProviderDetailSchema,
} from "@/lib/validators/provider-commission";
import { logger } from "@/lib/logger";

// ── Helpers ──

function decimalToNumber(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

/**
 * Progressive bracket calculation.
 * Each portion of the base is taxed at the bracket's rate.
 */
function applyProgressiveBrackets(
  baseTotal: number,
  rules: Array<{ rangeMin: number; rangeMax: number | null; rate: number }>,
): number {
  let commission = 0;

  for (const rule of rules) {
    const cap = rule.rangeMax ?? Number.MAX_SAFE_INTEGER;
    const topApplicable = Math.min(baseTotal, cap);
    const portion = Math.max(0, topApplicable - rule.rangeMin);
    if (portion <= 0) continue;

    commission += portion * (rule.rate / 100);
  }

  return Math.round(commission * 100) / 100;
}

export const providerCommissionRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // PROVIDERS CRUD
  // ═══════════════════════════════════════

  listProviders: tenantProcedure
    .input(listProvidersSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ProviderWhereInput = {};
        if (input.active !== undefined) where.active = input.active;
        if (input.profile) where.profile = input.profile;
        if (input.bondType) where.bondType = input.bondType;

        const providers = await tx.provider.findMany({
          where,
          include: {
            contracts: {
              orderBy: { startDate: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
        });

        // Fetch user names
        const userIds = providers.map((p) => p.userId);
        let userNames: Record<string, string> = {};
        if (userIds.length > 0) {
          const users = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true },
            });
          });
          userNames = Object.fromEntries(users.map((u) => [u.id, u.name]));
        }

        return providers.map((p) => ({
          ...p,
          userName: userNames[p.userId] ?? "Desconhecido",
          currentContract: p.contracts[0] ?? null,
        }));
      });
    }),

  createProvider: tenantProcedure
    .input(createProviderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Check if user already has a provider record
        const existing = await tx.provider.findFirst({
          where: { userId: input.userId },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este usuario ja e um prestador",
          });
        }

        const provider = await tx.provider.create({
          data: {
            tenantId: ctx.tenantId,
            userId: input.userId,
            profile: input.profile,
            bondType: input.bondType,
            cpf: input.cpf ?? null,
            whatsapp: input.whatsapp ?? null,
            cnpjMei: input.cnpjMei ?? null,
            razaoSocial: input.razaoSocial ?? null,
            cnaePrincipal: input.cnaePrincipal ?? null,
          },
        });

        // Create initial empty contract
        await tx.providerContract.create({
          data: {
            tenantId: ctx.tenantId,
            providerId: provider.id,
            startDate: new Date(),
          },
        });

        logger.info("Provider created", { providerId: provider.id });
        return { id: provider.id };
      });
    }),

  updateProvider: tenantProcedure
    .input(updateProviderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.provider.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Prestador nao encontrado" });
        }

        await tx.provider.update({
          where: { id: input.id },
          data: {
            profile: input.profile,
            bondType: input.bondType,
            cpf: input.cpf,
            whatsapp: input.whatsapp,
            cnpjMei: input.cnpjMei,
            razaoSocial: input.razaoSocial,
            cnaePrincipal: input.cnaePrincipal,
            active: input.active,
          },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // CONTRACTS
  // ═══════════════════════════════════════

  createContract: tenantProcedure
    .input(createContractSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const contract = await tx.providerContract.create({
          data: {
            tenantId: ctx.tenantId,
            providerId: input.providerId,
            startDate: new Date(input.startDate),
            endDate: input.endDate ? new Date(input.endDate) : null,
            allowanceCap: input.allowanceCap != null ? new Prisma.Decimal(input.allowanceCap) : null,
            dailyMeal: input.dailyMeal != null ? new Prisma.Decimal(input.dailyMeal) : null,
            dailyTransport: input.dailyTransport != null ? new Prisma.Decimal(input.dailyTransport) : null,
            monthlyCellphone: input.monthlyCellphone != null ? new Prisma.Decimal(input.monthlyCellphone) : null,
            notes: input.notes ?? null,
          },
        });
        return { id: contract.id };
      });
    }),

  // ═══════════════════════════════════════
  // COMMISSION RULES (per contract)
  // ═══════════════════════════════════════

  updateRules: tenantProcedure
    .input(updateProviderRulesSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const contract = await tx.providerContract.findUnique({
          where: { id: input.contractId },
        });
        if (!contract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato nao encontrado" });
        }

        for (const rule of input.rules) {
          if (rule._delete && rule.id) {
            await tx.providerCommissionRule.delete({
              where: { id: rule.id },
            });
            continue;
          }

          const payload = {
            tenantId: ctx.tenantId,
            contractId: input.contractId,
            category: rule.category,
            scope: rule.scope,
            rangeMin: new Prisma.Decimal(rule.rangeMin),
            rangeMax: rule.rangeMax != null ? new Prisma.Decimal(rule.rangeMax) : null,
            rate: new Prisma.Decimal(rule.rate),
          };

          if (rule.id) {
            await tx.providerCommissionRule.update({
              where: { id: rule.id },
              data: payload,
            });
          } else {
            // Only create if rate > 0
            if (rule.rate > 0) {
              await tx.providerCommissionRule.create({ data: payload });
            }
          }
        }

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // APURACAO (calculation)
  // ═══════════════════════════════════════

  /** Get provider detail with apuracao for a month */
  getDetail: tenantProcedure
    .input(getProviderDetailSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const provider = await tx.provider.findUnique({
          where: { id: input.providerId },
          include: {
            contracts: {
              orderBy: { startDate: "desc" },
              include: {
                rules: {
                  orderBy: [{ category: "asc" }, { scope: "asc" }, { rangeMin: "asc" }],
                },
              },
            },
          },
        });

        if (!provider) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Prestador nao encontrado" });
        }

        // Get user name
        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: { id: provider.userId },
            select: { id: true, name: true },
          });
        });
        const userName = users[0]?.name ?? "Desconhecido";

        // Find current contract
        const now = new Date();
        const currentContract = provider.contracts.find((c) => {
          const start = new Date(c.startDate);
          const end = c.endDate ? new Date(c.endDate) : null;
          return start <= now && (!end || end >= now);
        }) ?? provider.contracts[0] ?? null;

        // Get apuracao for this month
        const apuracao = await tx.providerApuracao.findFirst({
          where: {
            providerId: input.providerId,
            year: input.year,
            month: input.month,
          },
        });

        // Get reversals for the month
        const startOfMonth = new Date(input.year, input.month - 1, 1);
        const endOfMonth = new Date(input.year, input.month, 0);
        const reversals = await tx.providerReversal.findMany({
          where: {
            providerId: input.providerId,
            factDate: { gte: startOfMonth, lte: endOfMonth },
          },
          orderBy: { factDate: "desc" },
        });

        // Get uncovered days
        const uncoveredDays = await tx.providerUncoveredDay.findMany({
          where: {
            providerId: input.providerId,
            day: { gte: startOfMonth, lte: endOfMonth },
          },
          orderBy: { day: "asc" },
        });

        return {
          provider: {
            ...provider,
            userName,
          },
          currentContract: currentContract
            ? {
                ...currentContract,
                allowanceCap: decimalToNumber(currentContract.allowanceCap),
                dailyMeal: decimalToNumber(currentContract.dailyMeal),
                dailyTransport: decimalToNumber(currentContract.dailyTransport),
                monthlyCellphone: decimalToNumber(currentContract.monthlyCellphone),
                rules: currentContract.rules.map((r) => ({
                  ...r,
                  rangeMin: decimalToNumber(r.rangeMin),
                  rangeMax: r.rangeMax ? decimalToNumber(r.rangeMax) : null,
                  rate: decimalToNumber(r.rate),
                })),
              }
            : null,
          apuracao: apuracao
            ? {
                ...apuracao,
                grossCommission: decimalToNumber(apuracao.grossCommission),
                totalReversals: decimalToNumber(apuracao.totalReversals),
                totalAllowance: decimalToNumber(apuracao.totalAllowance),
                capReduction: decimalToNumber(apuracao.capReduction),
                netAmount: decimalToNumber(apuracao.netAmount),
              }
            : null,
          reversals: reversals.map((r) => ({
            ...r,
            amount: decimalToNumber(r.amount),
          })),
          uncoveredDays,
        };
      });
    }),

  /** Recalculate apuracao (only if OPEN or not yet created) */
  calculate: tenantProcedure
    .input(apurarProviderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const provider = await tx.provider.findUnique({
          where: { id: input.providerId },
          include: {
            contracts: {
              orderBy: { startDate: "desc" },
              include: { rules: true },
            },
          },
        });

        if (!provider) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Prestador nao encontrado" });
        }

        // Find active contract for the period
        const periodStart = new Date(input.year, input.month - 1, 1);
        const periodEnd = new Date(input.year, input.month, 0, 23, 59, 59, 999);
        const contract = provider.contracts.find((c) => {
          const start = new Date(c.startDate);
          const end = c.endDate ? new Date(c.endDate) : null;
          return start <= periodEnd && (!end || end >= periodStart);
        });

        if (!contract || contract.rules.length === 0) {
          // No contract = empty apuracao
          const apuracao = await tx.providerApuracao.upsert({
            where: {
              tenantId_providerId_year_month: {
                tenantId: ctx.tenantId,
                providerId: input.providerId,
                year: input.year,
                month: input.month,
              },
            },
            create: {
              tenantId: ctx.tenantId,
              providerId: input.providerId,
              year: input.year,
              month: input.month,
              memoryJson: { linhas: [], subtotais: {}, total_comissao: 0, aviso: "Sem contrato vigente" },
            },
            update: {},
          });

          return { id: apuracao.id, grossCommission: 0, netAmount: 0 };
        }

        // Check if already closed
        const existing = await tx.providerApuracao.findFirst({
          where: {
            providerId: input.providerId,
            year: input.year,
            month: input.month,
          },
        });

        if (existing && existing.status !== "OPEN") {
          return {
            id: existing.id,
            grossCommission: decimalToNumber(existing.grossCommission),
            netAmount: decimalToNumber(existing.netAmount),
          };
        }

        // Collect events: sales and service orders
        const events = await collectProviderEvents(
          tx,
          provider,
          periodStart,
          periodEnd,
        );

        // Group by category+scope for progressive brackets
        const buckets: Record<string, { category: string; scope: string; baseTotal: number; events: typeof events }> = {};
        for (const ev of events) {
          const key = `${ev.category}|${ev.scope}`;
          if (!buckets[key]) {
            buckets[key] = { category: ev.category, scope: ev.scope, baseTotal: 0, events: [] };
          }
          buckets[key]!.baseTotal += ev.base;
          buckets[key]!.events.push(ev);
        }

        // Apply progressive brackets
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines: Array<Record<string, any>> = [];
        const contractRules = contract.rules.map((r) => ({
          ...r,
          rangeMin: decimalToNumber(r.rangeMin),
          rangeMax: r.rangeMax ? decimalToNumber(r.rangeMax) : null,
          rate: decimalToNumber(r.rate),
        }));

        for (const bucket of Object.values(buckets)) {
          const matchingRules = contractRules
            .filter((r) => r.category === bucket.category && r.scope === bucket.scope)
            .sort((a, b) => a.rangeMin - b.rangeMin);

          if (matchingRules.length === 0) continue;

          const totalCommission = applyProgressiveBrackets(bucket.baseTotal, matchingRules);

          // Prorate commission among events
          for (const ev of bucket.events) {
            const proportion = bucket.baseTotal > 0 ? ev.base / bucket.baseTotal : 0;
            const eventCommission = Math.round(totalCommission * proportion * 100) / 100;
            const effectiveRate = ev.base > 0 ? Math.round((eventCommission / ev.base) * 10000) / 100 : 0;
            lines.push({
              ...ev,
              comissao: eventCommission,
              aliquota_efetiva: effectiveRate,
            });
          }
        }

        const grossCommission = Math.round(lines.reduce((s, l) => s + (l.comissao as number), 0) * 100) / 100;

        // Sum reversals
        const reversals = await tx.providerReversal.findMany({
          where: {
            providerId: input.providerId,
            factDate: { gte: periodStart, lte: periodEnd },
          },
        });
        const totalReversals = Math.round(
          reversals.reduce((s, r) => s + decimalToNumber(r.amount), 0) * 100,
        ) / 100;

        // Calculate allowance
        const totalAllowance = await calculateAllowance(
          tx,
          input.providerId,
          contract,
          periodStart,
          periodEnd,
        );

        const netAmount = Math.round(Math.max(0, grossCommission - totalReversals + totalAllowance) * 100) / 100;

        const memory = {
          prestador_id: provider.id,
          periodo: {
            inicio: periodStart.toISOString().split("T")[0],
            fim: periodEnd.toISOString().split("T")[0],
            label: `${String(input.month).padStart(2, "0")}/${input.year}`,
          },
          linhas: lines,
          subtotais_por_categoria: Object.fromEntries(
            Object.entries(buckets).map(([key, bucket]) => {
              const bucketLines = lines.filter(
                (l) => `${l.categoria}|${l.escopo}` === key,
              );
              return [
                key,
                {
                  categoria: bucket.category,
                  escopo: bucket.scope,
                  base: Math.round(bucket.baseTotal * 100) / 100,
                  comissao: Math.round(
                    bucketLines.reduce((s, l) => s + (l.comissao as number), 0) * 100,
                  ) / 100,
                  qtd: bucketLines.length,
                },
              ];
            }),
          ),
          total_comissao: grossCommission,
        };

        const apuracao = await tx.providerApuracao.upsert({
          where: {
            tenantId_providerId_year_month: {
              tenantId: ctx.tenantId,
              providerId: input.providerId,
              year: input.year,
              month: input.month,
            },
          },
          create: {
            tenantId: ctx.tenantId,
            providerId: input.providerId,
            year: input.year,
            month: input.month,
            grossCommission: new Prisma.Decimal(grossCommission),
            totalReversals: new Prisma.Decimal(totalReversals),
            totalAllowance: new Prisma.Decimal(totalAllowance),
            netAmount: new Prisma.Decimal(netAmount),
            memoryJson: memory as Prisma.InputJsonValue,
          },
          update: {
            grossCommission: new Prisma.Decimal(grossCommission),
            totalReversals: new Prisma.Decimal(totalReversals),
            totalAllowance: new Prisma.Decimal(totalAllowance),
            netAmount: new Prisma.Decimal(netAmount),
            memoryJson: memory as Prisma.InputJsonValue,
          },
        });

        logger.info("Provider apuracao calculated", {
          providerId: input.providerId,
          month: input.month,
          year: input.year,
          grossCommission,
          netAmount,
          lineCount: lines.length,
        });

        return { id: apuracao.id, grossCommission, netAmount };
      });
    }),

  /** Close apuracao and generate financial transaction */
  closeApuracao: tenantProcedure
    .input(closeApuracaoSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const apuracao = await tx.providerApuracao.findFirst({
          where: {
            providerId: input.providerId,
            year: input.year,
            month: input.month,
          },
        });

        if (!apuracao) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Apuracao nao encontrada. Calcule primeiro." });
        }

        if (apuracao.status !== "OPEN") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apuracao ja fechada" });
        }

        let financialTransactionId: string | null = null;
        const netAmount = decimalToNumber(apuracao.netAmount);

        // Create financial transaction (AP) if net > 0
        if (netAmount > 0) {
          const provider = await tx.provider.findUnique({
            where: { id: input.providerId },
          });

          const userName = provider
            ? (await withAdmin(async (adminTx) => {
                const u = await adminTx.user.findUnique({
                  where: { id: provider.userId },
                  select: { name: true },
                });
                return u?.name;
              })) ?? "Prestador"
            : "Prestador";

          const monthLabel = `${String(input.month).padStart(2, "0")}/${input.year}`;

          const ft = await tx.financialTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              type: "PAYABLE",
              description: `Comissao ${userName} — ${monthLabel}`,
              totalAmount: apuracao.netAmount,
              status: "PENDING",
              dueDate: new Date(input.year, input.month, 10), // 10th of next month
              emissionDate: new Date(),
              notes: `Apuracao #${apuracao.id}. Aguardando NFS-e do prestador.`,
            },
          });

          financialTransactionId = ft.id;
        }

        // Close apuracao
        await tx.providerApuracao.update({
          where: { id: apuracao.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closedById: ctx.session.user.id,
            financialTransactionId,
          },
        });

        // Link reversals to this apuracao
        const periodStart = new Date(input.year, input.month - 1, 1);
        const periodEnd = new Date(input.year, input.month, 0);
        await tx.providerReversal.updateMany({
          where: {
            providerId: input.providerId,
            apuracaoId: null,
            factDate: { gte: periodStart, lte: periodEnd },
          },
          data: { apuracaoId: apuracao.id },
        });

        logger.info("Provider apuracao closed", {
          apuracaoId: apuracao.id,
          financialTransactionId,
          netAmount,
        });

        return {
          success: true,
          financialTransactionId,
          message: financialTransactionId
            ? `Apuracao fechada. Conta a pagar gerada.`
            : "Apuracao fechada. Sem valor liquido positivo — nenhuma conta gerada.",
        };
      });
    }),

  // ═══════════════════════════════════════
  // REVERSALS
  // ═══════════════════════════════════════

  createReversal: tenantProcedure
    .input(createReversalSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const reversal = await tx.providerReversal.create({
          data: {
            tenantId: ctx.tenantId,
            providerId: input.providerId,
            factDate: new Date(input.factDate),
            type: input.type,
            amount: new Prisma.Decimal(input.amount),
            description: input.description ?? null,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            registeredById: ctx.session.user.id,
          },
        });
        return { id: reversal.id };
      });
    }),

  deleteReversal: tenantProcedure
    .input(deleteReversalSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const reversal = await tx.providerReversal.findUnique({
          where: { id: input.id },
        });

        if (!reversal || reversal.providerId !== input.providerId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Estorno nao encontrado" });
        }

        if (reversal.apuracaoId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Estorno ja vinculado a apuracao fechada" });
        }

        await tx.providerReversal.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // UNCOVERED DAYS
  // ═══════════════════════════════════════

  toggleUncoveredDay: tenantProcedure
    .input(toggleUncoveredDaySchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const day = new Date(input.day);

        const existing = await tx.providerUncoveredDay.findFirst({
          where: {
            providerId: input.providerId,
            day,
          },
        });

        if (existing) {
          await tx.providerUncoveredDay.delete({ where: { id: existing.id } });
          return { action: "removed" as const };
        }

        await tx.providerUncoveredDay.create({
          data: {
            tenantId: ctx.tenantId,
            providerId: input.providerId,
            day,
            reason: input.reason ?? null,
          },
        });
        return { action: "added" as const };
      });
    }),

  // ═══════════════════════════════════════
  // AVAILABLE USERS (for create provider)
  // ═══════════════════════════════════════

  listAvailableUsers: tenantProcedure
    .query(async ({ ctx }) => {
      return ctx.withTenant(async (tx) => {
        const existingProviderUserIds = (
          await tx.provider.findMany({ select: { userId: true } })
        ).map((p) => p.userId);

        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: {
              id: { notIn: existingProviderUserIds.length > 0 ? existingProviderUserIds : ["__none__"] },
            },
            select: { id: true, name: true, cpf: true },
            orderBy: { name: "asc" },
          });
        });

        return users;
      });
    }),
});

// ═══════════════════════════════════════
// Event collection helpers
// ═══════════════════════════════════════

interface ProviderEvent {
  tipo: string;
  referencia_id: string;
  referencia_label: string;
  data: string;
  categoria: string;
  escopo: string;
  base: number;
  detalhe: Record<string, unknown>;
  // Aliases used in bucket grouping
  category: string;
  scope: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectProviderEvents(
  tx: any,
  provider: { id: string; userId: string; profile: string },
  periodStart: Date,
  periodEnd: Date,
): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];

  // ── SALES ──
  try {
    const sales = await tx.sale.findMany({
      where: {
        status: "COMPLETED",
        saleDate: { gte: periodStart, lte: periodEnd },
        sellerId: provider.userId,
        deletedAt: null,
      },
      include: { items: true },
    });

    for (const sale of sales) {
      for (const item of sale.items) {
        const unitPrice = decimalToNumber(item.unitPrice);
        const unitCost = decimalToNumber(item.unitCost);
        const qty = item.quantity;
        const lbc = Math.round((unitPrice - unitCost) * qty * 100) / 100;

        if (lbc <= 0) continue;

        // SaleItem does not carry isSerialized; default to acessorio
        const category = "produto_acessorio";

        events.push({
          tipo: "venda",
          referencia_id: sale.id,
          referencia_label: `Venda #${sale.number} — ${item.description ?? "Item"}`,
          data: sale.saleDate?.toISOString().split("T")[0] ?? sale.createdAt.toISOString().split("T")[0],
          categoria: category,
          escopo: "normal",
          category,
          scope: "normal",
          base: lbc,
          detalhe: {
            preco_unitario: unitPrice,
            preco_custo_unitario: unitCost,
            quantidade: qty,
          },
        });
      }
    }
  } catch {
    // Sale table might not exist in test env
  }

  // ── SERVICE ORDERS ──
  try {
    const serviceOrders = await tx.serviceOrder.findMany({
      where: {
        status: { in: ["PAID", "DELIVERED"] },
        paymentDate: { gte: periodStart, lte: periodEnd },
        deletedAt: null,
      },
    });

    for (const so of serviceOrders) {
      const totalAmount = decimalToNumber(so.totalAmount);
      const partsCost = decimalToNumber(so.partsCost);
      const otherCost = decimalToNumber(so.otherCost);
      const costsTotal = partsCost + otherCost;
      const hasParts = costsTotal > 0;

      const isExecutor = so.technicianId === provider.userId;
      const isIntermediary = so.vendorId === provider.userId;

      // Technician executor: execution commission
      if (isExecutor && provider.profile === "TECHNICIAN") {
        const category = hasParts ? "servico_at_com_peca" : "servico_at_sem_peca";
        const base = hasParts
          ? Math.round((totalAmount - costsTotal) * 100) / 100
          : totalAmount;

        if (base > 0) {
          events.push({
            tipo: "servico_execucao",
            referencia_id: so.id,
            referencia_label: `OS #${so.number} (execucao)`,
            data: so.paymentDate?.toISOString().split("T")[0] ?? so.updatedAt.toISOString().split("T")[0],
            categoria: category,
            escopo: "normal",
            category,
            scope: "normal",
            base,
            detalhe: {
              valor_total: totalAmount,
              custo_total: costsTotal,
              tem_peca: hasParts,
            },
          });
        }
      }

      // Seller intermediary: intermediation commission
      if (isIntermediary && provider.profile === "SELLER") {
        const lbs = Math.round((totalAmount - costsTotal) * 100) / 100;
        if (lbs > 0) {
          events.push({
            tipo: "servico_intermediacao",
            referencia_id: so.id,
            referencia_label: `OS #${so.number} (intermediacao)`,
            data: so.paymentDate?.toISOString().split("T")[0] ?? so.updatedAt.toISOString().split("T")[0],
            categoria: "intermediacao_at",
            escopo: "normal",
            category: "intermediacao_at",
            scope: "normal",
            base: lbs,
            detalhe: {
              valor_total: totalAmount,
              custo_total: costsTotal,
            },
          });
        }
      }
    }
  } catch {
    // ServiceOrder table might not exist in test env
  }

  return events;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calculateAllowance(
  tx: any,
  providerId: string,
  contract: { allowanceCap: Prisma.Decimal | null; dailyMeal: Prisma.Decimal | null; dailyTransport: Prisma.Decimal | null; monthlyCellphone: Prisma.Decimal | null },
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const daysInMonth = periodEnd.getDate();

  const uncoveredCount = await tx.providerUncoveredDay.count({
    where: {
      providerId,
      day: { gte: periodStart, lte: periodEnd },
    },
  });

  const effectiveDays = Math.max(0, daysInMonth - uncoveredCount);

  const dailyMeal = decimalToNumber(contract.dailyMeal);
  const dailyTransport = decimalToNumber(contract.dailyTransport);
  const monthlyCellphone = decimalToNumber(contract.monthlyCellphone);
  const cap = decimalToNumber(contract.allowanceCap);

  const mealTotal = effectiveDays * dailyMeal;
  const transportTotal = effectiveDays * dailyTransport;
  const total = mealTotal + transportTotal + monthlyCellphone;

  return Math.round(Math.min(total, cap > 0 ? cap : total) * 100) / 100;
}
