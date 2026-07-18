/**
 * stripControlChars / hasControlChars: remove/detecta caracteres de controle
 * (C0/C1, quebras de linha) e overrides BIDI em campos de texto livre da API de
 * parceiros (recipientName, description). Fecha injeção em log/CSV/exibição por
 * input externo (auditoria WH-6).
 *
 * Chars de controle construídos via String.fromCharCode (fonte ASCII).
 */
import { describe, it, expect } from "vitest";
import { stripControlChars, hasControlChars } from "@/lib/utils/sanitize-line";

const RLO = String.fromCharCode(0x202e); // RIGHT-TO-LEFT OVERRIDE
const NUL = String.fromCharCode(0x00);

describe("stripControlChars", () => {
  it("mantém texto normal (com acentos)", () => {
    expect(stripControlChars("João da Silva")).toBe("João da Silva");
  });

  it("remove quebras de linha e tabs (injeção de log)", () => {
    expect(stripControlChars("linha1\nlinha2\r\tfim")).toBe("linha1linha2fim");
  });

  it("remove caracteres de controle C0 (ex.: NUL)", () => {
    expect(stripControlChars(`a${NUL}bc`)).toBe("abc");
  });

  it("remove overrides BIDI (spoofing de exibição)", () => {
    expect(stripControlChars(`txt${RLO}evil`)).toBe("txtevil");
  });

  it("faz trim das pontas", () => {
    expect(stripControlChars("  espaço  ")).toBe("espaço");
  });

  it("string vazia continua vazia", () => {
    expect(stripControlChars("")).toBe("");
  });
});

describe("hasControlChars", () => {
  it("false para texto normal", () => {
    expect(hasControlChars("João da Silva")).toBe(false);
  });
  it("true para quebra de linha / tab / controle / BIDI", () => {
    expect(hasControlChars("a\nb")).toBe(true);
    expect(hasControlChars("a\tb")).toBe(true);
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${RLO}b`)).toBe(true);
  });
  it("é estável em chamadas repetidas", () => {
    expect(hasControlChars("a\nb")).toBe(true);
    expect(hasControlChars("a\nb")).toBe(true);
    expect(hasControlChars("limpo")).toBe(false);
  });
});
