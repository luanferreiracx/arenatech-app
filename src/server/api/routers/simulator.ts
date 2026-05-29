import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  simulateSchema,
  updateSimulatorConfigSchema,
} from "@/lib/validators/simulator";
import type { SimulationResult } from "@/lib/validators/simulator";
import {
  DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
  DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE,
  DEFAULT_SIMULATOR_DEBIT_FEE,
  defaultSimulatorTiers,
} from "@/lib/simulator-defaults";
import { sendCloudText } from "@/lib/services/whatsapp-cloud-service";

type SimulatorTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type ConfigWithTiers = Prisma.SimulatorRateConfigGetPayload<{
  include: { tiers: true };
}>;

/**
 * Carrega a config de taxas do simulador. Se o tenant ainda nao tem (ex: tenant
 * migrado antes desta feature), cria com os defaults Laravel — mantem o
 * simulador funcional sem exigir configuracao previa.
 */
async function getOrCreateSimulatorConfig(
  tx: SimulatorTx,
  tenantId: string,
): Promise<ConfigWithTiers> {
  const existing = await tx.simulatorRateConfig.findUnique({
    where: { tenantId },
    include: { tiers: true },
  });
  if (existing) return existing;

  return tx.simulatorRateConfig.create({
    data: {
      tenantId,
      creditAvistaFeePercent: DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE,
      debitFeePercent: DEFAULT_SIMULATOR_DEBIT_FEE,
      maxInstallments: DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
      tiers: {
        create: defaultSimulatorTiers().map((t) => ({
          tenantId,
          installments: t.installments,
          feePercent: t.feePercent,
        })),
      },
    },
    include: { tiers: true },
  });
}

/**
 * Simulador de parcelamento.
 *
 * IMPORTANTE: usa as taxas EXIBIDAS AO CLIENTE (SimulatorRateConfig), que tem
 * margem embutida pelo lojista para mitigar risco operacional. NAO usa as taxas
 * reais do PDV/financeiro (PaymentMethod.feePercent / PaymentMethodRate).
 * Paridade Laravel SimuladorParcelamentoService (configuracoes_parcelamento).
 *
 * Formula gross-up: valorComTaxa = (valor * 100) / (100 - taxa)
 */
