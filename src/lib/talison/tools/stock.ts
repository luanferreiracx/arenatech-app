/**
 * Tool de estoque — busca aparelhos e acessórios em Product. Somente leitura.
 *
 * Uma só tabela Product cobre os dois casos: aparelho (isDevice=true) e
 * acessório (isDevice=false). Preço/estoque vêm do banco, formatados. Preço
 * zerado = "sob consulta" (não inventa valor). PIX com 5% de desconto, padrão
 * herdado do Laravel (config chatbot.vendas.pix_desconto).
 */

import { z } from "zod";
import { formatBRL, type TalisonTool } from "@/lib/talison/tools/contract";

const MAX_RESULTS = 8;
const PIX_DISCOUNT = 0.05;

const buscarProdutoSchema = z.object({
  termo: z
    .string()
    .describe("O que o cliente procura — modelo de aparelho ('iPhone 15') ou acessório ('capa S20', 'película', 'fone')."),
  tipo: z
    .enum(["aparelho", "acessorio", "qualquer"])
    .optional()
    .describe("aparelho = celular/tablet/notebook; acessorio = capa/película/fone/cabo. Omita se não souber."),
});

export const buscarProduto: TalisonTool<typeof buscarProdutoSchema> = {
  name: "buscar_produto",
  description:
    "Busca produtos em estoque — tanto aparelhos (iPhone, iPad, MacBook...) quanto " +
    "acessórios (capa, película, fone, cabo). Use SEMPRE que o cliente perguntar 'tem X?' " +
    "ou 'quanto custa o X?'. Copie nomes e preços do retorno; nunca invente preço nem " +
    "diga que tem algo que não veio na lista. Se vazio, ofereça transferir pra um atendente.",
  schema: buscarProdutoSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const term = args.termo.trim();
      const deviceFilter =
        args.tipo === "aparelho"
          ? { isDevice: true }
          : args.tipo === "acessorio"
            ? { isDevice: false }
            : {};

      const products = await tx.product.findMany({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          deletedAt: null,
          ...deviceFilter,
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { brand: { contains: term, mode: "insensitive" } },
          ],
        },
        // Disponíveis (com estoque) primeiro; depois por nome.
        orderBy: [{ currentStock: "desc" }, { name: "asc" }],
        take: MAX_RESULTS,
        select: {
          name: true,
          brand: true,
          salePrice: true,
          promotionalPrice: true,
          currentStock: true,
          isDevice: true,
        },
      });

      if (products.length === 0) {
        return {
          ok: false as const,
          reason: `Não encontrei "${term}" no estoque. Diga ao cliente que vai confirmar a disponibilidade com um atendente.`,
        };
      }

      const lines = products.map((product) => {
        // Preço efetivo: promocional quando houver; zero = sob consulta.
        const priceValue = Number(product.promotionalPrice ?? product.salePrice);
        const priceLabel =
          priceValue > 0
            ? `${formatBRL(priceValue)} (PIX ${formatBRL(priceValue * (1 - PIX_DISCOUNT))})`
            : "preço sob consulta";
        const availability = product.currentStock > 0 ? "em estoque" : "sob encomenda";
        return `${product.name}: ${priceLabel} — ${availability}`;
      });

      const anyInStock = products.some((product) => product.currentStock > 0);

      return {
        ok: true as const,
        data: {
          total: products.length,
          algum_em_estoque: anyInStock,
          itens: products.map((product) => ({
            nome: product.name,
            preco: Number(product.promotionalPrice ?? product.salePrice) > 0
              ? formatBRL(Number(product.promotionalPrice ?? product.salePrice))
              : "sob consulta",
            em_estoque: product.currentStock > 0,
          })),
        },
        display: lines.join("\n"),
      };
    });
  },
};
