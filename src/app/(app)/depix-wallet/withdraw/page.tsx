"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
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
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
import {
  PIX_KEY_PLACEHOLDER,
  extractTaxIdFromKey,
  isPixKeyValid,
  maskByPixType,
  type PixKeyType,
} from "@/lib/utils/pix-detect";
import { isValidTaxId } from "@/lib/utils/tax-id";
import { formatCpf, formatCnpj } from "@/lib/utils";
import { WizardStepper } from "../_components/wizard-stepper";
import { PixKeyTypeTabs } from "../_components/pix-key-type-tabs";
import { RecipientPicker } from "../_components/recipient-picker";
import { AmountQuickPicks } from "../_components/amount-quick-picks";
import { FeeBreakdown } from "../_components/fee-breakdown";

const STEPS = [
  { id: 1, label: "Destinatario" },
  { id: 2, label: "Valor" },
  { id: 3, label: "Revisao" },
];

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

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

export default function DepixWithdrawPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState(1);
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("CPF");
  const [pixKey, setPixKey] = useState("");
  const [recipientTaxId, setRecipientTaxId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [netAmount, setNetAmount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const overviewQuery = useQuery(trpc.depixTransaction.getOverview.queryOptions());

  const previewQuery = useQuery({
    ...trpc.depixTransaction.previewFee.queryOptions({
      kind: "WITHDRAW",
      amountCents: netAmount,
    }),
    enabled: netAmount >= DEPIX_LIMITS.MIN_CENTS,
  });

  const createMutation = useMutation(
    trpc.depixTransaction.createWithdraw.mutationOptions({
      onSuccess: (tx) => {
        toast.success("Saque enviado!");
        void queryClient.invalidateQueries({ queryKey: [["depixTransaction"]] });
        router.push(`/depix-wallet/transactions/${tx.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );


  // ─── Validacoes do passo 1 ───
  const pixKeyValid = isPixKeyValid(pixKeyType, pixKey);
  const taxIdValid = isValidTaxId(recipientTaxId);
  const canAdvanceStep1 = pixKeyValid && taxIdValid;

  // ─── Validacoes do passo 2 ───
  const balance = overviewQuery.data?.balance.depix ?? 0;
  const balanceCents = Math.round(balance * 100);
  const grossCents = previewQuery.data?.grossCents ?? 0;
  const insufficient =
    netAmount >= DEPIX_LIMITS.MIN_CENTS && grossCents > 0 && grossCents > balanceCents;
  const canAdvanceStep2 =
    netAmount >= DEPIX_LIMITS.MIN_CENTS &&
    netAmount <= DEPIX_LIMITS.MAX_CENTS &&
    !insufficient;

  // ─── Maskaras conforme tipo ───
  function handlePixKeyChange(raw: string) {
    const masked = maskByPixType(pixKeyType, raw);
    setPixKey(masked);
    // Auto-fill CPF/CNPJ quando a chave eh CPF/CNPJ valido
    const auto = extractTaxIdFromKey(pixKeyType, masked);
    if (auto && !recipientTaxId) {
      setRecipientTaxId(auto);
    }
  }
  function handleTypeChange(type: PixKeyType) {
    setPixKeyType(type);
    setPixKey("");
    // se o tipo era CPF/CNPJ e a auto-fill copiou, limpa pra usuario decidir
    setRecipientTaxId("");
  }
  function handleRecipientPick(r: {
    pixKey: string;
    pixKeyType: string;
    recipientName: string | null;
    recipientTaxId: string | null;
  }) {
    const t = r.pixKeyType as PixKeyType;
    setPixKeyType(t);
    setPixKey(maskByPixType(t, r.pixKey));
    setRecipientName(r.recipientName ?? "");
    setRecipientTaxId(r.recipientTaxId ?? "");
    toast.success(`Destinatario carregado: ${r.recipientName ?? "(sem nome)"}`);
  }

  function handleSubmit() {
    createMutation.mutate({
      pixKeyType,
      pixKey,
      recipientName: recipientName.trim() || null,
      recipientTaxId,
      netAmountCents: netAmount,
      idempotencyKey,
    });
    setConfirmOpen(false);
  }

  if (overviewQuery.isLoading) return <LoadingState />;

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
            <span>Sacar via PIX</span>
          </div>
        }
        subtitle="Informe o destinatario, valor e revise antes de confirmar."
      />

      <WizardStepper steps={STEPS} current={step} />

      {/* ─── PASSO 1 ─── */}
      {step === 1 && (
        <div className="max-w-xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <Card className="p-5 sm:p-6 space-y-5">
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <Label className="text-sm font-medium">
                  Tipo de chave PIX
                </Label>
                <RecipientPicker onPick={handleRecipientPick} />
              </div>
              <PixKeyTypeTabs value={pixKeyType} onChange={handleTypeChange} />
            </div>

            <div>
              <Label htmlFor="pixKey">Chave PIX *</Label>
              <Input
                id="pixKey"
                value={pixKey}
                onChange={(e) => handlePixKeyChange(e.target.value)}
                placeholder={PIX_KEY_PLACEHOLDER[pixKeyType]}
                className={cn(
                  "font-mono",
                  pixKey && !pixKeyValid && "border-destructive",
                )}
                autoComplete="off"
              />
              {pixKey && !pixKeyValid && (
                <p className="text-xs text-destructive mt-1.5">
                  Chave invalida pro tipo selecionado.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="taxId">
                  CPF/CNPJ do destinatario *{" "}
                  {pixKeyType === "CPF" || pixKeyType === "CNPJ" ? (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      (preenchido automaticamente)
                    </span>
                  ) : null}
                </Label>
                <Input
                  id="taxId"
                  value={maskTaxIdLive(recipientTaxId)}
                  onChange={(e) => setRecipientTaxId(e.target.value)}
                  placeholder="000.000.000-00"
                  className={cn(
                    "font-mono",
                    recipientTaxId && !taxIdValid && "border-destructive",
                  )}
                  inputMode="numeric"
                />
                {recipientTaxId && !taxIdValid && (
                  <p className="text-xs text-destructive mt-1.5">
                    CPF/CNPJ invalido.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="recipientName">
                  Nome do destinatario{" "}
                  <span className="text-[10px] text-muted-foreground font-normal">
                    (opcional)
                  </span>
                </Label>
                <Input
                  id="recipientName"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Como aparecera no comprovante"
                  autoComplete="off"
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/depix-wallet">Cancelar</Link>
            </Button>
            <Button onClick={() => setStep(2)} disabled={!canAdvanceStep1}>
              Continuar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── PASSO 2 ─── */}
      {step === 2 && (
        <div className="max-w-xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <Card className="p-5 sm:p-6 space-y-5">
            <div>
              <Label className="text-sm font-medium">
                Quanto o destinatario vai receber?
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Min R$ 10,00 · Max R$ 5.000,00 · Saldo {formatBRL(balanceCents)}
              </p>
              <MoneyInput
                value={netAmount}
                onChange={setNetAmount}
                placeholder="R$ 0,00"
                className="!text-3xl !h-16 !font-mono tabular-nums"
              />
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                Atalhos
              </p>
              <AmountQuickPicks value={netAmount} onChange={setNetAmount} />
            </div>

            {netAmount >= DEPIX_LIMITS.MIN_CENTS && previewQuery.data && (
              <FeeBreakdown
                kind="WITHDRAW"
                netCents={netAmount}
                feeArenaCents={previewQuery.data.feeArenaTechCents}
                feePixPayCents={previewQuery.data.feePixPayEstimatedCents}
                availableBalanceCents={balanceCents}
              />
            )}

            {insufficient && (
              <p className="text-xs text-destructive">
                Saldo insuficiente. Necessario {formatBRL(grossCents)} pra esse
                valor liquido.
              </p>
            )}
          </Card>

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <Button onClick={() => setStep(3)} disabled={!canAdvanceStep2}>
              Continuar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── PASSO 3 ─── */}
      {step === 3 && (
        <div className="max-w-xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <Card className="p-6 sm:p-8 text-center bg-linear-to-br from-card via-card to-primary/[0.04] border-b-2 border-b-primary/30">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
              Voce vai enviar
            </p>
            <p className="text-4xl sm:text-5xl font-mono tabular-nums font-bold">
              {formatBRL(netAmount)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              para{" "}
              <span className="font-medium text-foreground">
                {recipientName || "(sem nome)"}
              </span>
              <br />
              {pixKeyType === "CPF" && `CPF ${formatCpf(recipientTaxId)}`}
              {pixKeyType === "CNPJ" && `CNPJ ${formatCnpj(recipientTaxId)}`}
              {pixKeyType === "EMAIL" && pixKey}
              {pixKeyType === "PHONE" && pixKey}
              {pixKeyType === "RANDOM" && `chave aleatoria ${pixKey.slice(0, 12)}...`}
            </p>
          </Card>

          {previewQuery.data && (
            <FeeBreakdown
              kind="WITHDRAW"
              netCents={netAmount}
              feeArenaCents={previewQuery.data.feeArenaTechCents}
              feePixPayCents={previewQuery.data.feePixPayEstimatedCents}
              availableBalanceCents={balanceCents}
            />
          )}

          <Card className="p-3 bg-amber-500/[0.04] border-amber-500/30">
            <p className="text-xs text-amber-700 dark:text-amber-400 inline-flex items-center gap-2">
              <span className="text-base leading-none">⚠</span>
              Operacao on-chain irreversivel. Confira o destinatario antes de confirmar.
            </p>
          </Card>

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={createMutation.isPending}
              className="shadow-[0_0_20px_-4px_var(--primary)] hover:shadow-[0_0_28px_-4px_var(--primary)] transition-shadow"
            >
              {createMutation.isPending ? (
                "Enviando…"
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Confirmar saque
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar saque"
        description={`O destinatario vai receber ${formatBRL(netAmount)} via PIX. ${formatBRL(grossCents)} sera debitado do seu saldo DePix. A operacao e on-chain e nao pode ser desfeita.`}
        confirmLabel="Confirmar"
        onConfirm={handleSubmit}
      />
    </div>
  );
}
