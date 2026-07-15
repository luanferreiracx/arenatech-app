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

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { formatBRL, type TalisonTool, type TalisonToolContext } from "@/lib/talison/tools/contract";
import { searchWords, expandWord } from "@/lib/search/synonyms";

const MAX_RESULTS = 8;
const ACESSORIO_PIX_DISCOUNT = 0.05;

/** Base do catálogo do tenant CENTRAL (arena-tech), configurável por env. */
const CENTRAL_CATALOG_BASE_URL = process.env.TALISON_CATALOG_URL ?? "https://catalogo.arenatechpi.com.br";
/** Domínio-base do catálogo multi-tenant (subdomínio por slug). */
const CATALOG_BASE_DOMAIN = "pdvdepix.app";

/**
 * Base do catálogo POR TENANT (T1): o central usa o domínio próprio (env); os
 * demais usam o subdomínio do catálogo (`{slug}.pdvdepix.app`). Sem isso, o bot
 * de qualquer tenant apontava o cliente pro catálogo da Arena (vazamento).
 */
function resolveCatalogBaseUrl(ctx: TalisonToolContext): string {
  if (ctx.isCentralTenant) return CENTRAL_CATALOG_BASE_URL;
  return `https://${ctx.tenantSlug}.${CATALOG_BASE_DOMAIN}`;
}

/** Monta o link do catálogo público com a busca do cliente já aplicada. */
function catalogSearchLink(baseUrl: string, term: string): string {
  return `${baseUrl.replace(/\/$/, "")}/catalog?q=${encodeURIComponent(term)}`;
}

const STORAGE_OR_COLOR_WORDS = new Set(["64", "64gb", "128", "128gb", "256", "256gb", "512", "512gb", "1tb"]);

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
  Novo: "novo",
  Seminovo: "seminovo",
  Usado: "usado",
};

const productStockWhere: Prisma.ProductWhereInput = {
  OR: [
    { isSerialized: true, stockItems: { some: { status: "AVAILABLE", deletedAt: null } } },
    { hasVariations: true, variations: { some: { active: true, deletedAt: null, currentStock: { gt: 0 } } } },
    { isSerialized: false, hasVariations: false, currentStock: { gt: 0 } },
  ],
};

function accessorySearchWhere(term: string): Prisma.ProductWhereInput[] {
  // Cada palavra vira "palavra + sinonimos" (modulo compartilhado com o
  // catalogo). Por palavra: casa QUALQUER sinonimo (OR); entre palavras: todas
  // exigidas (AND, via o array que entra no AND externo da query).
  return searchWords(term).map((word) => ({
    OR: expandWord(word).flatMap((synonym): Prisma.ProductWhereInput[] => [
      { name: { contains: synonym, mode: "insensitive" } },
      { brand: { contains: synonym, mode: "insensitive" } },
      { sku: { contains: synonym, mode: "insensitive" } },
      { barcode: { contains: synonym, mode: "insensitive" } },
      { description: { contains: synonym, mode: "insensitive" } },
    ]),
  }));
}

