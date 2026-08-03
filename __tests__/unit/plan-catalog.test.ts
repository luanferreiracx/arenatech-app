/**
 * Propriedades comerciais dos quatro planos (decisão do dono, 2026-08-02).
 *
 * Estes testes não conferem "o catálogo está igual ao que escrevi" — isso seria
 * repetir o arquivo. Eles conferem as propriedades que fazem os planos SEREM
 * quatro produtos distintos, e que quebrariam em silêncio se alguém mexesse no
 * grafo de dependências sem perceber o efeito comercial.
 */
import { describe, it, expect } from "vitest";
import { PLAN_CATALOG, CATALOG_SLUGS, catalogPlanModules } from "@/lib/plans/catalog";
import { isRetiredModule, ALWAYS_ON_MODULES } from "@/lib/modules";

const bySlug = (slug: string) => {
  const plan = PLAN_CATALOG.find((p) => p.slug === slug);
  if (!plan) throw new Error(`plano ausente no catálogo: ${slug}`);
  return { plan, modules: new Set(catalogPlanModules(plan)) };
};

describe("catálogo de planos", () => {
  it("tem exatamente os quatro planos, sem slug repetido", () => {
    expect(CATALOG_SLUGS).toEqual(["assistencia", "varejo", "varejo-fiscal", "completo"]);
    expect(new Set(CATALOG_SLUGS).size).toBe(CATALOG_SLUGS.length);
  });

  it("limite de equipe é 3 / 3 / 5 / 10", () => {
    expect(PLAN_CATALOG.map((p) => p.maxUsers)).toEqual([3, 3, 5, 10]);
  });

  it("preço cresce (ou empata) do primeiro ao último degrau", () => {
    const precos = PLAN_CATALOG.map((p) => p.monthlyPriceReais);
    for (let i = 1; i < precos.length; i++) {
      expect(precos[i]!).toBeGreaterThanOrEqual(precos[i - 1]!);
    }
  });

  it("nenhum plano vende módulo aposentado", () => {
    for (const plan of PLAN_CATALOG) {
      for (const mod of catalogPlanModules(plan)) {
        expect(isRetiredModule(mod)).toBe(false);
      }
    }
  });

  it("nenhum plano lista módulo sempre-ligado — isso seria vender o que já é grátis", () => {
    for (const plan of PLAN_CATALOG) {
      for (const sempreOn of ALWAYS_ON_MODULES) {
        expect(plan.modules).not.toContain(sempreOn);
      }
    }
  });
});

describe("assistência × varejo: dois produtos, não um subconjunto do outro", () => {
  const assistencia = bySlug("assistencia");
  const varejo = bySlug("varejo");

  it("assistência recebe o PDV base, para RECEBER o valor da OS", () => {
    expect(assistencia.modules.has("service-orders")).toBe(true);
    expect(assistencia.modules.has("pdv")).toBe(true);
  });

  it("assistência NÃO vende no balcão", () => {
    // É a trava que o dono pediu: sem ela, o plano de OS arrastaria a venda
    // livre e o plano de varejo perderia a razão de existir.
    expect(assistencia.modules.has("pdv-retail")).toBe(false);
  });

  it("varejo vende no balcão e não abre ordem de serviço", () => {
    expect(varejo.modules.has("pdv-retail")).toBe(true);
    expect(varejo.modules.has("service-orders")).toBe(false);
  });

  it("cada um tem algo que o outro não tem", () => {
    const soNaAssistencia = [...assistencia.modules].filter((m) => !varejo.modules.has(m));
    const soNoVarejo = [...varejo.modules].filter((m) => !assistencia.modules.has(m));
    expect(soNaAssistencia).toContain("service-orders");
    expect(soNoVarejo).toContain("pdv-retail");
  });

  it("os dois compartilham a base para operar uma loja", () => {
    for (const base of ["cashier", "financial", "stock", "customers"]) {
      expect(assistencia.modules.has(base as never)).toBe(true);
      expect(varejo.modules.has(base as never)).toBe(true);
    }
  });
});

describe("escada: cada degrau contém o anterior", () => {
  it("varejo+fiscal contém tudo do varejo, mais fiscal e comissões", () => {
    const varejo = bySlug("varejo");
    const comFiscal = bySlug("varejo-fiscal");
    for (const mod of varejo.modules) {
      expect(comFiscal.modules.has(mod)).toBe(true);
    }
    expect(comFiscal.modules.has("fiscal")).toBe(true);
    expect(comFiscal.modules.has("commissions")).toBe(true);
  });

  it("completo contém a união dos outros três", () => {
    const completo = bySlug("completo");
    for (const slug of ["assistencia", "varejo", "varejo-fiscal"]) {
      for (const mod of bySlug(slug).modules) {
        expect(completo.modules.has(mod)).toBe(true);
      }
    }
  });

  it("as ferramentas acompanham a venda de balcão, não a assistência", () => {
    // Decisão do dono: simulador de parcelamento e avaliação de aparelho servem
    // a quem VENDE. A assistência tem PDV só para receber OS, então fica fora.
    for (const slug of ["varejo", "varejo-fiscal", "completo"]) {
      expect(bySlug(slug).modules.has("tools")).toBe(true);
      expect(bySlug(slug).modules.has("pdv-retail")).toBe(true);
    }
    expect(bySlug("assistencia").modules.has("tools")).toBe(false);
  });

  it("todo plano com ferramentas também vende no balcão (a regra é essa)", () => {
    for (const plan of PLAN_CATALOG) {
      const mods = new Set(catalogPlanModules(plan));
      if (mods.has("tools")) expect(mods.has("pdv-retail")).toBe(true);
    }
  });
});
