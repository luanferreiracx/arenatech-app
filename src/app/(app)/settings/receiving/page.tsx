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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const receivingSchema = z.object({
  defaultPolicyDevice: z.enum(["STORE_ABSORBS", "CUSTOMER_PAYS"]),
  defaultPolicyNonDevice: z.enum(["STORE_ABSORBS", "CUSTOMER_PAYS"]),
  minInstallmentAmount: z.number().int().min(0),
  requireCpfAbove: z.number().int().min(0),
  maxDiscountPercentNonAdmin: z.number().int().min(0).max(100).nullable(),
  autoCloseTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  monthlySalesGoal: z.number().int().min(0).nullable(),
  defaultDasRate: z.number().min(0).max(100).nullable(),
  defaultIcmsDiffRate: z.number().min(0).max(100).nullable(),
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
          defaultPolicyDevice: data.defaultPolicyDevice as "STORE_ABSORBS" | "CUSTOMER_PAYS",
          defaultPolicyNonDevice: data.defaultPolicyNonDevice as "STORE_ABSORBS" | "CUSTOMER_PAYS",
          minInstallmentAmount: data.minInstallmentAmount,
          requireCpfAbove: data.requireCpfAbove,
          maxDiscountPercentNonAdmin: data.maxDiscountPercentNonAdmin,
          autoCloseTime: data.autoCloseTime,
          monthlySalesGoal: data.monthlySalesGoal,
          defaultDasRate: data.defaultDasRate ? Number(data.defaultDasRate) : null,
          defaultIcmsDiffRate: data.defaultIcmsDiffRate ? Number(data.defaultIcmsDiffRate) : null,
        }
      : undefined,
  });

  const mutation = useMutation(
    trpc.settings.updateReceiving.mutationOptions({
      onSuccess: () => {
        toast.success("Configurações de recebimento atualizadas!");
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
        subtitle="Políticas de venda, exigência de CPF, metas e alíquotas"
      />

      {/* D6 da auditoria de config: parte dos ajustes ja vale (min. parcela +
          CPF), o resto ainda nao — aviso honesto por campo. */}
      <div className="mb-6 rounded-md border border-info bg-info/10 p-3 text-sm">
        <strong>Já aplicados no PDV:</strong> &quot;Valor mínimo de parcela&quot; e
        &quot;Exigir CPF/CNPJ acima de&quot; — barram a finalização da venda quando
        a regra é violada.
        <br />
        <strong>Em breve:</strong> políticas de taxa, fechar caixa automático,
        metas e alíquotas ainda não são aplicados automaticamente.
      </div>

      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
        <FormSection title="Políticas de taxa">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Política padrão (aparelhos)</Label>
              <Select
                value={form.watch("defaultPolicyDevice")}
                onValueChange={(v) => form.setValue("defaultPolicyDevice", v as "STORE_ABSORBS" | "CUSTOMER_PAYS")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STORE_ABSORBS">Loja absorve a taxa</SelectItem>
                  <SelectItem value="CUSTOMER_PAYS">Cliente paga acréscimo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Política padrão (outros)</Label>
              <Select
                value={form.watch("defaultPolicyNonDevice")}
                onValueChange={(v) => form.setValue("defaultPolicyNonDevice", v as "STORE_ABSORBS" | "CUSTOMER_PAYS")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STORE_ABSORBS">Loja absorve a taxa</SelectItem>
                  <SelectItem value="CUSTOMER_PAYS">Cliente paga acréscimo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </FormSection>

        <FormSection title="Regras de venda">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor mínimo para parcelamento</Label>
              <MoneyInput
                value={form.watch("minInstallmentAmount")}
                onChange={(v: number) => form.setValue("minInstallmentAmount", v)}
              />
            </div>
            <div className="space-y-2">
              <Label>Exigir CPF acima de</Label>
              <MoneyInput
                value={form.watch("requireCpfAbove")}
                onChange={(v: number) => form.setValue("requireCpfAbove", v)}
              />
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

        <FormSection title="Caixa e metas">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Horário fechamento automático do caixa</Label>
              <Input
                type="time"
                value={form.watch("autoCloseTime") ?? ""}
                onChange={(e) => form.setValue("autoCloseTime", e.target.value || null)}
              />
              <p className="text-xs text-muted-foreground">Deixe vazio para desativar</p>
            </div>
            <div className="space-y-2">
              <Label>Meta mensal de vendas</Label>
              <MoneyInput
                value={form.watch("monthlySalesGoal") ?? 0}
                onChange={(v: number) => form.setValue("monthlySalesGoal", v || null)}
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Alíquotas tributárias">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Alíquota DAS padrão (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.watch("defaultDasRate") ?? ""}
                onChange={(e) => form.setValue("defaultDasRate", e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Alíquota ICMS diferencial (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.watch("defaultIcmsDiffRate") ?? ""}
                onChange={(e) => form.setValue("defaultIcmsDiffRate", e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
          </div>
        </FormSection>

        <FormActions
          submitLabel="Salvar"
          isLoading={mutation.isPending}
        />
      </form>
    </div>
  );
}
