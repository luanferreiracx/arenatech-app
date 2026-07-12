import type { CatalogSort } from "@/server/services/public-catalog";

export type CatalogHrefInput = {
  search?: string;
  categoryId?: string;
  sort?: CatalogSort;
  page?: number;
};

/**
 * Constroi a URL do catalogo preservando os filtros ativos. Omite valores
 * default (sort "nome", page 1) para manter as URLs limpas e compartilhaveis.
 */
export function buildCatalogHref(input: CatalogHrefInput): string {
  const params = new URLSearchParams();
  if (input.search) params.set("q", input.search);
  if (input.categoryId) params.set("categoria", input.categoryId);
  if (input.sort && input.sort !== "nome") params.set("ordem", input.sort);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

/**
 * Monta o link do WhatsApp (wa.me) com uma mensagem pré-preenchida. Sem produto,
 * é um "olá" genérico da loja; com produto, cita nome e preço.
 */
export function buildWhatsAppHref(
  whatsappNumber: string,
  storeName: string,
  productName?: string,
  priceCents?: number,
): string {
  const parts = [`Olá, ${storeName}!`];
  if (productName) {
    const price =
      typeof priceCents === "number" && priceCents > 0
        ? ` (${(priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`
        : "";
    parts.push(`Tenho interesse no produto: ${productName}${price}.`);
  } else {
    parts.push("Vi o catálogo e queria tirar uma dúvida.");
  }
  const text = encodeURIComponent(parts.join(" "));
  return `https://wa.me/${whatsappNumber}?text=${text}`;
}

export type SortOption = { value: CatalogSort; label: string };

export const DEFAULT_SORT_OPTION: SortOption = { value: "nome", label: "Nome (A–Z)" };

export const SORT_OPTIONS: ReadonlyArray<SortOption> = [
  DEFAULT_SORT_OPTION,
  { value: "preco_asc", label: "Menor preço" },
  { value: "preco_desc", label: "Maior preço" },
  { value: "recentes", label: "Novidades" },
];
