"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Wallet } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BalanceHero } from "./_components/balance-hero";
import { StaticQrCard } from "./_components/static-qr-card";
import { RecentTransactions } from "./_components/recent-transactions";
import { RecoveryPhraseCard } from "./_components/recovery-phrase-card";
import { WalletManagementCard } from "./_components/wallet-management-card";
import { ByowWalletsCard } from "./_components/byow-wallets-card";
import { WalletSetupGate } from "./_components/wallet-setup-gate";

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

  // ADR 0051: carteira nasce non-custodial no 1o acesso. Sem provisionamento,
  // a overview vira um CTA de configuracao (criar/importar).
  if (walletInfo?.provisioned === false) {
    return (
      <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
        <PageHeader
          title="DePix Wallet"
          subtitle="Carteira Liquid propria — depositos e saques com rateio de taxa automatico"
        />
        <WalletSetupGate canConfigure={walletInfo.canRevealMnemonic === true} />
      </div>
    );
  }

  // Modo carteira EXTERNAL: o tenant administra a propria carteira. A Arena nao
  // custodia saldo — sem hero de saldo, sem frase de recuperacao, sem saque
  // gerenciado. O recebimento cai direto num endereco da lista de carteiras.
  if (walletInfo?.custodyModel === "external") {
    return (
      <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
        <PageHeader
          title="DePix Wallet"
          subtitle="Carteira externa — voce administra a propria carteira; a Arena nao custodia seus fundos"
        />

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Voce administra a propria carteira</h3>
              <p className="text-sm text-muted-foreground">
                O DePix que voce receber cai direto na sua carteira Liquid — a Arena
                nao guarda seu saldo. Cadastre e gerencie abaixo os enderecos de
                recebimento. O saque para carteira externa estara disponivel em breve.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Button asChild size="sm">
              <Link href="/depix-wallet/receive">
                <ArrowDownToLine className="mr-1 h-4 w-4" />
                Receber DePix
              </Link>
            </Button>
          </div>
        </Card>

        {/* Enderecos de recebimento (allowlist BYOW) — cadastro com 2FA+email+WhatsApp. */}
        <ByowWalletsCard canManage={walletInfo?.canWithdraw === true} />

        {/* Atividade recente */}
        <RecentTransactions />
      </div>
    );
  }

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

      {/* QR PIX estatico — exclusivo da Arena Tech (master). Vendas rapidas no
          balcao; recebimento conferido manualmente. */}
      {o?.isCentralTenant && <StaticQrCard />}

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

      {/* Allowlist de carteiras próprias (BYOW) que a API pode usar. */}
      <ByowWalletsCard canManage={walletInfo?.canWithdraw === true} />

      {/* Atividade recente */}
      <RecentTransactions />
    </div>
  );
}
