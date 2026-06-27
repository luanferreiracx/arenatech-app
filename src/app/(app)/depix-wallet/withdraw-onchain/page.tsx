"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Loader2, Send, ShieldCheck } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
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

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Validacao leve (espelha o validador do servidor — autoritativo e o LWK). */
function looksLikeLiquidAddress(addr: string): boolean {
  const a = addr.trim();
  if (a.length < 20 || a.length > 110) return false;
  if (/^(lq1|ex1)[0-9ac-hj-np-z]{20,108}$/i.test(a)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{26,108}$/.test(a) && /^[GHJPQVX]/.test(a)) return true;
  return false;
}

const MIN_CENTS = 100; // R$ 1,00

export default function DepixOnchainWithdrawPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState(0);
  // 2ª etapa: re-digitar endereco e valor (defesa contra erro/UI comprometida).
  const [confirmAddress, setConfirmAddress] = useState("");
  const [confirmAmount, setConfirmAmount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [walletPassphrase, setWalletPassphrase] = useState("");

  const overviewQuery = useQuery(trpc.depixTransaction.getOverview.queryOptions());
  const walletInfoQuery = useQuery(trpc.depixWallet.getWalletInfo.queryOptions());
  const twoFactorStatusQuery = useQuery(trpc.twoFactor.getStatus.queryOptions());
  const isNonCustodial = walletInfoQuery.data?.custodyModel === "non_custodial";
  const twoFactorEnabled = twoFactorStatusQuery.data?.enabled === true;

  const createMutation = useMutation(
    trpc.depixTransaction.createOnchainWithdraw.mutationOptions({
      onSuccess: (tx) => {
        toast.success("Envio on-chain transmitido!");
        void queryClient.invalidateQueries({ queryKey: [["depixTransaction"]] });
        router.push(`/depix-wallet/transactions/${tx.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const balance = overviewQuery.data?.balance.depix ?? 0;
  const balanceCents = Math.round(balance * 100);

  const addressValid = looksLikeLiquidAddress(toAddress);
  const amountValid = amount >= MIN_CENTS && amount <= balanceCents;
  const addressMatches = confirmAddress.trim() === toAddress.trim();
  const amountMatches = Math.round(confirmAmount) === Math.round(amount);
  const canReview = addressValid && amountValid && addressMatches && amountMatches;

  function handleSubmit() {
    createMutation.mutate({
      toAddress: toAddress.trim(),
      amountReais: amount / 100,
      confirmAddress: confirmAddress.trim(),
      confirmAmount: confirmAmount / 100,
      twoFactorCode: twoFactorCode.trim(),
      passphrase: isNonCustodial ? walletPassphrase : undefined,
    });
    setConfirmOpen(false);
    setTwoFactorCode("");
    setWalletPassphrase("");
  }

  if (overviewQuery.isLoading || walletInfoQuery.isLoading) return <LoadingState />;

  if (walletInfoQuery.data?.canWithdraw === false) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="icon">
                <Link href="/depix-wallet" aria-label="Voltar">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <span>Enviar on-chain</span>
            </div>
          }
          subtitle="Envio disponivel apenas para perfil admin do tenant."
        />
        <Card className="max-w-xl mx-auto p-6 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-muted-foreground">
            Seu perfil pode consultar a carteira, mas nao pode iniciar envios on-chain.
            Solicite a um usuario com perfil admin do tenant.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <Link href="/depix-wallet" aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span>Enviar DePix on-chain</span>
          </div>
        }
        subtitle="Envie DePix para um endereco Liquid externo (Sideswap, hardware wallet)."
      />

      <div className="max-w-xl mx-auto space-y-5">
        <Card className="p-5 sm:p-6 space-y-5">
          <div>
            <Label htmlFor="toAddress">Endereco Liquid de destino *</Label>
            <Input
              id="toAddress"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="lq1qq..."
              className={cn("font-mono text-sm", toAddress && !addressValid && "border-destructive")}
              autoComplete="off"
              spellCheck={false}
            />
            {toAddress && !addressValid && (
              <p className="text-xs text-destructive mt-1.5">
                Endereco Liquid invalido (use um endereco lq1.../ex1...).
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">Valor a enviar</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Min R$ 1,00 · Saldo {formatBRL(balanceCents)}
            </p>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              placeholder="R$ 0,00"
              className="!text-3xl !h-16 !font-mono tabular-nums"
            />
            {amount >= MIN_CENTS && amount > balanceCents && (
              <p className="text-xs text-destructive mt-1.5">Saldo insuficiente.</p>
            )}
          </div>
        </Card>

        {/* 2ª ETAPA: re-digitar endereco e valor. */}
        <Card className="p-5 sm:p-6 space-y-5 border-primary/30">
          <p className="text-xs font-medium inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Confirmacao (digite novamente)
          </p>
          <div>
            <Label htmlFor="confirmAddress">Repita o endereco de destino *</Label>
            <Input
              id="confirmAddress"
              value={confirmAddress}
              onChange={(e) => setConfirmAddress(e.target.value)}
              placeholder="lq1qq..."
              className={cn(
                "font-mono text-sm",
                confirmAddress && !addressMatches && "border-destructive",
              )}
              autoComplete="off"
              spellCheck={false}
              onPaste={(e) => e.preventDefault()}
            />
            {confirmAddress && !addressMatches && (
              <p className="text-xs text-destructive mt-1.5">
                O endereco nao confere com o de destino.
              </p>
            )}
          </div>
          <div>
            <Label className="text-sm font-medium">Repita o valor *</Label>
            <div className="mt-2">
              <MoneyInput
                value={confirmAmount}
                onChange={setConfirmAmount}
                placeholder="R$ 0,00"
                className={cn(
                  "!h-12 !font-mono tabular-nums",
                  confirmAmount > 0 && !amountMatches && "border-destructive",
                )}
              />
            </div>
            {confirmAmount > 0 && !amountMatches && (
              <p className="text-xs text-destructive mt-1.5">O valor nao confere.</p>
            )}
          </div>
        </Card>

        <Card className="p-3 bg-amber-500/[0.04] border-amber-500/30">
          <p className="text-xs text-amber-700 dark:text-amber-400 inline-flex items-center gap-2">
            <span className="text-base leading-none">⚠</span>
            Envio on-chain IRREVERSIVEL. Um endereco errado significa perda dos fundos.
            Confira com atencao.
          </p>
        </Card>

        <div className="flex justify-between gap-2">
          <Button asChild variant="outline">
            <Link href="/depix-wallet">Cancelar</Link>
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!canReview || createMutation.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            Revisar e enviar
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setTwoFactorCode("");
            setWalletPassphrase("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio on-chain</DialogTitle>
            <DialogDescription>
              Enviar {formatBRL(amount)} em DePix para{" "}
              <span className="font-mono text-foreground break-all">{toAddress}</span>. A
              operacao e on-chain e nao pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          {twoFactorEnabled ? (
            <div className="space-y-2">
              <Label htmlFor="twoFactorCode" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Codigo de autenticacao (2FA)
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
                Digite o codigo do seu app autenticador (ou um backup code).
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm">
                Envio exige autenticacao de dois fatores (2FA). Habilite o 2FA em{" "}
                <Link href="/settings/security" className="text-primary underline">
                  Configuracoes &gt; Seguranca
                </Link>{" "}
                antes de enviar.
              </p>
            </div>
          )}

          {isNonCustodial && (
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
                So voce conhece esta senha. Ela libera a assinatura do envio e nao fica
                guardada no sistema.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                createMutation.isPending ||
                !twoFactorEnabled ||
                twoFactorCode.trim().length === 0 ||
                (isNonCustodial && walletPassphrase.length === 0)
              }
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
