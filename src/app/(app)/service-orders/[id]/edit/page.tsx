"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { toast } from "@/lib/toast";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import {
  deviceTypeEnum,
  CHECKLIST_ITEMS,
  DEVICE_INFO_ITEMS,
  type ChecklistData,
  type DeviceInfoData,
  type UpdateServiceOrderInput,
} from "@/lib/validators/service-order";

export default function EditServiceOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const orderQuery = useQuery(
    trpc.serviceOrder.getById.queryOptions({ id })
  );
  const isLoading = orderQuery.isLoading;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderQuery.data as any;

  const updateMutation = useMutation(
    trpc.serviceOrder.update.mutationOptions({
      onSuccess: () => {
        toast.success("OS atualizada com sucesso!");
        void queryClient.invalidateQueries({ queryKey: [["serviceOrder"]] });
        router.push(`/service-orders/${id}`);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (isLoading || !order) {
    return <LoadingState />;
  }

  return (
    <EditForm
      order={order}
      onSubmit={(data) => updateMutation.mutate(data)}
      isPending={updateMutation.isPending}
      id={id}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditForm({ order, onSubmit, isPending, id }: { order: any; onSubmit: (data: UpdateServiceOrderInput) => void; isPending: boolean; id: string }) {
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      deviceType: order.deviceType ?? "",
      deviceBrand: order.deviceBrand ?? "",
      deviceModel: order.deviceModel ?? "",
      serialNumber: order.serialNumber ?? "",
      imei: order.imei ?? "",
      devicePassword: order.devicePassword ?? "",
      accessories: order.accessories ?? "",
      reportedProblem: order.reportedProblem ?? "",
      diagnosedProblem: order.diagnosedProblem ?? "",
      internalNotes: order.internalNotes ?? "",
      customerNotes: order.customerNotes ?? "",
      isWarranty: order.isWarranty ?? false,
      warrantyMonths: order.warrantyMonths ?? 3,
      nfseIssued: order.nfseIssued ?? false,
      nfseNumber: order.nfseNumber ?? "",
      estimatedDate: order.estimatedDate ? new Date(order.estimatedDate).toISOString().split("T")[0] : "",
    },
  });

  const checklist = (order.entryChecklist ?? {}) as ChecklistData;
  const deviceInfo = (order.deviceInfo ?? {}) as DeviceInfoData;

  const doSubmit = handleSubmit((values) => {
    onSubmit({
      id,
      deviceType: values.deviceType || null,
      deviceBrand: values.deviceBrand || null,
      deviceModel: values.deviceModel || null,
      serialNumber: values.serialNumber || null,
      imei: values.imei || null,
      devicePassword: values.devicePassword || null,
      accessories: values.accessories || null,
      reportedProblem: values.reportedProblem || undefined,
      diagnosedProblem: values.diagnosedProblem || null,
      internalNotes: values.internalNotes || null,
      customerNotes: values.customerNotes || null,
      isWarranty: values.isWarranty,
      warrantyMonths: values.warrantyMonths,
      nfseIssued: values.nfseIssued,
      nfseNumber: values.nfseNumber || null,
      estimatedDate: values.estimatedDate || null,
      entryChecklist: checklist,
      deviceInfo,
    });
  });

  return (
    <div>
      <PageHeader
        title={`Editar OS ${order.number}`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/service-orders/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />Voltar
            </Link>
          </Button>
        }
      />

      <form onSubmit={doSubmit} className="space-y-6">
        {/* Equipment */}
        <div className="rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold mb-4">Equipamento</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={watch("deviceType")} onValueChange={(v) => setValue("deviceType", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{deviceTypeEnum.options.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Marca</Label><Input {...register("deviceBrand")} /></div>
            <div className="space-y-2"><Label>Modelo</Label><Input {...register("deviceModel")} /></div>
            <div className="space-y-2"><Label>Serial</Label><Input {...register("serialNumber")} /></div>
            <div className="space-y-2"><Label>IMEI</Label><Input {...register("imei")} /></div>
            <div className="space-y-2"><Label>Senha</Label><Input {...register("devicePassword")} /></div>
            <div className="space-y-2 md:col-span-3"><Label>Acessorios</Label><Textarea {...register("accessories")} rows={2} /></div>
          </div>
        </div>

        {/* Problem */}
        <div className="rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold mb-4">Problema e Diagnostico</h3>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Problema Relatado</Label><Textarea {...register("reportedProblem")} rows={3} /></div>
            <div className="space-y-2"><Label>Defeito Constatado</Label><Textarea {...register("diagnosedProblem")} rows={3} /></div>
            <div className="space-y-2"><Label>Observacoes Internas</Label><Textarea {...register("internalNotes")} rows={3} /></div>
            <div className="space-y-2"><Label>Observacoes para o Cliente</Label><Textarea {...register("customerNotes")} rows={2} /></div>
          </div>
        </div>

        {/* Warranty */}
        <div className="rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold mb-4">Garantia e Previsao</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <Checkbox id="isWarranty" checked={watch("isWarranty")} onCheckedChange={(v) => setValue("isWarranty", !!v)} />
              <Label htmlFor="isWarranty">OS de Garantia</Label>
            </div>
            <div className="space-y-2"><Label>Prazo Garantia (meses)</Label><Input type="number" min={0} max={120} {...register("warrantyMonths", { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label>Data Prevista</Label><Input type="date" {...register("estimatedDate")} /></div>
          </div>
        </div>

        {/* NFS-e */}
        <div className="rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold mb-4">NFS-e</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Checkbox id="nfseIssued" checked={watch("nfseIssued")} onCheckedChange={(v) => setValue("nfseIssued", !!v)} />
              <Label htmlFor="nfseIssued">NFS-e Emitida</Label>
            </div>
            <div className="space-y-2"><Label>Numero NFS-e</Label><Input {...register("nfseNumber")} placeholder="Numero da nota" /></div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild><Link href={`/service-orders/${id}`}>Cancelar</Link></Button>
          <Button type="submit" disabled={isPending}>
            <Save className="mr-2 h-4 w-4" />{isPending ? "Salvando..." : "Salvar Alteracoes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
