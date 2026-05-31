import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  simulateSchema,
  updateSimulatorConfigSchema,
  sendSimulationWhatsAppSchema,
} from "@/lib/validators/simulator";
import type { SimulationResult } from "@/lib/validators/simulator";
import {
  DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
  DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE,
  DEFAULT_SIMULATOR_DEBIT_FEE,
  defaultSimulatorTiers,
} from "@/lib/simulator-defaults";
import { sendPdfWithFallback } from "@/lib/whatsapp/send-with-fallback";
import { createSignedPayloadToken } from "@/lib/whatsapp/signed-payload-token";
import type { SimulatorPdfData } from "@/lib/pdf/simulator-pdf";
import { logger } from "@/lib/logger";

type SimulatorTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type ConfigWithTiers = Prisma.SimulatorRateConfigGetPayload<{
  include: { tiers: true };
}>;

/**
 * Carrega a config de taxas do simulador (read-only). Se o tenant ainda nao tem
 * registro, retorna os defaults Laravel em memoria — sem escrever no banco. A
 * criacao real acontece no seed do tenant ou em updateConfig.
 */
async function loadSimulatorConfig(
  tx: SimulatorTx,
  tenantId: string,
): Promise<{
  creditAvistaFeePercent: number;
  debitFeePercent: number;
  maxInstallments: number;
  tiers: Array<{ installments: number; feePercent: number }>;
}> {
  const existing = await tx.simulatorRateConfig.findUnique({
    where: { tenantId },
    include: { tiers: true },
  });
  if (existing) {
    return {
      creditAvistaFeePercent: Number(existing.creditAvistaFeePercent),
      debitFeePercent: Number(existing.debitFeePercent),
      maxInstallments: existing.maxInstallments,
      tiers: existing.tiers.map((t) => ({
        installments: t.installments,
        feePercent: Number(t.feePercent),
      })),
    };
  }
  return {
    creditAvistaFeePercent: DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE,
    debitFeePercent: DEFAULT_SIMULATOR_DEBIT_FEE,
    maxInstallments: DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
    tiers: defaultSimulatorTiers(),
  };
}

/**
 * Garante a config persistida (usado por updateConfig). Cria com defaults se
 * inexistente. Aqui SIM escreve no banco — e o unico ponto de criacao.
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
 * Calcula a simulacao completa a partir da config (read-only). Centraliza a
 * logica usada por `simulate` (query) e `sendWhatsApp`.
 *
 * IMPORTANTE: usa as taxas EXIBIDAS AO CLIENTE (SimulatorRateConfig), que tem
 * margem embutida. NAO usa as taxas reais do PDV. Formula gross-up:
 * valorComTaxa = (valor * 100) / (100 - taxa). Paridade Laravel
 * SimuladorParcelamentoService.
 */
function computeSimulation(
  config: Awaited<ReturnType<typeof loadSimulatorConfig>>,
  valorProduto: number,
  valorEntrada: number,
): SimulationResult {
  const valorFinanciar = Math.max(0, valorProduto - valorEntrada);
  const taxaDebito = config.debitFeePercent;
  const taxaAvista = config.creditAvistaFeePercent;

  // Parcelas a partir dos tiers, limitadas a maxInstallments.
  // Paridade Laravel: so exibe parcela com taxa > 0 (juros 0 = nao oferta).
  const parcelas: SimulationResult["parcelas"] = config.tiers
    .filter(
      (tier) =>
        tier.installments <= config.maxInstallments && tier.feePercent > 0,
    )
    .sort((a, b) => a.installments - b.installments)
    .map((tier) => {
      const n = tier.installments;
      const taxa = tier.feePercent;
      const total = grossUp(valorFinanciar, taxa);
      return { n, taxa, total, parcela: Math.round((total / n) * 100) / 100 };
    });

  return {
    valorProduto,
    valorEntrada,
    valorFinanciar,
    debito: { taxa: taxaDebito, total: grossUp(valorFinanciar, taxaDebito) },
    avista: { taxa: taxaAvista, total: grossUp(valorFinanciar, taxaAvista) },
    parcelas,
    maxParcelas: config.maxInstallments,
  };
}

export const simulatorRouter = createTRPCRouter({
  /** Calcula a simulacao (query pura — sem efeitos colaterais). */
  simulate: tenantProcedure
    .input(simulateSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const config = await loadSimulatorConfig(tx, ctx.tenantId);
        return computeSimulation(
          config,
          input.valorProduto,
          input.valorEntrada ?? 0,
        );
      });
    }),

  /**
   * Envia a simulacao por WhatsApp (Cloud API). Stateless: recalcula, gera o
   * PDF transiente (token efemero) e usa o fallback inteligente — texto dentro
   * da janela 24h, ou template `simulacao_pdf` (HEADER DOCUMENT) fora dela.
   */
  sendWhatsApp: tenantProcedure
    .input(sendSimulationWhatsAppSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.withTenant(async (tx) => {
        const config = await loadSimulatorConfig(tx, ctx.tenantId);
        return computeSimulation(
          config,
          input.valorProduto,
          input.valorEntrada ?? 0,
        );
      });

      // Nome da loja: prioriza o trade name das settings de assistencia, com
      // fallback para o nome do tenant.
      const tenantName = await ctx.withTenant(async (tx) => {
        const settings = await tx.tenantAssistanceSettings.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { assistanceName: true },
        });
        if (settings?.assistanceName) return settings.assistanceName;
        const t = await tx.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: { name: true },
        });
        return t?.name ?? "Arena Tech";
      });

      const customerName = input.customerName?.trim() || "Cliente";
      const generatedAt = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date());

      const pdfData: SimulatorPdfData = {
        tenantName,
        customerName,
        valorProduto: result.valorProduto,
        valorEntrada: result.valorEntrada,
        valorFinanciar: result.valorFinanciar,
        debito: result.debito,
        avista: result.avista,
        parcelas: result.parcelas,
        generatedAt,
      };

      // Token HMAC carregando o payload da simulacao (TTL 1h). Sem Redis/banco.
      const token = createSignedPayloadToken<SimulatorPdfData>(pdfData, 60 * 60 * 1000);
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.NEXTAUTH_URL ??
        "https://app.arenatechpi.com.br";
      const pdfUrl = `${appUrl}/api/whatsapp-media/simulator/pdf/${token}`;

      const sendResult = await sendPdfWithFallback({
        phone: input.phone,
        pdfUrl,
        fileName: "simulacao.pdf",
        caption: `Ola, ${customerName}! Segue a simulacao de parcelamento solicitada.`,
        contexto: "simulacao_pdf",
        params: [customerName],
      });

      if (!sendResult.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao enviar WhatsApp: ${sendResult.error ?? "erro desconhecido"}`,
        });
      }

      logger.info("Simulator WhatsApp sent", {
        tenantId: ctx.tenantId,
        via: sendResult.via,
        templateUsed: sendResult.templateUsed,
      });

      return { success: true, via: sendResult.via, messageId: sendResult.messageId };
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
});

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
