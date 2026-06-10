/**
 * Tools de escrita do Talison — qualificar lead e transferir pra humano.
 * São ações do próprio atendimento, não edição de dados do sistema.
 */

import { z } from "zod";
import { toggleStatus } from "@/lib/talison/chatwoot-client";
import { recordTalisonMetric } from "@/lib/talison/metrics";
import type { TalisonTool } from "@/lib/talison/tools/contract";

const qualificarLeadSchema = z.object({
  tipo: z
    .enum(["PURCHASE", "REPAIR", "TRADE"])
    .describe("PURCHASE = quer comprar aparelho; REPAIR = quer consertar; TRADE = quer trocar/vender."),
  modelo_interesse: z
    .string()
    .optional()
    .describe("Modelo que o cliente quer comprar/trocar, se mencionado."),
  observacoes: z
    .string()
    .optional()
    .describe("Resumo curto do que o cliente quer, pra o atendente humano ter contexto."),
});

export const qualificarLead: TalisonTool<typeof qualificarLeadSchema> = {
  name: "qualificar_lead",
  description:
    "Registra o cliente como um lead (interesse) quando ele demonstra intenção clara de " +
    "comprar, consertar ou trocar. Use ANTES de transferir pra humano em casos de venda, " +
    "pra o atendente já receber o contexto. Não registre o mesmo lead duas vezes na conversa.",
  mutates: true,
  schema: qualificarLeadSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      // Idempotência simples: se já existe interesse aberto pra este contato no
      // mesmo tipo, atualiza em vez de duplicar.
      const existing = await tx.interest.findFirst({
        where: {
          tenantId: ctx.tenantId,
          phone: { contains: ctx.conversation.contactPhone.slice(-9) },
          type: args.tipo,
          status: "WAITING",
        },
        select: { id: true },
      });

      const notes = args.observacoes?.trim() || null;
      const desiredModel = args.modelo_interesse?.trim() || null;

      if (existing) {
        await tx.interest.update({
          where: { id: existing.id },
          data: { desiredModel, notes },
        });
        return {
          ok: true as const,
          data: { lead_id: existing.id, atualizado: true },
          display: "Lead atualizado com o novo interesse.",
        };
      }

      const interest = await tx.interest.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: ctx.conversation.customerId,
          customerName: ctx.conversation.contactName ?? "Contato WhatsApp",
          phone: ctx.conversation.contactPhone,
          type: args.tipo,
          desiredModel,
          notes,
          status: "WAITING",
        },
        select: { id: true },
      });

      recordTalisonMetric("lead_qualified", {
        conversationId: ctx.conversation.id,
        tipo: args.tipo,
      });

      return {
        ok: true as const,
        data: { lead_id: interest.id, atualizado: false },
        display: "Interesse registrado. Pode seguir pro fechamento ou transferir pra um atendente.",
      };
    });
  },
};

const transferirSchema = z.object({
  motivo: z
    .string()
    .describe("Por que está transferindo — ex: 'cliente pediu atendente', 'fora do escopo do bot'."),
});

export const transferirParaHumano: TalisonTool<typeof transferirSchema> = {
  name: "transferir_para_humano",
  description:
    "Transfere a conversa pra um atendente humano. Use quando: o cliente pedir, o assunto " +
    "fugir do escopo (assistência/venda), houver frustração, ou uma tool não tiver achado o " +
    "dado necessário. Após transferir, avise o cliente que um atendente vai continuar.",
  mutates: true,
  schema: transferirSchema,
  async execute(args, ctx) {
    await ctx.withTenant(async (tx) => {
      // Cancela follow-ups pendentes — humano assumiu. A decisão de o bot
      // participar ou calar é feita pelo status atual do Chatwoot: ao abrir a
      // conversa abaixo, o webhook espelha `open` para `OPEN`.
      await tx.chatbotFollowUp.updateMany({
        where: { conversationId: ctx.conversation.id, cancelled: false, executedAt: null },
        data: { cancelled: true },
      });
    });

    // Reabre a conversa no Chatwoot pra entrar na fila dos atendentes.
    // Fora da tx: chamada de rede não deve segurar transação do banco.
    if (ctx.conversation.externalId) {
      await toggleStatus(ctx.conversation.externalId, "open");
    }

    recordTalisonMetric("handoff", {
      conversationId: ctx.conversation.id,
      motivo: args.motivo,
    });

    return {
      ok: true as const,
      data: { transferido: true, motivo: args.motivo },
      display: "Conversa transferida pra um atendente humano.",
    };
  },
};
