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
import { Label } from "@/components/ui/label";

const assistanceSchema = z.object({
  termsOfService: z.string().optional(),
  warrantyPolicy: z.string().optional(),
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

        <FormActions
          submitLabel="Salvar"
          isLoading={mutation.isPending}
        />
      </form>
    </div>
  );
}
