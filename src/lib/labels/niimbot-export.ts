import ExcelJS from "exceljs";

/**
 * Geração de planilha .xlsx para impressão em série na Niimbot (B1).
 *
 * O app Niimbot importa uma planilha limpa (cabeçalho na linha 1, uma etiqueta por
 * linha, colunas simples) e vincula cada coluna a um elemento da etiqueta. Para a
 * etiqueta de produto desta loja, o conteúdo impresso são 3 campos: nome (reduzido
 * para caber), preço e código de barras. `Quantidade` é apenas controle de cópias —
 * não é impresso. Ver docs/pesquisa no PR.
 */

/** Valor numérico aceito (number ou Prisma.Decimal — qualquer coisa com toString). */
type Numeric = number | { toString(): string };

export type LabelRow = {
  /** Nome já abreviado para caber na etiqueta. */
  nome: string;
  /** Preço formatado em reais, ex.: "R$ 99,90". */
  preco: string;
  /** Código de barras (ou SKU como fallback). Pode ser vazio. */
  barcode: string;
  /** Quantidade de cópias desejada (>= 1). */
  quantidade: number;
};

const SHORT_NAME_MAX_LEN = 22;

/** Caractere de reticências (1 char, economiza espaço na etiqueta). */
const ELLIPSIS = "…";

/**
 * Reduz o nome do produto para caber na etiqueta, cortando em fronteira de palavra
 * quando possível e adicionando reticências. Não corta no meio de palavra a menos que
 * a primeira palavra já estoure o limite.
 */
export function abbreviateName(name: string, maxLen: number = SHORT_NAME_MAX_LEN): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLen) return clean;

  const slice = clean.slice(0, maxLen - 1);
  const lastSpace = slice.lastIndexOf(" ");
  // Só corta na palavra se sobrar pelo menos metade do limite — evita reduzir demais.
  const base = lastSpace > maxLen / 2 ? slice.slice(0, lastSpace) : slice;
  return base.trimEnd() + ELLIPSIS;
}

/** Formata um valor numérico como moeda BRL, ex.: 1234.5 → "R$ 1.234,50". */
export function formatBRL(value: Numeric): string {
  const num = typeof value === "number" ? value : Number(value.toString());
  const safe = Number.isFinite(num) ? num : 0;
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `R$ ${formatted}`;
}

/**
 * Expande as linhas repetindo cada uma conforme a quantidade (mínimo 1 cópia).
 * Usado quando se quer imprimir N cópias direto, sem ajustar no app Niimbot.
 */
export function expandByQuantity(rows: LabelRow[]): Omit<LabelRow, "quantidade">[] {
  const expanded: Omit<LabelRow, "quantidade">[] = [];
  for (const { quantidade, ...content } of rows) {
    const copies = Math.max(1, Math.floor(quantidade));
    for (let i = 0; i < copies; i++) expanded.push(content);
  }
  return expanded;
}

type BuildOptions = {
  /** Repete N linhas iguais em vez de usar a coluna Quantidade. */
  expand?: boolean;
};

/**
 * Monta o workbook .xlsx no formato de importação do Niimbot e retorna o buffer.
 * Uma única aba, cabeçalho na linha 1, sem células mescladas nem estilos pesados.
 */
export async function buildNiimbotWorkbook(
  rows: LabelRow[],
  options: BuildOptions = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Etiquetas");

  if (options.expand) {
    sheet.columns = [
      { header: "Nome", key: "nome", width: 28 },
      { header: "Preço", key: "preco", width: 14 },
      { header: "Código de barras", key: "barcode", width: 20 },
    ];
    for (const row of expandByQuantity(rows)) sheet.addRow(row);
  } else {
    sheet.columns = [
      { header: "Nome", key: "nome", width: 28 },
      { header: "Preço", key: "preco", width: 14 },
      { header: "Código de barras", key: "barcode", width: 20 },
      { header: "Quantidade", key: "quantidade", width: 12 },
    ];
    for (const row of rows) sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
