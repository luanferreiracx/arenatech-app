/**
 * Caixa alta padrão do catálogo — a grafia com que produto, serviço, tipo de
 * serviço, aparelho comprado e venda rápida são gravados desde 2026-08-01
 * (decisão do dono: padronizar a leitura das listas).
 *
 * Trima, colapsa espaço repetido e sobe a caixa com locale pt-BR (mantém Ç e Ã
 * corretos). É o único lugar que define "caixa alta" no sistema — os
 * normalizadores de cada entidade compõem a partir daqui.
 */
export function normalizeCatalogName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

/** Idem, tolerando nulo — devolve `null` para vazio/nulo (colunas opcionais). */
export function normalizeCatalogNameOrNull(value: string | null | undefined): string | null {
  const normalized = normalizeCatalogName(value ?? "");
  return normalized || null;
}
