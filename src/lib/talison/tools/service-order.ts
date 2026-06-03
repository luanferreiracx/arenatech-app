/**
 * Tools de Ordem de Serviço — status e garantia. Somente leitura.
 *
 * O cliente só vê dados que existem na OS dele. Status traduzido pra
 * linguagem de cliente (não expõe enum cru). Número/valor vêm prontos.
 */

import { z } from "zod";
import { formatBRL, type TalisonTool } from "@/lib/talison/tools/contract";

/** Tradução do enum ServiceOrderStatus pra linguagem de cliente. */
const STATUS_LABEL: Record<string, string> = {
  OPEN: "recebido, aguardando diagnóstico",
  IN_DIAGNOSIS: "em diagnóstico",
  WAITING_APPROVAL: "aguardando sua aprovação do orçamento",
  APPROVED: "orçamento aprovado, na fila de reparo",
  WAITING_PARTS: "aguardando peça",
  IN_PROGRESS: "em reparo",
  COMPLETED: "reparo concluído",
  PAID: "pago",
  READY_FOR_PICKUP: "pronto para retirada",
  DELIVERED: "entregue",
  IN_WARRANTY: "em garantia",
  CANCELLED: "cancelado",
  REFUNDED: "reembolsado",
};

const ACTIVE_WARRANTY_STATUSES = new Set(["DELIVERED", "PAID", "IN_WARRANTY", "COMPLETED"]);

/** Resolve a OS pelo número informado, ou a mais recente do contato. */
const osLookupSchema = z.object({
  numero_os: z
    .string()
    .optional()
    .describe("Número da OS, se o cliente informou. Sem número, busca a OS mais recente do contato."),
});

export const consultarStatusOs: TalisonTool<typeof osLookupSchema> = {
  name: "consultar_status_os",
  description:
    "Consulta o status atual de uma ordem de serviço (conserto). Use quando o " +
    "cliente perguntar 'como está meu aparelho', 'cadê minha OS', etc. " +
    "Retorna o status traduzido. Nunca invente status — só use o retorno desta tool.",
  schema: osLookupSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const order = await tx.serviceOrder.findFirst({
        where: {
          tenantId: ctx.tenantId,
          ...(args.numero_os
            ? { number: args.numero_os.trim() }
            : ctx.conversation.customerId
              ? { customerId: ctx.conversation.customerId }
              : { number: "__none__" }),
        },
        orderBy: { entryDate: "desc" },
        select: {
          number: true,
          status: true,
          deviceModel: true,
          estimatedDate: true,
          totalAmount: true,
          deliveredDate: true,
        },
      });

      if (!order) {
        return {
          ok: false as const,
          reason: args.numero_os
            ? `Nenhuma OS com número ${args.numero_os} encontrada para este contato.`
            : "Nenhuma OS encontrada para este contato. Peça o número da OS ou transfira pra um atendente.",
        };
      }

      const statusLabel = STATUS_LABEL[order.status] ?? order.status;
      const parts = [
        `OS ${order.number}`,
        order.deviceModel ? `(${order.deviceModel})` : "",
        `— status: ${statusLabel}`,
      ].filter(Boolean);
      if (order.estimatedDate) {
        parts.push(`. Previsão: ${order.estimatedDate.toLocaleDateString("pt-BR")}`);
      }

      return {
        ok: true as const,
        data: {
          numero: order.number,
          status: order.status,
          status_label: statusLabel,
          modelo: order.deviceModel,
          valor_total: formatBRL(order.totalAmount.toString()),
        },
        display: parts.join(" "),
      };
    });
  },
};

export const verificarGarantia: TalisonTool<typeof osLookupSchema> = {
  name: "verificar_garantia",
  description:
    "Verifica se uma OS ainda está dentro do prazo de garantia. Use quando o " +
    "cliente reclamar de problema após um conserto. Calcula a partir da data de " +
    "entrega + meses de garantia da OS. Nunca estime garantia de memória.",
  schema: osLookupSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const order = await tx.serviceOrder.findFirst({
        where: {
          tenantId: ctx.tenantId,
          ...(args.numero_os
            ? { number: args.numero_os.trim() }
            : ctx.conversation.customerId
              ? { customerId: ctx.conversation.customerId }
              : { number: "__none__" }),
        },
        orderBy: { entryDate: "desc" },
        select: {
          number: true,
          status: true,
          warrantyMonths: true,
          deliveredDate: true,
          deviceModel: true,
        },
      });

      if (!order) {
        return {
          ok: false as const,
          reason: "Não encontrei a OS pra verificar garantia. Peça o número ou transfira pra um atendente.",
        };
      }

      if (!order.deliveredDate || !ACTIVE_WARRANTY_STATUSES.has(order.status)) {
        return {
          ok: true as const,
          data: { numero: order.number, em_garantia: false, motivo: "aparelho ainda não entregue" },
          display: `A OS ${order.number} ainda não foi entregue, então a garantia ainda não começou a contar.`,
        };
      }

      const expiresAt = new Date(order.deliveredDate);
      expiresAt.setMonth(expiresAt.getMonth() + order.warrantyMonths);
      // Comparação contra "agora" feita pela tool (não pelo modelo) — data é dado, não palpite.
      const now = new Date();
      const inWarranty = now <= expiresAt;

      return {
        ok: true as const,
        data: {
          numero: order.number,
          em_garantia: inWarranty,
          expira_em: expiresAt.toLocaleDateString("pt-BR"),
          meses_garantia: order.warrantyMonths,
        },
        display: inWarranty
          ? `A OS ${order.number} (${order.deviceModel ?? "aparelho"}) está em garantia até ${expiresAt.toLocaleDateString("pt-BR")}.`
          : `A garantia da OS ${order.number} expirou em ${expiresAt.toLocaleDateString("pt-BR")}.`,
      };
    });
  },
};
