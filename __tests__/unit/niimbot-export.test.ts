import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  abbreviateName,
  buildNiimbotWorkbook,
  expandByQuantity,
  formatBRL,
  type LabelRow,
} from "@/lib/labels/niimbot-export";

describe("abbreviateName", () => {
  it("mantém nomes curtos inalterados", () => {
    expect(abbreviateName("Capa iPhone 13")).toBe("Capa iPhone 13");
  });

  it("colapsa espaços múltiplos", () => {
    expect(abbreviateName("Capa   iPhone   13")).toBe("Capa iPhone 13");
  });

  it("nomes com até maxLen chars passam inalterados", () => {
    const name = "Apple iPhone 15 Pro Max 256GB"; // 29 chars
    expect(abbreviateName(name, 30)).toBe(name);
  });

  it("nomes longos ficam dentro do limite com estratégia início…fim", () => {
    const result = abbreviateName("Apple iPhone 15 Pro Max 256GB Titânio Natural", 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain("…");
    expect(result.startsWith("Apple")).toBe(true);
  });

  it("preserva sufixo completo (número de modelo não é descartado)", () => {
    // "N3017W RTX 4060" deve aparecer no resultado — não deve ser cortado pelo algoritmo
    const result = abbreviateName("ASUS TUF Gaming F16 FX607JV-N3017W RTX 4060", 30);
    expect(result).toContain("…");
    expect(result.startsWith("ASUS")).toBe(true);
    expect(result).toMatch(/N3017W|RTX 4060/);
  });

  it("corta no meio quando não há espaço e a palavra estoura", () => {
    const result = abbreviateName("Supercalifragilisticexpialidocious", 10);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result).toContain("…");
  });
});

describe("formatBRL", () => {
  it("formata números simples", () => {
    expect(formatBRL(99.9)).toBe("R$ 99,90");
  });

  it("formata milhares com separador", () => {
    expect(formatBRL(1234.5)).toBe("R$ 1.234,50");
  });

  it("aceita valores tipo Decimal (toString)", () => {
    expect(formatBRL({ toString: () => "49.99" })).toBe("R$ 49,99");
  });

  it("trata valores inválidos como zero", () => {
    expect(formatBRL({ toString: () => "abc" })).toBe("R$ 0,00");
  });
});

describe("expandByQuantity", () => {
  const base: LabelRow = { nome: "X", preco: "R$ 1,00", barcode: "123", quantidade: 1 };

  it("repete a linha conforme a quantidade", () => {
    const out = expandByQuantity([{ ...base, quantidade: 3 }]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ nome: "X", preco: "R$ 1,00", barcode: "123" });
  });

  it("garante ao menos 1 cópia para quantidade 0 ou negativa", () => {
    expect(expandByQuantity([{ ...base, quantidade: 0 }])).toHaveLength(1);
    expect(expandByQuantity([{ ...base, quantidade: -5 }])).toHaveLength(1);
  });

  it("remove a coluna quantidade do resultado", () => {
    const [row] = expandByQuantity([base]);
    expect(row).not.toHaveProperty("quantidade");
  });
});

describe("buildNiimbotWorkbook", () => {
  const rows: LabelRow[] = [
    { nome: "Capa A", preco: "R$ 10,00", barcode: "111", quantidade: 2 },
    { nome: "Capa B", preco: "R$ 20,00", barcode: "222", quantidade: 1 },
  ];

  async function readSheet(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new Error("planilha não encontrada");
    const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    return { sheet, header, dataRows: sheet.rowCount - 1 };
  }

  it("expande a quantidade em linhas repetidas e omite a coluna Quantidade", async () => {
    // O Niimbot imprime 1 etiqueta por linha, então a planilha nunca tem coluna de cópias.
    const buffer = await buildNiimbotWorkbook(rows);
    const { header, dataRows } = await readSheet(buffer);
    expect(header).toEqual(["Nome", "Preço", "Código de barras"]);
    // 2 + 1 cópias = 3 linhas.
    expect(dataRows).toBe(3);
  });
});
