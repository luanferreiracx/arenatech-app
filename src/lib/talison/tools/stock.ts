/**
 * Tools de estoque do Talison — somente leitura.
 *
 * Por decisão de negócio, aparelhos e acessórios vivem em tabelas separadas:
 *  - buscar_aparelho → available_devices (catálogo curado de aparelhos à venda)
 *  - buscar_acessorio → products (capas, películas, fones, cabos)
 *
 * Preço sempre do banco, formatado. PIX -5% (padrão herdado do Laravel).
 * Nunca inventa preço nem disponibilidade.
 */

import { z } from "zod";
import { formatBRL, type TalisonTool } from "@/lib/talison/tools/contract";

const MAX_RESULTS = 8;
const PIX_DISCOUNT = 0.05;

/** Tradução do enum DeviceCondition pra linguagem de cliente. */
const CONDITION_LABEL: Record<string, string> = {
  NEW: "novo",
  SEMI_NEW: "seminovo",
  USED: "usado",
  DISPLAY: "vitrine",
  REFURBISHED: "recondicionado",
  DEFECTIVE: "com defeito",
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
    "Copie modelos e preços do retorno; nunca invente preço nem diga que tem aparelho que não veio na lista.",
  schema: buscarAparelhoSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const model = args.modelo.trim();
      const conditionFilter =
        args.condicao === "novo"
          ? { condition: "NEW" as const }
          : args.condicao === "seminovo"
            ? { condition: "SEMI_NEW" as const }
            : args.condicao === "usado"
              ? { condition: "USED" as const }
              : {};

      const devices = await tx.availableDevice.findMany({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          deletedAt: null,
          ...conditionFilter,
          model: { contains: model, mode: "insensitive" },
        },
        orderBy: [{ price: "asc" }],
        take: MAX_RESULTS,
        select: { model: true, condition: true, price: true, note: true },
      });

      if (devices.length === 0) {
        return {
          ok: false as const,
          reason: `Não encontrei "${model}" entre os aparelhos disponíveis. Diga que vai confirmar a disponibilidade com um atendente (ou ofereça um modelo parecido, se o cliente quiser).`,
        };
      }

      const lines = devices.map((device) => {
        const price = Number(device.price);
        const priceLabel =
          price > 0 ? `${formatBRL(price)} (PIX ${formatBRL(price * (1 - PIX_DISCOUNT))})` : "preço sob consulta";
        const condition = CONDITION_LABEL[device.condition] ?? device.condition;
        const note = device.note ? ` — ${device.note}` : "";
        return `${device.model} (${condition}): ${priceLabel}${note}`;
      });

      return {
        ok: true as const,
        data: {
          total: devices.length,
          aparelhos: devices.map((device) => ({
            modelo: device.model,
            condicao: CONDITION_LABEL[device.condition] ?? device.condition,
            preco: Number(device.price) > 0 ? formatBRL(Number(device.price)) : "sob consulta",
          })),
        },
        display: lines.join("\n"),
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
        const price = Number(product.promotionalPrice ?? product.salePrice);
        const priceLabel =
          price > 0 ? `${formatBRL(price)} (PIX ${formatBRL(price * (1 - PIX_DISCOUNT))})` : "preço sob consulta";
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
