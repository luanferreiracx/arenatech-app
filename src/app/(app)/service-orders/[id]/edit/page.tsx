"use client";

import { use, useState } from "react";
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
import { Check, X, Minus } from "lucide-react";

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
  // OS assinada = entrada com Autentique confirmada OU assinatura fisica.
  // Quando assinada, equipamento/IMEI/problema relatado/checklist entrada
  // viram readonly (paridade Laravel `$osAssinada`).
  const isSigned: boolean = !!order.signatureSignedAt || !!order.physicalSignature;

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

  const entryChecklist = (order.entryChecklist ?? {}) as ChecklistData;
  const deviceInfo = (order.deviceInfo ?? {}) as DeviceInfoData;

  const [exitChecklist, setExitChecklist] = useState<ChecklistData>(
    (order.exitChecklist ?? {}) as ChecklistData
  );

  function cycleChecklistValue(current: boolean | null | undefined): boolean | null {
    if (current === true) return false;
    if (current === false) return null;
    return true;
  }

  const doSubmit = handleSubmit((values) => {
    // Quando OS esta assinada, preservamos os valores originais dos campos
    // bloqueados (defesa em profundidade — o input ja e readonly).
    onSubmit({
      id,
      deviceType: isSigned ? order.deviceType : (values.deviceType || null),
      deviceBrand: isSigned ? order.deviceBrand : (values.deviceBrand || null),
      deviceModel: isSigned ? order.deviceModel : (values.deviceModel || null),
      serialNumber: isSigned ? order.serialNumber : (values.serialNumber || null),
      imei: isSigned ? order.imei : (values.imei || null),
      devicePassword: isSigned ? order.devicePassword : (values.devicePassword || null),
      accessories: isSigned ? order.accessories : (values.accessories || null),
      reportedProblem: isSigned ? order.reportedProblem : (values.reportedProblem || undefined),
      diagnosedProblem: values.diagnosedProblem || null,
      internalNotes: values.internalNotes || null,
      customerNotes: values.customerNotes || null,
      isWarranty: values.isWarranty,
      warrantyMonths: values.warrantyMonths,
      nfseIssued: values.nfseIssued,
      nfseNumber: values.nfseNumber || null,
      estimatedDate: values.estimatedDate || null,
      entryChecklist: isSigned ? entryChecklist : entryChecklist,
      exitChecklist,
      deviceInfo: isSigned ? deviceInfo : deviceInfo,
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Equipamento</h3>
            {isSigned && (
              <span className="text-xs text-muted-foreground">
                🔒 Bloqueado apos assinatura do cliente
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={watch("deviceType")} onValueChange={(v) => setValue("deviceType", v)} disabled={isSigned}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{deviceTypeEnum.options.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Marca</Label><Input {...register("deviceBrand")} readOnly={isSigned} /></div>
            <div className="space-y-2"><Label>Modelo</Label><Input {...register("deviceModel")} readOnly={isSigned} /></div>
            <div className="space-y-2"><Label>Serial</Label><Input {...register("serialNumber")} readOnly={isSigned} /></div>
            <div className="space-y-2"><Label>IMEI</Label><Input {...register("imei")} readOnly={isSigned} /></div>
            <div className="space-y-2"><Label>Senha</Label><Input {...register("devicePassword")} readOnly={isSigned} /></div>
            <div className="space-y-2 md:col-span-3"><Label>Acessorios</Label><Textarea {...register("accessories")} rows={2} readOnly={isSigned} /></div>
          </div>
        </div>

        {/* Problem */}
        <div className="rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Problema e Diagnostico</h3>
            {isSigned && (
              <span className="text-xs text-muted-foreground">
                🔒 Problema relatado bloqueado apos assinatura
              </span>
            )}
          </div>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Problema Relatado</Label><Textarea {...register("reportedProblem")} rows={3} readOnly={isSigned} /></div>
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

        {/* Exit Checklist */}
        <div className="rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold mb-4">Checklist de Saida</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Clique para alternar: <Check className="inline h-3 w-3 text-green-500" /> OK, <X className="inline h-3 w-3 text-red-500" /> NOK, <Minus className="inline h-3 w-3 text-gray-400" /> N/A
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {CHECKLIST_ITEMS.map(({ key, label }) => {
              const val = exitChecklist[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setExitChecklist((prev) => ({ ...prev, [key]: cycleChecklistValue(prev[key]) }))}
                  className={`flex items-center gap-2 p-2 rounded-md border text-sm transition-colors ${
                    val === true ? "border-green-300 bg-green-50 dark:bg-green-950" :
                    val === false ? "border-red-300 bg-red-50 dark:bg-red-950" :
                    "border-border bg-muted/50"
                  }`}
                >
                  {val === true ? <Check className="h-4 w-4 text-green-500" /> :
                   val === false ? <X className="h-4 w-4 text-red-500" /> :
                   <Minus className="h-4 w-4 text-muted-foreground" />}
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
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
