/**
 * Ordenacao de avaliacoes de aparelho — paridade Laravel AvaliacaoController.
 *
 * O Postgres (como o MySQL do Laravel) ordena strings lexicograficamente, o que
 * coloca "128GB" antes de "64GB" e bagunca a ordem da saude de bateria. O
 * Laravel resolvia com orderByRaw (REGEXP numerico + CASE). Aqui ordenamos em
 * memoria com chaves derivadas — a lista de avaliacoes por modelo e pequena.
 */

/**
 * Extrai a capacidade em GB de uma string de armazenamento.
 * "64GB" -> 64 ; "1TB" -> 1024 ; "2TB" -> 2048 ; sem numero -> Infinity (vai pro fim).
 */
export function storageSortKey(armazenamento: string): number {
  const normalized = armazenamento.trim().toUpperCase();
  const match = normalized.match(/([\d.]+)\s*(TB|GB|MB)?/);
  if (!match || match[1] === undefined) return Number.POSITIVE_INFINITY;
  const value = Number.parseFloat(match[1]);
  if (Number.isNaN(value)) return Number.POSITIVE_INFINITY;
  const unit = match[2] ?? "GB";
  const multiplier = unit === "TB" ? 1024 : unit === "MB" ? 1 / 1024 : 1;
  return value * multiplier;
}

/**
 * Ordem semantica da saude de bateria (melhor -> pior), paridade Laravel.
 */
const BATTERY_ORDER: Record<string, number> = {
  "> 90%": 1,
  "85% - 90%": 2,
  "80% - 85%": 3,
  "< 80%": 4,
  "-": 5,
};

export function batterySortKey(saudeBateria: string): number {
  return BATTERY_ORDER[saudeBateria.trim()] ?? 6;
}

/**
 * Comparador composto: modelo (alfabetico) -> armazenamento (numerico) ->
 * saude de bateria (semantica). Espelha o orderBy do AvaliacaoController.
 */
export function compareValuations(
  a: { modelo: string; armazenamento: string; saudeBateria: string },
  b: { modelo: string; armazenamento: string; saudeBateria: string },
): number {
  const byModelo = a.modelo.localeCompare(b.modelo, "pt-BR");
  if (byModelo !== 0) return byModelo;
  const byStorage = storageSortKey(a.armazenamento) - storageSortKey(b.armazenamento);
  if (byStorage !== 0) return byStorage;
  return batterySortKey(a.saudeBateria) - batterySortKey(b.saudeBateria);
}
