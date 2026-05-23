"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntitySelector } from "@/components/domain/entity-selector";
import { toast } from "@/lib/toast";
import {
  stockExitSchema,
  type StockExitInput,
  STOCK_WRITEOFF_REASONS,
} from "@/lib/validators/stock";

export default function StockExitPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reasonCode, setReasonCode] = useState<string>("danificado");
  const [reasonDetail, setReasonDetail] = useState<string>("");

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

  const submit = form.handleSubmit((data) => {
    const label = STOCK_WRITEOFF_REASONS.find((r) => r.code === reasonCode)?.label ?? reasonCode;
    const reason = reasonDetail.trim()
      ? `${label}: ${reasonDetail.trim()}`
      : label;
    exitMutation.mutate({ ...data, reason });
  });

  return (
    <div>
      <PageHeader title="Baixa de Estoque" subtitle="Registre a saida de produtos do estoque" />

      <form onSubmit={submit} className="space-y-6">
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
              <Label>Motivo da baixa *</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_WRITEOFF_REASONS.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Detalhes (opcional)</Label>
            <Textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Numero da NF de devolucao, descricao do dano, etc."
              rows={2}
            />
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
