import { describe, it, expect } from "vitest";
import {
  storageSortKey,
  batterySortKey,
  compareValuations,
} from "@/lib/valuation-ordering";

describe("storageSortKey", () => {
  it("ordena GB numericamente (64 < 128 < 256)", () => {
    expect(storageSortKey("64GB")).toBeLessThan(storageSortKey("128GB"));
    expect(storageSortKey("128GB")).toBeLessThan(storageSortKey("256GB"));
  });

  it("converte TB para GB (1TB = 1024GB > 512GB)", () => {
    expect(storageSortKey("1TB")).toBe(1024);
    expect(storageSortKey("512GB")).toBeLessThan(storageSortKey("1TB"));
    expect(storageSortKey("1TB")).toBeLessThan(storageSortKey("2TB"));
  });

  it("aceita espacos e caixa diferente", () => {
    expect(storageSortKey(" 64 gb ")).toBe(64);
  });

  it("manda strings sem numero pro fim", () => {
    expect(storageSortKey("-")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("batterySortKey", () => {
  it("ordena saude da melhor para a pior", () => {
    expect(batterySortKey("> 90%")).toBeLessThan(batterySortKey("85% - 90%"));
    expect(batterySortKey("85% - 90%")).toBeLessThan(batterySortKey("80% - 85%"));
    expect(batterySortKey("80% - 85%")).toBeLessThan(batterySortKey("< 80%"));
    expect(batterySortKey("< 80%")).toBeLessThan(batterySortKey("-"));
  });

  it("valor desconhecido vai pro fim", () => {
    expect(batterySortKey("qualquer")).toBe(6);
  });
});

describe("compareValuations", () => {
  it("ordena por modelo, depois storage numerico, depois bateria", () => {
    const rows = [
      { modelo: "iPhone 13", armazenamento: "128GB", saudeBateria: "< 80%" },
      { modelo: "iPhone 13", armazenamento: "64GB", saudeBateria: "> 90%" },
      { modelo: "iPhone 12", armazenamento: "256GB", saudeBateria: "> 90%" },
      { modelo: "iPhone 13", armazenamento: "64GB", saudeBateria: "85% - 90%" },
    ];
    const sorted = [...rows].sort(compareValuations);
    expect(sorted.map((r) => `${r.modelo}|${r.armazenamento}|${r.saudeBateria}`)).toEqual([
      "iPhone 12|256GB|> 90%",
      "iPhone 13|64GB|> 90%",
      "iPhone 13|64GB|85% - 90%",
      "iPhone 13|128GB|< 80%",
    ]);
  });

  it("nao coloca 128GB antes de 64GB (regressao do bug de string asc)", () => {
    const rows = [
      { modelo: "X", armazenamento: "128GB", saudeBateria: "> 90%" },
      { modelo: "X", armazenamento: "64GB", saudeBateria: "> 90%" },
    ];
    const sorted = [...rows].sort(compareValuations);
    expect(sorted[0]?.armazenamento).toBe("64GB");
  });
});
