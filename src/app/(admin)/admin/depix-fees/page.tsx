"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeeConfigEditor } from "./_components/fee-config-editor";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DepixFeesAdminPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState<string | null>(null);

  const statusQuery = useQuery({
    ...trpc.depixFeeWalletAdmin.status.queryOptions(),
    refetchInterval: 30_000,
  });
  const repaymentsQuery = useQuery({
    ...trpc.depixFeeWalletAdmin.listRepayments.queryOptions({ limit: 50 }),
    refetchInterval: 30_000,
  });
  const txQuery = useQuery({
    ...trpc.depixFeeWalletAdmin.transactions.queryOptions(),
    refetchInterval: 30_000,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: [["depixFeeWalletAdmin"]] });
  }

  const provisionMutation = useMutation(
    trpc.depixFeeWalletAdmin.provision.mutationOptions({
      onSuccess: (res) => {
        if (res.success) {
          toast.success(
            res.alreadyProvisioned ? "Carteira de taxas já provisionada" : "Carteira de taxas provisionada!",
          );
        } else {
          toast.error(`Falha: ${res.error ?? "erro"}`);
        }
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const retryMutation = useMutation(
    trpc.depixFeeWalletAdmin.retryRepaymentManual.mutationOptions({
      onSuccess: (res) => {
        if (res.status === "completed") toast.success("Repasse concluído");
        else if (res.status === "pending") toast.error(`Ainda falha: ${res.reason ?? ""}`);
        else toast.info(`Pulado: ${res.reason ?? ""}`);
        invalidate();
        setRetrying(null);
      },
      onError: (err) => {
        toast.error(err.message);
        setRetrying(null);
      },
    }),
  );

  if (statusQuery.isLoading) return <LoadingState />;
  const status = statusQuery.data;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        title="Carteira de Taxas (DePix)"
        subtitle="Carteira custodial que recebe depósitos de tenants non-custodial, retém a taxa Arena Tech e repassa o líquido."
      />

      {/* Status da carteira */}
      <Card className="p-5 sm:p-6">
        {status?.provisioned ? (
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Taxas acumuladas (saldo DePix)</p>
              <p className="text-2xl font-mono tabular-nums font-semibold mt-0.5">
                {status.balanceError ? "—" : formatBRL(Math.round((status.depixBalance ?? 0) * 100))}
              </p>
              {status.balanceError && (
                <p className="text-xs text-rose-500 mt-1 inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {status.balanceError}
                </p>
              )}
              {status.masterAddress && (
                <p className="text-[11px] text-muted-foreground font-mono break-all mt-1">
                  {status.masterAddress}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void statusQuery.refetch()}
              disabled={statusQuery.isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", statusQuery.isFetching && "animate-spin")} />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="h-11 w-11 rounded-full bg-amber-500/10 text-amber-500 grid place-items-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">Carteira de taxas não provisionada</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Depósitos de tenants non-custodial ficam bloqueados até a carteira existir. O serviço LWK precisa estar no ar.
              </p>
            </div>
            <Button onClick={() => provisionMutation.mutate()} disabled={provisionMutation.isPending}>
              <Sparkles className="h-4 w-4 mr-2" />
              {provisionMutation.isPending ? "Provisionando…" : "Provisionar carteira"}
            </Button>
          </div>
        )}
      </Card>

      {/* Editor de taxas por tenant */}
      <FeeConfigEditor />

      {/* Extrato on-chain */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Extrato (on-chain)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Taxas recebidas (entradas) e envios/recargas de L-BTC (saídas) — últimas 50 transações.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void txQuery.refetch()}
            disabled={txQuery.isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", txQuery.isFetching && "animate-spin")} />
          </Button>
        </div>
        {txQuery.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
        ) : (txQuery.data?.transactions ?? []).length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Nenhuma movimentação ainda
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(txQuery.data?.transactions ?? []).map((t) => {
              const isFeeIn = t.depixDeltaCents > 0;
              const isDepixOut = t.depixDeltaCents < 0;
              const label = isFeeIn
                ? "Taxa recebida"
                : isDepixOut
                  ? "Envio DePix"
                  : "Recarga L-BTC";
              return (
                <li key={t.txid} className="flex items-center justify-between gap-3 p-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{label}</p>
                    <p className="text-muted-foreground">
                      {t.timestamp
                        ? new Date(t.timestamp * 1000).toLocaleString("pt-BR")
                        : "—"}
                      {" · "}
                      <a
                        href={t.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-mono"
                      >
                        {t.txid.slice(0, 10)}…
                      </a>
                      {t.confirmations < 2 && " · pendente"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {t.depixDeltaCents !== 0 && (
                      <p
                        className={cn(
                          "font-mono tabular-nums",
                          isFeeIn ? "text-emerald-500" : "text-rose-500",
                        )}
                      >
                        {isFeeIn ? "+" : "−"}
                        {formatBRL(Math.abs(t.depixDeltaCents))}
                      </p>
                    )}
                    {t.lbtcDeltaSats !== 0 && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {t.lbtcDeltaSats > 0 ? "+" : "−"}
                        {Math.abs(t.lbtcDeltaSats)} sat L-BTC
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Repasses */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold">Repasses recentes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Líquido repassado da carteira de taxas para os tenants (últimos 50).
          </p>
        </div>
        {repaymentsQuery.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
        ) : (repaymentsQuery.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Nenhum repasse ainda</div>
        ) : (
          <ul className="divide-y divide-border">
            {(repaymentsQuery.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{r.tenantName}</p>
                  <p className="text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("pt-BR")}
                    {r.attempts > 0 && ` · ${r.attempts} tentativa(s)`}
                    {r.lastError && ` · ${r.lastError}`}
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-3">
                  <div>
                    <p className="font-mono tabular-nums">{formatBRL(r.netAmountCents)}</p>
                    <p
                      className={cn(
                        "text-[10px] uppercase tracking-wider",
                        r.status === "COMPLETED" && "text-emerald-500",
                        r.status === "FAILED" && "text-rose-500",
                        r.status === "PENDING" && "text-amber-500",
                      )}
                    >
                      {r.status}
                    </p>
                  </div>
                  {r.status !== "COMPLETED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={retryMutation.isPending && retrying === r.id}
                      onClick={() => {
                        setRetrying(r.id);
                        retryMutation.mutate({ repaymentId: r.id });
                      }}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reprocessar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
