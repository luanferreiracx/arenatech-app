"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  createDeviceSchema,
  type CreateDeviceInput,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";

interface DeviceFormProps {
  defaultValues?: CreateDeviceInput & { id?: string };
  isEdit?: boolean;
}

const NO_CATEGORY = "__none__";

export function DeviceForm({ defaultValues, isEdit = false }: DeviceFormProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: categories } = useQuery(
    trpc.catalog.listDeviceCategories.queryOptions(),
  );

  const form = useForm<CreateDeviceInput>({
    resolver: zodResolver(createDeviceSchema),
    defaultValues: defaultValues ?? {
      categoryId: null,
      brand: "",
      model: "",
    },
  });

  const createMutation = useMutation(
    trpc.catalog.createDevice.mutationOptions({
      onSuccess: () => {
        toast.success("Aparelho cadastrado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        router.push("/catalog/devices");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.catalog.updateDevice.mutationOptions({
      onSuccess: () => {
        toast.success("Aparelho atualizado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        router.push("/catalog/devices");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(data: CreateDeviceInput) {
    if (isEdit && defaultValues?.id) {
      updateMutation.mutate({ ...data, id: defaultValues.id });
    } else {
      createMutation.mutate(data);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormSection title="Dados do Aparelho">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Apple, Samsung" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: iPhone 15 Pro, Galaxy S24" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    value={field.value ?? NO_CATEGORY}
                    onValueChange={(v) => field.onChange(v === NO_CATEGORY ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormActions
          isLoading={isPending}
          onCancel={() => router.push("/catalog/devices")}
          submitLabel={isEdit ? "Salvar Alteracoes" : "Cadastrar Aparelho"}
        />
      </form>
    </Form>
  );
}
