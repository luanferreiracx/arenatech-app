"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import {
  createLabOrderSchema,
  type CreateLabOrderInput,
} from "@/lib/validators/operation";

export default function NewLabOrderPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const form = useForm<CreateLabOrderInput>({
    resolver: zodResolver(createLabOrderSchema),
    defaultValues: {
      labId: "",
      deviceDescription: "",
      problem: "",
      notes: "",
    },
  });

  const { data: labsData } = useQuery(
    trpc.operation.listExternalLabs.queryOptions({ page: 0, pageSize: 100, active: true }),
  );

  const { data: deliveryData } = useQuery(
    trpc.operation.listDeliveryPersons.queryOptions({ page: 0, pageSize: 100, active: true }),
  );

  const createMutation = useMutation(
    trpc.operation.createLabOrder.mutationOptions({
      onSuccess: () => {
        toast.success("Envio registrado!");
        router.push("/operation/lab-orders");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function onSubmit(values: CreateLabOrderInput) {
    createMutation.mutate({
      ...values,
      labId: values.labId,
      serviceOrderId: values.serviceOrderId || undefined,
      deliveryPersonId: values.deliveryPersonId || undefined,
      deviceDescription: values.deviceDescription || undefined,
      problem: values.problem || undefined,
      estimatedCost: values.estimatedCost ?? undefined,
      notes: values.notes || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Novo Envio para Laboratório" />
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <FormSection title="Dados do envio">
          <div>
            <Label htmlFor="labId">Laboratório *</Label>
            <Select
              value={form.watch("labId")}
              onValueChange={(v) => form.setValue("labId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o laboratório" />
              </SelectTrigger>
              <SelectContent>
                {labsData?.items.map((lab: { id: string; name: string }) => (
                  <SelectItem key={lab.id} value={lab.id}>
                    {lab.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.labId && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.labId.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="deliveryPersonId">Entregador</Label>
            <Select
              value={form.watch("deliveryPersonId") ?? ""}
              onValueChange={(v) => form.setValue("deliveryPersonId", v || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {deliveryData?.items.map((dp: { id: string; name: string }) => (
                  <SelectItem key={dp.id} value={dp.id}>
                    {dp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="deviceDescription">Descrição do equipamento</Label>
            <Input id="deviceDescription" {...form.register("deviceDescription")} />
          </div>

          <div>
            <Label htmlFor="problem">Problema / Descrição do serviço</Label>
            <Textarea id="problem" {...form.register("problem")} />
          </div>

          <div>
            <Label htmlFor="estimatedCost">Custo estimado (R$)</Label>
            <Input
              id="estimatedCost"
              type="number"
              step="0.01"
              {...form.register("estimatedCost", { valueAsNumber: true })}
            />
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" {...form.register("notes")} />
          </div>
        </FormSection>

        <FormActions
          onCancel={() => router.push("/operation/lab-orders")}
          isLoading={createMutation.isPending}
        />
      </form>
    </div>
  );
}
