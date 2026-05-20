import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { simulateSchema } from "@/lib/validators/simulator";
import type { SimulationResult } from "@/lib/validators/simulator";
import { sendCloudText } from "@/lib/services/whatsapp-cloud-service";

/**
 * Simulador de parcelamento.
 *
 * Usa as taxas de InstallmentRule do tenant. A formula e identica ao Laravel:
 * valorComTaxa = (valor * 100) / (100 - taxa)
 *
 * As taxas de debito e credito avista vem de PaymentMethod.feePercent.
 * As taxas de parcelamento vem de InstallmentRule.feePercent.
 */
export const simulatorRouter = createTRPCRouter({
  simulate: tenantProcedure
    .input(simulateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const valorProduto = input.valorProduto;
        const valorEntrada = input.valorEntrada ?? 0;
        const valorFinanciar = Math.max(0, valorProduto - valorEntrada);

        // Get payment methods with their fees
        const paymentMethods = await tx.paymentMethod.findMany({
          where: { active: true },
          include: {
            installmentRules: {
              orderBy: { installments: "asc" },
            },
          },
        });

        // Find debit and credit methods
        const debitMethod = paymentMethods.find((pm) => pm.type === "DEBIT_CARD");
        const creditMethod = paymentMethods.find((pm) => pm.type === "CREDIT_CARD");

        const taxaDebito = debitMethod ? Number(debitMethod.feePercent) : 0;
        const taxaAvista = creditMethod ? Number(creditMethod.feePercent) : 0;

        // Calculate debit total
        const debitoTotal = grossUp(valorFinanciar, taxaDebito);

        // Calculate credit a vista
        const avistaTotal = grossUp(valorFinanciar, taxaAvista);

        // Calculate installments from rules
        const parcelas: SimulationResult["parcelas"] = [];

        if (creditMethod) {
          const rules = creditMethod.installmentRules;
          for (const rule of rules) {
            const n = rule.installments;
            const taxa = Number(rule.feePercent);

            // Check minimum amount
            const minAmount = Number(rule.minAmount);
            if (minAmount > 0 && valorFinanciar < minAmount) continue;

            const total = grossUp(valorFinanciar, taxa);
            parcelas.push({
              n,
              taxa,
              total,
              parcela: Math.round((total / n) * 100) / 100,
            });
          }
        }

        const result: SimulationResult = {
          valorProduto,
          valorEntrada,
          valorFinanciar,
          debito: { taxa: taxaDebito, total: debitoTotal },
          avista: { taxa: taxaAvista, total: avistaTotal },
          parcelas,
          maxParcelas: parcelas.length > 0 ? parcelas[parcelas.length - 1]!.n : 1,
        };

        return result;
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
