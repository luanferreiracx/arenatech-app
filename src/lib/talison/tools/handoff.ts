/**
 * Tools de escrita do Talison — qualificar lead e transferir pra humano.
 * São ações do próprio atendimento, não edição de dados do sistema.
 */

import { z } from "zod";
import { toggleStatus } from "@/lib/talison/chatwoot-client";
import { recordTalisonMetric } from "@/lib/talison/metrics";
import { sendGroupMessage } from "@/lib/services/whatsapp-service";
import { logger } from "@/lib/logger";
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

const leadQuenteSchema = z.object({
  produto_modelo: z
    .string()
    .describe("Produto/modelo que o cliente quer comprar — ex: 'iPhone 16 Pro 256GB', 'PS5 Slim'."),
  forma_pagamento: z
    .string()
    .optional()
    .describe("Forma de pagamento mencionada — ex: 'PIX', 'cartão 12x', 'tem aparelho pra troca'."),
  nome: z
    .string()
    .optional()
    .describe("Nome do cliente, se informado na conversa."),
  observacoes: z
    .string()
    .optional()
    .describe("Resumo curto do contexto/urgência pro vendedor pegar o lead já com tudo."),
});

export const sinalizarLeadQuente: TalisonTool<typeof leadQuenteSchema> = {
  name: "sinalizar_lead_quente",
  description:
    "Use quando perceber ALTA probabilidade de fechar a venda: o cliente pediu o preço " +
    "final/parcelamento, disse 'quero comprar', confirmou modelo + forma de pagamento, ou " +
    "demonstrou urgência clara. Registra o lead no sistema E avisa o time de vendas no grupo " +
    "pra um vendedor assumir. Chame UMA vez por lead. Depois de chamar, ofereça naturalmente " +
    "transferir o cliente pra um atendente humano finalizar (use transferir_para_humano se ele aceitar).",
  mutates: true,
  schema: leadQuenteSchema,
  async execute(args, ctx) {
    const desiredModel = args.produto_modelo.trim();
    const notesParts = [
      args.forma_pagamento?.trim() ? `Pagamento: ${args.forma_pagamento.trim()}` : null,
      args.observacoes?.trim() || null,
    ].filter(Boolean);
    const notes = notesParts.length ? notesParts.join(" | ") : null;
    const leadName = args.nome?.trim() || ctx.conversation.contactName || "Contato WhatsApp";

    // Registra/atualiza o interesse (lead) — idempotente por contato+tipo aberto.
    const leadId = await ctx.withTenant(async (tx) => {
      const existing = await tx.interest.findFirst({
        where: {
          tenantId: ctx.tenantId,
          phone: { contains: ctx.conversation.contactPhone.slice(-9) },
          type: "PURCHASE",
          status: "WAITING",
        },
        select: { id: true },
      });
      if (existing) {
        await tx.interest.update({
          where: { id: existing.id },
          data: { desiredModel, notes, customerName: leadName },
        });
        return existing.id;
      }
      const created = await tx.interest.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: ctx.conversation.customerId,
          customerName: leadName,
          phone: ctx.conversation.contactPhone,
          type: "PURCHASE",
          desiredModel,
          notes,
          status: "WAITING",
        },
        select: { id: true },
      });
      return created.id;
    });

    // Avisa o time no grupo do WhatsApp (mesmo grupo do alerta de abandono).
    // Falha de entrega não invalida a tool — o lead já está registrado.
    // T1 (multi-tenant): o grupo global (env) é do tenant CENTRAL (arena-tech).
    // Só ele posta nele — um 2º tenant NÃO pode vazar seus leads pro grupo da
    // Arena. Config de grupo por-tenant é follow-up (quando um 2º tenant usar o bot).
    const groupJid = ctx.isCentralTenant ? process.env.TALISON_ALERT_GROUP_JID : undefined;
    if (!ctx.isCentralTenant) {
      logger.info("Talison: lead quente de tenant não-central — alerta de grupo pulado (fail-safe T1)", {
        conversationId: ctx.conversation.id,
        tenantSlug: ctx.tenantSlug,
      });
    }
    if (groupJid) {
      const lines = [
        "🔥 *Lead quente no WhatsApp!*",
        `👤 ${leadName}`,
        `📱 ${desiredModel}`,
        args.forma_pagamento?.trim() ? `💳 ${args.forma_pagamento.trim()}` : null,
        args.observacoes?.trim() ? `📝 ${args.observacoes.trim()}` : null,
        `📞 ${ctx.conversation.contactPhone}`,
        "",
        "Cliente com forte intenção de compra — um vendedor pode assumir pra fechar.",
      ].filter(Boolean) as string[];
      const sent = await sendGroupMessage(groupJid, lines.join("\n"), {
        instanceName: process.env.TALISON_ALERT_INSTANCE,
      });
      if (!sent.success) {
        logger.warn("Talison: falha ao avisar grupo sobre lead quente", {
          conversationId: ctx.conversation.id,
          error: sent.error,
        });
      }
    }

    recordTalisonMetric("hot_lead", {
      conversationId: ctx.conversation.id,
      produto: desiredModel,
    });

    return {
      ok: true as const,
      data: { lead_id: leadId, avisou_time: !!groupJid },
      display: "Lead quente registrado e o time de vendas foi avisado. Pode oferecer transferir pra um atendente finalizar.",
    };
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
