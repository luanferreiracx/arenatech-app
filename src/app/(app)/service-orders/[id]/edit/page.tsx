"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
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
import { ArrowLeft, Save, Lock, Trash2 } from "lucide-react";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
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
    }),
  );

  const attachNfseMutation = useMutation(
    trpc.serviceOrder.attachNfse.mutationOptions({
      onSuccess: () => {
        toast.success("NFS-e anexada!");
        void queryClient.invalidateQueries({ queryKey: [["serviceOrder"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const detachNfseMutation = useMutation(
    trpc.serviceOrder.detachNfse.mutationOptions({
      onSuccess: () => {
        toast.success("Anexo da NFS-e removido.");
        void queryClient.invalidateQueries({ queryKey: [["serviceOrder"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading || !order) {
    return <LoadingState />;
  }

  return (
    <EditForm
      order={order}
      onSubmit={(data) => updateMutation.mutate(data)}
      onAttachNfse={(payload) => attachNfseMutation.mutate(payload)}
      attachNfsePending={attachNfseMutation.isPending}
      onDetachNfse={() => detachNfseMutation.mutate({ orderId: id })}
      detachNfsePending={detachNfseMutation.isPending}
      isPending={updateMutation.isPending}
      id={id}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface AttachNfsePayload {
  orderId: string;
  nfseNumber?: string | null;
  fileBase64: string;
  fileName: string;
  contentType: string;
}

function EditForm({ order, onSubmit, onAttachNfse, attachNfsePending, onDetachNfse, detachNfsePending, isPending, id }: { order: any; onSubmit: (data: UpdateServiceOrderInput) => void; onAttachNfse: (p: AttachNfsePayload) => void; attachNfsePending: boolean; onDetachNfse: () => void; detachNfsePending: boolean; isPending: boolean; id: string }) {
  // detachNfse exige admin no backend — esconde o botao para operador.
  const isAdmin = useIsTenantAdmin();
  // Paridade Laravel:
  // - $osAssinada (entrada confirmada) → bloqueia equipamento, IMEI, problema
  //   relatado, checklist entrada e info adicionais
  // - $osConcluida (status in concluida/aguardando_retirada/entregue) →
  //   bloqueia ALEM disso: defeito constatado, observacoes internas, prazo
  //   garantia
  // Inclui entrySignatureAt (signature-pad) — espelho do isEntrySigned do
  // servidor. Sem isso, OS assinada no pad deixava o operador "editar" campos
  // do equipamento aqui e o servidor descartava silenciosamente (lockedFields),
  // com toast de sucesso enganoso.
  const isSigned: boolean =
    !!order.signatureSignedAt || !!order.physicalSignature || !!order.entrySignatureAt;
  const isCompleted: boolean = ["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED", "REFUNDED"].includes(order.status);

  const { register, handleSubmit, watch, setValue, control } = useForm({
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

  // Estado local de deviceInfo (6 checkboxes), editavel enquanto OS nao assinada.
  const [editedDeviceInfo, setEditedDeviceInfo] = useState<DeviceInfoData>(deviceInfo);

  const doSubmit = handleSubmit((values) => {
    // Defesa em profundidade — campos bloqueados sao preservados independente
    // do que vier do form (inputs ja sao readonly).
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
      // Bloqueados apos conclusao (paridade $osConcluida)
      diagnosedProblem: isCompleted ? order.diagnosedProblem : (values.diagnosedProblem || null),
      internalNotes: isCompleted ? order.internalNotes : (values.internalNotes || null),
      warrantyMonths: isCompleted ? order.warrantyMonths : values.warrantyMonths,
      // Sempre editaveis
      customerNotes: values.customerNotes || null,
      isWarranty: values.isWarranty,
      nfseIssued: values.nfseIssued,
      nfseNumber: values.nfseNumber || null,
      estimatedDate: values.estimatedDate || null,
      entryChecklist: isSigned ? entryChecklist : entryChecklist,
      exitChecklist,
      // deviceInfo: editavel apenas enquanto OS nao foi assinada
      deviceInfo: isSigned ? deviceInfo : editedDeviceInfo,
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
        {/* Aviso de edição restrita — torna explícito o lock (que ja existe por
            campo) para o operador nao achar que "salvou" algo bloqueado. */}
        {(isSigned || isCompleted) && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm">
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                {isCompleted ? "OS concluída — edição restrita" : "OS assinada pelo cliente — edição restrita"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {isSigned && (
                  <>
                    Os dados de entrada (equipamento, serial/IMEI, senha, acessórios, problema
                    relatado e informações adicionais) estão <strong>bloqueados</strong> — o
                    aparelho já está sob responsabilidade da loja.{" "}
                  </>
                )}
                {isCompleted && (
                  <>
                    Após a conclusão, diagnóstico, observações internas e prazo de garantia
                    também ficam bloqueados.{" "}
                  </>
                )}
                Campos com 🔒 não são salvos, mesmo que pareçam editáveis.
              </p>
            </div>
          </div>
        )}

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
            <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
              {isSigned && <span>🔒 Problema relatado bloqueado apos assinatura</span>}
              {isCompleted && <span>🔒 Diagnostico e notas internas bloqueados apos conclusao</span>}
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Problema Relatado</Label><Textarea {...register("reportedProblem")} rows={3} readOnly={isSigned} /></div>
            <div className="space-y-2"><Label>Defeito Constatado</Label><Textarea {...register("diagnosedProblem")} rows={3} readOnly={isCompleted} /></div>
            <div className="space-y-2"><Label>Observacoes Internas</Label><Textarea {...register("internalNotes")} rows={3} readOnly={isCompleted} /></div>
            <div className="space-y-2"><Label>Observacoes para o Cliente</Label><Textarea {...register("customerNotes")} rows={2} /></div>
          </div>
        </div>

        {/* Warranty */}
        <div className="rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Garantia e Previsao</h3>
            {isCompleted && (
              <span className="text-xs text-muted-foreground">🔒 Prazo de garantia bloqueado apos conclusao</span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <Checkbox id="isWarranty" checked={watch("isWarranty")} onCheckedChange={(v) => setValue("isWarranty", !!v)} />
              <Label htmlFor="isWarranty">OS de Garantia</Label>
            </div>
            <div className="space-y-2"><Label>Prazo Garantia (meses)</Label><Input type="number" min={0} max={120} {...register("warrantyMonths", { valueAsNumber: true })} readOnly={isCompleted} /></div>
            <div className="space-y-2">
              <Label>Data Prevista</Label>
              <Controller
                control={control}
                name="estimatedDate"
                render={({ field }) => (
                  <DateInput
                    value={(field.value as string) ?? ""}
                    onChange={field.onChange}
                    aria-label="Data prevista de entrega"
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Device Info — paridade Laravel `info_*` (editavel ate assinatura) */}
        <div className="rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Informacoes Adicionais</h3>
            {isSigned && (
              <span className="text-xs text-muted-foreground">🔒 Bloqueado apos assinatura do cliente</span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DEVICE_INFO_ITEMS.map(({ key, label }) => (
              <label
                key={key}
                className={`flex items-center gap-3 p-3 rounded-md border ${
                  editedDeviceInfo[key] ? "border-primary bg-primary/5" : "border-border bg-muted/50"
                } ${isSigned ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={!!editedDeviceInfo[key]}
                  disabled={isSigned}
                  onCheckedChange={(v) =>
                    setEditedDeviceInfo((prev) => ({ ...prev, [key]: !!v }))
                  }
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
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
          <div className="mt-4 space-y-2">
            <Label htmlFor="nfse-file">Anexar PDF/imagem da NFS-e</Label>
            <Input
              id="nfse-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              disabled={attachNfsePending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                // Limite 4 MB — alinhado com o validator no servidor
                // (`attachNfseSchema`) e com o Laravel `mimes:pdf,jpg,jpeg,png|max:4096`.
                if (file.size > 4 * 1024 * 1024) {
                  toast.error("Arquivo maior que 4 MB");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result;
                  if (typeof result !== "string") return;
                  onAttachNfse({
                    orderId: id,
                    nfseNumber: watch("nfseNumber") || null,
                    fileBase64: result,
                    fileName: file.name,
                    contentType: file.type,
                  });
                  e.target.value = "";
                };
                reader.readAsDataURL(file);
              }}
            />
            {order.nfseAttachmentPath && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground truncate">
                  Anexo atual: <span className="font-mono">{String(order.nfseAttachmentPath).split("/").pop()}</span>
                </p>
                {isAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive shrink-0"
                    disabled={detachNfsePending}
                    onClick={() => onDetachNfse()}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />Remover
                  </Button>
                )}
              </div>
            )}
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