function deviceAlternativeWhere(model: string): Prisma.CatalogDeviceWhereInput[] {
  const words = searchWords(model).filter((word) => !STORAGE_OR_COLOR_WORDS.has(word));
  const priorityWords = words.slice(0, 3);

  return priorityWords.map((word) => ({
    name: { contains: word, mode: "insensitive" },
  }));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCondition(condition: string | null): string {
  const label = CONDITION_LABEL[condition ?? ""] ?? condition ?? "";
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
}

function formatDeviceLine(device: {
  name: string;
  condition: string | null;
  price: Prisma.Decimal | number | string | null;
  promotionalPrice: Prisma.Decimal | number | string | null;
  description: string | null;
}): string {
  const effectivePrice = device.promotionalPrice ?? device.price;
  const price = effectivePrice == null ? 0 : Number(effectivePrice);
  const priceLabel = price > 0 ? `${formatBRL(price)} no PIX/à vista` : "preço sob consulta";
  const condition = formatCondition(device.condition);
  const note = device.description ? ` — ${device.description}` : "";
  return `${device.name} (${condition}): ${priceLabel}${note}`;
}

function deviceData(device: {
  name: string;
  condition: string | null;
  price: Prisma.Decimal | number | string | null;
  promotionalPrice: Prisma.Decimal | number | string | null;
}) {
  const effectivePrice = device.promotionalPrice ?? device.price;
  const price = effectivePrice == null ? 0 : Number(effectivePrice);
  return {
    modelo: device.name,
    condicao: formatCondition(device.condition),
    preco_pix: price > 0 ? formatBRL(price) : "sob consulta",
  };
}

function productAvailableQuantity(product: {
  isSerialized: boolean;
  hasVariations: boolean;
  currentStock: number;
  stockItems: { id: string }[];
  variations: { currentStock: number }[];
}): number {
  if (product.isSerialized) return product.stockItems.length;
  if (product.hasVariations) {
    return product.variations.reduce((sum, variation) => sum + Math.max(0, variation.currentStock), 0);
  }
  return Math.max(0, product.currentStock);
}

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
    "Busca aparelhos disponíveis para venda (iPhone, iPad, MacBook, Apple Watch, AirPods, notebook gamer, console). " +
    "Use SEMPRE que o cliente perguntar 'tem iPhone X?' ou 'quanto custa o aparelho Y?'. " +
    "Se o modelo exato não existir, a tool pode retornar alternativas próximas disponíveis da mesma família/categoria. " +
    "IMPORTANTE: o preço retornado JÁ É o valor PROMOCIONAL no PIX/à vista — informe-o como tal. " +
    "No débito e no cartão de crédito o valor é MAIOR (acréscimo da operadora) — diga isso se o cliente " +
    "perguntar de cartão, mas NUNCA invente o valor do cartão; ofereça simular com um atendente. " +
    "Copie modelos e preços exatamente; nunca invente preço nem diga que tem aparelho fora da lista.",
  schema: buscarAparelhoSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const model = args.modelo.trim();
      const conditionFilter: Prisma.CatalogDeviceWhereInput =
        args.condicao === "novo"
          ? { condition: { equals: "novo", mode: "insensitive" } }
          : args.condicao === "seminovo"
            ? { condition: { equals: "seminovo", mode: "insensitive" } }
            : args.condicao === "usado"
              ? { condition: { equals: "usado", mode: "insensitive" } }
              : {};

      const baseWhere: Prisma.CatalogDeviceWhereInput = {
        tenantId: ctx.tenantId,
        available: true,
        deletedAt: null,
        ...conditionFilter,
      };

      const devices = await tx.catalogDevice.findMany({
        where: {
          ...baseWhere,
          name: { contains: model, mode: "insensitive" },
        },
        orderBy: [{ price: "asc" }],
        take: MAX_RESULTS,
        select: { name: true, condition: true, price: true, promotionalPrice: true, description: true },
      });

      const exactMatch = devices.length > 0;
      const fallbackDevices = exactMatch
        ? []
        : await tx.catalogDevice.findMany({
            where: {
              ...baseWhere,
              OR: deviceAlternativeWhere(model),
            },
            orderBy: [{ featured: "desc" }, { order: "asc" }, { price: "asc" }],
            take: MAX_RESULTS,
            select: { name: true, condition: true, price: true, promotionalPrice: true, description: true },
          });
      const foundDevices = exactMatch ? devices : fallbackDevices;

      if (foundDevices.length === 0) {
        return {
          ok: false as const,
          reason: `Não encontrei "${model}" entre os aparelhos disponíveis. Diga que no momento não aparece disponível no catálogo e ofereça transferir para um atendente confirmar alternativas.`,
        };
      }

      const header = exactMatch ? "" : `Não encontrei exatamente "${model}", mas encontrei estas opções próximas disponíveis:\n`;
      const footer =
        "\n_Valores no PIX/à vista. No débito e cartão de crédito o valor é maior (acréscimo da operadora)._";

      return {
        ok: true as const,
        data: {
          total: foundDevices.length,
          encontrou_exato: exactMatch,
          observacao_pagamento: "preços são PIX/à vista; cartão tem acréscimo",
          aparelhos: foundDevices.map(deviceData),
        },
        display: header + foundDevices.map(formatDeviceLine).join("\n") + footer,
      };
    });
  },
};

const buscarAcessorioSchema = z.object({
  termo: z
    .string()
    .describe("Acessório/produto procurado — ex: 'capa S20', 'película iPhone 14', 'fone bluetooth', 'cabo usb-c', 'mouse gamer'."),
});

