"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { MoneyInput } from "@/components/inputs/money-input";
import { DatePicker } from "@/components/inputs/date-picker";
import { createTransactionSchema } from "@/lib/validators/financial";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { z } from "zod";

type FormValues = z.input<typeof createTransactionSchema>;

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function InstallmentPreview({ totalCentavos, count, baseDate }: {
  totalCentavos: number;
  count: number;
  baseDate: Date;
}) {
  if (totalCentavos <= 0 || count <= 0) {
    return <p className="text-sm text-muted-foreground">Informe o valor e número de parcelas.</p>;
  }

  const totalReais = totalCentavos / 100;
  const installmentAmount = Math.floor((totalReais / count) * 100) / 100;
  const lastAmount = Math.round((totalReais - installmentAmount * (count - 1)) * 100) / 100;

  const items = Array.from({ length: count }, (_, i) => {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(baseDate.getMonth() + i + 1);
    const value = i === count - 1 ? lastAmount : installmentAmount;
    return { number: i + 1, value, dueDate };
  });

  return (
    <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
      {items.map((item) => (
        <div key={item.number} className="p-2 rounded-md border bg-muted/30 text-xs">
          <span className="font-semibold text-primary">{item.number}/{count}</span>
          {" — "}
          <span className="text-success">{formatMoney(item.value)}</span>
          {" — "}
          <span className="text-muted-foreground">{item.dueDate.toLocaleDateString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}

export function TransactionForm() {
  const trpc = useTRPC();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      type: "PAYABLE",
      description: "",
      category: "",
      supplier: "",
      customerName: "",
      totalAmount: 0,
      dueDate: new Date(),
      emissionDate: new Date(),
      paymentMethod: "",
      notes: "",
      installments: 1,
    },
  });

  const createMutation = useMutation(
    trpc.financial.createTransaction.mutationOptions({
      onSuccess: (data) => {
        toast.success("Transação criada com sucesso!");
        router.push(`/financial/${data?.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      ...values,
      totalAmount: values.totalAmount / 100,
      customerName: values.customerName || undefined,
      supplier: values.supplier || undefined,
    });
  };

  const watchType = form.watch("type");
  const installmentsCount = form.watch("installments");
  const totalAmount = form.watch("totalAmount");
  const dueDate = form.watch("dueDate");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-3xl">
        <FormSection title="Dados da Transação">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="PAYABLE">A Pagar</SelectItem>
                    <SelectItem value="RECEIVABLE">A Receber</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição *</FormLabel>
                <FormControl>
                  <Input
                    placeholder={watchType === "PAYABLE"
                      ? "Ex: Aluguel da loja - Janeiro"
                      : "Ex: Venda a prazo para cliente X"}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Aluguel, Fornecedor..." {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="totalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Total (R$) *</FormLabel>
                  <FormControl>
                    <MoneyInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {watchType === "PAYABLE" ? (
            <FormField
              control={form.control}
              name="supplier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fornecedor</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do fornecedor" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <FormField
              control={form.control}
              name="customerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do cliente" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Forma de Pagamento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="crediario">Crediário</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="emissionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Emissão</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Vencimento *</FormLabel>
                <FormControl>
                  <DatePicker value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Parcelamento">
          <FormField
            control={form.control}
            name="installments"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de Parcelas (1-60)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="w-32"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-primary">Preview das Parcelas</CardTitle>
            </CardHeader>
            <CardContent>
              <InstallmentPreview
                totalCentavos={totalAmount}
                count={installmentsCount}
                baseDate={dueDate instanceof Date ? dueDate : new Date(dueDate)}
              />
            </CardContent>
          </Card>
        </FormSection>

        <FormSection title="Observações">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea placeholder="Informações adicionais..." rows={3} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormActions
          isLoading={createMutation.isPending}
          onCancel={() => router.push("/financial")}
          submitLabel="Criar Transação"
        />
      </form>
    </Form>
  );
}
