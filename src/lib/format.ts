/**
 * Formatação de dinheiro (pt-BR / BRL) — fonte ÚNICA para o app.
 *
 * O modelo de dinheiro do sistema é em CENTAVOS (inteiro) na maioria dos fluxos
 * (validators, serializers tRPC). Use `formatCentsBRL` por padrão. Alguns pontos
 * legados carregam o valor já em REAIS (number/Decimal já dividido) — para esses
 * existe `formatReaisBRL`. Ter as duas funções nomeadas evita o erro de 100×
 * que acontecia quando cada arquivo redefinia `formatCurrency` com contrato
 * próprio (uns dividiam por 100, outros não).
 */

/** Formata CENTAVOS (inteiro) em BRL. Ex.: 12345 → "R$ 123,45". */
export function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata REAIS (número já em reais) em BRL. Ex.: 123.45 → "R$ 123,45". */
export function formatReaisBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
