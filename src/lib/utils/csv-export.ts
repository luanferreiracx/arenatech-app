"use client";

/**
 * Geração de CSV no browser (client-side) para relatórios que já têm os dados
 * carregados na tela — evita duplicar a agregação do backend numa rota REST.
 * Separador `;` + BOM (Excel reconhece UTF-8) + guarda anti-injeção de fórmula,
 * espelhando o /api/financial/export.
 */

function csvCell(value: string | number | null | undefined): string {
  let safe = value == null ? "" : String(value);
  // Anti CSV/formula injection: campos que começam com =,+,-,@ ou tab.
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[";\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n");
}

/** Dispara o download de um CSV no navegador. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const blob = new Blob([buildCsv(headers, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Valor em centavos → reais no formato BR (vírgula decimal), sem separador de milhar. */
export function centsToBrl(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
