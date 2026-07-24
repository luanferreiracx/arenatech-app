import { StatusBadge } from "@/components/domain/status-badge";
import { formatCentsBRL, formatReaisBRL } from "@/lib/format";

/** Reexporta o formatter central (centavos) — os tabs de relatório importam daqui. */
export const formatCurrency = formatCentsBRL;

/** Formata Decimal/desconhecido (já em reais) via o central. */
export function formatCurrencyFromDecimal(value: unknown): string {
  return formatReaisBRL(Number(value));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function AbcBadge({ classe }: { classe: string }) {
  if (classe === "A") return <StatusBadge variant="success">A</StatusBadge>;
  if (classe === "B") return <StatusBadge variant="warning">B</StatusBadge>;
  return <StatusBadge variant="default">C</StatusBadge>;
}

export function RankBadge({ index }: { index: number }) {
  if (index === 0)
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-500 text-white text-xs font-bold">
        1
      </span>
    );
  if (index === 1)
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-400 text-white text-xs font-bold">
        2
      </span>
    );
  if (index === 2)
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-700 text-white text-xs font-bold">
        3
      </span>
    );
  return <span className="text-sm text-muted-foreground">{index + 1}</span>;
}
