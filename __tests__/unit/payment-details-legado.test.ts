/**
 * M8-1 (Etapa 7, Módulo 8 — PDV): `sales.payment_details` carrega três formas em
 * produção, e quem lia com `as Array<...>` quebrava em duas delas.
 *
 * Os dados abaixo são **cópias literais de produção**, não invenções:
 * `VND202601532` (string legado) e uma venda de agosto (array nativo).
 *
 * Os dois modos de falha medidos no navegador estão afirmados aqui como
 * regressão — são diferentes e o segundo é o pior:
 *
 * 1. `.map()` numa string lança `TypeError` → tela de erro. Ruidoso, mas visível.
 * 2. `for...of` numa string **não lança**: itera caractere a caractere. O recibo
 *    saía 200 com 76 linhas de `NaN` — silencioso, e vai para o cliente.
 */
import { describe, it, expect } from "vitest";
import { parsePaymentDetails } from "@/lib/payments/payment-details";

/** Cópia literal de `VND202601532` (10/04/2026) — valor em REAIS. */
const LEGADO_STRING =
  '[{"forma":"pix","valor":4582.13},{"forma":"cartao_credito","valor":4582.13}]';

/** Cópia literal de uma venda atual — valor em CENTAVOS. */
const ARRAY_NATIVO = [
  { amount: 3590, method: "cartao_credito", methodLabel: "Cartao Credito", installments: 1 },
];

describe("parsePaymentDetails — as três formas que existem no banco", () => {
  it("array nativo: preserva centavos, label e parcelas", () => {
    expect(parsePaymentDetails(ARRAY_NATIVO)).toEqual([
      { method: "cartao_credito", methodLabel: "Cartao Credito", amount: 3590, installments: 1 },
    ]);
  });

  it("string legado: converte reais para centavos e traduz as chaves", () => {
    expect(parsePaymentDetails(LEGADO_STRING)).toEqual([
      { method: "pix", amount: 458213, installments: 1 },
      { method: "cartao_credito", amount: 458213, installments: 1 },
    ]);
  });

  it("NULL (1.050 vendas anteriores a 10/04) vira lista vazia", () => {
    expect(parsePaymentDetails(null)).toEqual([]);
    expect(parsePaymentDetails(undefined)).toEqual([]);
  });

  it("soma do legado bate com o total da venda (R$ 9.164,26)", () => {
    const total = parsePaymentDetails(LEGADO_STRING).reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(916426);
  });

  it("arredonda em vez de truncar (4582.13 × 100 dá 458212.99… em float)", () => {
    const [leg] = parsePaymentDetails('[{"forma":"pix","valor":4582.13}]');
    expect(leg?.amount).toBe(458213);
    expect(Number.isInteger(leg?.amount)).toBe(true);
  });
});

describe("os dois modos de falha que isto substitui", () => {
  it("mapear o resultado nunca lança — era o TypeError da tela de detalhe", () => {
    expect(() => parsePaymentDetails(LEGADO_STRING).map((p) => p.amount)).not.toThrow();
  });

  it("iterar não percorre caracteres — era o recibo com 76 linhas de NaN", () => {
    const pernas = [...parsePaymentDetails(LEGADO_STRING)];
    expect(pernas).toHaveLength(2);
    expect(pernas.every((p) => Number.isFinite(p.amount))).toBe(true);
  });
});

describe("dado que não casa com forma nenhuma degrada em silêncio, sem quebrar", () => {
  const LIXO: unknown[] = ["texto solto", "{nao é json", 42, {}, [null], [{ forma: "pix" }]];

  for (const entrada of LIXO) {
    it(`${JSON.stringify(entrada)} vira lista vazia`, () => {
      expect(parsePaymentDetails(entrada)).toEqual([]);
    });
  }
});
