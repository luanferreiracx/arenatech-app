"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { MoneyInput } from "@/components/inputs/money-input";
import { createDevicePurchaseSchema } from "@/lib/validators/stock";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { z } from "zod";

type FormValues = z.input<typeof createDevicePurchaseSchema>;

export function DevicePurchaseForm() {
  const trpc = useTRPC();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(createDevicePurchaseSchema),
    defaultValues: {
      imei: "",
      serial: "",
      brand: "",
      model: "",
      condition: "USED",
      purchasePrice: 0, // centavos internally
      notes: "",
    },
  });

  const createMutation = useMutation(
    trpc.stock.createDevicePurchase.mutationOptions({
      onSuccess: () => {
        toast.success("Compra registrada com sucesso!");
        router.push("/stock/purchases");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({ ...values, purchasePrice: values.purchasePrice / 100 });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-3xl">
        <FormSection title="Aparelho">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <FormControl>
                    <Input placeholder="Samsung" {...field} value={field.value ?? ""} />
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
                  <FormLabel>Modelo</FormLabel>
                  <FormControl>
                    <Input placeholder="Galaxy S24" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="imei"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IMEI</FormLabel>
                  <FormControl>
                    <Input placeholder="353456789012345" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serial"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serial</FormLabel>
                  <FormControl>
                    <Input placeholder="SN123456" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="condition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condição</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="NEW">Novo</SelectItem>
                      <SelectItem value="USED">Usado</SelectItem>
                      <SelectItem value="REFURBISHED">Recondicionado</SelectItem>
                      <SelectItem value="DEFECTIVE">Defeituoso</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="purchasePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço de Compra *</FormLabel>
                  <FormControl>
                    <MoneyInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Observações">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notas</FormLabel>
                <FormControl>
                  <Textarea placeholder="Informações adicionais..." rows={3} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormActions
          isLoading={createMutation.isPending}
          onCancel={() => router.push("/stock/purchases")}
          submitLabel="Registrar Compra"
        />
      </form>
    </Form>
  );
}
