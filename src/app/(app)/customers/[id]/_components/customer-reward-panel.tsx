"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Money } from "@/components/domain/money";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";
import { Star, Gift } from "lucide-react";

const MOVEMENT_LABELS: Record<string, string> = {
  credit: "Crédito",
  debit: "Uso",
  lock: "Reservado",
  unlock: "Liberado",
  expire: "Expirado",
};

/**
 * Saldo de fidelidade (cashback) do cliente + extrato dos últimos movimentos e as
 * recompensas disponíveis para uso. Read-only: creditar/usar acontece no fluxo de
 * aprovação (/fidelidade) e no PDV. Fatia 3 do épico de fidelidade.
 */
export function CustomerRewardPanel({ customerId }: { customerId: string }) {
  const trpc = useTRPC();
  const balanceQuery = useQuery(trpc.reward.getBalance.queryOptions({ customerId }));
  const rewardsQuery = useQuery(trpc.reward.getAvailableRewards.queryOptions({ customerId }));

  if (balanceQuery.isLoading) {
    return <Skeleton className="h-40 w-full rounded-lg" />;
  }

  const balance = balanceQuery.data;
  const rewards = rewardsQuery.data ?? [];
  const movements = balance?.movements ?? [];

  return (
    <div className="space-y-4">
      {/* Saldo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Star className="h-4 w-4 shrink-0" />
              <span className="truncate text-xs font-medium uppercase tracking-wide">
                Disponível
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-semibold text-success">
              <Money cents={balance?.availableBalance ?? 0} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reservado
            </p>
            <p className="mt-1.5 text-2xl font-semibold">
              <Money cents={balance?.lockedBalance ?? 0} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total acumulado
            </p>
            <p className="mt-1.5 text-2xl font-semibold">
              <Money cents={balance?.totalBalance ?? 0} />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recompensas disponíveis (aprovadas, não usadas) */}
      <Card>
        <CardContent className="pt-6">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Gift className="h-4 w-4" />
            Recompensas disponíveis ({rewards.length})
          </h4>
          {rewards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma recompensa disponível para uso.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rewards.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.campaignName ?? "Recompensa"}
                    </p>
                    {r.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        Expira em {new Date(r.expiresAt).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {r.rewardType === "DISCOUNT_PERCENTAGE"
                      ? `${r.percentage}%`
                      : <Money cents={r.value} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Extrato */}
      <Card>
        <CardContent className="pt-6">
          <h4 className="mb-3 text-sm font-semibold text-muted-foreground">
            Últimos movimentos
          </h4>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum movimento de fidelidade.</p>
          ) : (
            <ul className="divide-y divide-border">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge variant={m.type === "credit" ? "success" : "default"}>
                        {MOVEMENT_LABELS[m.type] ?? m.type}
                      </StatusBadge>
                      <span className="truncate text-sm">{m.description}</span>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">
                    <Money cents={m.amount} sign={m.type === "credit"} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
