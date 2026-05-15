"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "@/lib/toast";
import {
  createInterestSchema,
  type CreateInterestInput,
  INTEREST_TYPE_LABELS,
} from "@/lib/validators/customer";

export default function NewInterestPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const form = useForm<CreateInterestInput>({
    resolver: zodResolver(createInterestSchema),
    defaultValues: {
      customerName: "",
      phone: "",
      type: "PURCHASE",
      desiredModel: "",
    },
  });

  const mutation = useMutation(
    trpc.interest.create.mutationOptions({
      onSuccess: (data: { id: string }) => {
        toast.success("Interesse cadastrado com sucesso!");
        void queryClient.invalidateQueries({ queryKey: trpc.interest.list.queryKey() });
        router.push(`/interests/${data.id}`);
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }),
  );

  function onSubmit(data: CreateInterestInput) {
    mutation.mutate(data);
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Novo interesse" />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormSection title="Dados do lead">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome do cliente *</Label>
              <Input {...form.register("customerName")} placeholder="Nome completo" />
              {form.formState.errors.customerName && (
                <p className="text-sm text-destructive">{form.formState.errors.customerName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Telefone *</Label>
              <Input {...form.register("phone")} placeholder="(00) 00000-0000" />
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input {...form.register("cpf")} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input {...form.register("email")} type="email" placeholder="email@exemplo.com" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Interesse">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de interesse *</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v: string) => form.setValue("type", v as CreateInterestInput["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTEREST_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modelo desejado *</Label>
              <Input {...form.register("desiredModel")} placeholder="Ex: iPhone 15 Pro 256GB" />
              {form.formState.errors.desiredModel && (
                <p className="text-sm text-destructive">{form.formState.errors.desiredModel.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea {...form.register("notes")} placeholder="Detalhes adicionais..." rows={3} />
          </div>
        </FormSection>

        <FormActions
          submitLabel="Cadastrar interesse"
          onCancel={() => router.push("/interests")}
          isLoading={mutation.isPending}
        />
      </form>
    </div>
  );
}
