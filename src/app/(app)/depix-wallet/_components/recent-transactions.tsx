"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Sparkles } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import { cn } from "@/lib/utils";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateRel(d: Date | string): string {
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "destructive" | "info"> = {
  PENDING: "warning",
  PROCESSING: "info",
  PROCESSING_FEE: "info",
  COMPLETED: "success",
  COMPLETED_FEE_PENDING: "warning",
  FAILED: "destructive",
  CANCELLED: "default",
  EXPIRED: "default",
};

/**
 * Card "Atividade recente" — lista compacta de transacoes pro overview.
 * Cada item: icone de tipo, descricao (numero + destinatario), valor liquido,
 * status badge, tempo relativo. Click leva pro detalhe. Empty state amigavel.
 */
export function RecentTransactions() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.depixTransaction.list.queryOptions({ page: 0, pageSize: 8 }),
    refetchInterval: 15000,
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold">Atividade recente</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ultimas operacoes da sua carteira
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Atualizar"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")} />
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-8">
            <Link href="/depix-wallet?view=all">Ver tudo</Link>
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="p-8 text-center text-xs text-muted-foreground">
          Carregando…
        </div>
      ) : (query.data?.data ?? []).length === 0 ? (
        <div className="p-10 sm:p-14 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium mb-1">Nada por aqui ainda</p>
          <p className="text-xs text-muted-foreground mb-4">
            Faca seu primeiro deposito pra ver as transacoes aparecerem.
          </p>
          <Button asChild size="sm">
            <Link href="/depix-wallet/receive">Receber DePix</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {(query.data?.data ?? []).map((t) => {
            const isDeposit = t.kind === "DEPOSIT";
            const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight;
            return (
              <li key={t.id}>
                <Link
                  href={`/depix-wallet/transactions/${t.id}`}
                  className="flex items-center gap-3 p-3.5 sm:p-4 hover:bg-muted/40 transition-colors"
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full grid place-items-center shrink-0",
                      isDeposit
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
                        {!isDeposit && t.recipientName && (
                          <span className="text-muted-foreground font-normal">
                            {" "}para {t.recipientName}
                          </span>
                        )}
                      </p>
                      <p
                        className={cn(
                          "tabular-nums font-mono text-sm font-semibold shrink-0",
                          isDeposit ? "text-success" : "text-foreground",
                        )}
                      >
                        {isDeposit ? "+" : "−"}{" "}
                        {formatBRL(
                          (t.netAmountCents ?? t.grossAmountCents) as number,
                        )}
                      </p>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 mt-0.5">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {t.number}
                      </span>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          variant={STATUS_VARIANT[t.status] ?? "default"}
                          className="h-5 text-[10px] px-1.5"
                        >
                          {t.statusLabel}
                        </StatusBadge>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatDateRel(t.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
