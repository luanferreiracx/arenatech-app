"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Wallet, RefreshCw } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { LoadingState } from "@/components/domain/loading-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  updateDepixFeeConfigSchema,
  type UpdateDepixFeeConfigInput,
} from "@/lib/validators/depix-wallet";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DepixSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const feeQuery = useQuery(trpc.depixWallet.getFeeConfig.queryOptions());
  const walletQuery = useQuery(trpc.depixWallet.getWalletInfo.queryOptions());
  const balanceQuery = useQuery(trpc.depixWallet.getBalance.queryOptions());

  const form = useForm<UpdateDepixFeeConfigInput>({
    resolver: zodResolver(updateDepixFeeConfigSchema),
    values: feeQuery.data
      ? {
          entryFeeFixed: feeQuery.data.entryFeeFixed,
          entryFeePercent: feeQuery.data.entryFeePercent,
          exitFeeFixed: feeQuery.data.exitFeeFixed,
          exitFeePercent: feeQuery.data.exitFeePercent,
        }
      : undefined,
  });

  const updateMutation = useMutation(
    trpc.depixWallet.updateFeeConfig.mutationOptions({
      onSuccess: () => {
        toast.success("Taxas DePix atualizadas!");
        void queryClient.invalidateQueries({ queryKey: [["depixWallet"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const provisionMutation = useMutation(
    trpc.depixWallet.provision.mutationOptions({
      onSuccess: (res) => {
        if (res.success) {
          toast.success(
            res.alreadyProvisioned ? "Carteira ja provisionada." : "Carteira provisionada!",
          );
          void queryClient.invalidateQueries({ queryKey: [["depixWallet"]] });
        } else {
          toast.error(res.error ?? "Falha ao provisionar carteira.");
        }
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (feeQuery.isLoading) return <LoadingState />;

  const wallet = walletQuery.data;
  const masterAddress = wallet?.masterAddress ?? null;

  return (
    <div>
      <PageHeader
        title="DePix"
        subtitle="Carteira Liquid do tenant e taxas de intermediacao por transacao"
      />

      {/* Carteira */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Carteira</h3>
        </div>
        {wallet?.provisioned && masterAddress ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Endereco de recebimento (Liquid)</p>
              <div className="flex items-start gap-2 mt-1 p-2 bg-muted/30 rounded border border-border">
                <p className="font-mono text-xs break-all flex-1 select-all">{masterAddress}</p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(masterAddress);
                    toast.success("Endereco copiado!");
                  }}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                >
                  <Copy className="w-3 h-3" /> Copiar
                </button>
              </div>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Saldo DePix</span>
              <span className="font-semibold">
                {balanceQuery.data
                  ? `R$ ${(balanceQuery.data.depixBalance ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                  : "—"}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Carteira ainda nao provisionada. Provisione para gerar a carteira Liquid deste tenant.
            </p>
            <Button
              variant="outline"
              onClick={() => provisionMutation.mutate()}
              disabled={provisionMutation.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Provisionar carteira
            </Button>
          </div>
        )}
      </Card>

      {/* Taxas */}
      <form
        onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
        className="space-y-6"
      >
        <FormSection
          title="Taxas de intermediacao"
          description="Cobradas por transacao e repassadas para a carteira da Arena Tech. Empilham sobre a taxa do gateway de off-ramp."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-sm font-semibold">Entrada (deposito)</p>
              <div>
                <Label>Taxa fixa</Label>
                <MoneyInput
                  value={form.watch("entryFeeFixed")}
                  onChange={(v) => form.setValue("entryFeeFixed", v)}
                />
              </div>
              <div>
                <Label>Taxa percentual (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  {...form.register("entryFeePercent", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-semibold">Saida (saque)</p>
              <div>
                <Label>Taxa fixa</Label>
                <MoneyInput
                  value={form.watch("exitFeeFixed")}
                  onChange={(v) => form.setValue("exitFeeFixed", v)}
                />
              </div>
              <div>
                <Label>Taxa percentual (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  {...form.register("exitFeePercent", { valueAsNumber: true })}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Padrao: entrada {formatBRL(99)} + 1,5% · saida {formatBRL(99)} + 1,7%.
          </p>
        </FormSection>

        <FormActions isLoading={updateMutation.isPending} submitLabel="Salvar taxas" />
      </form>
    </div>
  );
}
