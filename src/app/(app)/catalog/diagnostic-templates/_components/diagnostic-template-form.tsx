"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  createDiagnosticTemplateSchema,
  type CreateDiagnosticTemplateInput,
} from "@/lib/validators/catalog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";

interface DiagnosticTemplateFormProps {
  defaultValues?: CreateDiagnosticTemplateInput & { id?: string };
  isEdit?: boolean;
}

export function DiagnosticTemplateForm({ defaultValues, isEdit = false }: DiagnosticTemplateFormProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<CreateDiagnosticTemplateInput>({
    resolver: zodResolver(createDiagnosticTemplateSchema),
    defaultValues: defaultValues ?? {
      title: "",
      content: "",
      category: "",
    },
  });

  const createMutation = useMutation(
    trpc.catalog.createDiagnosticTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template cadastrado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        router.push("/catalog/diagnostic-templates");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.catalog.updateDiagnosticTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template atualizado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        router.push("/catalog/diagnostic-templates");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(data: CreateDiagnosticTemplateInput) {
    if (isEdit && defaultValues?.id) {
      updateMutation.mutate({ ...data, id: defaultValues.id });
    } else {
      createMutation.mutate(data);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormSection title="Dados do Template">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titulo *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Checklist de Display" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Ex: Tela, Bateria, Placa" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Conteudo">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conteudo do Template *</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Descreva os passos do diagnostico..."
                    rows={8}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormActions
          isLoading={isPending}
          onCancel={() => router.push("/catalog/diagnostic-templates")}
          submitLabel={isEdit ? "Salvar Alteracoes" : "Cadastrar Template"}
        />
      </form>
    </Form>
  );
}
