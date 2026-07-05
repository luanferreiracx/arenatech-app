import { describe, it, expect } from "vitest";
import {
  extractApuracaoLines,
  csvField,
  buildApuracaoCsv,
} from "@/lib/commission/apuracao-memory";

describe("extractApuracaoLines", () => {
  it("returns empty for missing/malformed memory", () => {
    expect(extractApuracaoLines(null)).toEqual([]);
    expect(extractApuracaoLines({})).toEqual([]);
    expect(extractApuracaoLines({ linhas: "x" })).toEqual([]);
  });

  it("maps memory rows to export lines with readable labels", () => {
    const lines = extractApuracaoLines({
      linhas: [
        {
          data: "2026-06-10",
          referencia_label: "Venda #12 — iPhone",
          categoria: "produto_aparelho",
          escopo: "premium",
          base: 1000,
          comissao: 50,
        },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      data: "2026-06-10",
      referencia: "Venda #12 — iPhone",
      categoria: "Aparelho",
      escopo: "Premium",
      base: 1000,
      comissao: 50,
    });
  });

  it("keeps raw key when label is unknown and coerces numbers", () => {
    const lines = extractApuracaoLines({
      linhas: [{ categoria: "desconhecida", escopo: "x", base: "12.5", comissao: "1.25" }],
    });
    expect(lines[0]).toMatchObject({ categoria: "desconhecida", base: 12.5, comissao: 1.25 });
  });
});

describe("csvField", () => {
  it("passes through plain values", () => {
    expect(csvField("abc")).toBe("abc");
    expect(csvField(12.5)).toBe("12.5");
  });

  it("quotes and escapes when it contains separator/quote/newline", () => {
    expect(csvField("a;b")).toBe('"a;b"');
    expect(csvField('a"b')).toBe('"a""b"');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
});

describe("buildApuracaoCsv", () => {
  it("emits BOM + header + rows separated by ;", () => {
    const csv = buildApuracaoCsv([
      { data: "2026-06-10", referencia: "Venda #1", categoria: "Aparelho", escopo: "Normal", base: 100, comissao: 5 },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("﻿Data;Referencia;Categoria;Escopo;Base;Comissao");
    expect(lines[1]).toBe("2026-06-10;Venda #1;Aparelho;Normal;100.00;5.00");
  });

  it("escapes a referencia that contains the separator", () => {
    const csv = buildApuracaoCsv([
      { data: "2026-06-10", referencia: "OS #9; troca de tela", categoria: "AT com peca", escopo: "Normal", base: 200, comissao: 20 },
    ]);
    expect(csv).toContain('"OS #9; troca de tela"');
  });
});
