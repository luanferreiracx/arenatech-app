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
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
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

export default function DepixReceivePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [amount, setAmount] = useState(0);

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
    amount >= DEPIX_LIMITS.MIN_CENTS && amount <= DEPIX_LIMITS.MAX_CENTS;

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
            onClick={() => createMutation.mutate({ grossAmountCents: amount })}
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
