"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyInput } from "@/components/inputs/money-input";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/cashier";
import type { CreateTransactionInput } from "@/lib/validators/financial";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface FormValues {
  type: "PAYABLE" | "RECEIVABLE";
  description: string;
  category: string;
  supplier: string;
  customerName: string;
  totalAmount: number; // centavos
  paymentMethod: string;
  numInstallments: number;
  emissionDate: string;
  firstDueDate: string;
  notes: string;
}

export function TransactionForm() {
  const router = useRouter();
  const trpc = useTRPC();

  const { register, handleSubmit, watch, control, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      type: "RECEIVABLE",
      description: "",
      category: "",
      supplier: "",
      customerName: "",
      totalAmount: 0,
      paymentMethod: "",
      numInstallments: 1,
      emissionDate: new Date().toISOString().split("T")[0],
      firstDueDate: "",
      notes: "",
    },
  });

  const type = watch("type");
  const totalAmount = watch("totalAmount");
  const numInstallments = watch("numInstallments");
  const emissionDate = watch("emissionDate");

  // Calculate installment preview
  const installmentPreview = useMemo(() => {
    if (totalAmount <= 0 || numInstallments <= 0) return [];

    const valorParcela = Math.floor(totalAmount / numInstallments);
    const valorUltima = totalAmount - valorParcela * (numInstallments - 1);

    const baseDate = emissionDate ? new Date(emissionDate) : new Date();
    const previews = [];

    for (let i = 1; i <= numInstallments; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setDate(dueDate.getDate() + 30 * i);

      previews.push({
        number: i,
        amount: i === numInstallments ? valorUltima : valorParcela,
        dueDate: dueDate.toLocaleDateString("pt-BR"),
      });
    }

    return previews;
  }, [totalAmount, numInstallments, emissionDate]);

  const createMutation = useMutation(
    trpc.financial.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Transacao criada com sucesso!");
        router.push(`/financial/${data.id}`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const onSubmit = (values: FormValues) => {
    const input: CreateTransactionInput = {
      type: values.type,
      description: values.description,
      category: values.category || null,
      supplier: values.type === "PAYABLE" ? (values.supplier || null) : null,
      customerName: values.type === "RECEIVABLE" ? (values.customerName || null) : null,
      totalAmount: values.totalAmount,
      paymentMethod: values.paymentMethod || null,
      numInstallments: values.numInstallments,
      emissionDate: values.emissionDate,
      firstDueDate: values.firstDueDate || null,
      notes: values.notes || null,
    };

    createMutation.mutate(input);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da Transacao</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tipo *</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RECEIVABLE">A Receber</SelectItem>
                      <SelectItem value="PAYABLE">A Pagar</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div>
              <Label>Categoria</Label>
              <Input
                {...register("category")}
                placeholder="Ex: Servicos, Material, etc."
                maxLength={100}
              />
            </div>
          </div>

          <div>
            <Label>Descricao *</Label>
            <Input
              {...register("description", { required: "Descricao e obrigatoria" })}
              placeholder="Ex: Venda a prazo para cliente X"
              maxLength={200}
            />
            {errors.description && (
              <p className="text-sm text-destructive mt-1">{errors.description.message}</p>
            )}
          </div>

          {type === "RECEIVABLE" && (
            <div>
              <Label>Cliente</Label>
              <Input
                {...register("customerName")}
                placeholder="Nome do cliente"
                maxLength={200}
              />
            </div>
          )}

          {type === "PAYABLE" && (
            <div>
              <Label>Fornecedor</Label>
              <Input
                {...register("supplier")}
                placeholder="Nome do fornecedor"
                maxLength={200}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valores e Parcelamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Valor Total (R$) *</Label>
              <Controller
                name="totalAmount"
                control={control}
                rules={{ min: { value: 1, message: "Valor deve ser maior que zero" } }}
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              {errors.totalAmount && (
                <p className="text-sm text-destructive mt-1">{errors.totalAmount.message}</p>
              )}
            </div>

            <div>
              <Label>Forma de Pagamento</Label>
              <Controller
                name="paymentMethod"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div>
              <Label>Numero de Parcelas *</Label>
              <Input
                type="number"
                min={1}
                max={60}
                {...register("numInstallments", {
                  valueAsNumber: true,
                  min: { value: 1, message: "Minimo 1 parcela" },
                  max: { value: 60, message: "Maximo 60 parcelas" },
                })}
              />
              {errors.numInstallments && (
                <p className="text-sm text-destructive mt-1">{errors.numInstallments.message}</p>
              )}
            </div>

            <div>
              <Label>Data de Emissao *</Label>
              <Input
                type="date"
                {...register("emissionDate", { required: "Data de emissao e obrigatoria" })}
              />
              {errors.emissionDate && (
                <p className="text-sm text-destructive mt-1">{errors.emissionDate.message}</p>
              )}
            </div>
          </div>

          {/* Installment Preview */}
          {installmentPreview.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-primary mb-3">
                Preview das Parcelas
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {installmentPreview.map((p) => (
                  <div
                    key={p.number}
                    className="bg-background border rounded-md px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-primary">
                      {p.number}/{numInstallments}
                    </span>
                    {" - "}
                    <span className="font-mono text-success">
                      {formatCents(p.amount)}
                    </span>
                    {" - "}
                    <span className="text-muted-foreground">{p.dueDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Observacoes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            {...register("notes")}
            placeholder="Observacoes opcionais..."
            maxLength={2000}
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/financial")}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Criando..." : "Criar Transacao"}
        </Button>
      </div>
    </form>
  );
}
