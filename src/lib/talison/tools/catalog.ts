/**
 * Tools de catálogo de serviços — estimar orçamento e listar serviços.
 * Somente leitura. Preço SEMPRE vem do banco (base_price), formatado.
 *
 * Regra de preço de SERVIÇO (resgatada do Laravel / confirmada pelo dono):
 * o base_price é o preço CHEIO (cartão). No PIX/à vista há 5% de desconto,
 * OU até 6x sem juros no cartão. A tool informa isso; não recalcula a parcela
 * (parcelamento detalhado é a tool simular_parcelamento).
 */

import { z } from "zod";
import { formatBRL, type TalisonTool } from "@/lib/talison/tools/contract";

const MAX_RESULTS = 8;
const SERVICE_PIX_DISCOUNT = 0.05;
const SERVICE_MAX_INTEREST_FREE = 6;

const estimarSchema = z.object({
  servico: z
    .string()
    .describe("O que o cliente quer consertar — ex: 'troca de tela', 'bateria'."),
  modelo: z
    .string()
    .optional()
    .describe("Modelo do aparelho, se informado — ex: 'iPhone 13'. Refina o preço."),
});

export const estimarOrcamento: TalisonTool<typeof estimarSchema> = {
  name: "estimar_orcamento",
  description:
    "Estima o preço de um serviço consultando a tabela de preços. Use SEMPRE que " +
    "o cliente perguntar quanto custa um conserto. O valor retornado é o oficial — " +
    "copie-o exatamente. Se não houver preço cadastrado, diga que vai confirmar com um atendente.",
  schema: estimarSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const services = await tx.service.findMany({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          deletedAt: null,
          name: { contains: args.servico.trim(), mode: "insensitive" },
          ...(args.modelo
            ? { deviceModel: { contains: args.modelo.trim(), mode: "insensitive" } }
            : {}),
        },
        orderBy: { basePrice: "asc" },
        take: MAX_RESULTS,
        select: { name: true, basePrice: true, deviceModel: true, estimatedTime: true },
      });

      if (services.length === 0) {
        return {
          ok: false as const,
          reason: `Não há preço cadastrado para "${args.servico}"${args.modelo ? ` no ${args.modelo}` : ""}. Diga ao cliente que vai confirmar o valor com um atendente.`,
        };
      }

      const lines = services.map((service) => {
        const model = service.deviceModel ? ` (${service.deviceModel})` : "";
        const time = service.estimatedTime ? ` — ${service.estimatedTime}` : "";
        const full = Number(service.basePrice);
        const pix = formatBRL(full * (1 - SERVICE_PIX_DISCOUNT));
        return `${service.name}${model}: ${formatBRL(full)} (PIX/à vista ${pix})${time}`;
      });
      const footer = `\n_No PIX/à vista: 5% de desconto. No cartão: até ${SERVICE_MAX_INTEREST_FREE}x sem juros._`;

      return {
        ok: true as const,
        data: {
          condicoes_pagamento: `PIX/à vista -5%; até ${SERVICE_MAX_INTEREST_FREE}x sem juros no cartão`,
          servicos: services.map((service) => ({
            nome: service.name,
            modelo: service.deviceModel,
            preco_cartao: formatBRL(service.basePrice.toString()),
            preco_pix: formatBRL(Number(service.basePrice) * (1 - SERVICE_PIX_DISCOUNT)),
          })),
        },
        display: lines.join("\n") + footer,
      };
    });
  },
};

const listarSchema = z.object({
  modelo: z
    .string()
    .optional()
    .describe("Filtra os serviços por modelo de aparelho, se informado."),
});

export const listarServicos: TalisonTool<typeof listarSchema> = {
  name: "listar_servicos",
  description:
    "Lista os serviços disponíveis com seus preços. Use quando o cliente perguntar " +
    "'o que vocês fazem' ou 'quais serviços têm'. Copie nomes e preços do retorno.",
  schema: listarSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const services = await tx.service.findMany({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          deletedAt: null,
          ...(args.modelo
            ? { deviceModel: { contains: args.modelo.trim(), mode: "insensitive" } }
            : {}),
        },
        orderBy: { name: "asc" },
        take: MAX_RESULTS,
        select: { name: true, basePrice: true, deviceModel: true },
      });

      if (services.length === 0) {
        return {
          ok: false as const,
          reason: "Nenhum serviço cadastrado encontrado. Transfira pra um atendente.",
        };
      }

      const lines = services.map(
        (service) =>
          `${service.name}${service.deviceModel ? ` (${service.deviceModel})` : ""}: ${formatBRL(service.basePrice.toString())}`,
      );

      return {
        ok: true as const,
        data: { total: services.length },
        display: lines.join("\n"),
      };
    });
  },
};
