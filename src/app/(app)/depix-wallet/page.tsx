"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { BalanceHero } from "./_components/balance-hero";
import { RecentTransactions } from "./_components/recent-transactions";
import { RecoveryPhraseCard } from "./_components/recovery-phrase-card";
import { WalletManagementCard } from "./_components/wallet-management-card";

/**
 * /depix-wallet — Overview da carteira DePix do tenant.
 *
 * Hierarquia visual (de cima pra baixo):
 *   1. Header — titulo + subtitulo
 *   2. Hero — saldo + acoes (Receber/Sacar) + endereco de recebimento
 *   3. Atividade recente (8 ultimas tx)
 *
 * L-BTC (taxa de rede Liquid) eh gerenciado pela Arena Tech central —
 * usuario final nao precisa saber. Reabastecimento automatico apos cada
 * saque + painel /admin/depix-lbtc pro tenant central.
 */
export default function DepixWalletPage() {
  const trpc = useTRPC();
  const overviewQuery = useQuery({
    ...trpc.depixTransaction.getOverview.queryOptions(),
    refetchInterval: 15000,
  });
  const walletInfoQuery = useQuery(trpc.depixWallet.getWalletInfo.queryOptions());

  if (overviewQuery.isLoading || walletInfoQuery.isLoading) return <LoadingState />;
  const o = overviewQuery.data;
  const walletInfo = walletInfoQuery.data;

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="DePix Wallet"
        subtitle="Carteira Liquid propria — depositos e saques com rateio de taxa automatico"
      />

      {/* Hero do saldo */}
      <BalanceHero
        depixBalance={o?.balance.depix ?? 0}
        masterAddress={o?.wallet.masterAddress ?? null}
        network={o?.wallet.network ?? null}
        success={o?.balance.success ?? false}
        error={o?.balance.error ?? null}
        canWithdraw={walletInfo?.canWithdraw === true}
      />

      {/* Gerenciamento da carteira non-custodial (ADR 0051): trocar senha,
          recuperar. So aparece p/ admin com carteira non_custodial provisionada. */}
      <WalletManagementCard
        provisioned={walletInfo?.provisioned === true}
        custodyModel={walletInfo?.custodyModel ?? "custodial"}
        canManage={walletInfo?.canRevealMnemonic === true}
      />

      <RecoveryPhraseCard
        provisioned={walletInfo?.provisioned === true}
        canRevealMnemonic={walletInfo?.canRevealMnemonic === true}
        custodyModel={walletInfo?.custodyModel ?? "custodial"}
      />

      {/* Atividade recente */}
      <RecentTransactions />
    </div>
  );
}
