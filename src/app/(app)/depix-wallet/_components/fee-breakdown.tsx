"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeeBreakdownProps {
  kind: "DEPOSIT" | "WITHDRAW";
  netCents: number;
  feeArenaCents: number;
  feeProviderCents: number;
  /** Saldo disponivel pro usuario comparar com o gross (saque). Opcional. */
  availableBalanceCents?: number;
  className?: string;
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Card de breakdown visual das taxas. Para SAQUE:
 *   Destinatario recebe   R$ X
 *   + Taxa Arena Tech     R$ Y
 *   + Taxa LiquidX (est.) R$ Z
 *   ────
 *   Voce paga             R$ X+Y+Z
 *   Saldo disponivel      R$ ...
 *
 * Para DEPOSITO:
 *   Cliente paga          R$ X
 *   - Taxa Arena Tech     R$ Y
 *   - Taxa PixPay         R$ Z
 *   ────
 *   Voce recebe           R$ X-Y-Z
 */
export function FeeBreakdown({
  kind,
  netCents,
  feeArenaCents,
  feeProviderCents,
  availableBalanceCents,
  className,
}: FeeBreakdownProps) {
  const isWithdraw = kind === "WITHDRAW";
  const providerLabel = isWithdraw ? "Taxa LiquidX" : "Taxa PixPay";
  const providerTitle = isWithdraw
    ? "Estimativa LiquidX. Valor real eh confirmado ao iniciar a operacao."
    : "Estimativa PixPay para deposito. Valor real eh confirmado ao iniciar a operacao.";
  const grossCents = netCents + feeArenaCents + feeProviderCents;
  const totalCents = grossCents;
  const hasArenaFee = feeArenaCents > 0;
  const sign = isWithdraw ? "+" : "−";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-4 sm:p-5",
        "transition-all duration-200",
        className,
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3 font-medium">
        Resumo da operacao
      </p>

      <dl className="space-y-2.5 text-sm">
        {/* Net — destaque maior */}
        <div className="flex items-baseline justify-between">
          <dt className="text-muted-foreground">
            {isWithdraw ? "Destinatario recebe" : "Cliente paga"}
          </dt>
          <dd className="tabular-nums font-mono text-base">{fmt(netCents)}</dd>
        </div>

        {/* Taxas */}
        <div className="flex items-baseline justify-between">
          <dt className={cn("text-muted-foreground", hasArenaFee && "text-foreground/80")}>
            Taxa Arena Tech
          </dt>
          <dd
            className={cn(
              "tabular-nums font-mono",
              hasArenaFee ? "text-primary" : "text-muted-foreground",
            )}
          >
            {hasArenaFee ? `${sign} ${fmt(feeArenaCents)}` : fmt(0)}
          </dd>
        </div>

        <div className="flex items-baseline justify-between">
          <dt className="text-muted-foreground inline-flex items-center gap-1">
            {providerLabel}
            <span title={providerTitle}>
              <Info className="h-3 w-3 inline opacity-60" />
            </span>
          </dt>
          <dd className="tabular-nums font-mono text-muted-foreground">
            {sign} {fmt(feeProviderCents)}
          </dd>
        </div>

        {/* Total */}
        <div className="pt-2.5 mt-1 border-t border-border flex items-baseline justify-between">
          <dt className="font-semibold">
            {isWithdraw ? "Voce paga" : "Voce recebe"}
          </dt>
          <dd className="tabular-nums font-mono text-lg font-semibold">
            {fmt(isWithdraw ? totalCents : netCents - feeArenaCents - feeProviderCents)}
          </dd>
        </div>

        {/* Saldo disponivel (so saque) */}
        {isWithdraw && availableBalanceCents != null && (
          <div className="flex items-baseline justify-between text-xs pt-1">
            <dt className="text-muted-foreground">Saldo disponivel</dt>
            <dd
              className={cn(
                "tabular-nums font-mono",
                grossCents > availableBalanceCents
                  ? "text-destructive font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {fmt(availableBalanceCents)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
