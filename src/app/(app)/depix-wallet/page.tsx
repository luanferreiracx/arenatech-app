"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { BalanceHero } from "./_components/balance-hero";
import { RecentTransactions } from "./_components/recent-transactions";

/**
 * /depix-wallet — Overview da carteira DePix do tenant.
 *
 * Hierarquia visual (de cima pra baixo):
 *   1. Header — titulo + subtitulo
 *   2. Alerta L-BTC baixo (so quando saldo L-BTC < 1000 sat)
 *   3. Hero — saldo + acoes (Receber/Sacar) + endereco de recebimento
 *   4. Atividade recente (8 ultimas tx)
 */
export default function DepixWalletPage() {
  const trpc = useTRPC();
  const overviewQuery = useQuery({
    ...trpc.depixTransaction.getOverview.queryOptions(),
    refetchInterval: 15000,
  });

  if (overviewQuery.isLoading) return <LoadingState />;
  const o = overviewQuery.data;

  const lbtcLow =
    !!o?.balance.success &&
    o.balance.lbtcSat < 1000 &&
    o?.wallet.provisioned;

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="DePix Wallet"
        subtitle="Carteira Liquid propria — depositos e saques com rateio de taxa automatico"
      />

      {/* Alerta L-BTC baixo (taxa de rede). Sem L-BTC, saques falham. */}
      {lbtcLow && o?.wallet.masterAddress && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/[0.04] animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-amber-500/10 grid place-items-center shrink-0">
              <span className="text-amber-500 text-lg leading-none">⚠</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Saldo L-BTC baixo
                <span className="ml-2 text-[11px] text-muted-foreground font-normal tabular-nums">
                  ({o.balance.lbtcSat} sat)
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                O L-BTC eh necessario pra pagar a taxa de rede em cada saque.
                Envie aproximadamente <span className="font-semibold">5.000 sat</span> pro mesmo
                endereco da carteira:
              </p>
              <p className="font-mono text-[11px] break-all mt-2 p-2.5 bg-muted/40 rounded-md select-all">
                {o.wallet.masterAddress}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Hero do saldo */}
      <BalanceHero
        depixBalance={o?.balance.depix ?? 0}
        lbtcSat={o?.balance.lbtcSat ?? 0}
        masterAddress={o?.wallet.masterAddress ?? null}
        network={o?.wallet.network ?? null}
        success={o?.balance.success ?? false}
        error={o?.balance.error ?? null}
      />

      {/* Atividade recente */}
      <RecentTransactions />
    </div>
  );
}
