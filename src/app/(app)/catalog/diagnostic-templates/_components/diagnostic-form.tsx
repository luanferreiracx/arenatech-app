"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type z } from "zod";
import { useRouter } from "next/navigation";
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
import { Switch } from "@/components/ui/switch";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { createDiagnosticTemplateSchema } from "@/lib/validators/catalog";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

type FormValues = z.infer<typeof createDiagnosticTemplateSchema>;

interface DiagnosticFormProps {
  defaultValues?: Partial<FormValues> & { id?: string };
  mode?: "create" | "edit";
}

export function DiagnosticForm({ defaultValues, mode = "create" }: DiagnosticFormProps) {
  const trpc = useTRPC();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(createDiagnosticTemplateSchema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      content: defaultValues?.content ?? "",
      category: defaultValues?.category ?? "",
      active: defaultValues?.active ?? true,
    },
  });

  const createMutation = useMutation(
    trpc.catalog.createDiagnosticTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template criado!");
        router.push("/catalog/diagnostic-templates");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.catalog.updateDiagnosticTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template atualizado!");
        router.push("/catalog/diagnostic-templates");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const onSubmit = (values: FormValues) => {
    if (mode === "edit" && defaultValues?.id) {
      updateMutation.mutate({ id: defaultValues.id, ...values });
    } else {
      createMutation.mutate(values);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
        <FormSection title="Template de Diagnóstico">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Diagnóstico Padrão iPhone" {...field} />
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
                    <Input placeholder="Ex: Smartphone" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conteúdo *</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Descreva o diagnóstico..."
                    rows={8}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="active"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="mb-2">Ativo</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </FormSection>

        <FormActions
          isLoading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => router.push("/catalog/diagnostic-templates")}
          submitLabel={mode === "edit" ? "Salvar" : "Criar Template"}
        />
      </form>
    </Form>
  );
}
