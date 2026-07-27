/**
 * Auditoria 2026-07-25 — balde de comissão com MODOS MISTURADOS.
 *
 * `computeBucketCommission` lê o modo (`valueType` e `base`) da PRIMEIRA regra
 * do balde (`sorted[0]`) e aplica esse modo ao balde inteiro. O comentário do
 * motor afirma que "o validador garante um modo por balde" — mas o
 * `superRefine` pulava as regras `FIXED_PER_UNIT` (`continue`) e só checava
 * contiguidade de faixas PERCENT. Nada impedia:
 *
 *   - R$/unidade + %/lucro no MESMO (categoria, escopo, origem);
 *   - `base: PROFIT` e `base: GROSS_NET` no mesmo balde.
 *
 * Com ambas em `rangeMin: 0` o comparador empata e a ordem passa a ser a do
 * `findMany` — que NÃO tem `orderBy`. Ou seja: heap do Postgres, instável após
 * UPDATE/VACUUM. O admin configurava "R$50/un + 10% do lucro" achando que
 * somavam; o motor aplicava só UMA, e a MESMA apuração podia mudar sozinha
 * entre dois cálculos — inclusive entre o que o admin conferiu e o que o
 * `closeApuracao` gerou como PAYABLE.
 *
 * DECISÃO DO DONO (2026-07-25): bloquear no cadastro + ordem fixa nas consultas.
 */
import { describe, it, expect } from "vitest";
import { updateProviderRulesSchema } from "@/lib/validators/provider-commission";

const CONTRACT = "4f1c9d2e-6b3a-4c8d-9e7f-1a2b3c4d5e6f";

/** Regra completa, com os defaults que o schema exige. */
function rule(over: Record<string, unknown> = {}) {
  return {
    category: "produto_acessorio",
    scope: "normal",
    source: "OWN",
    valueType: "PERCENT",
    base: "PROFIT",
    rangeMin: 0,
    rangeMax: null,
    rate: 10,
    ...over,
  };
}

const parse = (rules: unknown[]) =>
  updateProviderRulesSchema.safeParse({ contractId: CONTRACT, rules });

describe("balde de comissão — um único modo por (categoria, escopo, origem)", () => {
  it("rejeita R$/unidade e %/lucro no MESMO balde", () => {
    const r = parse([
      rule({ valueType: "FIXED_PER_UNIT", rate: 50, rangeMax: null }),
      rule({ valueType: "PERCENT", rate: 10, rangeMax: null }),
    ]);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toMatch(/mesmo tipo de valor|um único modo|mesmo modo/i);
    }
  });

  it("rejeita bases divergentes (PROFIT + GROSS_NET) no mesmo balde", () => {
    const r = parse([
      rule({ base: "PROFIT", rangeMin: 0, rangeMax: 1000 }),
      rule({ base: "GROSS_NET", rangeMin: 1000, rangeMax: null }),
    ]);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toMatch(/mesma base|base/i);
    }
  });

  it("aceita faixas progressivas coerentes (mesmo modo e base) — caso legítimo", () => {
    const r = parse([
      rule({ rangeMin: 0, rangeMax: 1000, rate: 5 }),
      rule({ rangeMin: 1000, rangeMax: null, rate: 10 }),
    ]);
    expect(r.success).toBe(true);
  });

  it("aceita modos diferentes em BALDES diferentes", () => {
    const r = parse([
      rule({ category: "produto_acessorio", valueType: "PERCENT", rate: 10 }),
      rule({ category: "produto_aparelho", valueType: "FIXED_PER_UNIT", rate: 50 }),
    ]);
    expect(r.success).toBe(true);
  });

  it("regra marcada para exclusão não conta no balde", () => {
    const r = parse([
      rule({ valueType: "PERCENT", rate: 10 }),
      { ...rule({ valueType: "FIXED_PER_UNIT", rate: 50 }), _delete: true },
    ]);
    expect(r.success).toBe(true);
  });
});
