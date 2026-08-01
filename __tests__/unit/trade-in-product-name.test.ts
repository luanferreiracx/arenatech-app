import { describe, it, expect } from "vitest";
import { resolveTradeInProductName } from "@/lib/utils/trade-in-name";

/**
 * Bug em produção: o fluxo de aparelho-de-entrada (trade-in) gravava o modelo
 * cru ("Apple Apple iPhone 16") e criava o produto com [brand, model].join(" "),
 * acumulando "Apple". O findFirst por nome nunca casava o produto canônico
 * ("iPhone 16") → nascia uma duplicata a cada troca. Esta função é a fonte única
 * do nome canônico do produto do trade-in, para o dedup por nome voltar a casar.
 *
 * Desde 2026-08-01 o nome sai em CAIXA ALTA (normalizeProductName) — o produto
 * do trade-in tem que nascer no mesmo padrão do catálogo, senão o dedup por nome
 * volta a errar.
 */
describe("resolveTradeInProductName", () => {
  it("colapsa a marca repetida acumulada e casa o nome canônico do catálogo", () => {
    expect(resolveTradeInProductName("Apple", "Apple Apple Apple iPhone 16")).toBe(
      "IPHONE 16",
    );
    expect(resolveTradeInProductName("Apple", "Apple iPhone 15 Pro Max")).toBe(
      "IPHONE 15 PRO MAX",
    );
  });

  it("não prepende a marca quando o modelo não a traz", () => {
    // Antes o código fazia [brand, model].join(" ") — prependia "Apple".
    expect(resolveTradeInProductName("Apple", "iPhone 14")).toBe("IPHONE 14");
  });

  it("preserva a marca nos modelos cujo nome canônico a inclui", () => {
    expect(resolveTradeInProductName("Apple", "Apple Apple Watch SE 3")).toBe(
      "APPLE WATCH SE 3",
    );
  });

  it("sem marca, usa o modelo trimado; sem modelo, cai no rótulo genérico", () => {
    expect(resolveTradeInProductName(null, "iPhone 13")).toBe("IPHONE 13");
    expect(resolveTradeInProductName("Apple", "")).toBe("APARELHO SEMINOVO");
    expect(resolveTradeInProductName(null, null)).toBe("APARELHO SEMINOVO");
  });

  it("generaliza para outras marcas", () => {
    expect(resolveTradeInProductName("Samsung", "Samsung Samsung Galaxy S24")).toBe(
      "GALAXY S24",
    );
  });
});
