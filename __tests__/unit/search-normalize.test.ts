import { describe, it, expect } from "vitest";
import { normalizeSearchTerm } from "@/lib/search/normalize";
import { productSearchFilter } from "@/server/services/product-search";

describe("normalizeSearchTerm", () => {
  it("remove acento e sobe pra minúscula", () => {
    expect(normalizeSearchTerm("PELÍCULA")).toBe("pelicula");
    expect(normalizeSearchTerm("Câmera")).toBe("camera");
    expect(normalizeSearchTerm("Coração")).toBe("coracao");
    expect(normalizeSearchTerm("Relógio")).toBe("relogio");
  });

  it("faz as duas grafias convergirem (é o ponto do bug)", () => {
    expect(normalizeSearchTerm("pelicula")).toBe(normalizeSearchTerm("Película"));
    expect(normalizeSearchTerm("CAMERA")).toBe(normalizeSearchTerm("câmera"));
  });

  it("trima e colapsa espaços internos — igual ao search_normalize do banco", () => {
    expect(normalizeSearchTerm("  cabo   usb  ")).toBe("cabo usb");
  });

  it("não quebra com string vazia", () => {
    expect(normalizeSearchTerm("")).toBe("");
    expect(normalizeSearchTerm("   ")).toBe("");
  });
});

describe("productSearchFilter", () => {
  it("busca o termo normalizado em search_name e o cru em sku/barcode", () => {
    expect(productSearchFilter("Película")).toEqual({
      OR: [
        { searchName: { contains: "pelicula" } },
        { sku: { contains: "pelicula", mode: "insensitive" } },
        { barcode: { contains: "pelicula", mode: "insensitive" } },
      ],
    });
  });

  it("devolve null quando não há termo — o chamador não filtra", () => {
    expect(productSearchFilter("")).toBeNull();
    expect(productSearchFilter("   ")).toBeNull();
    expect(productSearchFilter(null)).toBeNull();
    expect(productSearchFilter(undefined)).toBeNull();
  });
});
