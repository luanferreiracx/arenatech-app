"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Copy, RefreshCw, Wallet } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default function DepixWalletPage() {
  const trpc = useTRPC();
  const overviewQuery = useQuery({
    ...trpc.depixTransaction.getOverview.queryOptions(),
    refetchInterval: 15000,
  });
  const txQuery = useQuery({
    ...trpc.depixTransaction.list.queryOptions({ page: 0, pageSize: 20 }),
    refetchInterval: 10000,
  });

  if (overviewQuery.isLoading) return <LoadingState />;
  const o = overviewQuery.data;

  return (
    <div>
      <PageHeader
        title="DePix Wallet"
        subtitle="Carteira Liquid propria — depositos e saques com rateio de taxa automatico"
      />

      {/* Alerta L-BTC baixo (taxa de rede). Sem L-BTC, saques falham. */}
      {o?.balance.success && o.balance.lbtcSat < 1000 && o?.wallet.provisioned && o.wallet.masterAddress && (
        <Card className="p-4 mb-4 border-amber-500/40 bg-amber-500/5">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            ⚠ Saldo L-BTC baixo ({o.balance.lbtcSat} sat)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            L-BTC (Liquid Bitcoin) eh necessario pra pagar a taxa de rede em saques.
            Sem saldo suficiente, saques vao falhar. Envie ~5.000 sat (centavos
            de R$) pra esse mesmo endereco da carteira:
          </p>
          {o.wallet.masterAddress && (
            <p className="font-mono text-xs break-all mt-2 p-2 bg-muted/30 rounded">
              {o.wallet.masterAddress}
            </p>
          )}
        </Card>
      )}

      {/* Hero */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Saldo DePix</p>
            </div>
            <p className="text-3xl font-bold">
              {o?.balance.success
                ? formatBRL(o.balance.depix)
                : "—"}
            </p>
            {!o?.balance.success && o?.balance.error && (
              <p className="text-xs text-destructive mt-1">{o.balance.error}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/depix-wallet/receive">
                <ArrowDownLeft className="mr-2 h-4 w-4" />
                Receber
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/depix-wallet/withdraw">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Sacar
              </Link>
            </Button>
          </div>
        </div>

        {o?.wallet.provisioned && o.wallet.masterAddress && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Endereco de recebimento (Liquid)
            </p>
            <div className="flex items-start gap-2 p-2 bg-muted/30 rounded border border-border">
              <p className="font-mono text-xs break-all flex-1 select-all">{o.wallet.masterAddress}</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(o.wallet.masterAddress!);
                  toast.success("Endereco copiado!");
                }}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
              >
                <Copy className="w-3 h-3" /> Copiar
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Transactions */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Transacoes recentes</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void txQuery.refetch()}
            disabled={txQuery.isFetching}
          >
            <RefreshCw className={txQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>

        {txQuery.isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando…</div>
        ) : (txQuery.data?.data ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma transacao ainda. Comece <Link href="/depix-wallet/receive" className="text-primary hover:underline">recebendo um DePix</Link>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Numero</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Valor</th>
                  <th className="text-right p-3">Liquido</th>
                  <th className="text-left p-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {(txQuery.data?.data ?? []).map((t) => (
                  <tr key={t.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <Link href={`/depix-wallet/transactions/${t.id}`} className="text-primary hover:underline font-mono text-xs">
                        {t.number}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1">
                        {t.kind === "DEPOSIT" ? (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                        )}
                        {t.kind === "DEPOSIT" ? "Deposito" : "Saque"}
                      </span>
                    </td>
                    <td className="p-3">
                      <StatusBadge variant={STATUS_VARIANT[t.status] ?? "default"}>
                        {t.statusLabel}
                      </StatusBadge>
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatBRL(t.grossAmountCents / 100)}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {t.netAmountCents != null ? formatBRL(t.netAmountCents / 100) : "—"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
