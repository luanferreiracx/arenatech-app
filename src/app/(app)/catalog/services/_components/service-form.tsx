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
import { createServiceSchema } from "@/lib/validators/catalog";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

type FormValues = z.infer<typeof createServiceSchema>;

interface ServiceFormProps {
  defaultValues?: Partial<FormValues> & { id?: string };
  mode?: "create" | "edit";
}

export function ServiceForm({ defaultValues, mode = "create" }: ServiceFormProps) {
  const trpc = useTRPC();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      basePrice: defaultValues?.basePrice ?? 0,
      active: defaultValues?.active ?? true,
    },
  });

  const createMutation = useMutation(
    trpc.catalog.createService.mutationOptions({
      onSuccess: () => {
        toast.success("Serviço criado com sucesso!");
        router.push("/catalog/services");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.catalog.updateService.mutationOptions({
      onSuccess: () => {
        toast.success("Serviço atualizado com sucesso!");
        router.push("/catalog/services");
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

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
        <FormSection title="Dados do Serviço">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl>
                  <Input placeholder="Troca de tela" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Descrição do serviço..."
                    {...field}
                    value={field.value ?? ""}
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="basePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço Base (R$) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0,00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
          </div>
        </FormSection>

        <FormActions
          isLoading={isLoading}
          onCancel={() => router.push("/catalog/services")}
          submitLabel={mode === "edit" ? "Salvar Alterações" : "Criar Serviço"}
        />
      </form>
    </Form>
  );
}