export const buscarAcessorio: TalisonTool<typeof buscarAcessorioSchema> = {
  name: "buscar_acessorio",
  description:
    "Busca acessórios, periféricos, eletrônicos e produtos diversos no catálogo (capa, película, fone, cabo, " +
    "carregador, adaptador, mouse, teclado, figurinhas, álbuns, e itens inusitados). Use quando o cliente " +
    "perguntar por qualquer produto que não seja um aparelho. A tool procura nos dois catálogos (acessórios " +
    "e aparelhos) antes de dizer que não tem. O retorno inclui um LINK do catálogo público já com a busca do " +
    "cliente aplicada — compartilhe esse link com o cliente pra ele ver fotos e variações (cor/modelo). " +
    "Se mesmo assim vier vazio, informe indisponibilidade e ofereça transferir.",
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
          AND: [
            // Filtro de foto removido: itens recém-cadastrados sem foto não podem
            // ficar invisíveis pro bot (o catálogo é a fonte da verdade). Mantém
            // só o filtro de estoque.
            productStockWhere,
            ...accessorySearchWhere(term),
          ],
        },
        orderBy: [{ currentStock: "desc" }, { name: "asc" }],
        take: MAX_RESULTS,
        select: {
          name: true,
          salePrice: true,
          promotionalPrice: true,
          currentStock: true,
          isSerialized: true,
          hasVariations: true,
          stockItems: { where: { status: "AVAILABLE", deletedAt: null }, select: { id: true } },
          variations: { where: { active: true, deletedAt: null }, select: { currentStock: true } },
        },
      });

      if (products.length > 0) {
        const lines = products.map((product) => {
          const price = Number(product.promotionalPrice ?? product.salePrice);
          const quantity = productAvailableQuantity(product);
          const priceLabel =
            price > 0
              ? `${formatBRL(price)} (PIX ${formatBRL(roundMoney(price * (1 - ACESSORIO_PIX_DISCOUNT)))})`
              : "preço sob consulta";
          return `${product.name}: ${priceLabel} — ${quantity} em estoque`;
        });

        const link = catalogSearchLink(resolveCatalogBaseUrl(ctx), term);
        return {
          ok: true as const,
          data: { total: products.length, algum_em_estoque: true, link_catalogo: link },
          display: `${lines.join("\n")}\n\n👉 Ver mais opções (cores/modelos) com fotos no catálogo: ${link}`,
        };
      }

      // Cross-search: produtos "inusitados" (figurinhas, álbuns, etc.) podem ter
      // sido cadastrados no catálogo de APARELHOS. Os dois catálogos são a fonte
      // da verdade — então, se não achar como acessório, procura também lá antes
      // de dizer que não temos. Preço de catalog_devices JÁ É o PIX/à vista.
      const words = searchWords(term);
      const devices =
        words.length > 0
          ? await tx.catalogDevice.findMany({
              where: {
                tenantId: ctx.tenantId,
                available: true,
                deletedAt: null,
                // Mesma expansao de sinonimos do acessorio (ex.: "relogio" acha
                // "Apple Watch"). Casa qualquer sinonimo de qualquer palavra.
                OR: words.flatMap((word) =>
                  expandWord(word).map((synonym) => ({
                    name: { contains: synonym, mode: "insensitive" as const },
                  })),
                ),
              },
              orderBy: [{ price: "asc" }],
              take: MAX_RESULTS,
              select: { name: true, condition: true, price: true, promotionalPrice: true, description: true },
            })
          : [];

      if (devices.length > 0) {
        const link = catalogSearchLink(resolveCatalogBaseUrl(ctx), term);
        return {
          ok: true as const,
          data: { total: devices.length, fonte: "catalogo", algum_em_estoque: true, link_catalogo: link },
          display:
            devices.map(formatDeviceLine).join("\n") +
            "\n_Valores no PIX/à vista. No cartão há acréscimo._" +
            `\n\n👉 Ver mais com fotos no catálogo: ${link}`,
        };
      }

      // Não achou por nome exato — mas acessórios (capa, película, fone, cabo,
      // carregador) costumam estar cadastrados com nome genérico, sem o modelo.
      // NÃO negue ("não temos"): ofereça o link do catálogo pra o cliente navegar
      // com fotos. Só transfira/diga indisponível se o cliente pedir.
      const link = catalogSearchLink(resolveCatalogBaseUrl(ctx), term);
      return {
        ok: true as const,
        data: { total: 0, encontrou_exato: false, link_catalogo: link },
        display:
          `Não achei um resultado exato pra "${term}" por aqui, mas pode estar no catálogo com outro nome. ` +
          `Dá uma olhada nas opções com fotos: ${link}`,
      };
    });
  },
};
