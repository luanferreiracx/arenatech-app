"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { LoadingState } from "@/components/domain/loading-state";
import { MoneyInput } from "@/components/inputs/money-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const receivingSchema = z.object({
  minInstallmentAmount: z.number().int().min(0),
  maxDiscountPercentNonAdmin: z.number().int().min(0).max(100).nullable(),
});

type ReceivingInput = z.infer<typeof receivingSchema>;

export default function ReceivingSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(trpc.settings.getReceiving.queryOptions());

  const form = useForm<ReceivingInput>({
    resolver: zodResolver(receivingSchema),
    values: data
      ? {
          minInstallmentAmount: data.minInstallmentAmount,
          maxDiscountPercentNonAdmin: data.maxDiscountPercentNonAdmin,
        }
      : undefined,
  });

  const mutation = useMutation(
    trpc.settings.updateReceiving.mutationOptions({
      onSuccess: () => {
        toast.success("Regras de venda atualizadas!");
        void queryClient.invalidateQueries({ queryKey: [["settings"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Regras de Venda"
        subtitle="Limites aplicados automaticamente ao finalizar uma venda no PDV"
      />

      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="mt-6 space-y-6">
        <FormSection title="Regras de venda">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor mínimo para parcelamento</Label>
              <MoneyInput
                value={form.watch("minInstallmentAmount")}
                onChange={(v: number) => form.setValue("minInstallmentAmount", v)}
              />
              <p className="text-xs text-muted-foreground">
                Cada parcela do cartão precisa ser maior ou igual a este valor.
                Zero desliga a regra.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Desconto máximo (não-administradores)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="Sem limite"
                value={form.watch("maxDiscountPercentNonAdmin") ?? ""}
                onChange={(e) =>
                  form.setValue(
                    "maxDiscountPercentNonAdmin",
                    e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))),
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Teto de desconto (%) no PDV para quem não é administrador — vale
                para o desconto do carrinho e para alterar o preço do item.
                Administradores não têm limite. Vazio = sem limite.
              </p>
            </div>
          </div>
        </FormSection>

        <FormActions submitLabel="Salvar" isLoading={mutation.isPending} />
      </form>
    </div>
  );
}
