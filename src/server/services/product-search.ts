import type { Prisma } from "@prisma/client";
import { normalizeSearchTerm } from "@/lib/search/normalize";

/**
 * Filtro de busca de produto por termo livre — fonte única do sistema.
 *
 * Casa contra:
 *  - `search_name` (nome + marca em minúsculo e SEM ACENTO, mantida por trigger):
 *    é o que faz "pelicula" achar "PELÍCULA" e "camera" achar "CÂMERA";
 *  - `sku` e `barcode` crus (não têm acento; `insensitive` basta).
 *
 * Antes cada tela montava seu próprio `OR` com `contains mode:"insensitive"`,
 * que ignora caixa mas não acento — o PDV tinha um $queryRaw com unaccent e as
 * outras oito telas não tinham nada. Toda busca de produto passa a chamar aqui.
 *
 * Devolve `null` para termo vazio: o chamador simplesmente não aplica filtro.
 */
export function productSearchFilter(
  rawTerm: string | null | undefined,
): Prisma.ProductWhereInput | null {
  const term = normalizeSearchTerm(rawTerm ?? "");
  if (!term) return null;

  return {
    OR: [
      { searchName: { contains: term } },
      { sku: { contains: term, mode: "insensitive" } },
      { barcode: { contains: term, mode: "insensitive" } },
    ],
  };
}
