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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const assistanceSchema = z.object({
  termsOfService: z.string().optional(),
  warrantyPolicy: z.string().optional(),
  installmentsNoInterest: z.number().int().min(1).max(24),
  pixDiscount: z.number().min(0).max(100),
});

type AssistanceInput = z.infer<typeof assistanceSchema>;

export default function AssistanceSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(trpc.settings.getAssistance.queryOptions());

  const form = useForm<AssistanceInput>({
    resolver: zodResolver(assistanceSchema),
    values: data
      ? {
          termsOfService: data.termsOfService ?? "",
          warrantyPolicy: data.warrantyPolicy ?? "",
          installmentsNoInterest: data.installmentsNoInterest ?? 12,
          pixDiscount: Number(data.pixDiscount ?? 5),
        }
      : undefined,
  });

  const mutation = useMutation(
    trpc.settings.updateAssistance.mutationOptions({
      onSuccess: () => {
        toast.success("Configurações de assistência atualizadas!");
        void queryClient.invalidateQueries({ queryKey: [["settings"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Assistência"
        subtitle="Termos e políticas da assistência técnica"
      />

      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
        <FormSection title="Termos de serviço">
          <div className="space-y-2">
            <Label>Termos de serviço (exibido na OS)</Label>
            <Textarea
              {...form.register("termsOfService")}
              rows={8}
              placeholder="Descreva os termos de serviço da sua assistência..."
            />
          </div>
        </FormSection>

        <FormSection title="Política de garantia">
          <div className="space-y-2">
            <Label>Política de garantia (exibido na OS e PDV)</Label>
            <Textarea
              {...form.register("warrantyPolicy")}
              rows={8}
              placeholder="Descreva a política de garantia..."
            />
          </div>
        </FormSection>

        <FormSection title="Orçamentos de serviço (WhatsApp)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Parcelas sem juros (até)</Label>
              <Input
                type="number"
                min={1}
                max={24}
                {...form.register("installmentsNoInterest", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Numero maximo de parcelas sem juros oferecidas nos orcamentos enviados via WhatsApp.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Desconto PIX (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                {...form.register("pixDiscount", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Percentual de desconto a vista (PIX/especie) exibido no orcamento.
              </p>
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
