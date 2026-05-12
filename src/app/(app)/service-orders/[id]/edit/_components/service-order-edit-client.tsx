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
import { EntitySelector } from "@/components/domain/entity-selector";
import { updateServiceOrderSchema, WARRANTY_TYPES, WARRANTY_TYPE_LABELS, CHECKLIST_LABELS, DEVICE_INFO_LABELS, type ChecklistInput, type DeviceInfoInput } from "@/lib/validators/service-order";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

type FormValues = z.input<typeof updateServiceOrderSchema>;

interface Props {
  id: string;
}

const DEVICE_TYPES = [
  "iPhone",
  "iPad",
  "MacBook",
  "Android",
  "Notebook",
  "Console",
  "Outro",
];

export function ServiceOrderEditClient({ id }: Props) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const searchTechnicians = useCallback(
    async (query: string) => {
      const opts = trpc.serviceOrders.listTechnicians.queryOptions({
        search: query || undefined,
      });
      const result = await queryClient.fetchQuery(opts);
      return result as Array<{ id: string; name: string }>;
    },
    [trpc.serviceOrders.listTechnicians, queryClient],
  );

  const searchVendors = useCallback(
    async (query: string) => {
      const opts = trpc.serviceOrders.listVendors.queryOptions({
        search: query || undefined,
      });
      const result = await queryClient.fetchQuery(opts);
      return result as Array<{ id: string; name: string }>;
    },
    [trpc.serviceOrders.listVendors, queryClient],
  );

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
          discount: Math.round(Number(order.discount) * 100),
          estimatedDate: order.estimatedDate
            ? new Date(order.estimatedDate).toISOString()
            : undefined,
          technicianId: order.technicianId ?? undefined,
          vendorId: order.vendorId ?? undefined,
          nfseIssued: order.nfseIssued ?? false,
          nfseNumber: order.nfseNumber ?? undefined,
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
    updateMutation.mutate({
      id,
      ...values,
      // MoneyInput stores centavos, router expects reais
      discount: values.discount !== undefined ? values.discount / 100 : undefined,
    });
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

        <FormSection title="Checklist de Entrada">
          <p className="text-xs text-muted-foreground mb-3">
            Para cada item: <span className="text-green-600 font-medium">✓ OK</span>{" "}
            / <span className="text-red-600 font-medium">✗ Não OK</span>{" "}
            / <span className="text-muted-foreground font-medium">— N/A</span>
          </p>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
              const val = (form.watch("entryChecklist") ?? {})[key as keyof ChecklistInput];
              const normalized = val ?? null;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="flex rounded-md border overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const current = form.getValues("entryChecklist") ?? {};
                        form.setValue("entryChecklist", { ...current, [key]: normalized === true ? null : true }, { shouldDirty: true });
                      }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center text-xs transition-colors",
                        normalized === true ? "bg-green-600 text-white" : "hover:bg-muted text-muted-foreground",
                      )}
                      title="OK"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = form.getValues("entryChecklist") ?? {};
                        form.setValue("entryChecklist", { ...current, [key]: normalized === false ? null : false }, { shouldDirty: true });
                      }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center text-xs transition-colors border-x",
                        normalized === false ? "bg-red-600 text-white" : "hover:bg-muted text-muted-foreground",
                      )}
                      title="Não OK"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = form.getValues("entryChecklist") ?? {};
                        form.setValue("entryChecklist", { ...current, [key]: null }, { shouldDirty: true });
                      }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center text-xs transition-colors",
                        normalized === null ? "bg-muted-foreground/20 text-muted-foreground" : "hover:bg-muted text-muted-foreground",
                      )}
                      title="N/A"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm">{label}</span>
                </div>
              );
            })}
          </div>
        </FormSection>

        <FormSection title="Checklist de Saída">
          <p className="text-xs text-muted-foreground mb-3">
            Preencha ao finalizar o serviço.
          </p>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
              const val = (form.watch("exitChecklist") ?? {})[key as keyof ChecklistInput];
              const normalized = val ?? null;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="flex rounded-md border overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const current = form.getValues("exitChecklist") ?? {};
                        form.setValue("exitChecklist", { ...current, [key]: normalized === true ? null : true }, { shouldDirty: true });
                      }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center text-xs transition-colors",
                        normalized === true ? "bg-green-600 text-white" : "hover:bg-muted text-muted-foreground",
                      )}
                      title="OK"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = form.getValues("exitChecklist") ?? {};
                        form.setValue("exitChecklist", { ...current, [key]: normalized === false ? null : false }, { shouldDirty: true });
                      }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center text-xs transition-colors border-x",
                        normalized === false ? "bg-red-600 text-white" : "hover:bg-muted text-muted-foreground",
                      )}
                      title="Não OK"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = form.getValues("exitChecklist") ?? {};
                        form.setValue("exitChecklist", { ...current, [key]: null }, { shouldDirty: true });
                      }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center text-xs transition-colors",
                        normalized === null ? "bg-muted-foreground/20 text-muted-foreground" : "hover:bg-muted text-muted-foreground",
                      )}
                      title="N/A"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm">{label}</span>
                </div>
              );
            })}
          </div>
        </FormSection>

        <FormSection title="Informações Adicionais">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {Object.entries(DEVICE_INFO_LABELS).map(([key, label]) => {
              const val = (form.watch("deviceInfo") ?? {})[key as keyof DeviceInfoInput];
              return (
                <div key={key} className="flex items-center gap-2">
                  <Switch
                    checked={!!val}
                    onCheckedChange={(checked) => {
                      const current = form.getValues("deviceInfo") ?? {};
                      form.setValue("deviceInfo", { ...current, [key]: checked }, { shouldDirty: true });
                    }}
                  />
                  <span className="text-sm">{label}</span>
                </div>
              );
            })}
          </div>
        </FormSection>

        <FormSection title="Responsáveis">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="technicianId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Técnico Responsável</FormLabel>
                  <FormControl>
                    <EntitySelector<{ id: string; name: string }>
                      value={field.value ?? undefined}
                      onChange={(val) => field.onChange(val ?? null)}
                      searchFn={searchTechnicians}
                      getOptionLabel={(u) => u.name}
                      getOptionValue={(u) => u.id}
                      placeholder="Selecionar técnico..."
                      emptyMessage="Nenhum técnico encontrado."
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vendorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendedor Intermediador <span className="text-xs text-muted-foreground">(opcional)</span></FormLabel>
                  <FormControl>
                    <EntitySelector<{ id: string; name: string }>
                      value={field.value ?? undefined}
                      onChange={(val) => field.onChange(val ?? null)}
                      searchFn={searchVendors}
                      getOptionLabel={(u) => u.name}
                      getOptionValue={(u) => u.id}
                      placeholder="Selecionar vendedor..."
                      emptyMessage="Nenhum vendedor encontrado."
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Vendedor que recepcionou o cliente e encaminhou a OS.
                  </p>
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="NFS-e">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="nfseIssued"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 pt-2">
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel>NFS-e emitida</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nfseNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número da NFS-e</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Ex: 2025/001234" />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Marque após emitir a nota na prefeitura. Habilita dedução de tributos no cálculo de comissão.
          </p>
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
