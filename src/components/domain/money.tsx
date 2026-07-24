import { cn } from "@/lib/utils";
import { formatCentsBRL } from "@/lib/format";

/**
 * Exibe um valor monetário (em CENTAVOS) com `tabular-nums` — dígitos de largura
 * fixa, para que colunas de dinheiro alinhem verticalmente. Fonte única de
 * exibição de dinheiro no app (substitui os `formatCurrency` locais divergentes).
 *
 * `sign`: quando true, prefixa "+"/"−" e tinge por sinal (verde/vermelho) — útil
 * em extratos/lançamentos. Padrão false (sem cor, sem sinal explícito).
 */
export function Money({
  cents,
  sign = false,
  className,
}: {
  cents: number;
  sign?: boolean;
  className?: string;
}) {
  const formatted = formatCentsBRL(Math.abs(cents));
  const signPrefix = sign ? (cents < 0 ? "− " : "+ ") : "";
  return (
    <span
      className={cn(
        "tabular-nums",
        sign && cents < 0 && "text-destructive",
        sign && cents > 0 && "text-success",
        className,
      )}
    >
      {signPrefix}
      {formatted}
    </span>
  );
}
