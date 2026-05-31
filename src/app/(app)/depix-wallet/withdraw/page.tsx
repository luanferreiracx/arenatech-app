"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createWithdrawSchema,
  type CreateWithdrawInput,
} from "@/lib/validators/depix-transaction";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const KEY_TYPE_LABELS: Record<string, string> = {
  CPF: "CPF",
  CNPJ: "CNPJ",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  RANDOM: "Chave aleatoria",
};

export default function DepixWithdrawPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const overviewQuery = useQuery(trpc.depixTransaction.getOverview.queryOptions());

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const form = useForm<CreateWithdrawInput>({
    resolver: zodResolver(createWithdrawSchema),
    defaultValues: {
      pixKeyType: "CPF",
      pixKey: "",
      recipientName: "",
      recipientTaxId: "",
      netAmountCents: 0,
      idempotencyKey,
    },
  });

  const netAmount = form.watch("netAmountCents");
  const previewQuery = useQuery({
    ...trpc.depixTransaction.previewFee.queryOptions({ kind: "WITHDRAW", amountCents: netAmount }),
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

  const onSubmit = (data: CreateWithdrawInput) => {
    createMutation.mutate(data);
    setConfirmOpen(false);
  };

  const balance = overviewQuery.data?.balance.depix ?? 0;
  // Gross = bruto a debitar do saldo (calculado pela inversa). Saldo precisa cobrir gross.
  const grossCents = previewQuery.data?.grossCents ?? 0;
  const required = grossCents / 100;
  const insufficient = netAmount >= DEPIX_LIMITS.MIN_CENTS && grossCents > 0 && required > balance;

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
            Sacar (DePix &rarr; PIX)
          </div>
        }
        subtitle="Saldo on-chain vai pra carteira do gateway, que paga o PIX no destinatario."
      />

      <form
        className="max-w-xl"
        onSubmit={form.handleSubmit(() => setConfirmOpen(true))}
      >
        <FormSection title="Destinatario">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Tipo de chave PIX</Label>
              <Select
                value={form.watch("pixKeyType")}
                onValueChange={(v) =>
                  form.setValue("pixKeyType", v as "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KEY_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Chave PIX *</Label>
              <Input {...form.register("pixKey")} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatoria" />
              {form.formState.errors.pixKey && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.pixKey.message}</p>
              )}
            </div>
            <div>
              <Label>CPF/CNPJ do destinatario *</Label>
              <Input {...form.register("recipientTaxId")} placeholder="00000000000" />
              {form.formState.errors.recipientTaxId && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.recipientTaxId.message}</p>
              )}
            </div>
            <div>
              <Label>Nome do destinatario</Label>
              <Input {...form.register("recipientName")} placeholder="(opcional)" />
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Valor"
          description={`Min R$ 10,00 — Max R$ 5.000,00 · Saldo disponivel: ${formatBRL(balance * 100)}`}
        >
          <div>
            <Label>Valor a receber pelo destinatario</Label>
            <MoneyInput
              value={form.watch("netAmountCents")}
              onChange={(v) => form.setValue("netAmountCents", v)}
              placeholder="R$ 0,00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              E o valor que o destinatario recebe via PIX. As taxas sao
              adicionadas em cima e debitadas do seu saldo.
            </p>
            {form.formState.errors.netAmountCents && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.netAmountCents.message}</p>
            )}
            {insufficient && (
              <p className="text-xs text-destructive mt-1">
                Saldo insuficiente. Necessario {formatBRL(grossCents)} pra esse valor liquido.
              </p>
            )}
          </div>
        </FormSection>

        {netAmount >= DEPIX_LIMITS.MIN_CENTS && previewQuery.data && (
          <Card className="p-4 my-6 space-y-2 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Resumo</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Destinatario recebe</span>
              <span className="tabular-nums">{formatBRL(previewQuery.data.netCents)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa Arena Tech</span>
              <span className="tabular-nums">+ {formatBRL(previewQuery.data.feeArenaTechCents)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa PixPay (estimada)</span>
              <span className="tabular-nums">+ {formatBRL(previewQuery.data.feePixPayEstimatedCents)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2 font-semibold">
              <span>Voce paga (debita do saldo)</span>
              <span className="tabular-nums">{formatBRL(previewQuery.data.grossCents)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Taxa PixPay eh estimada — valor real eh confirmado ao iniciar o saque.
            </p>
          </Card>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button asChild variant="outline">
            <Link href="/depix-wallet">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={insufficient || netAmount < 200 || createMutation.isPending}>
            {createMutation.isPending ? "Enviando…" : "Sacar"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar saque"
        description={`Destinatario vai receber ${formatBRL(netAmount)} via PIX. ${formatBRL(grossCents)} sera debitado do seu saldo DePix. A operacao e on-chain e nao pode ser desfeita.`}
        confirmLabel="Confirmar saque"
        onConfirm={() => form.handleSubmit(onSubmit)()}
      />
    </div>
  );
}
