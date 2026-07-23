"use client";

import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/inputs/money-input";
import { EntitySelector } from "@/components/domain/entity-selector";
import { VariationPicker } from "@/components/inputs/variation-picker";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/toast";
import {
  stockEntryBatchSchema,
  type StockEntryBatchInput,
} from "@/lib/validators/stock";
import { blockEnterSubmit } from "@/lib/utils/form-keyboard";

type ProductSearchResult = {
  id: string;
  name: string;
  sku: string | null;
  hasVariations: boolean;
};

type SupplierSearchResult = {
  id: string;
  name: string;
  tradeName?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
};

const emptyItem = {
  productId: "",
  variationId: null as string | null,
  quantity: 1,
  unitCost: 0,
};

export default function StockEntryPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<StockEntryBatchInput>({
    resolver: zodResolver(stockEntryBatchSchema),
    defaultValues: {
      supplierId: null,
      items: [emptyItem],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Por linha: o produto selecionado tem variacoes? (usado pra mostrar o picker).
  // Map<fieldId, hasVariations> — sobrevive a remocoes pq useFieldArray gera id estavel.
  const [hasVariationsByField, setHasVariationsByField] = useState<Record<string, boolean>>({});

  const entryMutation = useMutation(
    trpc.stock.stockEntryBatch.mutationOptions({
      onSuccess: (res) => {
        toast.success(`${res.count} entrada(s) registrada(s).`);
        queryClient.invalidateQueries({ queryKey: trpc.stock.list.queryKey() });
        router.push("/stock");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div>
      <PageHeader
        title="Entrada de Estoque"
        subtitle="Adicione varios produtos de uma vez compartilhando o fornecedor"
      />

      <form
        onSubmit={form.handleSubmit(
          (data) => entryMutation.mutate(data),
          () => toast.error("Revise os campos destacados antes de registrar a entrada."),
        )}
        onKeyDown={blockEnterSubmit}
        className="space-y-6"
      >
        {/* Header: dados compartilhados pelo lote */}
        <FormSection title="Dados da entrada">
          <div className="space-y-2 sm:max-w-md">
            <Label>Fornecedor</Label>
            <EntitySelector<SupplierSearchResult>
              value={form.watch("supplierId") ?? ""}
              onChange={(v) => form.setValue("supplierId", v || null)}
              searchFn={async (search) => {
                return queryClient.fetchQuery(
                  trpc.stock.searchSuppliers.queryOptions({ search }),
                ) as Promise<SupplierSearchResult[]>;
              }}
              getOptionLabel={(s) =>
                `${s.tradeName || s.name}${(s.cpf || s.cnpj) ? ` — ${s.cpf || s.cnpj}` : ""}`
              }
              getOptionValue={(s) => s.id}
              placeholder="Buscar fornecedor..."
            />
          </div>
        </FormSection>

        {/* Itens do lote */}
        <FormSection title="Produtos">
          <div className="space-y-4">
            {fields.map((field, idx) => {
              const productId = form.watch(`items.${idx}.productId`) || null;
              const showVariation = !!hasVariationsByField[field.id];
              return (
                <div
                  key={field.id}
                  className="border border-border rounded-md p-4 space-y-3 bg-card/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Item {idx + 1}
                    </span>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          remove(idx);
                          setHasVariationsByField((prev) => {
                            const next = { ...prev };
                            delete next[field.id];
                            return next;
                          });
                        }}
                        aria-label={`Remover item ${idx + 1}`}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Produto *</Label>
                    <EntitySelector<ProductSearchResult>
                      value={productId ?? undefined}
                      onChange={(v) => {
                        form.setValue(`items.${idx}.productId`, v ?? "");
                        form.setValue(`items.${idx}.variationId`, null);
                        if (!v) {
                          setHasVariationsByField((prev) => ({
                            ...prev,
                            [field.id]: false,
                          }));
                        }
                      }}
                      onSelect={(p) => {
                        setHasVariationsByField((prev) => ({
                          ...prev,
                          [field.id]: p.hasVariations,
                        }));
                      }}
                      searchFn={async (search) => {
                        return queryClient.fetchQuery(
                          trpc.stock.searchProducts.queryOptions({ search }),
                        ) as Promise<ProductSearchResult[]>;
                      }}
                      getOptionLabel={(p) =>
                        `${p.name}${p.sku ? ` (${p.sku})` : ""}`
                      }
                      getOptionValue={(p) => p.id}
                      placeholder="Buscar produto..."
                    />
                    {form.formState.errors.items?.[idx]?.productId && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.items[idx]?.productId?.message}
                      </p>
                    )}
                    {showVariation && (
                      <VariationPicker
                        productId={productId}
                        value={form.watch(`items.${idx}.variationId`) ?? null}
                        onChange={(v) =>
                          form.setValue(`items.${idx}.variationId`, v)
                        }
                        showStock
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quantidade *</Label>
                      <Input
                        type="number"
                        min={1}
                        {...form.register(`items.${idx}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                      {form.formState.errors.items?.[idx]?.quantity && (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.items[idx]?.quantity?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Custo Unitario</Label>
                      <MoneyInput
                        value={form.watch(`items.${idx}.unitCost`) ?? 0}
                        onChange={(v) =>
                          form.setValue(`items.${idx}.unitCost`, v)
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              onClick={() => append(emptyItem)}
              className="w-full gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar produto
            </Button>

            {form.formState.errors.items?.root && (
              <p className="text-xs text-destructive">
                {form.formState.errors.items.root.message}
              </p>
            )}
          </div>
        </FormSection>

        <FormActions
          isLoading={entryMutation.isPending}
          submitLabel="Registrar Entradas"
          onCancel={() => router.push("/stock")}
        />
      </form>
    </div>
  );
}
