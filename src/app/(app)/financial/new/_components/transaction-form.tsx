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
      totalAmount: 0, // centavos
      dueDate: new Date(),
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
    createMutation.mutate({ ...values, totalAmount: values.totalAmount / 100 });
  };

  const watchType = form.watch("type");
  const installmentsCount = form.watch("installments");
  const totalAmount = form.watch("totalAmount");
  const installmentValue = installmentsCount > 0 ? (totalAmount / 100) / installmentsCount : 0;

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
                  <Input placeholder="Descrição da transação" {...field} />
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
                  <FormLabel>Valor Total *</FormLabel>
                  <FormControl>
                    <MoneyInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {watchType === "PAYABLE" && (
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
          )}

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        </FormSection>

        <FormSection title="Parcelamento">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="installments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Parcelas (1-36)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={36}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {installmentsCount > 1 && (
              <div className="flex items-end">
                <p className="text-sm text-muted-foreground">
                  {installmentsCount}x de{" "}
                  {installmentValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
            )}
          </div>
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
