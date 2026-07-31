"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TransactionRow } from "./transaction-row";

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
            <Link href="/depix-wallet/transactions">Ver tudo</Link>
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
          {(query.data?.data ?? []).map((t) => (
            <TransactionRow key={t.id} tx={t} />
          ))}
        </ul>
      )}
    </Card>
  );
}
