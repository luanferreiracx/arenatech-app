/**
 * Higieniza o nome do produto removendo a marca repetida no início.
 *
 * Contexto: um import legado prependia a marca ao `name` a cada execução,
 * gerando nomes como "Apple Apple Apple iPhone 15" (a migração
 * 20260721070852 limpou os dados existentes). Como a marca vive em coluna
 * própria (`Product.brand`), o nome deve conter só o modelo. Esta função é a
 * guarda de entrada — aplicada no `create`/`importCsv` — para o padrão não
 * voltar via digitação ou reimportação.
 *
 * Regra:
 *   1. Colapsa ocorrências repetidas da marca no início para no máximo uma.
 *   2. Remove essa única ocorrência quando o modelo seguinte NÃO carrega a
 *      marca no nome canônico. A exceção são produtos cujo nome oficial inclui
 *      a marca (ex.: "Apple Watch", "Apple Pencil") — nesses o prefixo é
 *      preservado.
 *
 * Sem uma marca resolvida (brand vazio), o nome é devolvido apenas trimado —
 * não temos como saber o que é prefixo de marca.
 */

// Modelos cujo nome canônico inclui a marca no início (não devem perder o
// prefixo). Comparação case-insensitive contra a 1ª palavra após a marca.
const BRAND_BOUND_MODELS = new Set(["watch", "pencil"]);

export function sanitizeProductName(name: string, brand?: string | null): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const brandTrimmed = brand?.trim();
  if (!trimmed || !brandTrimmed) return trimmed;

  const brandLower = brandTrimmed.toLowerCase();
  const words = trimmed.split(" ");

  // Conta quantas palavras iniciais são a marca (repetição).
  let brandLead = 0;
  while (brandLead < words.length && words[brandLead]!.toLowerCase() === brandLower) {
    brandLead++;
  }
  if (brandLead === 0) return trimmed; // nome não começa pela marca — nada a fazer.

  const rest = words.slice(brandLead);
  if (rest.length === 0) return brandTrimmed; // nome era só a marca repetida.

  // Mantém uma ocorrência da marca quando o modelo a carrega no nome canônico.
  const keepBrand = BRAND_BOUND_MODELS.has(rest[0]!.toLowerCase());
  return keepBrand ? `${brandTrimmed} ${rest.join(" ")}` : rest.join(" ");
}
