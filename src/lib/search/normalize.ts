/**
 * Normalização de termo de busca — minúsculo, sem acento, espaços colapsados.
 *
 * Contrato: este arquivo é o par TypeScript da função SQL `search_normalize()`
 * (migração 20260801120000). As colunas `products.search_name` e
 * `product_brands.search_name` são preenchidas por trigger com AQUELA função;
 * o termo digitado pelo usuário passa por ESTA antes de virar filtro. As duas
 * precisam produzir a mesma saída — mudou uma, mude a outra.
 *
 * Motivo de existir: `contains mode:"insensitive"` do Prisma ignora caixa mas
 * não acento, então "pelicula" não achava "Película" e "camera" não achava
 * "Câmera". Buscar na coluna normalizada com o termo normalizado resolve os
 * dois eixos de uma vez, sem SQL cru espalhado por router.
 */
export function normalizeSearchTerm(term: string): string {
  return term
    .normalize("NFD")
    // Remove os diacríticos que o NFD separou da letra base (ç→c, ã→a, é→e).
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
