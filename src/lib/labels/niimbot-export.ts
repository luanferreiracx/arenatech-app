import ExcelJS from "exceljs";

/**
 * Geração de planilha .xlsx para impressão em série na Niimbot (B1).
 *
 * O app Niimbot importa uma planilha limpa (cabeçalho na linha 1, uma etiqueta por
 * linha, colunas simples) e vincula cada coluna a um elemento da etiqueta. Para a
 * etiqueta de produto desta loja, o conteúdo impresso são 3 campos: nome (reduzido
 * para caber), preço e código de barras.
 *
 * O app Niimbot imprime SEMPRE 1 etiqueta por linha — não existe coluna de "cópias"
 * que ele multiplique. Por isso a quantidade é resolvida aqui, repetindo cada linha
 * N vezes (`expandByQuantity`). A planilha final não tem coluna Quantidade.
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

// Niimbot B1: etiqueta 50x30 mm — acima de ~30 chars a fonte fica ilegível.
const SHORT_NAME_MAX_LEN = 30;

/** Caractere de reticências (1 char, economiza espaço na etiqueta). */
const ELLIPSIS = "…";

/**
 * Reduz o nome do produto para caber na etiqueta Niimbot B1 usando estratégia início…fim.
 *
 * Preserva início (marca/série) e fim (modelo/capacidade), descartando o meio.
 * O sufixo é mantido integralmente (sem pular palavras) — apenas espaços iniciais
 * são removidos. Isso garante que números de modelo como "N3017W RTX 4060" apareçam
 * completos, mesmo que o corte caia no meio de um token composto (ex.: "FX607JV-N3017W").
 *
 * Exemplo: "ASUS TUF Gaming F16 FX607JV-N3017W RTX 4060" (43 chars, maxLen=30)
 *   → "ASUS TUF Gaming…N3017W RTX 4060" (31 chars)
 */
export function abbreviateName(name: string, maxLen: number = SHORT_NAME_MAX_LEN): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLen) return clean;

  const budget = maxLen - 1;
  // 45% início (marca/série) + 55% fim (modelo/variante) — o fim importa mais para identificação.
  const startBudget = Math.ceil(budget * 0.45);
  const endBudget = budget - startBudget;

  // Início: corta na última fronteira de palavra dentro de startBudget.
  const startSlice = clean.slice(0, startBudget);
  const startSpace = startSlice.lastIndexOf(" ");
  const startPart =
    startSpace > startBudget * 0.5 ? startSlice.slice(0, startSpace) : startSlice.trimEnd();

  // Fim: pega os últimos N chars e remove apenas espaços iniciais.
  // Não pula a primeira palavra — preserva o sufixo completo (ex.: "N3017W RTX 4060").
  const endPart = clean.slice(-endBudget).trimStart();

  return `${startPart}${ELLIPSIS}${endPart}`;
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

/**
 * Monta o workbook .xlsx no formato de importação do Niimbot e retorna o buffer.
 * Uma única aba, cabeçalho na linha 1, sem células mescladas nem estilos pesados.
 *
 * Cada linha da planilha é UMA etiqueta física: a quantidade de cada produto é
 * expandida em linhas repetidas, pois o Niimbot imprime 1 etiqueta por linha e
 * ignora qualquer coluna de contagem.
 */
export async function buildNiimbotWorkbook(rows: LabelRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Etiquetas");

  sheet.columns = [
    { header: "Nome", key: "nome", width: 28 },
    { header: "Preço", key: "preco", width: 14 },
    { header: "Código de barras", key: "barcode", width: 20 },
  ];
  for (const row of expandByQuantity(rows)) sheet.addRow(row);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
