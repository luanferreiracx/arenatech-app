import type { CsvImportLineInput } from "@/lib/validators/stock";

export interface ParsedLine extends CsvImportLineInput {
  _lineNum: number;
  _error?: string;
}

/**
 * Divide UMA linha CSV respeitando aspas duplas (RFC 4180): campos entre aspas
 * podem conter o separador e aspas escapadas ("") sem quebrar as colunas. O
 * split ingênuo por `;` deslocava silenciosamente as colunas quando um nome ou
 * descrição continha o separador.
 */
export function splitCsvLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === separator) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

/** Mapa de cabeçalhos aceitos → campo canônico. isDevice ("é aparelho") e
 * isSerialized ("controla por IMEI/série") são flags distintas. */
const COL_MAP: Record<string, string> = {
  nome: "name", name: "name", produto: "name",
  sku: "sku", codigo_interno: "sku",
  codigo_barras: "barcode", barcode: "barcode", ean: "barcode",
  marca: "brand", brand: "brand",
  categoria: "category", category: "category",
  preco_custo: "costPrice", custo: "costPrice", cost_price: "costPrice",
  preco_venda: "salePrice", venda: "salePrice", sale_price: "salePrice", preco: "salePrice",
  preco_promocional: "promotionalPrice", promotional_price: "promotionalPrice",
  estoque_minimo: "minStock", min_stock: "minStock",
  quantidade: "quantity", qtd: "quantity", qty: "quantity",
  eh_aparelho: "isDevice", is_device: "isDevice", aparelho: "isDevice",
  serializado: "isSerialized", serialized: "isSerialized", controla_serie: "isSerialized",
  descricao: "description", description: "description",
};

function parseBrPrice(v: string): number {
  if (!v) return 0;
  let clean = v.replace(/[R$\s]/g, "");
  // Formato BR: 1.234,56
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(clean)) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (clean.includes(",") && !clean.includes(".")) {
    clean = clean.replace(",", ".");
  }
  return Math.round(parseFloat(clean || "0") * 100); // em centavos
}

function parseBool(v: string): boolean {
  return ["sim", "yes", "1", "true", "s", "y"].includes(v.toLowerCase());
}

export function parseCsvContent(
  text: string,
  separator = ";",
): { lines: ParsedLine[]; errors: string[] } {
  const rows = text.split(/\r?\n/).filter((r) => r.trim() && !r.trim().startsWith("#"));
  if (rows.length < 2) return { lines: [], errors: ["Arquivo vazio ou sem dados."] };

  const headerRaw = splitCsvLine(rows[0]!, separator).map((h) =>
    h.trim().toLowerCase().replace(/\*/g, ""),
  );
  const headers = headerRaw.map((h) => COL_MAP[h] ?? h);
  const errors: string[] = [];
  const lines: ParsedLine[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = splitCsvLine(rows[i]!, separator);
    if (cols.every((c) => !c.trim())) continue;

    // Contagem de colunas divergente = separador não escapado ou coluna a mais/
    // a menos. Sinaliza em vez de importar dados desalinhados silenciosamente.
    if (cols.length !== headers.length) {
      errors.push(
        `Linha ${i + 1}: ${cols.length} colunas, esperado ${headers.length} (verifique separador/aspas)`,
      );
      continue;
    }

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });

    if (!obj.name) {
      errors.push(`Linha ${i + 1}: Nome obrigatorio`);
      continue;
    }

    const line: ParsedLine = {
      _lineNum: i + 1,
      name: obj.name ?? "",
      sku: obj.sku || undefined,
      barcode: obj.barcode || undefined,
      brand: obj.brand || undefined,
      category: obj.category || undefined,
      costPrice: parseBrPrice(obj.costPrice ?? ""),
      salePrice: parseBrPrice(obj.salePrice ?? ""),
      promotionalPrice: obj.promotionalPrice ? parseBrPrice(obj.promotionalPrice) : undefined,
      minStock: obj.minStock ? parseInt(obj.minStock, 10) : undefined,
      quantity: obj.quantity ? parseInt(obj.quantity, 10) : undefined,
      isDevice: obj.isDevice ? parseBool(obj.isDevice) : undefined,
      isSerialized: obj.isSerialized ? parseBool(obj.isSerialized) : undefined,
      description: obj.description || undefined,
    };

    if (line.salePrice <= 0) {
      line._error = "Preco de venda invalido";
    }

    lines.push(line);
  }

  return { lines, errors };
}
