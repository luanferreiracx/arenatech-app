"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, QrCode } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
import { isValidTaxId } from "@/lib/utils/tax-id";
import { WizardStepper } from "../_components/wizard-stepper";
import { AmountQuickPicks } from "../_components/amount-quick-picks";
import { FeeBreakdown } from "../_components/fee-breakdown";

const STEPS = [
  { id: 1, label: "Valor" },
  { id: 2, label: "QR Code" },
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

function maskPhoneLive(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 13);
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length <= 10) {
    return local
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return local
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function isValidOptionalPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (!digits) return true;
  return digits.length === 10 || digits.length === 11 ||
    ((digits.length === 12 || digits.length === 13) && digits.startsWith("55"));
}

export default function DepixReceivePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [amount, setAmount] = useState(0);
  const [payerTaxId, setPayerTaxId] = useState("");
  const [payerPhone, setPayerPhone] = useState("");

  const payerTaxIdDigits = payerTaxId.replace(/\D/g, "");
  const requiresTaxId = amount >= 50_000;
  const hasPayerTaxId = payerTaxIdDigits.length > 0;
  const payerTaxIdValid = !hasPayerTaxId || isValidTaxId(payerTaxIdDigits);
  const payerPhoneValid = isValidOptionalPhone(payerPhone);

  const previewQuery = useQuery({
    ...trpc.depixTransaction.previewFee.queryOptions({
      kind: "DEPOSIT",
      amountCents: amount,
    }),
    enabled: amount >= DEPIX_LIMITS.MIN_CENTS,
  });

  const createMutation = useMutation(
    trpc.depixTransaction.createDeposit.mutationOptions({
      onSuccess: (tx) => {
        toast.success("QR PIX gerado!");
        void queryClient.invalidateQueries({ queryKey: [["depixTransaction"]] });
        router.push(`/depix-wallet/transactions/${tx.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const canSubmit =
    amount >= DEPIX_LIMITS.MIN_CENTS &&
    amount <= DEPIX_LIMITS.MAX_CENTS &&
    (!requiresTaxId || hasPayerTaxId) &&
    payerTaxIdValid &&
    payerPhoneValid;

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
            <span>Receber via PIX</span>
          </div>
        }
        subtitle="Defina o valor e gere um QR PIX. O DePix cai direto na sua carteira."
      />

      <WizardStepper steps={STEPS} current={1} />

      <div className="max-w-xl mx-auto space-y-5">
        <Card className="p-5 sm:p-6 space-y-5">
          <div>
            <Label className="text-sm font-medium">
              Quanto voce quer receber?
            </Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Min R$ 10,00 · Max R$ 5.000,00 · O cliente paga este valor via PIX
            </p>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              placeholder="R$ 0,00"
              className="!text-3xl !h-16 !font-mono tabular-nums"
            />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
              Atalhos
            </p>
            <AmountQuickPicks value={amount} onChange={setAmount} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="payerPhone">
                Telefone do pagador{" "}
                <span className="text-[10px] text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                id="payerPhone"
                value={maskPhoneLive(payerPhone)}
                onChange={(event) => setPayerPhone(event.target.value)}
                placeholder="(86) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
              />
              {!payerPhoneValid && (
                <p className="text-xs text-destructive mt-1.5">
                  Telefone invalido.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="payerTaxId">
                CPF/CNPJ do pagador {requiresTaxId ? "*" : ""}
              </Label>
              <Input
                id="payerTaxId"
                value={maskTaxIdLive(payerTaxId)}
                onChange={(event) => setPayerTaxId(event.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Opcional ate R$ 499,99; obrigatorio a partir de R$ 500,00.
              </p>
              {requiresTaxId && !hasPayerTaxId && (
                <p className="text-xs text-destructive mt-1.5">
                  Informe CPF/CNPJ para recebimentos de {formatBRL(amount)}.
                </p>
              )}
              {hasPayerTaxId && !payerTaxIdValid && (
                <p className="text-xs text-destructive mt-1.5">
                  CPF/CNPJ invalido.
                </p>
              )}
            </div>
          </div>

          {amount >= DEPIX_LIMITS.MIN_CENTS && previewQuery.data && (
            <FeeBreakdown
              kind="DEPOSIT"
              netCents={amount}
              feeArenaCents={previewQuery.data.feeArenaTechCents}
              feePixPayCents={previewQuery.data.feePixPayEstimatedCents}
            />
          )}
        </Card>

        <div className="flex justify-between gap-2">
          <Button asChild variant="outline">
            <Link href="/depix-wallet">Cancelar</Link>
          </Button>
          <Button
            onClick={() =>
              createMutation.mutate({
                grossAmountCents: amount,
                payerTaxId: payerTaxIdDigits || null,
                payerPhone: payerPhone.replace(/\D/g, "") || null,
              })
            }
            disabled={!canSubmit || createMutation.isPending}
            className="shadow-[0_0_20px_-4px_var(--primary)] hover:shadow-[0_0_28px_-4px_var(--primary)] transition-shadow"
          >
            {createMutation.isPending ? (
              "Gerando…"
            ) : (
              <>
                <QrCode className="mr-2 h-4 w-4" />
                Gerar QR PIX
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
