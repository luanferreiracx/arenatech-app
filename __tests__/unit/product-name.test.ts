import { describe, it, expect } from "vitest";
import { sanitizeProductName } from "@/lib/utils/product-name";

describe("sanitizeProductName", () => {
  it("remove marca duplicada no início (bug do import legado)", () => {
    expect(sanitizeProductName("Apple Apple Apple Apple iPhone 15", "Apple")).toBe("iPhone 15");
    expect(sanitizeProductName("Apple Apple iPhone 13 Pro", "Apple")).toBe("iPhone 13 Pro");
  });

  it("remove a marca do nome quando o modelo não a carrega no nome canônico", () => {
    expect(sanitizeProductName("Apple iPhone 14", "Apple")).toBe("iPhone 14");
    expect(sanitizeProductName("Apple MacBook Air M1 2020", "Apple")).toBe("MacBook Air M1 2020");
    expect(sanitizeProductName("Apple iPad 10a Geracao", "Apple")).toBe("iPad 10a Geracao");
    expect(sanitizeProductName("Apple Magic Keyboard", "Apple")).toBe("Magic Keyboard");
  });

  it("preserva um 'Apple' em produtos cujo nome oficial inclui a marca", () => {
    expect(sanitizeProductName("Apple Apple Watch SE 3", "Apple")).toBe("Apple Watch SE 3");
    expect(sanitizeProductName("Apple Watch Series 10", "Apple")).toBe("Apple Watch Series 10");
    expect(sanitizeProductName("Apple Pencil", "Apple")).toBe("Apple Pencil");
  });

  it("é case-insensitive na marca mas preserva o texto original do nome", () => {
    expect(sanitizeProductName("apple APPLE iPhone 16", "Apple")).toBe("iPhone 16");
  });

  it("não mexe quando o nome não começa pela marca", () => {
    expect(sanitizeProductName("iPhone 15", "Apple")).toBe("iPhone 15");
    expect(sanitizeProductName("Galaxy S24", "Samsung")).toBe("Galaxy S24");
  });

  it("generaliza para qualquer marca, não só Apple", () => {
    expect(sanitizeProductName("Samsung Samsung Galaxy S24", "Samsung")).toBe("Galaxy S24");
    expect(sanitizeProductName("Xiaomi Xiaomi Redmi Note 13", "Xiaomi")).toBe("Redmi Note 13");
  });

  it("normaliza espaços e trima", () => {
    expect(sanitizeProductName("  Apple   Apple  iPhone 15  ", "Apple")).toBe("iPhone 15");
  });

  it("devolve só trimado quando não há marca resolvida", () => {
    expect(sanitizeProductName("  Apple Apple iPhone 15 ", null)).toBe("Apple Apple iPhone 15");
    expect(sanitizeProductName("iPhone 15", undefined)).toBe("iPhone 15");
  });

  it("lida com nome que é só a marca repetida", () => {
    expect(sanitizeProductName("Apple Apple", "Apple")).toBe("Apple");
  });
});
