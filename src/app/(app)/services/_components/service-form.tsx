"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  createServiceSchema,
  type CreateServiceInput,
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
import { MoneyInput } from "@/components/inputs/money-input";

/** Valor sentinela do select para "criar um tipo novo" (nao e um uuid). */
const NOVO_TIPO_OPTION = "__novo__";

interface ServiceFormProps {
  defaultValues?: CreateServiceInput & { id?: string };
  isEdit?: boolean;
}

export function ServiceForm({ defaultValues, isEdit = false }: ServiceFormProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<CreateServiceInput>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: defaultValues ?? {
      serviceTypeId: null,
      newServiceTypeName: null,
      deviceModel: "",
      description: "",
      basePrice: 0,
      estimatedTime: "",
    },
  });

  const { data: serviceTypes } = useQuery(trpc.catalog.listServiceTypes.queryOptions());

  const createMutation = useMutation(
    trpc.catalog.createService.mutationOptions({
      onSuccess: () => {
        toast.success("Servico cadastrado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        router.push("/services/manage");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.catalog.updateService.mutationOptions({
      onSuccess: () => {
        toast.success("Servico atualizado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        router.push("/services/manage");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(data: CreateServiceInput) {
    if (isEdit && defaultValues?.id) {
      updateMutation.mutate({ ...data, id: defaultValues.id });
    } else {
      createMutation.mutate(data);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormSection title="Dados do Servico">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/*
              Auditoria 2026-07-25 (item 17): era um Input de texto livre. Quem
              digitasse "troca de tela" criava um tipo separado de "Troca de
              Tela" — os dois apareciam na lista com o mesmo nome aos olhos de
              quem le, mas o reajuste em massa e o filtro so pegavam um deles.
              Agora escolhe da lista, ou cria um tipo novo explicitamente
              (mesmo padrao da marca no cadastro de produto).
            */}
            <FormField
              control={form.control}
              name="serviceTypeId"
              render={({ field }) => {
                const criandoNovo = form.watch("newServiceTypeName") != null;
                return (
                  <FormItem>
                    <FormLabel>Tipo de Servico *</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={criandoNovo ? NOVO_TIPO_OPTION : field.value ?? ""}
                        onChange={(e) => {
                          if (e.target.value === NOVO_TIPO_OPTION) {
                            field.onChange(null);
                            form.setValue("newServiceTypeName", "");
                          } else {
                            field.onChange(e.target.value || null);
                            form.setValue("newServiceTypeName", null);
                          }
                        }}
                      >
                        <option value="">Selecione o tipo</option>
                        {serviceTypes?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                        <option value={NOVO_TIPO_OPTION}>+ Novo tipo...</option>
                      </select>
                    </FormControl>
                    {criandoNovo && (
                      <FormField
                        control={form.control}
                        name="newServiceTypeName"
                        render={({ field: nameField }) => (
                          <FormItem className="mt-2">
                            <FormControl>
                              <Input
                                autoFocus
                                placeholder="Nome do novo tipo (ex: Troca de Tela)"
                                value={nameField.value ?? ""}
                                onChange={(e) => nameField.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="deviceModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo do Aparelho *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: iPhone 15 Pro" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="basePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preco *</FormLabel>
                  <FormControl>
                    <MoneyInput
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tempo Estimado</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Ex: 1 hora, 30 min" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Descricao">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descricao</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Descricao do servico (opcional)"
                    rows={4}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormActions
          isLoading={isPending}
          onCancel={() => router.push("/services/manage")}
          submitLabel={isEdit ? "Salvar Alteracoes" : "Cadastrar Servico"}
        />
      </form>
    </Form>
  );
}
