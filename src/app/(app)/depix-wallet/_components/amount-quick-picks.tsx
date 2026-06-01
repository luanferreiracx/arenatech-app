"use client";

import { cn } from "@/lib/utils";

interface AmountQuickPicksProps {
  /** Valor atual em centavos. */
  value: number;
  onChange: (cents: number) => void;
  /** Valores padrao em centavos. */
  picks?: number[];
  className?: string;
}

const DEFAULT_PICKS = [5000, 10000, 25000, 50000, 100000]; // R$50, 100, 250, 500, 1000

function formatPick(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/**
 * Pilulas de atalho pra valores comuns (R$ 50, 100, 250, 500, 1000).
 * Ativo: fundo dourado. Hover: borda dourada. Scroll horizontal em mobile.
 */
export function AmountQuickPicks({
  value,
  onChange,
  picks = DEFAULT_PICKS,
  className,
}: AmountQuickPicksProps) {
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin",
        className,
      )}
      role="group"
      aria-label="Atalhos de valor"
    >
      {picks.map((cents) => {
        const isActive = value === cents;
        return (
          <button
            key={cents}
            type="button"
            onClick={() => onChange(cents)}
            aria-pressed={isActive}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium border transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-muted",
            )}
          >
            {formatPick(cents)}
          </button>
        );
      })}
    </div>
  );
}
