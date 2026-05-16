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
import { EntitySelector } from "@/components/domain/entity-selector";
import { toast } from "@/lib/toast";
import { stockExitSchema, type StockExitInput } from "@/lib/validators/stock";

export default function StockExitPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<StockExitInput>({
    resolver: zodResolver(stockExitSchema),
    defaultValues: { productId: "", quantity: 1, reason: "" },
  });

  const exitMutation = useMutation(
    trpc.stock.stockExit.mutationOptions({
      onSuccess: () => {
        toast.success("Baixa de estoque registrada");
        queryClient.invalidateQueries({ queryKey: trpc.stock.list.queryKey() });
        router.push("/stock");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div>
      <PageHeader title="Baixa de Estoque" subtitle="Registre a saida de produtos do estoque" />

      <form onSubmit={form.handleSubmit((data) => exitMutation.mutate(data))} className="space-y-6">
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
              getOptionLabel={(p) => `${p.name}`}
              getOptionValue={(p) => p.id}
              placeholder="Buscar produto..."
            />
          </div>
        </FormSection>

        <FormSection title="Detalhes da Baixa">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input type="number" min={1} {...form.register("quantity", { valueAsNumber: true })} />
            </div>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Input {...form.register("reason")} placeholder="Ex: Produto avariado, perda, doacao..." />
            </div>
          </div>
        </FormSection>

        <FormActions
          isLoading={exitMutation.isPending}
          submitLabel="Registrar Baixa"
          onCancel={() => router.push("/stock")}
        />
      </form>
    </div>
  );
}
