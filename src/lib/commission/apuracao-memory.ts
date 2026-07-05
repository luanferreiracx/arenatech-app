import {
  COMMISSION_CATEGORY_LABELS,
  COMMISSION_SCOPE_LABELS,
  COMMISSION_SOURCE_LABELS,
} from "@/lib/validators/provider-commission";

export type ApuracaoLine = {
  data: string;
  referencia: string;
  categoria: string;
  escopo: string;
  origem: string;
  base: number; // reais
  comissao: number; // reais
};

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extrai as linhas exportaveis da `memoryJson` da apuracao, ja com os rotulos
 * legiveis de categoria/escopo. Tolerante a memoria ausente/mal-formada ([]).
 * Puro — sem dependencia de servidor, testavel isoladamente.
 */
export function extractApuracaoLines(memoryJson: unknown): ApuracaoLine[] {
  if (!memoryJson || typeof memoryJson !== "object") return [];
  const linhas = (memoryJson as { linhas?: unknown }).linhas;
  if (!Array.isArray(linhas)) return [];

  return linhas.map((raw): ApuracaoLine => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const categoria = String(row.categoria ?? "");
    const escopo = String(row.escopo ?? "");
    const origem = String(row.origem ?? "OWN");
    return {
      data: String(row.data ?? ""),
      referencia: String(row.referencia_label ?? ""),
      categoria: COMMISSION_CATEGORY_LABELS[categoria] ?? categoria,
      escopo: COMMISSION_SCOPE_LABELS[escopo] ?? escopo,
      origem: COMMISSION_SOURCE_LABELS[origem] ?? origem,
      base: toNumber(row.base),
      comissao: toNumber(row.comissao),
    };
  });
}

/** Escapa um campo CSV (aspas duplas; envolve se contiver separador/quebra). */
export function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Monta o CSV (separador `;`, com BOM UTF-8 para o Excel) da memoria de calculo.
 */
export function buildApuracaoCsv(lines: ApuracaoLine[]): string {
  const header = ["Data", "Referencia", "Categoria", "Escopo", "Origem", "Base", "Comissao"];
  const rows = lines.map((l) =>
    [l.data, l.referencia, l.categoria, l.escopo, l.origem, l.base.toFixed(2), l.comissao.toFixed(2)]
      .map(csvField)
      .join(";"),
  );
  return "﻿" + [header.join(";"), ...rows].join("\r\n") + "\r\n";
}
