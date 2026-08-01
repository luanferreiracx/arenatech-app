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
  cpf: z
    .string()
    .optional()
    .describe(
      "CPF do cliente. Use quando o contato não estiver vinculado a um cadastro: CPF e " +
        "numero_os JUNTOS liberam a consulta. CPF sozinho, ou número sozinho, não bastam.",
    ),
});

const CPF_DIGITS = 11;

/** O CPF chega como o cliente digitou — "912.931.893-91", com espaços, etc. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export const consultarStatusOs: TalisonTool<typeof osLookupSchema> = {
  name: "consultar_status_os",
  description:
    "Consulta o status atual de uma ordem de serviço (conserto). Use quando o " +
    "cliente perguntar 'como está meu aparelho', 'cadê minha OS', etc. " +
    "Retorna o status traduzido. Nunca invente status — só use o retorno desta tool.",
  schema: osLookupSchema,
  async execute(args, ctx) {
    // IDOR (auditoria 2026-07-25): o número da OS é sequencial e fácil de
    // adivinhar, então NUNCA vale como chave sozinho. A posse vem de:
    //   (a) CPF + número da OS, que precisam bater entre si, ou
    //   (b) o contato já vinculado a um cadastro pelo telefone.
    //
    // (a) vem PRIMEIRO de propósito: o aparelho em conserto costuma ser o
    // próprio celular cadastrado, então quem fala com o bot quase nunca está no
    // telefone da OS — está num aparelho emprestado. O vínculo por telefone,
    // quando existe, pode inclusive ser de OUTRA pessoa (o dono do aparelho
    // emprestado); por isso o CPF informado tem precedência sobre ele.
    const ownerId = ctx.conversation.customerId;
    const cpf = onlyDigits(args.cpf ?? "");
    const numeroOs = args.numero_os?.trim();
    const provaPorCpf = cpf.length === CPF_DIGITS && Boolean(numeroOs);

    if (!provaPorCpf && !ownerId) {
      return {
        ok: false as const,
        reason:
          "Não consegui identificar o cadastro deste contato — o que é normal, já que o celular em conserto costuma ser o número cadastrado. " +
          "Peça o CPF E o número da OS na MESMA mensagem, que eu consulto na hora. Se o cliente já mandou os dois e não bateu, não repita o pedido: transfira pra um atendente.",
      };
    }

    return ctx.withTenant(async (tx) => {
      let customerId = ownerId;
      if (provaPorCpf) {
        const customer = await tx.customer.findFirst({
          where: { tenantId: ctx.tenantId, cpf, deletedAt: null },
          select: { id: true },
        });
        if (!customer) {
          return {
            ok: false as const,
            // Mesma resposta pra CPF inexistente e pra par que não confere —
            // não confirma se aquele número de OS existe.
            reason:
              "CPF e número da OS não conferem. Peça pro cliente revisar os dois; se insistir sem bater, transfira pra um atendente.",
          };
        }
        customerId = customer.id;
      }

      // Defesa em profundidade: o guard acima já garante um dos dois caminhos de
      // posse, mas sem esta checagem um customerId nulo viraria filtro vazio —
      // e filtro vazio numa consulta de OS é exatamente o IDOR de volta.
      if (!customerId) {
        return {
          ok: false as const,
          reason: "Não consegui identificar o cadastro. Transfira pra um atendente.",
        };
      }

      const order = await tx.serviceOrder.findFirst({
        where: {
          tenantId: ctx.tenantId,
          customerId,
          ...(numeroOs ? { number: numeroOs } : {}),
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
    // IDOR (auditoria 2026-07-25): o número da OS é sequencial e fácil de
    // adivinhar, então NUNCA vale como chave sozinho. A posse vem de:
    //   (a) CPF + número da OS, que precisam bater entre si, ou
    //   (b) o contato já vinculado a um cadastro pelo telefone.
    //
    // (a) vem PRIMEIRO de propósito: o aparelho em conserto costuma ser o
    // próprio celular cadastrado, então quem fala com o bot quase nunca está no
    // telefone da OS — está num aparelho emprestado. O vínculo por telefone,
    // quando existe, pode inclusive ser de OUTRA pessoa (o dono do aparelho
    // emprestado); por isso o CPF informado tem precedência sobre ele.
    const ownerId = ctx.conversation.customerId;
    const cpf = onlyDigits(args.cpf ?? "");
    const numeroOs = args.numero_os?.trim();
    const provaPorCpf = cpf.length === CPF_DIGITS && Boolean(numeroOs);

    if (!provaPorCpf && !ownerId) {
      return {
        ok: false as const,
        reason:
          "Não consegui identificar o cadastro deste contato — o que é normal, já que o celular em conserto costuma ser o número cadastrado. " +
          "Peça o CPF E o número da OS na MESMA mensagem, que eu consulto na hora. Se o cliente já mandou os dois e não bateu, não repita o pedido: transfira pra um atendente.",
      };
    }

    return ctx.withTenant(async (tx) => {
      let customerId = ownerId;
      if (provaPorCpf) {
        const customer = await tx.customer.findFirst({
          where: { tenantId: ctx.tenantId, cpf, deletedAt: null },
          select: { id: true },
        });
        if (!customer) {
          return {
            ok: false as const,
            // Mesma resposta pra CPF inexistente e pra par que não confere —
            // não confirma se aquele número de OS existe.
            reason:
              "CPF e número da OS não conferem. Peça pro cliente revisar os dois; se insistir sem bater, transfira pra um atendente.",
          };
        }
        customerId = customer.id;
      }

      // Defesa em profundidade: o guard acima já garante um dos dois caminhos de
      // posse, mas sem esta checagem um customerId nulo viraria filtro vazio —
      // e filtro vazio numa consulta de OS é exatamente o IDOR de volta.
      if (!customerId) {
        return {
          ok: false as const,
          reason: "Não consegui identificar o cadastro. Transfira pra um atendente.",
        };
      }

      const order = await tx.serviceOrder.findFirst({
        where: {
          tenantId: ctx.tenantId,
          customerId,
          ...(numeroOs ? { number: numeroOs } : {}),
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
