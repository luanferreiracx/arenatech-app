"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import { createWithdrawSchema, type CreateWithdrawInput, PIX_KEY_TYPE_LABELS } from "@/lib/validators/depix-withdraw";
import { cn } from "@/lib/utils";

const PIX_KEY_TYPES = ["RANDOM", "CPF", "CNPJ", "EMAIL", "PHONE"] as const;

const PIX_KEY_PLACEHOLDERS: Record<string, string> = {
  RANDOM: "Cole a chave aleatoria aqui",
  CPF: "00000000000",
  CNPJ: "00000000000000",
  EMAIL: "email@exemplo.com",
  PHONE: "5586999222725",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function NewWithdrawForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const [selectedType, setSelectedType] = useState<string>("");
  const [pendingWithdraw, setPendingWithdraw] = useState<CreateWithdrawInput | null>(null);

  const form = useForm<CreateWithdrawInput>({
    resolver: zodResolver(createWithdrawSchema),
    defaultValues: {
      pixKeyType: undefined,
      pixKey: "",
      recipientName: "",
      recipientTaxId: "",
      notes: "",
      requestedAmount: 0,
    },
  });

  const watchAmount = form.watch("requestedAmount");
  const watchPixKey = form.watch("pixKey");
  const watchName = form.watch("recipientName");

  const createMutation = useMutation(
    trpc.depixWithdraw.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Saque solicitado com sucesso!");
        router.push(`/depix/withdrawals/${data.id}`);
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  const selectPixKeyType = (type: string) => {
    setSelectedType(type);
    form.setValue("pixKeyType", type as CreateWithdrawInput["pixKeyType"]);
  };

  const onSubmit = (data: CreateWithdrawInput) => {
    setPendingWithdraw(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main */}
        <div className="space-y-6">
          {/* PIX Key Type */}
          <Card className="p-6">
            <Label className="text-sm font-semibold mb-3 block">Tipo de Chave PIX</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {PIX_KEY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectPixKeyType(type)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 border-2 rounded-lg text-xs font-semibold transition-colors",
                    selectedType === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {PIX_KEY_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            {form.formState.errors.pixKeyType && (
              <p className="text-sm text-destructive mt-2">{form.formState.errors.pixKeyType.message}</p>
            )}
          </Card>

          {/* Withdraw Data */}
          <Card className="p-6 space-y-4">
            <div>
              <Label>Chave PIX *</Label>
              <Input
                {...form.register("pixKey")}
                placeholder={selectedType ? PIX_KEY_PLACEHOLDERS[selectedType] : "Selecione o tipo acima"}
              />
              {form.formState.errors.pixKey && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.pixKey.message}</p>
              )}
            </div>

            <div>
              <Label>Nome do Destinatario (opcional)</Label>
              <Input
                {...form.register("recipientName")}
                placeholder="Nome de quem vai receber o PIX"
                maxLength={200}
              />
            </div>

            <div>
              <Label>CPF / CNPJ do Destinatario *</Label>
              <Input
                {...form.register("recipientTaxId")}
                placeholder="000.000.000-00"
                maxLength={18}
              />
              {form.formState.errors.recipientTaxId && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.recipientTaxId.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Deve corresponder ao titular da chave PIX informada.</p>
            </div>

            <div>
              <Label>Observacao (opcional)</Label>
              <Textarea
                {...form.register("notes")}
                placeholder="Motivo do saque, referencia, etc."
                maxLength={500}
                rows={2}
              />
            </div>

            <div>
              <Label>Valor do Saque (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="2"
                max="6000"
                placeholder="0,00"
                {...form.register("requestedAmount", { valueAsNumber: true })}
                className="text-lg font-semibold"
              />
              {form.formState.errors.requestedAmount && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.requestedAmount.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Valor minimo: R$ 2,00. Valor maximo: R$ 6.000,00.</p>
            </div>
          </Card>

          <div className="bg-warning/10 border border-warning/25 rounded-lg p-4 text-sm text-warning flex items-start gap-2">
            <span className="font-bold">Atencao:</span>
            <span>Apos solicitar o saque, o valor sera processado via DePix. Uma taxa sera adicionada automaticamente.</span>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="bg-primary p-3 text-primary-foreground text-sm font-semibold uppercase tracking-wider">
              Resumo do Saque
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tipo Chave</span>
                <span>{selectedType ? PIX_KEY_TYPE_LABELS[selectedType] : "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Chave PIX</span>
                <span className="font-mono text-xs max-w-[160px] text-right break-all">{watchPixKey || "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Destinatario</span>
                <span className="text-xs max-w-[160px] text-right">{watchName || "-"}</span>
              </div>
              <div className="border-t pt-3 flex justify-between items-baseline">
                <span className="font-semibold">Valor</span>
                <span className="text-2xl font-bold text-primary">
                  {watchAmount > 0 ? formatCurrency(watchAmount) : "R$ 0,00"}
                </span>
              </div>
            </div>
          </Card>

          <Button
            type="submit"
            className="w-full"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Processando..." : "Solicitar Saque"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => router.push("/depix/withdrawals")}
          >
            Cancelar
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingWithdraw !== null}
        onOpenChange={(open) => { if (!open) setPendingWithdraw(null); }}
        title="Confirmar saque PIX?"
        description={
          pendingWithdraw
            ? `Tipo: ${PIX_KEY_TYPE_LABELS[pendingWithdraw.pixKeyType]} | Chave: ${pendingWithdraw.pixKey} | Valor: ${formatCurrency(pendingWithdraw.requestedAmount)}. Esta operacao move dinheiro de verdade.`
            : ""
        }
        confirmLabel="Confirmar saque"
        onConfirm={() => {
          if (pendingWithdraw) {
            createMutation.mutate(pendingWithdraw);
            setPendingWithdraw(null);
          }
        }}
        isLoading={createMutation.isPending}
      />
    </form>
  );
}
