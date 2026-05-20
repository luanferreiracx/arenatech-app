import { describe, it, expect } from "vitest";
import { parseIPhoneListing } from "@/lib/services/iphone-listing-parser";

describe("parseIPhoneListing", () => {
  describe("modelo + caixa", () => {
    it("extrai iPhone 13 com caixa", () => {
      const r = parseIPhoneListing("Vendo iPhone 13 128gb preto com caixa R$ 2.800");
      expect(r).not.toBeNull();
      expect(r?.model).toBe("iPhone 13");
      expect(r?.hasBox).toBe(true);
    });

    it("extrai iPhone 13 Pro Max com 'pm' abreviado", () => {
      const r = parseIPhoneListing("iPhone 13 PM 256gb caixa R$ 4500");
      expect(r?.model).toBe("iPhone 13 Pro Max");
    });

    it("extrai iPhone 15 Pro Max completo", () => {
      const r = parseIPhoneListing("iPhone 15 Pro Max 512gb com caixa lacrado");
      expect(r?.model).toBe("iPhone 15 Pro Max");
    });

    it("extrai iPhone XS Max", () => {
      const r = parseIPhoneListing("iPhone XS Max 64gb na cx R$ 1.800");
      expect(r?.model).toBe("iPhone XS Max");
    });

    it("extrai iPhone SE", () => {
      const r = parseIPhoneListing("iPhone SE 2 com caixa R$ 1200");
      expect(r?.model).toBe("iPhone SE 2");
    });

    it("aceita 'na cx' como caixa", () => {
      const r = parseIPhoneListing("iPhone 12 64gb na cx 2300");
      expect(r?.hasBox).toBe(true);
    });

    it("aceita 'c/ caixa' como caixa", () => {
      const r = parseIPhoneListing("iPhone 14 128gb c/ caixa R$3500");
      expect(r?.hasBox).toBe(true);
    });
  });

  describe("rejeições", () => {
    it("rejeita 'sem caixa'", () => {
      expect(parseIPhoneListing("iPhone 13 128gb sem caixa R$ 2500")).toBeNull();
    });

    it("rejeita 's/ caixa'", () => {
      expect(parseIPhoneListing("iPhone 12 64gb s/ caixa")).toBeNull();
    });

    it("rejeita 'sem cx'", () => {
      expect(parseIPhoneListing("iPhone 11 sem cx 1800")).toBeNull();
    });

    it("rejeita quando não há menção a caixa", () => {
      expect(parseIPhoneListing("iPhone 13 128gb preto R$ 2500")).toBeNull();
    });

    it("rejeita mensagem sem iPhone", () => {
      expect(parseIPhoneListing("Samsung Galaxy S23 com caixa R$ 2000")).toBeNull();
    });

    it("rejeita mensagem vazia", () => {
      expect(parseIPhoneListing("")).toBeNull();
    });

    it("rejeita mensagem muito curta", () => {
      expect(parseIPhoneListing("ipho")).toBeNull();
    });
  });

  describe("storage", () => {
    it("extrai 128gb", () => {
      const r = parseIPhoneListing("iPhone 14 128gb caixa");
      expect(r?.storageGb).toBe(128);
    });

    it("extrai 1tb", () => {
      const r = parseIPhoneListing("iPhone 15 Pro Max 1TB caixa lacrado");
      expect(r?.storageGb).toBe(1024);
    });

    it("retorna null quando sem storage", () => {
      const r = parseIPhoneListing("iPhone 13 com caixa R$ 2800");
      expect(r?.storageGb).toBeNull();
    });
  });

  describe("preço", () => {
    it("extrai 'R$ 2.800'", () => {
      const r = parseIPhoneListing("iPhone 13 128gb caixa R$ 2.800");
      expect(r?.priceCents).toBe(280000);
    });

    it("extrai '2500'", () => {
      const r = parseIPhoneListing("iPhone 13 caixa 2500");
      expect(r?.priceCents).toBe(250000);
    });

    it("extrai 'R$ 1.500,00'", () => {
      const r = parseIPhoneListing("iPhone 11 caixa R$ 1.500,00");
      expect(r?.priceCents).toBe(150000);
    });

    it("ignora preços implausíveis (R$ 50)", () => {
      const r = parseIPhoneListing("iPhone 13 caixa 50");
      expect(r?.priceCents).toBeNull();
    });

    it("ignora preços implausíveis (R$ 100.000)", () => {
      const r = parseIPhoneListing("iPhone 13 caixa 100000");
      expect(r?.priceCents).toBeNull();
    });
  });

  describe("condição", () => {
    it("LACRADO quando 'lacrado'", () => {
      const r = parseIPhoneListing("iPhone 15 Pro caixa lacrado 256gb");
      expect(r?.condition).toBe("LACRADO");
    });

    it("LACRADO quando 'zero km'", () => {
      const r = parseIPhoneListing("iPhone 15 0 km com caixa");
      expect(r?.condition).toBe("LACRADO");
    });

    it("SEMINOVO_CAIXA quando 'seminovo' + caixa", () => {
      const r = parseIPhoneListing("iPhone 13 seminovo com caixa R$ 2800");
      expect(r?.condition).toBe("SEMINOVO_CAIXA");
    });

    it("SEMINOVO_CAIXA quando apenas 'caixa' (default com caixa)", () => {
      const r = parseIPhoneListing("iPhone 13 com caixa R$ 2800");
      expect(r?.condition).toBe("SEMINOVO_CAIXA");
    });
  });

  describe("snippet", () => {
    it("normaliza espaços", () => {
      const r = parseIPhoneListing("iPhone 13   128gb\n\ncom  caixa");
      expect(r?.rawSnippet).toBe("iPhone 13 128gb com caixa");
    });
  });

  describe("cor", () => {
    it("extrai cor preto", () => {
      const r = parseIPhoneListing("iPhone 13 128gb preto com caixa");
      expect(r?.color).toBe("preto");
    });

    it("extrai cor midnight", () => {
      const r = parseIPhoneListing("iPhone 13 midnight 128gb na caixa");
      expect(r?.color).toBe("midnight");
    });
  });
});
