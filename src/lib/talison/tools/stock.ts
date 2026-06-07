/**
 * Tools de estoque do Talison — somente leitura.
 *
 * Por decisão de negócio, aparelhos e acessórios vivem em tabelas separadas e
 * com REGRAS DE PREÇO DIFERENTES (resgatadas fielmente do Talison Laravel —
 * ChatbotController:4820). Assimetria crítica:
 *
 *  - buscar_aparelho → catalog_devices: usa o catálogo curado administrado em
 *    /aparelhos-catalogo. O preço efetivo (promotionalPrice ?? price) JÁ É o
 *    preço PIX/à vista. NÃO se aplica desconto. No débito/cartão o valor é
 *    MAIOR (acréscimo da operadora). A tool informa isso, sem recalcular.
 *
 *  - buscar_acessorio → products: o preço da tabela é o preço CHEIO (crédito).
 *    PIX tem 5% de desconto (preço × 0,95), padrão config chatbot.vendas.pix_desconto.
 *
 * Nunca inventa preço nem disponibilidade.
 */

import { z } from "zod";
import { formatBRL, type TalisonTool } from "@/lib/talison/tools/contract";

const MAX_RESULTS = 8;
const ACESSORIO_PIX_DISCOUNT = 0.05;

/** Tradução do enum DeviceCondition pra linguagem de cliente. */
const CONDITION_LABEL: Record<string, string> = {
  NEW: "novo",
  SEMI_NEW: "seminovo",
  USED: "usado",
  DISPLAY: "vitrine",
  REFURBISHED: "recondicionado",
  DEFECTIVE: "com defeito",
  novo: "novo",
  seminovo: "seminovo",
  usado: "usado",
};

const buscarAparelhoSchema = z.object({
  modelo: z
    .string()
    .describe("Modelo procurado — ex: 'iPhone 15', 'iPhone 15 Pro Max', 'MacBook Air', 'PlayStation 5'."),
  condicao: z
    .enum(["novo", "seminovo", "usado", "qualquer"])
    .optional()
    .describe("Filtra por condição, se o cliente especificar. Omita para qualquer."),
});

export const buscarAparelho: TalisonTool<typeof buscarAparelhoSchema> = {
  name: "buscar_aparelho",
  description:
    "Busca aparelhos disponíveis para venda (iPhone, iPad, MacBook, Apple Watch, AirPods, console). " +
    "Use SEMPRE que o cliente perguntar 'tem iPhone X?' ou 'quanto custa o aparelho Y?'. " +
    "IMPORTANTE: o preço retornado JÁ É o valor PROMOCIONAL no PIX/à vista — informe-o como tal. " +
    "No débito e no cartão de crédito o valor é MAIOR (acréscimo da operadora) — diga isso se o cliente " +
    "perguntar de cartão, mas NUNCA invente o valor do cartão; ofereça simular com um atendente. " +
    "Copie modelos e preços exatamente; nunca invente preço nem diga que tem aparelho fora da lista.",
  schema: buscarAparelhoSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const model = args.modelo.trim();
      const conditionFilter =
        args.condicao === "novo"
          ? { condition: { equals: "novo", mode: "insensitive" as const } }
          : args.condicao === "seminovo"
            ? { condition: { equals: "seminovo", mode: "insensitive" as const } }
            : args.condicao === "usado"
              ? { condition: { equals: "usado", mode: "insensitive" as const } }
              : {};

      const devices = await tx.catalogDevice.findMany({
        where: {
          tenantId: ctx.tenantId,
          available: true,
          deletedAt: null,
          ...conditionFilter,
          name: { contains: model, mode: "insensitive" },
        },
        orderBy: [{ price: "asc" }],
        take: MAX_RESULTS,
        select: { name: true, condition: true, price: true, promotionalPrice: true, description: true },
      });

      if (devices.length === 0) {
        return {
          ok: false as const,
          reason: `Não encontrei "${model}" entre os aparelhos disponíveis. Diga que vai confirmar a disponibilidade com um atendente (ou ofereça um modelo parecido, se o cliente quiser).`,
        };
      }

      const lines = devices.map((device) => {
        const effectivePrice = device.promotionalPrice ?? device.price;
        const price = effectivePrice == null ? 0 : Number(effectivePrice);
        // Preço da tabela JÁ É o PIX/à vista — não recalcula. Cartão é maior.
        const priceLabel = price > 0 ? `${formatBRL(price)} no PIX/à vista` : "preço sob consulta";
        const condition = CONDITION_LABEL[device.condition ?? ""] ?? device.condition ?? "";
        const note = device.description ? ` — ${device.description}` : "";
        return `${device.name} (${condition}): ${priceLabel}${note}`;
      });

      const aparelhos = devices.map((device) => {
        const effectivePrice = device.promotionalPrice ?? device.price;
        const price = effectivePrice == null ? 0 : Number(effectivePrice);
        return {
          modelo: device.name,
          condicao: CONDITION_LABEL[device.condition ?? ""] ?? device.condition ?? "",
          preco_pix: price > 0 ? formatBRL(price) : "sob consulta",
        };
      });
      // Nota fiel ao Laravel, pro modelo não confundir PIX com cartão.
      const footer =
        "\n_Valores no PIX/à vista. No débito e cartão de crédito o valor é maior (acréscimo da operadora)._";

      return {
        ok: true as const,
        data: {
          total: devices.length,
          observacao_pagamento: "preços são PIX/à vista; cartão tem acréscimo",
          aparelhos,
        },
        display: lines.join("\n") + footer,
      };
    });
  },
};

const buscarAcessorioSchema = z.object({
  termo: z
    .string()
    .describe("Acessório procurado — ex: 'capa S20', 'película iPhone 14', 'fone bluetooth', 'cabo usb-c'."),
});

export const buscarAcessorio: TalisonTool<typeof buscarAcessorioSchema> = {
  name: "buscar_acessorio",
  description:
    "Busca acessórios em estoque (capa, película, fone, cabo, carregador, etc). Use quando o cliente " +
    "perguntar por um acessório. Copie nomes e preços do retorno; nunca invente. Se vazio, ofereça transferir.",
  schema: buscarAcessorioSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const term = args.termo.trim();
      const products = await tx.product.findMany({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          deletedAt: null,
          isDevice: false,
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { brand: { contains: term, mode: "insensitive" } },
          ],
        },
        orderBy: [{ currentStock: "desc" }, { name: "asc" }],
        take: MAX_RESULTS,
        select: { name: true, salePrice: true, promotionalPrice: true, currentStock: true },
      });

      if (products.length === 0) {
        return {
          ok: false as const,
          reason: `Não encontrei "${term}" entre os acessórios. Diga que vai confirmar com um atendente.`,
        };
      }

      const lines = products.map((product) => {
        // Acessório: preço da tabela é o CHEIO (crédito); PIX tem 5% de desconto.
        const price = Number(product.promotionalPrice ?? product.salePrice);
        const priceLabel =
          price > 0
            ? `${formatBRL(price)} (PIX ${formatBRL(price * (1 - ACESSORIO_PIX_DISCOUNT))})`
            : "preço sob consulta";
        const availability = product.currentStock > 0 ? "em estoque" : "sob encomenda";
        return `${product.name}: ${priceLabel} — ${availability}`;
      });

      return {
        ok: true as const,
        data: {
          total: products.length,
          algum_em_estoque: products.some((p) => p.currentStock > 0),
        },
        display: lines.join("\n"),
      };
    });
  },
};
