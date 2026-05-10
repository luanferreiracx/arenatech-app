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
import { LoadingState } from "@/components/domain/loading-state";
import { MoneyInput } from "@/components/inputs/money-input";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { updateServiceOrderSchema, WARRANTY_TYPES, WARRANTY_TYPE_LABELS, type ChecklistInput, type DeviceInfoInput } from "@/lib/validators/service-order";
import { z } from "zod";

type FormValues = z.input<typeof updateServiceOrderSchema>;

interface Props {
  id: string;
}

const DEVICE_TYPES = [
  "Celular",
  "Tablet",
  "Notebook",
  "Desktop",
  "Smart Watch",
  "Console",
  "Outro",
];

export function ServiceOrderEditClient({ id }: Props) {
  const trpc = useTRPC();
  const router = useRouter();

  const { data: order, isLoading } = useQuery(
    trpc.serviceOrders.getById.queryOptions({ id }),
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(updateServiceOrderSchema),
    values: order
      ? {
          deviceType: order.deviceType ?? undefined,
          deviceBrand: order.deviceBrand ?? undefined,
          deviceModel: order.deviceModel ?? undefined,
          serialNumber: order.serialNumber ?? undefined,
          imei: order.imei ?? undefined,
          devicePassword: order.devicePassword ?? undefined,
          reportedProblem: order.reportedProblem ?? undefined,
          diagnosedProblem: order.diagnosedProblem ?? undefined,
          entryChecklist: (order.entryChecklist as ChecklistInput) ?? undefined,
          exitChecklist: (order.exitChecklist as ChecklistInput) ?? undefined,
          deviceInfo: (order.deviceInfo as DeviceInfoInput) ?? undefined,
          discount: Number(order.discount),
          estimatedDate: order.estimatedDate
            ? new Date(order.estimatedDate).toISOString()
            : undefined,
          technicianId: order.technicianId ?? undefined,
          isWarranty: order.isWarranty,
          warrantyType: (order.warrantyType as (typeof WARRANTY_TYPES)[number]) ?? undefined,
          warrantyMonths: order.warrantyMonths ?? 3,
          internalNotes: order.internalNotes ?? undefined,
          customerNotes: order.customerNotes ?? undefined,
        }
      : undefined,
  });

  const updateMutation = useMutation(
    trpc.serviceOrders.update.mutationOptions({
      onSuccess: () => {
        toast.success("OS atualizada com sucesso!");
        router.push(`/service-orders/${id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState variant="form" />;
  if (!order)
    return (
      <p className="text-muted-foreground">Ordem de Serviço não encontrada.</p>
    );

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate({ id, ...values });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-8 max-w-3xl"
      >
        <FormSection title="Equipamento">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="deviceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DEVICE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="deviceBrand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="deviceModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serialNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>N. Serial</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="imei"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IMEI</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="devicePassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha do equipamento</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Problema e Diagnóstico">
          <FormField
            control={form.control}
            name="reportedProblem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Problema relatado</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="diagnosedProblem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Defeito diagnosticado</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    rows={3}
                    placeholder="Preencha após o diagnóstico..."
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Valores e Garantia">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="discount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Desconto</FormLabel>
                  <FormControl>
                    <MoneyInput
                      value={field.value ?? 0}
                      onChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isWarranty"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 pt-6">
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel>É garantia?</FormLabel>
                </FormItem>
              )}
            />
          </div>
          {form.watch("isWarranty") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="warrantyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de garantia</FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WARRANTY_TYPES.map((wt) => (
                          <SelectItem key={wt} value={wt}>
                            {WARRANTY_TYPE_LABELS[wt]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warrantyMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prazo de garantia (meses)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={field.value ?? 3}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          )}
        </FormSection>

        <FormSection title="Notas">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas internas</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      placeholder="Visível apenas pela equipe..."
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customerNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas para o cliente</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      placeholder="Visível na vista pública..."
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormActions
          isLoading={updateMutation.isPending}
          onCancel={() => router.push(`/service-orders/${id}`)}
          submitLabel="Salvar Alterações"
        />
      </form>
    </Form>
  );
}
