"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/inputs/money-input";
import { Label } from "@/components/ui/label";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DepixReceivePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [amount, setAmount] = useState(0);

  // Preview da taxa Arena Tech (R$0,99 + 1,5%) — atualiza on-the-fly.
  const previewQuery = useQuery({
    ...trpc.depixTransaction.previewFee.queryOptions({ kind: "DEPOSIT", grossAmountCents: amount }),
    enabled: amount >= 200,
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

  const canSubmit = amount >= 200 && amount <= 600000;

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <Link href="/depix-wallet">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            Receber DePix
          </div>
        }
        subtitle="Gere um QR PIX. O DePix cai direto na sua carteira ja com taxa descontada."
      />

      <div className="max-w-xl">
        <FormSection title="Valor a receber" description="Min R$ 2,00 — Max R$ 6.000,00">
          <div>
            <Label>Valor (bruto pago pelo cliente)</Label>
            <MoneyInput value={amount} onChange={setAmount} placeholder="R$ 0,00" />
          </div>
        </FormSection>

        {amount >= 200 && previewQuery.data && (
          <Card className="p-4 my-6 space-y-2 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Breakdown estimado</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente paga</span>
              <span className="tabular-nums font-semibold">{formatBRL(previewQuery.data.grossCents)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa Arena Tech</span>
              <span className="tabular-nums">− {formatBRL(previewQuery.data.feeArenaTechCents)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa PixPay (estimada)</span>
              <span className="tabular-nums">− {formatBRL(previewQuery.data.feePixPayEstimatedCents)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2 font-semibold">
              <span>Voce recebe (estimado)</span>
              <span className="tabular-nums">{formatBRL(previewQuery.data.netCents)}</span>
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button asChild variant="outline">
            <Link href="/depix-wallet">Cancelar</Link>
          </Button>
          <Button
            onClick={() => createMutation.mutate({ grossAmountCents: amount })}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? "Gerando…" : "Gerar QR"}
          </Button>
        </div>
      </div>
    </div>
  );
}
