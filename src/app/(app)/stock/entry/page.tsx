"use client";

import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import { EntitySelector } from "@/components/domain/entity-selector";
import { toast } from "@/lib/toast";
import { stockEntrySchema, type StockEntryInput } from "@/lib/validators/stock";

export default function StockEntryPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<StockEntryInput>({
    resolver: zodResolver(stockEntrySchema),
    defaultValues: {
      productId: "",
      quantity: 1,
      unitCost: 0,
      reason: "",
      supplierId: null,
    },
  });

  const entryMutation = useMutation(
    trpc.stock.stockEntry.mutationOptions({
      onSuccess: () => {
        toast.success("Entrada de estoque registrada");
        queryClient.invalidateQueries({ queryKey: trpc.stock.list.queryKey() });
        router.push("/stock");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div>
      <PageHeader title="Entrada de Estoque" subtitle="Registre a entrada de produtos no estoque" />

      <form onSubmit={form.handleSubmit((data) => entryMutation.mutate(data))} className="space-y-6">
        <FormSection title="Produto">
          <div className="space-y-2">
            <Label>Produto *</Label>
            <EntitySelector
              value={form.watch("productId")}
              onChange={(v) => form.setValue("productId", v ?? "")}
              searchFn={async (search) => {
                return queryClient.fetchQuery(
                  trpc.stock.searchProducts.queryOptions({ search }),
                );
              }}
              getOptionLabel={(p) => `${p.name}${p.sku ? ` (${p.sku})` : ""}`}
              getOptionValue={(p) => p.id}
              placeholder="Buscar produto..."
            />
            {form.formState.errors.productId && (
              <p className="text-xs text-destructive">{form.formState.errors.productId.message}</p>
            )}
          </div>
        </FormSection>

        <FormSection title="Detalhes da Entrada">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input
                type="number"
                min={1}
                {...form.register("quantity", { valueAsNumber: true })}
              />
              {form.formState.errors.quantity && (
                <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Custo Unitario</Label>
              <MoneyInput
                value={form.watch("unitCost") ?? 0}
                onChange={(v) => form.setValue("unitCost", v)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <EntitySelector
                value={form.watch("supplierId") ?? ""}
                onChange={(v) => form.setValue("supplierId", v || null)}
                searchFn={async (search) => {
                  return queryClient.fetchQuery(
                    trpc.stock.searchSuppliers.queryOptions({ search }),
                  );
                }}
                getOptionLabel={(s) => `${s.tradeName || s.name}${(s.cpf || s.cnpj) ? ` — ${s.cpf || s.cnpj}` : ""}`}
                getOptionValue={(s) => s.id}
                placeholder="Buscar fornecedor..."
              />
            </div>
          </div>
          <div className="space-y-2 mt-4">
            <Label>Motivo *</Label>
            <Input {...form.register("reason")} placeholder="Ex: Compra de fornecedor, devolucao..." />
            {form.formState.errors.reason && (
              <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
            )}
          </div>
        </FormSection>

        <FormActions
          isLoading={entryMutation.isPending}
          submitLabel="Registrar Entrada"
          onCancel={() => router.push("/stock")}
        />
      </form>
    </div>
  );
}
