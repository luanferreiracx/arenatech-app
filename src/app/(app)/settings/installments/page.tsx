"use client";

import { useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { LoadingState } from "@/components/domain/loading-state";
import { useIsSuperAdmin } from "@/lib/auth/use-tenant-admin";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateSimulatorConfigSchema,
  type UpdateSimulatorConfigInput,
} from "@/lib/validators/simulator";
import { defaultSimulatorTiers } from "@/lib/simulator-defaults";

export default function SimulatorRatesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Taxas do simulador são precificação controlada pela Arena Tech
  // (updateConfig = superAdminTenantProcedure). Admin de tenant comum vê, mas
  // não edita — sem gate, veria um form que só daria erro ao salvar.
  const isSuperAdmin = useIsSuperAdmin();

  const { data, isLoading } = useQuery(trpc.simulator.getConfig.queryOptions());

  const form = useForm<UpdateSimulatorConfigInput>({
    resolver: zodResolver(updateSimulatorConfigSchema),
    values: data
      ? {
          creditAvistaFeePercent: data.creditAvistaFeePercent,
          debitFeePercent: data.debitFeePercent,
          maxInstallments: data.maxInstallments,
          // Garante uma linha para cada parcela 2x..36x (preenche faltantes com 0)
          tiers: fillTiers(data.tiers),
        }
      : undefined,
  });

  const { fields } = useFieldArray({
    control: form.control,
    name: "tiers",
  });

  const maxInstallments = form.watch("maxInstallments");

  const mutation = useMutation(
    trpc.simulator.updateConfig.mutationOptions({
      onSuccess: () => {
        toast.success("Taxas do simulador atualizadas!");
        void queryClient.invalidateQueries({ queryKey: [["simulator"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const installmentOptions = useMemo(
    () => Array.from({ length: 35 }, (_, i) => i + 2), // 2..36
    [],
  );

  function handleRestoreDefaults() {
    const defaults = defaultSimulatorTiers();
    form.setValue("creditAvistaFeePercent", 0, { shouldDirty: true });
    form.setValue("debitFeePercent", 0, { shouldDirty: true });
    form.setValue("maxInstallments", 12, { shouldDirty: true });
    defaults.forEach((t, idx) => {
      form.setValue(`tiers.${idx}.feePercent`, t.feePercent, {
        shouldDirty: true,
      });
    });
    toast.info("Taxas-padrao restauradas — clique em Salvar para confirmar.");
  }

  function onSubmit(values: UpdateSimulatorConfigInput) {
    // `installments` NAO e um input registrado (so `feePercent` e) — ao submeter
    // pode vir undefined e derrubar o filtro, apagando TODOS os tiers (bug do
    // "nao salva"). Deriva do indice (tiers sempre 2..36 em ordem) e envia so
    // ate o maximo de parcelas configurado.
    const tiers = values.tiers
      .map((t, idx) => ({ installments: idx + 2, feePercent: t.feePercent }))
      .filter((t) => t.installments <= values.maxInstallments);
    mutation.mutate({ ...values, tiers });
  }

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Taxas do Simulador"
        subtitle="Taxas exibidas ao cliente no simulador de parcelamento — independentes das taxas reais do PDV/financeiro"
      />

      <div className="mb-6 rounded-md border border-amber-300/40 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
        Estas sao as taxas que o <strong>cliente paga</strong> — geralmente
        superiores a taxa real cobrada pela operadora, para mitigar risco
        operacional. Nao afetam o calculo de receita liquida do PDV.
      </div>

      {!isSuperAdmin && (
        <div className="mb-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Estas taxas são definidas pela Arena Tech. Você pode visualizá-las, mas
          a alteração é exclusiva do suporte.
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormSection title="Pagamentos a vista">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Taxa Credito a vista (%)</Label>
              <Input
                type="number"
                min={0}
                max={99.99}
                step={0.01}
                {...form.register("creditAvistaFeePercent", {
                  valueAsNumber: true,
                })}
              />
            </div>
            <div className="space-y-2">
              <Label>Taxa Debito (%)</Label>
              <Input
                type="number"
                min={0}
                max={99.99}
                step={0.01}
                {...form.register("debitFeePercent", { valueAsNumber: true })}
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Prazo maximo de parcelamento">
          <div className="space-y-2 max-w-xs">
            <Label>Numero maximo de parcelas (2 a 36)</Label>
            <Select
              value={String(maxInstallments)}
              onValueChange={(v) =>
                form.setValue("maxInstallments", Number(v), {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {installmentOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}x
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O simulador mostrara opcoes de 2x ate o valor selecionado (somente
              parcelas com taxa maior que zero).
            </p>
          </div>
        </FormSection>

        <FormSection title="Taxas por parcela (%)">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {fields.map((field, idx) => {
              const installments = idx + 2; // tiers sempre 2..36 em ordem
              if (installments > maxInstallments) return null;
              return (
                <div key={field.id} className="space-y-1">
                  <Label className="text-xs">{installments}x</Label>
                  <Input
                    type="number"
                    min={0}
                    max={99.99}
                    step={0.01}
                    {...form.register(`tiers.${idx}.feePercent`, {
                      valueAsNumber: true,
                    })}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRestoreDefaults}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar taxas-padrao
            </Button>
          </div>
        </FormSection>

        {isSuperAdmin && (
          <FormActions submitLabel="Salvar" isLoading={mutation.isPending} />
        )}
      </form>
    </div>
  );
}

/**
 * Garante exatamente 35 linhas (2x..36x) em ordem, preenchendo as faltantes
 * com taxa 0. O index do array passa a corresponder a (installments - 2).
 */
function fillTiers(
  tiers: Array<{ installments: number; feePercent: number }>,
): UpdateSimulatorConfigInput["tiers"] {
  const byInstallments = new Map(tiers.map((t) => [t.installments, t.feePercent]));
  return Array.from({ length: 35 }, (_, i) => {
    const installments = i + 2;
    return {
      installments,
      feePercent: byInstallments.get(installments) ?? 0,
    };
  });
}
