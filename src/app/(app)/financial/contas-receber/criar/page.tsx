"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { MoneyInput } from "@/components/inputs/money-input";
import { todayBrtISO } from "@/lib/utils/date-range";
import { DateInput } from "@/components/inputs/date-input";
import { FinancialCategorySelect } from "@/components/domain/forms/financial-category-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateInstallments } from "@/server/services/installment-generator.service";

// Form for creating RECEIVABLE transactions (contas a receber)
// Decision: separate forms for CR and CP per SPEC seção 4.4
// The generic /financial/new still works as fallback but is not linked in menu

interface FormValues {
  description: string;
  totalAmount: number; // centavos
  numInstallments: number;
  emissionDate: string;
  firstDueDate: string;
  paymentMethod: string;
  customerName: string;
  category: string;
  notes: string;
}


export default function CreateReceivablePage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    defaultValues: {
      description: "",
      totalAmount: 0,
      numInstallments: 1,
      emissionDate: todayBrtISO(),
      firstDueDate: "",
      paymentMethod: "dinheiro",
      customerName: "",
      category: "",
      notes: "",
    },
  });

  const totalAmount = form.watch("totalAmount");
  const numInstallments = form.watch("numInstallments");
  const firstDueDate = form.watch("firstDueDate");

  // Generate preview — mesma função que financial.create usa (fonte única):
  // o que aparece aqui é exatamente o que será gravado. totalAmount já em centavos.
  const preview = totalAmount > 0 && numInstallments >= 1 && firstDueDate
    ? generateInstallments(totalAmount, numInstallments, new Date(firstDueDate))
    : [];

  const createMut = useMutation(
    trpc.financial.create.mutationOptions({
      onSuccess: (result) => {
        toast.success("Conta a receber criada");
        queryClient.invalidateQueries({ queryKey: [["financial"]] });
        router.push(`/financial/${result.id}`);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  function onSubmit(data: FormValues) {
    createMut.mutate({
      type: "RECEIVABLE",
      description: data.description,
      totalAmount: data.totalAmount,
      numInstallments: data.numInstallments,
      emissionDate: data.emissionDate,
      firstDueDate: data.firstDueDate || undefined,
      paymentMethod: data.paymentMethod || undefined,
      customerName: data.customerName || undefined,
      category: data.category || undefined,
      notes: data.notes || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Nova Conta a Receber" />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormSection title="Dados da Conta">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome do cliente" />
                    </FormControl>
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
                      <Input {...field} placeholder="Ex: Venda manual" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <FormControl>
                      <FinancialCategorySelect
                        value={field.value}
                        onChange={field.onChange}
                        transactionType="RECEIVABLE"
                      />
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
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forma de Pagamento</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="dinheiro, pix, cartao_credito" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numInstallments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parcelas</FormLabel>
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
              <FormField
                control={form.control}
                name="firstDueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primeiro Vencimento</FormLabel>
                    <FormControl>
                      <DateInput
                        value={(field.value as string) ?? ""}
                        onChange={field.onChange}
                        aria-label="Primeiro vencimento"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection title="Observações">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea {...field} placeholder="Observações (opcional)" rows={3} />
                  </FormControl>
                </FormItem>
              )}
            />
          </FormSection>

          {preview.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview de Parcelas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {preview.map((p) => (
                    <div key={p.number} className="flex justify-between">
                      <span>Parcela {p.number}: {formatCurrency(p.amountCents)}</span>
                      <span className="text-muted-foreground">{p.dueDate.toLocaleDateString("pt-BR")}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium border-t pt-1 mt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <FormActions
            isLoading={createMut.isPending}
            onCancel={() => router.push("/financial")}
            submitLabel="Criar Conta a Receber"
          />
        </form>
      </Form>
    </div>
  );
}
