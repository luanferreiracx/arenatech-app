"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  createInvoiceSchema,
  invoiceTypeValues,
  invoiceTypeLabels,
  type CreateInvoiceInput,
} from "@/lib/validators/fiscal";

export function InvoiceForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateInvoiceInput>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      type: "NFE",
      recipientName: "",
      recipientCpfCnpj: "",
      items: [{ description: "", quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const createMutation = useMutation(
    trpc.fiscal.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Nota fiscal criada como rascunho");
        router.push(`/fiscal/${data.id}`);
      },
      onError: (err) => {
        toast.error(err.message);
        setSubmitting(false);
      },
    }),
  );

  const onSubmit = (data: CreateInvoiceInput) => {
    setSubmitting(true);
    createMutation.mutate(data);
  };

  const watchItems = form.watch("items");
  const totalAmount = watchItems.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
    0,
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FormSection title="Dados da Nota">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select
              value={form.watch("type")}
              onValueChange={(v) => form.setValue("type", v as CreateInvoiceInput["type"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {invoiceTypeValues.map((t) => (
                  <SelectItem key={t} value={t}>
                    {invoiceTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.type && (
              <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Nome do Destinatário</Label>
            <Input {...form.register("recipientName")} placeholder="Nome ou razão social" />
          </div>
          <div className="space-y-2">
            <Label>CPF/CNPJ do Destinatário</Label>
            <Input {...form.register("recipientCpfCnpj")} placeholder="000.000.000-00" />
          </div>
        </div>
      </FormSection>

      <FormSection title="Itens">
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap gap-2 items-end border-b pb-3">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label className="text-xs">Descrição *</Label>
                <Input
                  {...form.register(`items.${index}.description`)}
                  placeholder="Descrição do item"
                />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">Qtd *</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                />
              </div>
              <div className="w-36 space-y-1">
                <Label className="text-xs">Valor Unit. *</Label>
                <MoneyInput
                  value={Math.round((watchItems[index]?.unitPrice ?? 0) * 100)}
                  onChange={(val) => form.setValue(`items.${index}.unitPrice`, val / 100)}
                />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">NCM</Label>
                <Input {...form.register(`items.${index}.ncm`)} placeholder="NCM" />
              </div>
              <div className="w-20 space-y-1">
                <Label className="text-xs">CFOP</Label>
                <Input {...form.register(`items.${index}.cfop`)} placeholder="CFOP" />
              </div>
              <div className="w-28 text-right pt-5">
                <span className="text-sm font-medium">
                  {((watchItems[index]?.quantity ?? 0) * (watchItems[index]?.unitPrice ?? 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}

          {form.formState.errors.items && (
            <p className="text-xs text-destructive">{form.formState.errors.items.message}</p>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Item
            </Button>
            <div className="text-lg font-bold">
              Total: {totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
        </div>
      </FormSection>

      <FormActions
        isLoading={submitting}
        submitLabel="Criar Rascunho"
        onCancel={() => router.push("/fiscal")}
      />
    </form>
  );
}
