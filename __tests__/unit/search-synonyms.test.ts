import { describe, it, expect } from "vitest";
import {
  normalizeTerm,
  expandWord,
  searchWords,
  expandSearchWords,
} from "@/lib/search/synonyms";

describe("normalizeTerm", () => {
  it("minuscula e remove acentos", () => {
    expect(normalizeTerm("Película")).toBe("pelicula");
    expect(normalizeTerm("RELÓGIO")).toBe("relogio");
    expect(normalizeTerm("rápido")).toBe("rapido");
  });
  it("casa formas com e sem acento", () => {
    expect(normalizeTerm("película")).toBe(normalizeTerm("pelicula"));
  });
});

describe("expandWord", () => {
  it("expande para sinonimos do mesmo grupo", () => {
    const fone = expandWord("fone");
    expect(fone).toContain("headset");
    expect(fone).toContain("earbuds");
    expect(fone).toContain("fone"); // sempre inclui o original
  });
  it("sinonimia funciona nos dois sentidos", () => {
    expect(expandWord("headset")).toContain("fone");
    expect(expandWord("fone")).toContain("headset");
  });
  it("casa entrada acentuada via normalizacao", () => {
    // "película" (com acento) deve achar o grupo da chave "pelicula".
    const peli = expandWord("película");
    expect(peli).toContain("vidro");
    expect(peli).toContain("protetor");
  });
  it("fonte e carregador sao sinonimos", () => {
    expect(expandWord("fonte")).toContain("carregador");
    expect(expandWord("carregador")).toContain("fonte");
  });
  it("termo sem sinonimo cadastrado devolve so ele mesmo", () => {
    expect(expandWord("xyzqualquer")).toEqual(["xyzqualquer"]);
  });
  it("nao duplica o termo original", () => {
    const out = expandWord("mouse");
    expect(out.filter((w) => w === "mouse")).toHaveLength(1);
  });
});

describe("searchWords", () => {
  it("quebra em palavras >= 2 chars, minusculas", () => {
    expect(searchWords("Fone Bluetooth")).toEqual(["fone", "bluetooth"]);
  });
  it("descarta palavras de 1 char", () => {
    expect(searchWords("a fone")).toEqual(["fone"]);
  });
  it("string vazia => lista vazia", () => {
    expect(searchWords("   ")).toEqual([]);
  });
});

describe("expandSearchWords", () => {
  it("expande cada palavra da busca", () => {
    const groups = expandSearchWords("fone bluetooth");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toContain("headset"); // fone
    expect(groups[1]).toContain("wireless"); // bluetooth
  });
  it("busca vazia => sem grupos", () => {
    expect(expandSearchWords("")).toEqual([]);
  });

  // Regressao: sinonimo MULTI-PALAVRA. "carregador portatil" / "bateria externa"
  // sao chaves do dicionario mas eram quebradas em tokens e nunca casavam power
  // bank. A busca da loja (public-catalog) usa expandSearchWords para montar o WHERE.
  describe("frases multi-palavra (regressao powerbank)", () => {
    // Os termos exatos que o dono testou na loja.
    const termos = ["powerbank", "bateria portatil", "carregador portatil"];
    for (const termo of termos) {
      it(`"${termo}" acha power bank`, () => {
        const groups = expandSearchWords(termo);
        const todos = groups.flat();
        expect(todos).toContain("power bank");
        expect(todos).toContain("powerbank");
      });
    }

    it("frase inteira vira UM grupo (OR entre sinonimos)", () => {
      const groups = expandSearchWords("carregador portatil");
      // Sem o fix eram 2 grupos (AND) que exigiam "portatil" no produto.
      expect(groups).toHaveLength(1);
      expect(groups[0]).toContain("bateria externa");
    });

    it("mantem a forma acentuada digitada pelo cliente", () => {
      expect(expandSearchWords("bateria portátil")[0]).toContain("bateria portátil");
    });

    it("frase desconhecida cai no fallback palavra-por-palavra", () => {
      const groups = expandSearchWords("fone bluetooth");
      expect(groups).toHaveLength(2); // comportamento historico preservado
    });
  });
});
