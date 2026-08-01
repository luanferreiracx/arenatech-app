import { describe, it, expect } from "vitest";
import { normalizeProductName } from "@/lib/utils/product-name";

describe("normalizeProductName", () => {
  it("remove marca duplicada no início (bug do import legado)", () => {
    expect(normalizeProductName("Apple Apple Apple Apple iPhone 15", "Apple")).toBe("IPHONE 15");
    expect(normalizeProductName("Apple Apple iPhone 13 Pro", "Apple")).toBe("IPHONE 13 PRO");
  });

  it("remove a marca do nome quando o modelo não a carrega no nome canônico", () => {
    expect(normalizeProductName("Apple iPhone 14", "Apple")).toBe("IPHONE 14");
    expect(normalizeProductName("Apple MacBook Air M1 2020", "Apple")).toBe("MACBOOK AIR M1 2020");
    expect(normalizeProductName("Apple iPad 10a Geracao", "Apple")).toBe("IPAD 10A GERACAO");
    expect(normalizeProductName("Apple Magic Keyboard", "Apple")).toBe("MAGIC KEYBOARD");
  });

  it("preserva um 'Apple' em produtos cujo nome oficial inclui a marca", () => {
    expect(normalizeProductName("Apple Apple Watch SE 3", "Apple")).toBe("APPLE WATCH SE 3");
    expect(normalizeProductName("Apple Watch Series 10", "Apple")).toBe("APPLE WATCH SERIES 10");
    expect(normalizeProductName("Apple Pencil", "Apple")).toBe("APPLE PENCIL");
  });

  it("é case-insensitive na marca", () => {
    expect(normalizeProductName("apple APPLE iPhone 16", "Apple")).toBe("IPHONE 16");
  });

  it("não tira nada quando o nome não começa pela marca", () => {
    expect(normalizeProductName("iPhone 15", "Apple")).toBe("IPHONE 15");
    expect(normalizeProductName("Galaxy S24", "Samsung")).toBe("GALAXY S24");
  });

  it("generaliza para qualquer marca, não só Apple", () => {
    expect(normalizeProductName("Samsung Samsung Galaxy S24", "Samsung")).toBe("GALAXY S24");
    expect(normalizeProductName("Xiaomi Xiaomi Redmi Note 13", "Xiaomi")).toBe("REDMI NOTE 13");
  });

  it("normaliza espaços e trima", () => {
    expect(normalizeProductName("  Apple   Apple  iPhone 15  ", "Apple")).toBe("IPHONE 15");
  });

  it("sobe a caixa mesmo sem marca resolvida", () => {
    expect(normalizeProductName("  Apple Apple iPhone 15 ", null)).toBe("APPLE APPLE IPHONE 15");
    expect(normalizeProductName("iPhone 15", undefined)).toBe("IPHONE 15");
  });

  it("lida com nome que é só a marca repetida", () => {
    expect(normalizeProductName("Apple Apple", "Apple")).toBe("APPLE");
  });

  it("preserva acentuação ao subir a caixa (pt-BR)", () => {
    expect(normalizeProductName("película 3d cerâmica", null)).toBe("PELÍCULA 3D CERÂMICA");
    expect(normalizeProductName("cabo de força", null)).toBe("CABO DE FORÇA");
  });

  it("devolve string vazia para nome vazio", () => {
    expect(normalizeProductName("   ", "Apple")).toBe("");
  });
});
