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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { createDeviceSchema } from "@/lib/validators/catalog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

type FormValues = z.infer<typeof createDeviceSchema>;

interface DeviceFormProps {
  defaultValues?: Partial<FormValues> & { id?: string };
  mode?: "create" | "edit";
}

export function DeviceForm({ defaultValues, mode = "create" }: DeviceFormProps) {
  const trpc = useTRPC();
  const router = useRouter();

  const { data: categories = [] } = useQuery(
    trpc.catalog.listDeviceCategories.queryOptions(),
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(createDeviceSchema),
    defaultValues: {
      brand: defaultValues?.brand ?? "",
      model: defaultValues?.model ?? "",
      categoryId: defaultValues?.categoryId,
      attributes: defaultValues?.attributes,
      active: defaultValues?.active ?? true,
    },
  });

  const createMutation = useMutation(
    trpc.catalog.createDevice.mutationOptions({
      onSuccess: () => {
        toast.success("Aparelho criado!");
        router.push("/catalog/devices");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.catalog.updateDevice.mutationOptions({
      onSuccess: () => {
        toast.success("Aparelho atualizado!");
        router.push("/catalog/devices");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const onSubmit = (values: FormValues) => {
    // Validate JSON if provided
    if (values.attributes) {
      try {
        JSON.parse(values.attributes);
      } catch {
        form.setError("attributes", { message: "JSON inválido" });
        return;
      }
    }

    if (mode === "edit" && defaultValues?.id) {
      updateMutation.mutate({ id: defaultValues.id, ...values });
    } else {
      createMutation.mutate(values);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
        <FormSection title="Dados do Aparelho">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca *</FormLabel>
                  <FormControl>
                    <Input placeholder="Apple" {...field} />
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
                    <Input placeholder="iPhone 15 Pro" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}
                    defaultValue={field.value ?? "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar categoria" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categories.map((cat) => (
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

          <FormField
            control={form.control}
            name="attributes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Atributos (JSON)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder='{"cor": "Preto", "armazenamento": "256GB"}'
                    rows={4}
                    className="font-mono text-sm"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormActions
          isLoading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => router.push("/catalog/devices")}
          submitLabel={mode === "edit" ? "Salvar" : "Criar Aparelho"}
        />
      </form>
    </Form>
  );
}
