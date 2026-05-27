"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import { createInvoiceSchema, type CreateInvoiceInput } from "@/lib/validators/fiscal";

export function InvoiceForm() {
  const router = useRouter();
  const trpc = useTRPC();

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

  const createMutation = useMutation(trpc.fiscal.create.mutationOptions());

  const onSubmit = (data: CreateInvoiceInput) => {
    createMutation.mutate(data, {
      onSuccess: (result) => {
        toast.success("Nota fiscal criada com sucesso");
        router.push(`/fiscal/${result.id}`);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
      <FormSection title="Dados da Nota">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Tipo</Label>
            <Select
              value={form.watch("type")}
              onValueChange={(v) => form.setValue("type", v as "NFE" | "NFCE" | "NFSE")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NFE">NF-e</SelectItem>
                <SelectItem value="NFCE">NFC-e</SelectItem>
                <SelectItem value="NFSE">NFS-e</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome Destinatario</Label>
            <Input {...form.register("recipientName")} placeholder="Nome do destinatario" />
            {form.formState.errors.recipientName && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.recipientName.message}</p>
            )}
          </div>
          <div>
            <Label>CPF/CNPJ</Label>
            <Input {...form.register("recipientCpfCnpj")} placeholder="CPF ou CNPJ" />
            {form.formState.errors.recipientCpfCnpj && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.recipientCpfCnpj.message}</p>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection title="Itens">
        {fields.map((field, index) => (
          <Card key={field.id} className="mb-3">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div className="md:col-span-2">
                  <Label>Descricao</Label>
                  <Input {...form.register(`items.${index}.description`)} placeholder="Descricao do item" />
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <Label>Preco Unit. (R$)</Label>
                  <MoneyInput
                    value={form.watch(`items.${index}.unitPrice`)}
                    onChange={(v) => form.setValue(`items.${index}.unitPrice`, v)}
                  />
                </div>
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label="Remover item da NF"
                    onClick={() => fields.length > 1 && remove(index)}
                    disabled={fields.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}
        >
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Item
        </Button>
      </FormSection>

      <FormActions
        submitLabel="Criar Nota Fiscal"
        isLoading={createMutation.isPending}
        onCancel={() => router.push("/fiscal")}
      />
    </form>
  );
}
