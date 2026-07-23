import { describe, it, expect } from "vitest";
import { resolveTradeInProductName } from "@/lib/utils/trade-in-name";

/**
 * Bug em produção: o fluxo de aparelho-de-entrada (trade-in) gravava o modelo
 * cru ("Apple Apple iPhone 16") e criava o produto com [brand, model].join(" "),
 * acumulando "Apple". O findFirst por nome nunca casava o produto canônico
 * ("iPhone 16") → nascia uma duplicata a cada troca. Esta função é a fonte única
 * do nome canônico do produto do trade-in, para o dedup por nome voltar a casar.
 */
describe("resolveTradeInProductName", () => {
  it("colapsa a marca repetida acumulada e casa o nome canônico do catálogo", () => {
    expect(resolveTradeInProductName("Apple", "Apple Apple Apple iPhone 16")).toBe(
      "iPhone 16",
    );
    expect(resolveTradeInProductName("Apple", "Apple iPhone 15 Pro Max")).toBe(
      "iPhone 15 Pro Max",
    );
  });

  it("não prepende a marca quando o modelo não a traz", () => {
    // Antes o código fazia [brand, model].join(" ") — prependia "Apple".
    expect(resolveTradeInProductName("Apple", "iPhone 14")).toBe("iPhone 14");
  });

  it("preserva a marca nos modelos cujo nome canônico a inclui", () => {
    expect(resolveTradeInProductName("Apple", "Apple Apple Watch SE 3")).toBe(
      "Apple Watch SE 3",
    );
  });

  it("sem marca, usa o modelo trimado; sem modelo, cai no rótulo genérico", () => {
    expect(resolveTradeInProductName(null, "iPhone 13")).toBe("iPhone 13");
    expect(resolveTradeInProductName("Apple", "")).toBe("Aparelho seminovo");
    expect(resolveTradeInProductName(null, null)).toBe("Aparelho seminovo");
  });

  it("generaliza para outras marcas", () => {
    expect(resolveTradeInProductName("Samsung", "Samsung Samsung Galaxy S24")).toBe(
      "Galaxy S24",
    );
  });
});