export const simulatorRouter = createTRPCRouter({
  simulate: tenantProcedure
    .input(simulateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const valorProduto = input.valorProduto;
        const valorEntrada = input.valorEntrada ?? 0;
        const valorFinanciar = Math.max(0, valorProduto - valorEntrada);

        const config = await getOrCreateSimulatorConfig(tx, ctx.tenantId);

        const taxaDebito = Number(config.debitFeePercent);
        const taxaAvista = Number(config.creditAvistaFeePercent);

        const debitoTotal = grossUp(valorFinanciar, taxaDebito);
        const avistaTotal = grossUp(valorFinanciar, taxaAvista);

        // Parcelas a partir dos tiers cadastrados, limitadas a maxInstallments.
        // Paridade Laravel: so exibe parcela com taxa > 0 (juros 0 = nao oferta).
        const parcelas: SimulationResult["parcelas"] = config.tiers
          .filter(
            (tier) =>
              tier.installments <= config.maxInstallments &&
              Number(tier.feePercent) > 0,
          )
          .sort((a, b) => a.installments - b.installments)
          .map((tier) => {
            const n = tier.installments;
            const taxa = Number(tier.feePercent);
            const total = grossUp(valorFinanciar, taxa);
            return {
              n,
              taxa,
              total,
              parcela: Math.round((total / n) * 100) / 100,
            };
          });

        const result: SimulationResult = {
          valorProduto,
          valorEntrada,
          valorFinanciar,
          debito: { taxa: taxaDebito, total: debitoTotal },
          avista: { taxa: taxaAvista, total: avistaTotal },
          parcelas,
          maxParcelas: config.maxInstallments,
        };

        return result;
      });
    }),

  // ═══════════════════════════════════════
  // RATE CONFIG (taxas exibidas ao cliente)
  // ═══════════════════════════════════════

  /**
   * Retorna a config de taxas do simulador (cria com defaults se inexistente).
   */
  getConfig: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const config = await getOrCreateSimulatorConfig(tx, ctx.tenantId);
      return {
        creditAvistaFeePercent: Number(config.creditAvistaFeePercent),
        debitFeePercent: Number(config.debitFeePercent),
        maxInstallments: config.maxInstallments,
        tiers: config.tiers
          .slice()
          .sort((a, b) => a.installments - b.installments)
          .map((t) => ({
            installments: t.installments,
            feePercent: Number(t.feePercent),
          })),
      };
    });
  }),

  /**
   * Atualiza a config de taxas do simulador. Substitui todos os tiers.
   * Apenas owner/manager (config sensivel de precificacao).
   */
  updateConfig: tenantProcedure
    .input(updateSimulatorConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.availableTenants.find(
        (t) => t.id === ctx.tenantId,
      )?.role;
      if (role !== "owner" && role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas dono ou gerente pode alterar as taxas do simulador.",
        });
      }

      return ctx.withTenant(async (tx) => {
        const config = await getOrCreateSimulatorConfig(tx, ctx.tenantId);

        await tx.simulatorRateConfig.update({
          where: { id: config.id },
          data: {
            creditAvistaFeePercent: input.creditAvistaFeePercent,
            debitFeePercent: input.debitFeePercent,
            maxInstallments: input.maxInstallments,
          },
        });

        // Substitui os tiers (delete-all + recreate dentro da mesma tx)
        await tx.simulatorInstallmentTier.deleteMany({
          where: { configId: config.id },
        });
        if (input.tiers.length > 0) {
          await tx.simulatorInstallmentTier.createMany({
            data: input.tiers.map((t) => ({
              tenantId: ctx.tenantId,
              configId: config.id,
              installments: t.installments,
              feePercent: t.feePercent,
            })),
          });
        }

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // SESSIONS (historico)
  // ═══════════════════════════════════════

  /**
   * Salva uma simulacao no historico para posterior consulta/reuso/envio.
   */
  saveSession: tenantProcedure
    .input(z.object({
      productValueCents: z.number().int().min(1),
      downPaymentCents: z.number().int().min(0).default(0),
      customerId: z.string().uuid().optional(),
      customerName: z.string().max(150).optional(),
      customerPhone: z.string().max(20).optional(),
      result: z.unknown(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.simulatorSession.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: input.customerId ?? null,
            customerName: input.customerName ?? null,
            customerPhone: input.customerPhone ?? null,
            productValueCents: input.productValueCents,
            downPaymentCents: input.downPaymentCents,
            resultPayload: input.result as never,
            createdByUserId: ctx.session.user.id,
          },
        });
        return { id: session.id };
      });
    }),

  listSessions: tenantProcedure
    .input(z.object({
      customerId: z.string().uuid().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: { customerId?: string } = {};
        if (input?.customerId) where.customerId = input.customerId;
        const page = input?.page ?? 0;
        const pageSize = input?.pageSize ?? 20;
        const [data, total] = await Promise.all([
          tx.simulatorSession.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.simulatorSession.count({ where }),
        ]);
        return { data, total, page, pageSize };
      });
    }),

  getSession: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.simulatorSession.findUnique({ where: { id: input.id } });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        return session;
      });
    }),

  /**
   * Envia simulacao formatada via WhatsApp Cloud API.
   * Marca sentAt + sentVia no session.
   */
  sendWhatsApp: tenantProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      phone: z.string().min(10).max(20),
      customMessage: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.simulatorSession.findUnique({ where: { id: input.sessionId } });
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });

        const result = session.resultPayload as unknown as SimulationResult;
        const productValueBrl = (session.productValueCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        // Monta mensagem
        const lines: string[] = [];
        lines.push(`*Simulacao de Parcelamento*`);
        if (session.customerName) lines.push(`Cliente: ${session.customerName}`);
        lines.push(`Produto: ${productValueBrl}`);
        if (session.downPaymentCents > 0) {
          const entrada = (session.downPaymentCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
          lines.push(`Entrada: ${entrada}`);
        }
        lines.push("");
        lines.push(`Debito: ${formatBrl(result.debito.total)}`);
        lines.push(`Credito a vista: ${formatBrl(result.avista.total)}`);
        lines.push("");
        lines.push(`*Opcoes de parcelamento:*`);
        for (const p of result.parcelas.slice(0, 12)) {
          lines.push(`${p.n}x ${formatBrl(p.parcela)} — Total ${formatBrl(p.total)}`);
        }
        if (input.customMessage) {
          lines.push("");
          lines.push(input.customMessage);
        }
        const body = lines.join("\n");

        const sendResult = await sendCloudText(input.phone, body);
        if (!sendResult.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Falha ao enviar WhatsApp: ${sendResult.error ?? "erro desconhecido"}`,
          });
        }

        await tx.simulatorSession.update({
          where: { id: session.id },
          data: {
            sentAt: new Date(),
            sentVia: "whatsapp_cloud",
            customerPhone: input.phone,
          },
        });

        return { success: true, messageId: sendResult.messageId };
      });
    }),
});

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Gross-up formula: base * 100 / (100 - taxa)
 * Identical to Laravel SimuladorParcelamentoService::grossUp
 */
function grossUp(base: number, taxa: number): number {
  if (taxa <= 0) return Math.round(base * 100) / 100;
  const denom = 100 - taxa;
  if (denom <= 0) return Math.round(base * 100) / 100;
  return Math.round((base * 100) / denom * 100) / 100;
}
