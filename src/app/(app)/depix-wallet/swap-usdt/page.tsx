"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Loader2, RefreshCw, ShieldCheck, ArrowRightLeft } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SATS_PER_UNIT = 100_000_000;
const MIN_CENTS = 100; // R$ 1,00 em DePix

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatUsdt(sats: number): string {
  return (sats / SATS_PER_UNIT).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

type PreviewData = {
  soldDepixSats: number;
  grossUsdtSats: number;
  netUsdtSats: number;
  serverFeeSats: number;
  fixedFeeSats: number;
  priceDepixPerUsdt: number;
};

export default function DepixSwapUsdtPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [walletPassphrase, setWalletPassphrase] = useState("");

  const overviewQuery = useQuery(trpc.depixTransaction.getOverview.queryOptions());
  const walletInfoQuery = useQuery(trpc.depixWallet.getWalletInfo.queryOptions());
  const twoFactorStatusQuery = useQuery(trpc.twoFactor.getStatus.queryOptions());
  const isNonCustodial = walletInfoQuery.data?.custodyModel === "non_custodial";
  const twoFactorEnabled = twoFactorStatusQuery.data?.enabled === true;

  const previewMutation = useMutation(
    trpc.depixSwap.preview.mutationOptions({
      onSuccess: (data) => setPreview(data),
      onError: (err) => { setPreview(null); toast.error(err.message); },
    }),
  );

  const executeMutation = useMutation(
    trpc.depixSwap.execute.mutationOptions({
      onSuccess: (res) => {
        toast.success(`Conversão realizada! Você recebeu ${formatUsdt(res.grossUsdtSats)} L-USDt.`);
        void queryClient.invalidateQueries({ queryKey: [["depixTransaction"]] });
        setConfirmOpen(false);
        setPreview(null);
        setAmount(0);
        setTwoFactorCode("");
        setWalletPassphrase("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const balance = overviewQuery.data?.balance.depix ?? 0;
  const balanceCents = Math.round(balance * 100);
  const amountValid = amount >= MIN_CENTS && amount <= balanceCents;

  const handlePreview = () => {
    setPreview(null);
    previewMutation.mutate({ amountReais: amount / 100 });
  };

  const handleExecute = () => {
    // Guard-rail: teto = preço do preview + 0,5% de tolerância (evita executar se
    // o mercado piorar entre cotar e confirmar).
    const maxPrice = preview ? preview.priceDepixPerUsdt * 1.005 : undefined;
    executeMutation.mutate({
      amountReais: amount / 100,
      walletPassphrase,
      twoFactorCode: twoFactorCode.trim(),
      maxPriceDepixPerUsdt: maxPrice,
    });
  };

  if (overviewQuery.isLoading || walletInfoQuery.isLoading) return <LoadingState />;

  const backHeader = (title: string) => (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="icon">
        <Link href="/depix-wallet" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <span>{title}</span>
    </div>
  );

  // Só carteira non-custodial pode converter (assinatura exige a passphrase).
  if (walletInfoQuery.data && !isNonCustodial) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <PageHeader title={backHeader("Converter para USDT")} subtitle="Disponível apenas para carteira non-custodial." />
        <Card className="max-w-xl mx-auto p-6 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-muted-foreground">
            A conversão para USDT exige uma carteira non-custodial (com senha própria). Configure a
            carteira non-custodial na DePix Wallet para usar este recurso.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={backHeader("Converter DePix em USDT")}
        subtitle="Converte seu saldo DePix em L-USDt (dólar) na sua carteira Liquid, via Sideswap."
      />

      <div className="max-w-xl mx-auto space-y-5">
        <Card className="p-5 sm:p-6 space-y-5">
          <div>
            <Label className="text-sm font-medium">Quanto de DePix converter</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Min R$ 1,00 · Saldo {formatBRL(balanceCents)}
            </p>
            <MoneyInput
              value={amount}
              onChange={(v) => { setAmount(v); setPreview(null); }}
              placeholder="R$ 0,00"
              className="!text-3xl !h-16 !font-mono tabular-nums"
            />
            {amount >= MIN_CENTS && amount > balanceCents && (
              <p className="text-xs text-destructive mt-1.5">Saldo insuficiente.</p>
            )}
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handlePreview}
            disabled={!amountValid || previewMutation.isPending}
          >
            {previewMutation.isPending
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cotando…</>
              : <><RefreshCw className="mr-2 h-4 w-4" /> Cotar conversão</>}
          </Button>
        </Card>

        {preview && (
          <Card className="p-5 sm:p-6 space-y-3 border-primary/30">
            <p className="text-xs font-medium inline-flex items-center gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
              Cotação
            </p>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Você recebe</span>
              <span className="text-2xl font-bold tabular-nums">{formatUsdt(preview.netUsdtSats)} <span className="text-sm font-normal text-muted-foreground">L-USDt</span></span>
            </div>
            <dl className="space-y-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Converte</dt><dd className="tabular-nums">{formatBRL(amount)} em DePix</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Preço</dt><dd className="tabular-nums">{preview.priceDepixPerUsdt.toFixed(4)} DePix/USDt</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Taxa de swap</dt><dd className="tabular-nums">{formatUsdt(preview.serverFeeSats)} L-USDt</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Taxa de rede</dt><dd className="tabular-nums">{formatUsdt(preview.fixedFeeSats)} L-USDt</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">
              A cotação varia com o mercado. O USDT fica na sua carteira Liquid.
            </p>
            <Button className="w-full" onClick={() => setConfirmOpen(true)} disabled={executeMutation.isPending}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Converter agora
            </Button>
          </Card>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) { setTwoFactorCode(""); setWalletPassphrase(""); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar conversão</DialogTitle>
            <DialogDescription>
              Converter {formatBRL(amount)} em DePix por aproximadamente{" "}
              <span className="font-medium text-foreground">{preview ? formatUsdt(preview.netUsdtSats) : "—"} L-USDt</span>.
              A operação é on-chain e não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          {twoFactorEnabled ? (
            <div className="space-y-2">
              <Label htmlFor="twoFactorCode" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Código de autenticação (2FA)
              </Label>
              <Input
                id="twoFactorCode"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="font-mono tracking-[0.3em] text-center text-lg"
              />
              <p className="text-xs text-muted-foreground">
                Digite o código do seu app autenticador (ou um backup code).
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm">
                A conversão exige autenticação de dois fatores (2FA). Habilite em{" "}
                <Link href="/settings/security" className="text-primary underline">
                  Configurações &gt; Segurança
                </Link>{" "}
                antes de converter.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="walletPassphrase" className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-primary" />
              Senha da carteira
            </Label>
            <Input
              id="walletPassphrase"
              type="password"
              value={walletPassphrase}
              onChange={(e) => setWalletPassphrase(e.target.value)}
              placeholder="Sua senha da carteira"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Só você conhece esta senha. Ela libera a assinatura e não fica guardada no sistema.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={executeMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleExecute}
              disabled={
                executeMutation.isPending ||
                !twoFactorEnabled ||
                twoFactorCode.trim().length === 0 ||
                walletPassphrase.length === 0
              }
            >
              {executeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar conversão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
