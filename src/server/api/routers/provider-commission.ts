import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, tenantAdminProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  createProviderSchema,
  updateProviderSchema,
  listProvidersSchema,
  createContractSchema,
  updateContractSchema,
  updateProviderRulesSchema,
  apurarProviderSchema,
  closeApuracaoSchema,
  createReversalSchema,
  deleteReversalSchema,
  toggleUncoveredDaySchema,
  getProviderDetailSchema,
} from "@/lib/validators/provider-commission";
import { logger } from "@/lib/logger";
import { computeBucketCommission } from "@/lib/commission/bucket-commission";
import { monthRange } from "@/lib/commission/month-range";
import { calcAllowance } from "@/lib/commission/allowance";
import { createProviderApuracaoPayable } from "@/server/services/provider-apuracao-payable.service";

// ── Helpers ──

function decimalToNumber(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
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

  createProvider: tenantAdminProcedure
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

  updateProvider: tenantAdminProcedure
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

  createContract: tenantAdminProcedure
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

  /** Atualiza os campos do contrato vigente (datas, ajuda de custo) sem criar
   *  nova versao. Regras sao geridas a parte via `updateRules`. */
  updateContract: tenantAdminProcedure
    .input(updateContractSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const contract = await tx.providerContract.findUnique({
          where: { id: input.contractId },
        });
        if (!contract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato nao encontrado" });
        }

        await tx.providerContract.update({
          where: { id: input.contractId },
          data: {
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

  updateRules: tenantAdminProcedure
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
            valueType: rule.valueType,
            base: rule.base,
            source: rule.source,
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
        return buildProviderDetail(tx, input.providerId, input.year, input.month);
      });
    }),

  /** Self-service: prestador ve a PROPRIA apuracao (read-only). Resolve o
   *  providerId a partir do usuario logado — nao expoe dados de outro prestador. */
  getMyDetail: tenantProcedure
    .input(z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020).max(2100),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const provider = await tx.provider.findFirst({
          where: { userId: ctx.session.user.id },
          select: { id: true },
        });
        if (!provider) return null; // usuario nao e prestador — a UI mostra empty state
        return buildProviderDetail(tx, provider.id, input.year, input.month);
      });
    }),

  /** Recalculate apuracao (only if OPEN or not yet created) */
  calculate: tenantAdminProcedure
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
        const { start: periodStart, end: periodEnd } = monthRange(input.year, input.month);
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

        // Coleta eventos: vendas/OS proprias e — se houver regra de participacao —
        // vendas da loja (de outros) e OS da loja (de outros tecnicos). Cada fonte
        // extra so e varrida quando ha regra correspondente (evita scan desnecessario):
        //  - vendas da loja: qualquer regra source=STORE de produto;
        //  - OS da loja: regra da categoria servico_at_loja.
        const hasStoreSaleRule = contract.rules.some(
          (r) => r.source === "STORE" && r.category !== "servico_at_loja",
        );
        const hasStoreServiceRule = contract.rules.some((r) => r.category === "servico_at_loja");
        const events = await collectProviderEvents(
          tx,
          provider,
          periodStart,
          periodEnd,
          hasStoreSaleRule,
          hasStoreServiceRule,
        );

        // Agrupa por (categoria, escopo, ORIGEM) — proprias e loja acumulam separado.
        const buckets: Record<string, { category: string; scope: string; source: string; events: typeof events }> = {};
        for (const ev of events) {
          const key = `${ev.category}|${ev.scope}|${ev.source}`;
          if (!buckets[key]) {
            buckets[key] = { category: ev.category, scope: ev.scope, source: ev.source, events: [] };
          }
          buckets[key]!.events.push(ev);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines: Array<Record<string, any>> = [];
        const contractRules = contract.rules.map((r) => ({
          ...r,
          rangeMin: decimalToNumber(r.rangeMin),
          rangeMax: r.rangeMax ? decimalToNumber(r.rangeMax) : null,
          rate: decimalToNumber(r.rate),
        }));

        for (const bucket of Object.values(buckets)) {
          const matchingRules = contractRules.filter(
            (r) => r.category === bucket.category && r.scope === bucket.scope && r.source === bucket.source,
          );
          if (matchingRules.length === 0) continue;

          // Calculo do balde (percent-progressivo ou fixo/unidade) num helper puro.
          const results = computeBucketCommission(matchingRules, bucket.events);
          bucket.events.forEach((ev, i) => {
            const r = results[i]!;
            lines.push({
              ...ev,
              base: r.base,
              comissao: r.comissao,
              aliquota_efetiva: r.aliquotaEfetiva,
              tipo_valor: r.tipoValor,
              origem: bucket.source,
            });
          });
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
                (l) => `${l.categoria}|${l.escopo}|${l.origem}` === key,
              );
              return [
                key,
                {
                  categoria: bucket.category,
                  escopo: bucket.scope,
                  origem: bucket.source,
                  base: Math.round(bucketLines.reduce((s, l) => s + (l.base as number), 0) * 100) / 100,
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

  /** Close apuracao and generate financial transaction.
   *
   * Lock anti-race: usa updateMany(where: status=OPEN) → CLOSING como reserva atômica.
   * Se 2 chamadas concorrentes tentarem fechar, só 1 vê count=1. A outra recebe count=0
   * e aborta sem efeito colateral (sem PAYABLE duplicada).
   */
  closeApuracao: tenantAdminProcedure
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

        // Tentativa de aquisição do lock — UPDATE atômico no status (CAS).
        // Postgres serializa este UPDATE; somente uma transação verá count=1.
        const reservation = await tx.providerApuracao.updateMany({
          where: { id: apuracao.id, status: "OPEN" },
          data: { status: "CLOSING" },
        });
        if (reservation.count === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Apuracao esta sendo fechada por outro processo. Tente novamente em alguns segundos.",
          });
        }

        // Helper de rollback se algo der errado durante o close.
        // Restaura status OPEN para que possa ser reprocessada.
        const rollback = async () => {
          await tx.providerApuracao.updateMany({
            where: { id: apuracao.id, status: "CLOSING" },
            data: { status: "OPEN" },
          });
        };

        let financialTransactionId: string | null = null;
        const netAmount = decimalToNumber(apuracao.netAmount);

        try {

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

          financialTransactionId = await createProviderApuracaoPayable(tx, ctx.tenantId, {
            apuracaoId: apuracao.id,
            providerName: userName,
            netAmount: apuracao.netAmount,
            year: input.year,
            month: input.month,
            createdByUserId: ctx.session.user.id,
          });
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

        // Link reversals to this apuracao (fronteira inclusiva ate 23:59:59.999 —
        // senao um estorno com factDate no ultimo dia do mes ficava sem apuracaoId).
        const { start: periodStart, end: periodEnd } = monthRange(input.year, input.month);
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
        } catch (err) {
          await rollback();
          throw err;
        }
      });
    }),

  // ═══════════════════════════════════════
  // REVERSALS
  // ═══════════════════════════════════════

  createReversal: tenantAdminProcedure
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

  deleteReversal: tenantAdminProcedure
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

  toggleUncoveredDay: tenantAdminProcedure
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

  /** Self-service: prestador marca/desmarca um dia nao coberto SEU. Resolve o
   *  providerId pelo usuario logado — nao permite mexer no dia de outro prestador.
   *  Bloqueado se a apuracao do mes ja estiver fechada. */
  toggleMyUncoveredDay: tenantProcedure
    .input(z.object({
      day: z.string().min(1, "Data obrigatoria"),
      reason: z.string().max(200).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const provider = await tx.provider.findFirst({
          where: { userId: ctx.session.user.id },
          select: { id: true },
        });
        if (!provider) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Voce nao e um prestador." });
        }

        const day = new Date(input.day);

        // Nao permite editar dia de mes com apuracao ja fechada.
        const closed = await tx.providerApuracao.findFirst({
          where: {
            providerId: provider.id,
            year: day.getFullYear(),
            month: day.getMonth() + 1,
            status: { not: "OPEN" },
          },
          select: { id: true },
        });
        if (closed) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apuracao do mes ja fechada." });
        }

        const existing = await tx.providerUncoveredDay.findFirst({
          where: { providerId: provider.id, day },
        });
        if (existing) {
          await tx.providerUncoveredDay.delete({ where: { id: existing.id } });
          return { action: "removed" as const };
        }

        await tx.providerUncoveredDay.create({
          data: {
            tenantId: ctx.tenantId,
            providerId: provider.id,
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

        // SEGURANCA (isolamento cross-tenant): so usuarios VINCULADOS ao tenant
        // ativo. Antes listava TODOS os usuarios do sistema (incl. CPF) de
        // outros tenants. Filtramos por user_tenants do tenant atual.
        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: {
              tenants: { some: { tenantId: ctx.tenantId } },
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
// Detail builder (shared por getDetail e getMyDetail)
// ═══════════════════════════════════════

type DetailRule = {
  id: string;
  category: string;
  scope: string;
  valueType: string;
  base: string;
  source: string;
  rangeMin: number;
  rangeMax: number | null;
  rate: number;
};
type DetailReversal = {
  id: string;
  factDate: Date;
  type: string;
  amount: number;
  description: string | null;
  apuracaoId: string | null;
};
type DetailUncoveredDay = { id: string; day: Date; reason: string | null };
type DetailContract = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  allowanceCap: number;
  dailyMeal: number;
  dailyTransport: number;
  monthlyCellphone: number;
  notes: string | null;
  rules: DetailRule[];
};
type DetailApuracao = {
  id: string;
  status: string;
  year: number;
  month: number;
  grossCommission: number;
  totalReversals: number;
  totalAllowance: number;
  capReduction: number;
  netAmount: number;
  memoryJson: unknown;
};
type ProviderDetail = {
  provider: {
    id: string;
    userId: string;
    userName: string;
    profile: string;
    bondType: string;
    razaoSocial: string | null;
    cnpjMei: string | null;
    active: boolean;
  };
  currentContract: DetailContract | null;
  apuracao: DetailApuracao | null;
  reversals: DetailReversal[];
  uncoveredDays: DetailUncoveredDay[];
};

/**
 * Monta a ficha de apuracao de um prestador para um mes: dados, contrato
 * vigente + regras, apuracao, estornos e dias nao cobertos. Compartilhado pela
 * visao admin (`getDetail`, por providerId) e pela self-service (`getMyDetail`,
 * resolvido pelo usuario logado).
 */
async function buildProviderDetail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  providerId: string,
  year: number,
  month: number,
): Promise<ProviderDetail> {
  const provider = await tx.provider.findUnique({
    where: { id: providerId },
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

  const users = await withAdmin(async (adminTx) => {
    return adminTx.user.findMany({
      where: { id: provider.userId },
      select: { id: true, name: true },
    });
  });
  const userName = users[0]?.name ?? "Desconhecido";

  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentContract = provider.contracts.find((c: any) => {
    const start = new Date(c.startDate);
    const end = c.endDate ? new Date(c.endDate) : null;
    return start <= now && (!end || end >= now);
  }) ?? provider.contracts[0] ?? null;

  const apuracao = await tx.providerApuracao.findFirst({
    where: { providerId, year, month },
  });

  const { start: startOfMonth, end: endOfMonth } = monthRange(year, month);
  const reversals = await tx.providerReversal.findMany({
    where: { providerId, factDate: { gte: startOfMonth, lte: endOfMonth } },
    orderBy: { factDate: "desc" },
  });

  const uncoveredDays = await tx.providerUncoveredDay.findMany({
    where: { providerId, day: { gte: startOfMonth, lte: endOfMonth } },
    orderBy: { day: "asc" },
  });

  return {
    provider: { ...provider, userName },
    currentContract: currentContract
      ? {
          ...currentContract,
          allowanceCap: decimalToNumber(currentContract.allowanceCap),
          dailyMeal: decimalToNumber(currentContract.dailyMeal),
          dailyTransport: decimalToNumber(currentContract.dailyTransport),
          monthlyCellphone: decimalToNumber(currentContract.monthlyCellphone),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rules: currentContract.rules.map((r: any): DetailRule => ({
            id: r.id,
            category: r.category,
            scope: r.scope,
            valueType: r.valueType,
            base: r.base,
            source: r.source,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reversals: reversals.map((r: any): DetailReversal => ({
      id: r.id,
      factDate: r.factDate,
      type: r.type,
      amount: decimalToNumber(r.amount),
      description: r.description ?? null,
      apuracaoId: r.apuracaoId ?? null,
    })),
    uncoveredDays: uncoveredDays as DetailUncoveredDay[],
  };
}

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
  // Origem: OWN (venda propria / OS) ou STORE (participacao nas vendas de outros).
  source: string;
  // Bases alternativas para escolher conforme a regra do balde:
  // baseProfit = lucro (LBC); baseGrossNet = valor total liquido do item.
  // Servicos/OS so tem baseProfit (== base). qty = unidades (p/ valor fixo).
  baseProfit: number;
  baseGrossNet: number;
  qty: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectProviderEvents(
  tx: any,
  provider: { id: string; userId: string; profile: string },
  periodStart: Date,
  periodEnd: Date,
  includeStoreSales = false,
  includeStoreServiceOrders = false,
): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];

  // ── SALES ──
  // Base (LBC) = (preco_unit − custo_unit) × qtd, apenas custo do produto.
  // Categoria = Product.isDevice (aparelho/acessorio); escopo = Product.isPremium.
  // Coleta vendas PROPRIAS (sellerId = prestador, origem OWN) e — se o contrato
  // tiver regra de participacao — as vendas da LOJA (de OUTROS, origem STORE).
  try {
    const ownSales = await tx.sale.findMany({
      where: {
        status: "COMPLETED",
        saleDate: { gte: periodStart, lte: periodEnd },
        sellerId: provider.userId,
        deletedAt: null,
      },
      include: { items: true },
    });

    // Participacao na loja: vendas de OUTROS vendedores (exclui as proprias —
    // decisao do dono, evita comissionar a mesma venda 2× na mesma regra).
    const storeSales = includeStoreSales
      ? await tx.sale.findMany({
          where: {
            status: "COMPLETED",
            saleDate: { gte: periodStart, lte: periodEnd },
            sellerId: { not: provider.userId },
            deletedAt: null,
          },
          include: { items: true },
        })
      : [];

    // Batch-load product flags (isDevice/isPremium) — evita N+1, cobre ambos.
    const allSales = [...ownSales, ...storeSales];
    const productIds = Array.from(
      new Set(
        allSales.flatMap((s: { items: Array<{ productId: string }> }) =>
          s.items.map((i) => i.productId),
        ) as string[],
      ),
    );
    const productFlags = await loadProductFlags(tx, productIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushSaleEvents = (sale: any, source: "OWN" | "STORE") => {
      for (const item of sale.items) {
        // Item estornado (parcial) tem total=0 — nao comissiona. O estorno zera
        // o total do item; ignora-los aqui mantem o re-calculo correto enquanto a
        // apuracao esta aberta (o estorno automatico so gera reversal apos fechada).
        const grossNet = decimalToNumber(item.total);
        if (grossNet <= 0) continue;

        const unitPrice = decimalToNumber(item.unitPrice);
        const unitCost = decimalToNumber(item.costPrice);
        const qty = item.quantity;
        // Duas bases possiveis; a regra do balde escolhe qual usar:
        //  - lucro (LBC) = (preco − custo) × qtd
        //  - total liquido = o que o cliente pagou pelo item (SaleItem.total)
        const lbc = Math.round(Math.max(0, (unitPrice - unitCost) * qty) * 100) / 100;

        const flags = productFlags.get(item.productId);
        const category = flags?.isDevice ? "produto_aparelho" : "produto_acessorio";
        const scope = flags?.isPremium ? "premium" : "normal";
        const label =
          source === "STORE"
            ? `Venda #${sale.number} (loja) — ${item.description ?? "Item"}`
            : `Venda #${sale.number} — ${item.description ?? "Item"}`;

        events.push({
          tipo: source === "STORE" ? "venda_loja" : "venda",
          referencia_id: sale.id,
          referencia_label: label,
          data: sale.saleDate?.toISOString().split("T")[0] ?? sale.createdAt.toISOString().split("T")[0],
          categoria: category,
          escopo: scope,
          category,
          scope,
          source,
          base: lbc,
          baseProfit: lbc,
          baseGrossNet: grossNet,
          qty,
          detalhe: {
            preco_unitario: unitPrice,
            preco_custo_unitario: unitCost,
            quantidade: qty,
            eh_aparelho: flags?.isDevice ?? false,
            eh_premium: flags?.isPremium ?? false,
          },
        });
      }
    };

    for (const sale of ownSales) pushSaleEvents(sale, "OWN");
    for (const sale of storeSales) pushSaleEvents(sale, "STORE");
  } catch {
    // Sale table might not exist in test env
  }

  // ── SERVICE ORDERS ──
  // Base = valor do SERVICO (serviceAmount), nao o total da OS. O total inclui
  // pecas — comissionar sobre ele pagaria comissao sobre o custo de peca. Com peca:
  // LBS = serviceAmount − (partsCost + otherCost). Sem peca: serviceAmount cheio.
  // OS sempre escopo `normal`. Sem deducao fiscal.
  try {
    const serviceOrders = await tx.serviceOrder.findMany({
      where: {
        status: { in: ["PAID", "DELIVERED"] },
        paymentDate: { gte: periodStart, lte: periodEnd },
        deletedAt: null,
        OR: [{ technicianId: provider.userId }, { vendorId: provider.userId }],
      },
    });

    for (const so of serviceOrders) {
      const serviceAmount = decimalToNumber(so.serviceAmount);
      const partsCost = decimalToNumber(so.partsCost);
      const otherCost = decimalToNumber(so.otherCost);
      const costsTotal = partsCost + otherCost;
      const hasParts = costsTotal > 0;
      const lbs = Math.round((serviceAmount - costsTotal) * 100) / 100;

      const isExecutor = so.technicianId === provider.userId;
      const isIntermediary = so.vendorId === provider.userId;

      // Technician executor: execution commission.
      // Bases DISTINTAS para o eixo base ser configuravel (lucro vs total):
      //   baseProfit = LBS (serviceAmount − custos); baseGrossNet = serviceAmount.
      // O default por categoria preserva o comportamento antigo (com peca=lucro,
      // sem peca=total) via `base` da regra (ver validators/UI).
      if (isExecutor && provider.profile === "TECHNICIAN") {
        const category = hasParts ? "servico_at_com_peca" : "servico_at_sem_peca";

        if (serviceAmount > 0 || lbs > 0) {
          events.push({
            tipo: "servico_execucao",
            referencia_id: so.id,
            referencia_label: `OS #${so.number} (execucao)`,
            data: so.paymentDate?.toISOString().split("T")[0] ?? so.updatedAt.toISOString().split("T")[0],
            categoria: category,
            escopo: "normal",
            category,
            scope: "normal",
            source: "OWN",
            base: lbs,
            baseProfit: lbs,
            baseGrossNet: serviceAmount,
            qty: 1,
            detalhe: {
              valor_servico: serviceAmount,
              custo_total: costsTotal,
              tem_peca: hasParts,
            },
          });
        }
      }

      // Seller intermediary: intermediation commission. Bases distintas tambem.
      if (isIntermediary && provider.profile === "SELLER" && (serviceAmount > 0 || lbs > 0)) {
        events.push({
          tipo: "servico_intermediacao",
          referencia_id: so.id,
          referencia_label: `OS #${so.number} (intermediacao)`,
          data: so.paymentDate?.toISOString().split("T")[0] ?? so.updatedAt.toISOString().split("T")[0],
          categoria: "intermediacao_at",
          escopo: "normal",
          category: "intermediacao_at",
          scope: "normal",
          source: "OWN",
          base: lbs,
          baseProfit: lbs,
          baseGrossNet: serviceAmount,
          qty: 1,
          detalhe: {
            valor_servico: serviceAmount,
            custo_total: costsTotal,
          },
        });
      }
    }
  } catch {
    // ServiceOrder table might not exist in test env
  }

  // ── PARTICIPACAO EM AT (OS da loja, de OUTROS tecnicos) ──
  // Analogo ao STORE de vendas: o prestador ganha por OS executada na loja por
  // OUTRO tecnico. So varre quando ha regra da categoria `servico_at_loja`.
  // Base: baseProfit = LBS (serviceAmount − custos); baseGrossNet = serviceAmount.
  // qty = Σ quantidade dos itens SERVICE (fixo "por servico"); fallback 1 se a OS
  // nao itemiza servicos (mao de obra so e cobrada se houve servico — evita R$0).
  if (includeStoreServiceOrders) {
    try {
      const storeOrders = await tx.serviceOrder.findMany({
        where: {
          status: { in: ["PAID", "DELIVERED"] },
          paymentDate: { gte: periodStart, lte: periodEnd },
          deletedAt: null,
          technicianId: { not: provider.userId },
        },
        include: { items: true },
      });

      for (const so of storeOrders) {
        // Guard extra: technicianId nao-nulo (executor definido) e != prestador.
        if (!so.technicianId || so.technicianId === provider.userId) continue;

        const serviceAmount = decimalToNumber(so.serviceAmount);
        const costsTotal = decimalToNumber(so.partsCost) + decimalToNumber(so.otherCost);
        const lbs = Math.round((serviceAmount - costsTotal) * 100) / 100;
        if (serviceAmount <= 0 && lbs <= 0) continue;

        // qty = numero de servicos (itens type=SERVICE); fallback 1.
        const serviceItemsQty = (so.items ?? [])
          .filter((it: { type: string }) => it.type === "SERVICE")
          .reduce((sum: number, it: { quantity: unknown }) => sum + decimalToNumber(it.quantity as never), 0);
        const qty = serviceItemsQty > 0 ? serviceItemsQty : 1;

        events.push({
          tipo: "servico_loja",
          referencia_id: so.id,
          referencia_label: `OS #${so.number} (participacao)`,
          data: so.paymentDate?.toISOString().split("T")[0] ?? so.updatedAt.toISOString().split("T")[0],
          categoria: "servico_at_loja",
          escopo: "normal",
          category: "servico_at_loja",
          scope: "normal",
          source: "STORE",
          base: lbs,
          baseProfit: lbs,
          baseGrossNet: serviceAmount,
          qty,
          detalhe: {
            valor_servico: serviceAmount,
            custo_total: costsTotal,
            qtd_servicos: qty,
          },
        });
      }
    } catch {
      // ServiceOrder table might not exist in test env
    }
  }

  return events;
}

/**
 * Carrega flags de categoria/escopo dos produtos em lote (isDevice → aparelho,
 * isPremium → premium). Query unica pelos ids — evita N+1 no loop de itens.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProductFlags(
  tx: any,
  productIds: string[],
): Promise<Map<string, { isDevice: boolean; isPremium: boolean }>> {
  const flags = new Map<string, { isDevice: boolean; isPremium: boolean }>();
  if (productIds.length === 0) return flags;

  const products: Array<{ id: string; isDevice: boolean; isPremium: boolean }> =
    await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, isDevice: true, isPremium: true },
    });
  for (const p of products) {
    flags.set(p.id, { isDevice: p.isDevice, isPremium: p.isPremium });
  }
  return flags;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calculateAllowance(
  tx: any,
  providerId: string,
  contract: { allowanceCap: Prisma.Decimal | null; dailyMeal: Prisma.Decimal | null; dailyTransport: Prisma.Decimal | null; monthlyCellphone: Prisma.Decimal | null },
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const uncoveredDays = await tx.providerUncoveredDay.count({
    where: {
      providerId,
      day: { gte: periodStart, lte: periodEnd },
    },
  });

  // Os campos do contrato sao VALORES DO MES (nao diarias) — ver calcAllowance.
  return calcAllowance({
    meal: decimalToNumber(contract.dailyMeal),
    transport: decimalToNumber(contract.dailyTransport),
    cellphone: decimalToNumber(contract.monthlyCellphone),
    cap: decimalToNumber(contract.allowanceCap),
    daysInMonth: periodEnd.getDate(),
    uncoveredDays,
  });
}
