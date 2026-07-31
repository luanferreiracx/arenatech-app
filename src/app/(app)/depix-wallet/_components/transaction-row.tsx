"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { cn } from "@/lib/utils";

/**
 * Uma linha de transação da carteira DePix.
 *
 * Extraída de `recent-transactions.tsx` quando a lista completa
 * (`/depix-wallet/transactions`) passou a existir: renderizar a mesma linha em
 * dois lugares com dois códigos é exatamente o padrão que este sistema já pagou
 * caro sete vezes — duas implementações, e a correção entrando só numa delas.
 */

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateRel(d: Date | string): string {
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export const STATUS_VARIANT: Record<
  string,
  "default" | "warning" | "success" | "destructive" | "info"
> = {
  PENDING: "warning",
  PROCESSING: "info",
  PROCESSING_FEE: "info",
  COMPLETED: "success",
  COMPLETED_FEE_PENDING: "warning",
  FAILED: "destructive",
  CANCELLED: "default",
  EXPIRED: "default",
};

export type TransactionRowData = {
  id: string;
  kind: string;
  status: string;
  statusLabel: string;
  number: string;
  recipientName?: string | null;
  grossAmountCents: number;
  netAmountCents?: number | null;
  createdAt: Date | string;
};

export function TransactionRow({ tx }: { tx: TransactionRowData }) {
  const isDeposit = tx.kind === "DEPOSIT";
  const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight;
  // Valor só "entra/sai" de fato quando CONCLUÍDO. Cancelado/falho/expirado NÃO
  // movimenta saldo — exibe neutro e riscado (sem +/− verde, que enganava:
  // parecia crédito mesmo não tendo entrado).
  const didMoveFunds = tx.status === "COMPLETED";
  const isVoided = ["CANCELLED", "FAILED", "EXPIRED", "MED_REFUNDED"].includes(tx.status);

  return (
    <li>
      <Link
        href={`/depix-wallet/transactions/${tx.id}`}
        className="flex items-center gap-3 p-3.5 sm:p-4 hover:bg-muted/40 transition-colors"
      >
        <div
          className={cn(
            "h-10 w-10 rounded-full grid place-items-center shrink-0",
            isVoided
              ? "bg-muted text-muted-foreground"
              : isDeposit
                ? "bg-success/10 text-success"
                : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium truncate">
              {isDeposit ? "Deposito" : "Saque"}
              {!isDeposit && tx.recipientName && (
                <span className="text-muted-foreground font-normal"> para {tx.recipientName}</span>
              )}
            </p>
            <p
              className={cn(
                "tabular-nums font-mono text-sm font-semibold shrink-0",
                isVoided
                  ? "text-muted-foreground line-through"
                  : isDeposit && didMoveFunds
                    ? "text-success"
                    : "text-foreground",
              )}
            >
              {/* Só mostra sinal +/− quando o valor de fato movimentou. */}
              {didMoveFunds ? (isDeposit ? "+ " : "− ") : ""}
              {formatBRL(tx.netAmountCents ?? tx.grossAmountCents)}
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-3 mt-0.5">
            <span className="text-[11px] text-muted-foreground font-mono">{tx.number}</span>
            <div className="flex items-center gap-2">
              <StatusBadge
                variant={STATUS_VARIANT[tx.status] ?? "default"}
                className="h-5 text-[10px] px-1.5"
              >
                {tx.statusLabel}
              </StatusBadge>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatDateRel(tx.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
