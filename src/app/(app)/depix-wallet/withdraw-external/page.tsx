"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Loader2, ShieldAlert, Wallet } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
import {
  PIX_KEY_PLACEHOLDER,
  extractTaxIdFromKey,
  isPixKeyValid,
  maskByPixType,
  type PixKeyType,
} from "@/lib/utils/pix-detect";
import { isValidTaxId } from "@/lib/utils/tax-id";
import { PixKeyTypeTabs } from "../_components/pix-key-type-tabs";
import { RecipientPicker } from "../_components/recipient-picker";
import { AmountQuickPicks } from "../_components/amount-quick-picks";
import { FeeBreakdown } from "../_components/fee-breakdown";

function maskTaxIdLive(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/**
 * Saque no modo CARTEIRA EXTERNA (Fase B, por intermediacao). O tenant informa o
 * destinatario PIX + valor; ao confirmar (2FA), geramos a INTENCAO e mostramos um
 * endereco pra ele enviar o DePix da propria carteira. O DePix passa pela nossa
 * carteira de intermediacao (a taxa fica retida) e o restante segue pra Eulen.
 */
export default function DepixWithdrawExternalPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("CPF");
  const [pixKey, setPixKey] = useState("");
  const [recipientTaxId, setRecipientTaxId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [netAmount, setNetAmount] = useState(0);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const walletInfoQuery = useQuery(trpc.depixWallet.getWalletInfo.queryOptions());
  const twoFactorStatusQuery = useQuery(trpc.twoFactor.getStatus.queryOptions());
  const twoFactorEnabled = twoFactorStatusQuery.data?.enabled === true;

  const previewQuery = useQuery({
    ...trpc.depixTransaction.previewFee.queryOptions({ kind: "WITHDRAW", amountCents: netAmount }),
    enabled: netAmount >= DEPIX_LIMITS.MIN_CENTS,
  });

  const createMutation = useMutation(
    trpc.depixTransaction.createExternalWithdraw.mutationOptions({
      onSuccess: (tx) => {
        toast.success("Saque iniciado. Envie o DePix para concluir.");
        void queryClient.invalidateQueries({ queryKey: [["depixTransaction"]] });
        router.push(`/depix-wallet/transactions/${tx.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const pixKeyValid = isPixKeyValid(pixKeyType, pixKey);
  const taxIdValid = isValidTaxId(recipientTaxId);
  const recipientNameValid = recipientName.trim().length >= 2;
  const amountValid = netAmount >= DEPIX_LIMITS.MIN_CENTS && netAmount <= DEPIX_LIMITS.MAX_CENTS;
  const twoFactorFilled = twoFactorCode.trim().length >= 6;
  const canSubmit =
    pixKeyValid && taxIdValid && recipientNameValid && amountValid && twoFactorEnabled && twoFactorFilled;

  function handlePixKeyChange(raw: string) {
    const masked = maskByPixType(pixKeyType, raw);
    setPixKey(masked);
    const auto = extractTaxIdFromKey(pixKeyType, masked);
    if (auto && !recipientTaxId) setRecipientTaxId(auto);
  }
  function handleTypeChange(type: PixKeyType) {
    setPixKeyType(type);
    setPixKey("");
    setRecipientTaxId("");
  }
  function handleRecipientPick(r: {
    pixKey: string;
    pixKeyType: string;
    recipientName: string | null;
    recipientTaxId: string | null;
  }) {
    const type = r.pixKeyType as PixKeyType;
    setPixKeyType(type);
    setPixKey(maskByPixType(type, r.pixKey));
    setRecipientName(r.recipientName ?? "");
    setRecipientTaxId(r.recipientTaxId ?? "");
    toast.success(`Destinatario carregado: ${r.recipientName ?? "(sem nome)"}`);
  }

  const backButton = (
    <Button asChild variant="ghost" size="icon">
      <Link href="/depix-wallet" aria-label="Voltar">
        <ArrowLeft className="h-4 w-4" />
      </Link>
    </Button>
  );

  if (walletInfoQuery.isLoading) return <LoadingState />;

  // Guarda de perfil: so admin do tenant inicia saque.
  if (walletInfoQuery.data?.canWithdraw === false) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <PageHeader
          title={<div className="flex items-center gap-2">{backButton}<span>Sacar</span></div>}
          subtitle="Saque disponivel apenas para o perfil admin do tenant."
        />
        <Card className="mx-auto max-w-xl border-amber-500/30 bg-amber-500/5 p-6">
          <p className="text-sm text-muted-foreground">
            Seu perfil pode consultar a carteira, mas nao pode iniciar saques. Solicite a
            um usuario admin do tenant.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={<div className="flex items-center gap-2">{backButton}<span>Sacar da carteira externa</span></div>}
        subtitle="Você envia o DePix da sua carteira; a gente repassa e paga o PIX ao destinatário."
      />

      <div className="mx-auto max-w-xl space-y-5">
        {/* Como funciona — transparencia sobre a intermediacao (custodia breve). */}
        <Card className="border-primary/20 bg-primary/[0.04] p-4">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="min-w-0 text-sm text-muted-foreground">
              Ao confirmar, mostramos um endereço para você enviar o DePix. Ele passa pela
              carteira da Arena, que retém a taxa e repassa o restante à Eulen para concluir
              o PIX. Se algo falhar, o valor é devolvido à sua carteira.
            </p>
          </div>
        </Card>

        <Card className="space-y-5 p-5 sm:p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium">Destinatário</Label>
              <RecipientPicker onPick={handleRecipientPick} />
            </div>
            <PixKeyTypeTabs value={pixKeyType} onChange={handleTypeChange} />
            <div>
              <Label htmlFor="pixKey" className="sr-only">Chave PIX</Label>
              <Input
                id="pixKey"
                value={pixKey}
                onChange={(e) => handlePixKeyChange(e.target.value)}
                placeholder={PIX_KEY_PLACEHOLDER[pixKeyType]}
                autoComplete="off"
                className="font-mono"
              />
              {pixKey.length > 0 && !pixKeyValid && (
                <p className="mt-1.5 text-xs text-destructive">Chave PIX inválida para o tipo selecionado.</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="recipientTaxId">CPF/CNPJ do destinatário</Label>
                <Input
                  id="recipientTaxId"
                  value={maskTaxIdLive(recipientTaxId)}
                  onChange={(e) => setRecipientTaxId(e.target.value)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  autoComplete="off"
                />
                {recipientTaxId.length > 0 && !taxIdValid && (
                  <p className="mt-1.5 text-xs text-destructive">CPF/CNPJ inválido.</p>
                )}
              </div>
              <div>
                <Label htmlFor="recipientName">Nome do destinatário</Label>
                <Input
                  id="recipientName"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value.slice(0, 200))}
                  placeholder="Nome do titular da chave"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <Label className="text-sm font-medium">Quanto o destinatário recebe?</Label>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              Min R$ 10,00 · Max R$ 5.000,00 · via PIX
            </p>
            <MoneyInput
              value={netAmount}
              onChange={setNetAmount}
              placeholder="R$ 0,00"
              className="!h-16 !font-mono !text-3xl tabular-nums"
            />
            <div className="mt-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Atalhos
              </p>
              <AmountQuickPicks value={netAmount} onChange={setNetAmount} />
            </div>
            {netAmount >= DEPIX_LIMITS.MIN_CENTS && previewQuery.data && (
              <div className="mt-4">
                <FeeBreakdown
                  kind="WITHDRAW"
                  netCents={netAmount}
                  feeArenaCents={previewQuery.data.feeArenaTechCents}
                  feeProviderCents={previewQuery.data.feePixPayEstimatedCents}
                />
              </div>
            )}
          </div>

          <div className="border-t border-border pt-5">
            <Label htmlFor="twoFactorCode">Código 2FA</Label>
            {!twoFactorEnabled ? (
              <div className="mt-2 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="min-w-0 text-sm text-muted-foreground">
                  O saque exige 2FA. Habilite em{" "}
                  <Link href="/settings/security" className="text-primary hover:underline">
                    Configurações › Segurança
                  </Link>{" "}
                  antes de sacar.
                </p>
              </div>
            ) : (
              <>
                <Input
                  id="twoFactorCode"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="mt-1 font-mono tabular-nums"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Código do app autenticador (ou um código de backup).
                </p>
              </>
            )}
          </div>
        </Card>

        <div className="flex justify-between gap-2">
          <Button asChild variant="outline">
            <Link href="/depix-wallet">Cancelar</Link>
          </Button>
          <Button
            onClick={() =>
              createMutation.mutate({
                pixKeyType,
                pixKey,
                recipientName: recipientName.trim(),
                recipientTaxId,
                netAmountCents: netAmount,
                idempotencyKey,
                twoFactorCode: twoFactorCode.trim(),
              })
            }
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando…
              </>
            ) : (
              <>
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Continuar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
