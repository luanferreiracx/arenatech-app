"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDateRel(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function DepixLbtcAdminPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [refilling, setRefilling] = useState<string | null>(null);

  const listQuery = useQuery({
    ...trpc.depixLbtcAdmin.list.queryOptions(),
    refetchInterval: 30_000,
  });

  const historyQuery = useQuery({
    ...trpc.depixLbtcAdmin.history.queryOptions({ limit: 20 }),
    refetchInterval: 30_000,
  });

  const refillMutation = useMutation(
    trpc.depixLbtcAdmin.refillManual.mutationOptions({
      onSuccess: (res, vars) => {
        if (res.skipped) {
          toast.info(`Pulado: ${res.reason ?? "ja ok"}`);
        } else if (res.status === "COMPLETED") {
          toast.success(`Recarga de ${res.amountSats} sat concluida`);
        } else {
          toast.error(`Recarga falhou: ${res.reason ?? "erro"}`);
        }
        void queryClient.invalidateQueries({ queryKey: [["depixLbtcAdmin"]] });
        setRefilling(null);
        void vars;
      },
      onError: (err) => {
        toast.error(err.message);
        setRefilling(null);
      },
    }),
  );

  if (listQuery.isLoading) return <LoadingState />;
  const data = listQuery.data;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        title="Gestao L-BTC (taxa de rede)"
        subtitle={`Reabastecimento automatico pos-saque · trigger < ${data?.lowThresholdSats ?? "—"} sat · recarga ${data?.refillAmountSats ?? "—"} sat`}
      />

      {/* Cards de tenants */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold">Tenants</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", listQuery.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {(data?.tenants ?? []).map((t) => {
            const isLow =
              t.lbtcSat != null && t.lbtcSat < (data?.lowThresholdSats ?? 1000);
            const isCentral = t.isCentral;
            return (
              <li key={t.tenantId} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
                <div
                  className={cn(
                    "h-9 w-9 rounded-full grid place-items-center shrink-0",
                    t.balanceError
                      ? "bg-rose-500/10 text-rose-500"
                      : isCentral
                        ? "bg-primary/10 text-primary"
                        : isLow
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-emerald-500/10 text-emerald-500",
                  )}
                >
                  {t.balanceError ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : isCentral ? (
                    <span className="text-[10px] font-bold tracking-wider">CENTRAL</span>
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium truncate">
                      {t.tenantName}
                      <span className="text-muted-foreground font-normal ml-2 text-xs">
                        {t.tenantSlug}
                      </span>
                    </p>
                    <p
                      className={cn(
                        "tabular-nums font-mono text-sm font-semibold shrink-0",
                        t.balanceError && "text-rose-500",
                        !t.balanceError && isLow && "text-amber-500",
                      )}
                    >
                      {t.balanceError ? "—" : `${t.lbtcSat?.toLocaleString("pt-BR")} sat`}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">
                      {t.balanceError
                        ? t.balanceError
                        : t.lastRefillAt
                          ? `Ultima recarga ${formatDateRel(t.lastRefillAt)} · ${t.lastRefillStatus}`
                          : "Sem recargas"}
                    </span>
                    {!isCentral && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={refillMutation.isPending && refilling === t.tenantId}
                        onClick={() => {
                          setRefilling(t.tenantId);
                          refillMutation.mutate({ tenantId: t.tenantId });
                        }}
                      >
                        <ArrowDownLeft className="h-3 w-3 mr-1" />
                        Recarregar
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {(data?.tenants ?? []).length === 0 && (
            <li className="p-8 text-center text-xs text-muted-foreground">
              Nenhum tenant com carteira provisionada
            </li>
          )}
        </ul>
      </Card>

      {/* Historico de recargas */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold">Historico recente</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ultimas 20 recargas (auto + manual)
          </p>
        </div>
        {historyQuery.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
        ) : (historyQuery.data ?? []).length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Sem recargas</div>
        ) : (
          <ul className="divide-y divide-border">
            {(historyQuery.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{r.tenantName}</p>
                  <p className="text-muted-foreground">
                    {r.source === "auto" ? "Automatica" : "Manual"} ·{" "}
                    {new Date(r.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono tabular-nums">{r.amountSats} sat</p>
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
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
