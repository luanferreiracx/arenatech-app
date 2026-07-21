import { describe, it, expect } from "vitest";
import { splitCsvLine, parseCsvContent } from "@/app/(app)/stock/import/csv-parser";

describe("splitCsvLine", () => {
  it("respeita o separador dentro de aspas", () => {
    expect(splitCsvLine('"iPhone 15; Pro";1500,00', ";")).toEqual([
      "iPhone 15; Pro",
      "1500,00",
    ]);
  });

  it("desescapa aspas duplas dentro do campo", () => {
    expect(splitCsvLine('"Tela 6"" polegadas";10', ";")).toEqual([
      'Tela 6" polegadas',
      "10",
    ]);
  });

  it("split simples sem aspas", () => {
    expect(splitCsvLine("a;b;c", ";")).toEqual(["a", "b", "c"]);
  });
});

describe("parseCsvContent", () => {
  it("não desloca colunas quando o nome contém o separador (bug do split ingênuo)", () => {
    const csv = ['nome;preco_venda', '"Cabo USB-C; 2m";49,90'].join("\n");
    const { lines, errors } = parseCsvContent(csv);
    expect(errors).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.name).toBe("Cabo USB-C; 2m");
    expect(lines[0]!.salePrice).toBe(4990); // centavos
  });

  it("mapeia 'aparelho' para isDevice e 'serializado' para isSerialized (semânticas distintas)", () => {
    const csv = [
      "nome;preco_venda;aparelho;serializado",
      "iPhone 15;5000,00;sim;sim",
      "Capa;50,00;nao;nao",
    ].join("\n");
    const { lines } = parseCsvContent(csv);
    expect(lines[0]).toMatchObject({ name: "iPhone 15", isDevice: true, isSerialized: true });
    expect(lines[1]).toMatchObject({ name: "Capa", isDevice: false, isSerialized: false });
  });

  it("sinaliza linha com número de colunas divergente em vez de importar desalinhado", () => {
    const csv = ["nome;preco_venda", "Produto A;10,00;coluna_extra"].join("\n");
    const { lines, errors } = parseCsvContent(csv);
    expect(lines).toHaveLength(0);
    expect(errors[0]).toMatch(/colunas, esperado 2/);
  });
});
