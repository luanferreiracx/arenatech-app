"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Pencil,
  Ban,
  Undo2,
  Trash2,
  Check,
  X,
  Minus,
  Plus,
  DollarSign,
  Clock,
  Send,
  FlaskConical,
  FileSignature,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Truck,
  Navigation,
  RotateCcw,
  Wrench,
  UserCog,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/domain/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import {
  SERVICE_ORDER_STATUS_LABELS,
  SERVICE_ORDER_STATUS_VARIANT,
  STATUS_FLOW,
  OPTIONAL_STATUSES,
  SPECIAL_STATUSES,
  ALLOWED_TRANSITIONS,
  CHECKLIST_ITEMS,
  DEVICE_INFO_ITEMS,
  WARRANTY_TYPE_LABELS,
  type ServiceOrderStatus,
  type ChecklistData,
  type DeviceInfoData,
} from "@/lib/validators/service-order";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/cashier";

function formatMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ── Status Stepper ──

function StatusStepper({ status }: { status: ServiceOrderStatus }) {
  const isSpecial = SPECIAL_STATUSES.includes(status);
  const currentIndex = STATUS_FLOW.indexOf(status);

  if (isSpecial) {
    return (
      <div className="flex items-center justify-center py-6">
        <StatusBadge variant={SERVICE_ORDER_STATUS_VARIANT[status]} className="text-base px-4 py-2">
          {SERVICE_ORDER_STATUS_LABELS[status]}
        </StatusBadge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STATUS_FLOW.map((s, i) => {
        const isCompleted = currentIndex >= 0 && i < currentIndex;
        const isCurrent = i === currentIndex;
        const isOptional = OPTIONAL_STATUSES.includes(s);

        return (
          <div key={s} className="flex items-center">
            <div
              className={`flex flex-col items-center min-w-[60px] ${
                isOptional ? "opacity-70" : ""
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  isCompleted
                    ? "bg-success border-success text-white"
                    : isCurrent
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-[10px] mt-1 text-center leading-tight ${
                  isCurrent ? "text-primary font-semibold" : "text-muted-foreground"
                }`}
              >
                {SERVICE_ORDER_STATUS_LABELS[s]}
              </span>
            </div>
            {i < STATUS_FLOW.length - 1 && (
              <div
                className={`w-4 h-0.5 mt-[-12px] ${
                  isCompleted ? "bg-success" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──

export function ServiceOrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const orderQuery = useQuery(
    trpc.serviceOrder.getById.queryOptions({ id })
  );
  const isLoading = orderQuery.isLoading;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderQuery.data as any;

  // Dialogs
  const [statusDialog, setStatusDialog] = useState(false);
  const [nextStatus, setNextStatus] = useState<ServiceOrderStatus | null>(null);
  const [statusNotes, setStatusNotes] = useState("");
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [uncancelDialog, setUncancelDialog] = useState(false);
  const [uncancelReason, setUncancelReason] = useState("");
  const [refundDialog, setRefundDialog] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentDiscount, setPaymentDiscount] = useState(0);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [addItemDialog, setAddItemDialog] = useState(false);
  const [newItemType, setNewItemType] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [costsEditing, setCostsEditing] = useState(false);
  const [partsCostEdit, setPartsCostEdit] = useState(0);
  const [otherCostEdit, setOtherCostEdit] = useState(0);
  const [quoteDialog, setQuoteDialog] = useState(false);
  const [quoteServiceAmount, setQuoteServiceAmount] = useState(0);
  const [quotePartsAmount, setQuotePartsAmount] = useState(0);
  const [quoteDiscount, setQuoteDiscount] = useState(0);
  const [quoteReason, setQuoteReason] = useState("");
  const [quoteAdditional, setQuoteAdditional] = useState("");
  // New dialogs — Sprint 1A
  const [trackingDialog, setTrackingDialog] = useState(false);
  const [trackingPhone, setTrackingPhone] = useState("");
  const [deliveryTermDialog, setDeliveryTermDialog] = useState(false);
  const [deliveryTermPhone, setDeliveryTermPhone] = useState("");
  const [returnTermDialog, setReturnTermDialog] = useState(false);
  const [returnTermPhone, setReturnTermPhone] = useState("");
  const [returnTermReason, setReturnTermReason] = useState("Equipamento devolvido ao cliente");
  const [techInfoDialog, setTechInfoDialog] = useState(false);
  const [techDiagnosed, setTechDiagnosed] = useState("");
  const [techNotes, setTechNotes] = useState("");
  const [changeTechDialog, setChangeTechDialog] = useState(false);
  const [selectedTechId, setSelectedTechId] = useState("");

  const invalidateOrder = () => {
    void queryClient.invalidateQueries({ queryKey: [["serviceOrder"]] });
  };

  // Mutations
  const updateStatusMut = useMutation(
    trpc.serviceOrder.updateStatus.mutationOptions({
      onSuccess: () => { toast.success("Status atualizado!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const cancelMut = useMutation(
    trpc.serviceOrder.cancel.mutationOptions({
      onSuccess: () => { toast.success("OS cancelada!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const uncancelMut = useMutation(
    trpc.serviceOrder.uncancel.mutationOptions({
      onSuccess: () => { toast.success("OS descancelada!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const refundMut = useMutation(
    trpc.serviceOrder.refund.mutationOptions({
      onSuccess: () => { toast.success("OS estornada!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const deleteMut = useMutation(
    trpc.serviceOrder.delete.mutationOptions({
      onSuccess: () => { toast.success("OS excluida!"); router.push("/service-orders"); },
      onError: (e) => toast.error(e.message),
    })
  );

  const addItemMut = useMutation(
    trpc.serviceOrder.addItem.mutationOptions({
      onSuccess: () => { toast.success("Item adicionado!"); setAddItemDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const removeItemMut = useMutation(
    trpc.serviceOrder.removeItem.mutationOptions({
      onSuccess: () => { toast.success("Item removido!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const registerPaymentMut = useMutation(
    trpc.serviceOrder.registerPayment.mutationOptions({
      onSuccess: () => { toast.success("Pagamento registrado!"); setPaymentDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const updateCostsMut = useMutation(
    trpc.serviceOrder.updateCosts.mutationOptions({
      onSuccess: () => { toast.success("Custos atualizados!"); setCostsEditing(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const confirmSigMut = useMutation(
    trpc.serviceOrder.confirmPhysicalSignature.mutationOptions({
      onSuccess: () => { toast.success("Assinatura confirmada!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendForSignatureMut = useMutation(
    trpc.serviceOrder.sendForSignature.mutationOptions({
      onSuccess: (data) => {
        toast.success("Documento enviado para assinatura!");
        if (data.signatureLink) {
          window.open(data.signatureLink, "_blank");
        }
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const checkSignatureStatusMut = useMutation(
    trpc.serviceOrder.checkSignatureStatus.mutationOptions({
      onSuccess: (data) => {
        if (data.signed) {
          toast.success("Assinatura confirmada!");
        } else {
          toast.info(`Assinaturas: ${data.signaturesCompleted}/${data.totalSignatures}`);
        }
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const notifyCompletedMut = useMutation(
    trpc.communication.notifyOsCompleted.mutationOptions({
      onSuccess: (data) => {
        if (data.success) toast.success("Notificacao de conclusao enviada por WhatsApp!");
        else toast.error("Falha ao enviar notificacao");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const notifyStatusMut = useMutation(
    trpc.communication.notifyOsStatusChanged.mutationOptions({
      onSuccess: (data) => {
        if (data.success) toast.success("Atualizacao de status enviada por WhatsApp!");
        else toast.error("Falha ao enviar notificacao");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const createQuoteMut = useMutation(
    trpc.serviceOrder.createQuote.mutationOptions({
      onSuccess: () => { toast.success("Orcamento criado!"); setQuoteDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const cancelQuoteMut = useMutation(
    trpc.serviceOrder.cancelQuote.mutationOptions({
      onSuccess: () => { toast.success("Orcamento cancelado!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const approveQuoteMut = useMutation(
    trpc.serviceOrder.approveQuoteManually.mutationOptions({
      onSuccess: () => { toast.success("Orcamento aprovado!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  if (isLoading || !order) {
    return <div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div>;
  }

  const status = order.status as ServiceOrderStatus;
  const allowed = ALLOWED_TRANSITIONS[status] ?? [];
  const isCancelled = status === "CANCELLED";
  const isRefunded = status === "REFUNDED";
  const isDelivered = status === "DELIVERED";
  const isSigned = !!order.signatureSignedAt || order.physicalSignature;
  const checklist = (order.entryChecklist ?? {}) as ChecklistData;
  const deviceInfo = (order.deviceInfo ?? {}) as DeviceInfoData;
  const pendingQuote = order.quotes?.find((q: { status: string }) => q.status === "pending");

  // Costs / Profit
  const profit = order.totalAmount - order.partsCost - order.otherCost;

  return (
    <div>
      {/* Header */}
      <PageHeader
        title={<>OS {order.number}</>}
        subtitle={`Criada em ${format(new Date(order.entryDate), "dd/MM/yyyy HH:mm")} por ${order.createdByName}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/service-orders"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/api/service-orders/${order.id}/pdf`} target="_blank">
                <FileText className="mr-2 h-4 w-4" />PDF
              </Link>
            </Button>
            {!isCancelled && !isRefunded && (
              <Button variant="outline" asChild>
                <Link href={`/service-orders/${order.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />Editar
                </Link>
              </Button>
            )}
            {!isCancelled && !isRefunded && !isDelivered && (
              <Button variant="destructive" size="sm" onClick={() => setCancelDialog(true)}>
                <Ban className="mr-2 h-4 w-4" />Cancelar
              </Button>
            )}
            {isCancelled && (
              <Button variant="outline" onClick={() => setUncancelDialog(true)}>
                <Undo2 className="mr-2 h-4 w-4" />Descancelar
              </Button>
            )}
            {isDelivered && !isRefunded && (
              <Button variant="destructive" size="sm" onClick={() => setRefundDialog(true)}>
                <Undo2 className="mr-2 h-4 w-4" />Estornar
              </Button>
            )}
          </div>
        }
      />

      {/* Cancelled/Refunded Alert */}
      {(isCancelled || isRefunded) && (
        <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 mb-6">
          <h3 className="font-semibold text-destructive flex items-center gap-2">
            <Ban className="h-5 w-5" />
            OS {isRefunded ? "Estornada" : "Cancelada"}
          </h3>
          {order.cancellationReason && (
            <p className="text-sm mt-2 text-muted-foreground">{order.cancellationReason}</p>
          )}
          {order.refundReason && (
            <p className="text-sm mt-2 text-muted-foreground">{order.refundReason}</p>
          )}
        </div>
      )}

      {/* Signature Status */}
      {!isCancelled && !isRefunded && (
        <div className={`rounded-lg border-2 p-4 mb-6 ${isSigned ? "border-success bg-success/10" : "border-warning bg-warning/10"}`}>
          <h3 className={`font-semibold flex items-center gap-2 ${isSigned ? "text-success" : "text-warning"}`}>
            <FileSignature className="h-5 w-5" />
            {isSigned ? "Assinatura Confirmada" : "Assinatura Pendente"}
          </h3>
          {order.signatureUrl && (
            <p className="text-xs text-muted-foreground mt-1">
              Documento enviado em {order.signatureSentAt ? format(new Date(order.signatureSentAt), "dd/MM/yyyy HH:mm") : "—"}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {!isSigned && !order.signatureDocumentId && (
              <Button
                size="sm"
                variant="outline"
                disabled={sendForSignatureMut.isPending}
                onClick={() => sendForSignatureMut.mutate({ orderId: id })}
              >
                <Send className="mr-1 h-3 w-3" />Enviar para Assinatura Digital
              </Button>
            )}
            {order.signatureDocumentId && !isSigned && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={checkSignatureStatusMut.isPending}
                  onClick={() => checkSignatureStatusMut.mutate({ orderId: id })}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />Verificar Status
                </Button>
                {order.signatureUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={order.signatureUrl as string} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3 w-3" />Ver Documento
                    </a>
                  </Button>
                )}
              </>
            )}
            {!isSigned && (
              <Button size="sm" variant="outline" onClick={() => confirmSigMut.mutate({ orderId: id, type: "entry" })}>
                <Check className="mr-1 h-3 w-3" />Confirmar Assinatura Fisica
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Communication */}
      {!isCancelled && !isRefunded && order.customer?.phone && (
        <div className="rounded-lg border-2 border-blue-500 bg-blue-500/10 p-4 mb-6">
          <h3 className="font-semibold text-blue-400 flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />Comunicacao
          </h3>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={notifyCompletedMut.isPending}
              onClick={() => notifyCompletedMut.mutate({ serviceOrderId: id })}
            >
              <MessageCircle className="mr-1 h-3 w-3" />Enviar Conclusao por WhatsApp
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={notifyStatusMut.isPending}
              onClick={() => notifyStatusMut.mutate({
                serviceOrderId: id,
                newStatus: SERVICE_ORDER_STATUS_LABELS[status] ?? status,
              })}
            >
              <Send className="mr-1 h-3 w-3" />Enviar Status Atual por WhatsApp
            </Button>
          </div>
        </div>
      )}

      {/* Pending Quote Alert */}
      {pendingQuote && (
        <div className="rounded-lg border-2 border-purple-500 bg-purple-500/10 p-4 mb-6">
          <h3 className="font-semibold text-purple-400 flex items-center gap-2 mb-3">
            <DollarSign className="h-5 w-5" />Orcamento Pendente
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm mb-3">
            <div>
              <p className="text-muted-foreground">Valor Anterior</p>
              <p className="font-semibold">{formatMoney(pendingQuote.previousTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Novo Valor</p>
              <p className="font-semibold text-purple-400">{formatMoney(pendingQuote.newTotal)}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-3">Motivo: {pendingQuote.reason}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => approveQuoteMut.mutate({ orderId: id })}>
              <Check className="mr-1 h-3 w-3" />Aprovar Manual
            </Button>
            <Button size="sm" variant="destructive" onClick={() => cancelQuoteMut.mutate({ orderId: id })}>
              <X className="mr-1 h-3 w-3" />Cancelar Orcamento
            </Button>
          </div>
        </div>
      )}

      {/* Lab External */}
      {order.sentToLab && !order.labReceived && !isCancelled && (
        <div className="rounded-lg border-2 border-warning bg-warning/10 p-4 mb-6">
          <h3 className="font-semibold text-warning flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />Laboratorio Externo — Aguardando Retorno
          </h3>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Cliente</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-muted-foreground text-xs">Nome</p><p className="font-medium">{order.customer?.name ?? "—"}</p></div>
              <div><p className="text-muted-foreground text-xs">CPF</p><p>{order.customer?.cpf ?? "—"}</p></div>
              <div><p className="text-muted-foreground text-xs">Telefone</p><p>{order.customer?.phone ?? "—"}</p></div>
              <div><p className="text-muted-foreground text-xs">Email</p><p>{order.customer?.email ?? "—"}</p></div>
            </div>
          </div>

          {/* Equipment */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Equipamento</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-muted-foreground text-xs">Tipo</p><p>{order.deviceType ?? "—"}</p></div>
              <div><p className="text-muted-foreground text-xs">Modelo</p><p>{order.deviceModel ?? "—"}</p></div>
              <div><p className="text-muted-foreground text-xs">IMEI / Serial</p><p className="font-mono text-xs">{order.imei ?? order.serialNumber ?? "—"}</p></div>
              <div><p className="text-muted-foreground text-xs">Senha</p><p>{order.devicePassword ?? "—"}</p></div>
            </div>
            {order.accessories && (
              <div className="mt-3"><p className="text-muted-foreground text-xs">Acessorios</p><p className="text-sm">{order.accessories}</p></div>
            )}
          </div>

          {/* Status Stepper */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Status</h3>
            <StatusStepper status={status} />

            {/* Action buttons */}
            {allowed.length > 0 && !order.budgetPending && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                {allowed.map((s) => {
                  if (s === "PAID") {
                    return (
                      <Button key={s} size="sm" onClick={() => setPaymentDialog(true)}>
                        <DollarSign className="mr-1 h-3 w-3" />Registrar Pagamento
                      </Button>
                    );
                  }
                  return (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === "CANCELLED" ? "destructive" : "outline"}
                      onClick={() => { setNextStatus(s); setStatusNotes(""); setStatusDialog(true); }}
                    >
                      {SERVICE_ORDER_STATUS_LABELS[s]}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Problem & Diagnostics */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Problema e Diagnostico</h3>
            <div className="space-y-3 text-sm">
              <div><p className="text-muted-foreground text-xs">Problema Relatado</p><p>{order.reportedProblem ?? "—"}</p></div>
              {order.diagnosedProblem && <div><p className="text-muted-foreground text-xs">Defeito Constatado</p><p>{order.diagnosedProblem}</p></div>}
              {order.internalNotes && <div><p className="text-muted-foreground text-xs">Observacoes Internas</p><p>{order.internalNotes}</p></div>}
            </div>
          </div>

          {/* Checklist */}
          {Object.keys(checklist).length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Checklist de Entrada</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                {CHECKLIST_ITEMS.map((item) => {
                  const val = checklist[item.key];
                  if (val === undefined) return null;
                  return (
                    <div key={item.key} className="flex items-center gap-2 py-1">
                      {val === true && <Check className="w-4 h-4 text-success" />}
                      {val === false && <X className="w-4 h-4 text-destructive" />}
                      {val === null && <Minus className="w-4 h-4 text-muted-foreground" />}
                      <span>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Device Info */}
          {Object.values(deviceInfo).some(Boolean) && (
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Informacoes Adicionais</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {DEVICE_INFO_ITEMS.filter((item) => deviceInfo[item.key]).map((item) => (
                  <div key={item.key} className="flex items-center gap-2 text-warning">
                    <Check className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">Itens</h3>
              {!isCancelled && !isRefunded && !isDelivered && (
                <Button size="sm" variant="outline" onClick={() => { setNewItemDesc(""); setNewItemQty(1); setNewItemPrice(0); setAddItemDialog(true); }}>
                  <Plus className="mr-1 h-3 w-3" />Adicionar
                </Button>
              )}
            </div>
            {order.items.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum item cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {order.items.map((item: { id: string; type: string; description: string; quantity: number; unitPrice: number; total: number }) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0 text-sm">
                    <div className="flex-1">
                      <StatusBadge variant={item.type === "SERVICE" ? "info" : "warning"} className="mr-2 text-[10px]">
                        {item.type === "SERVICE" ? "Servico" : "Produto"}
                      </StatusBadge>
                      <span>{item.description}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{item.quantity}x {formatMoney(item.unitPrice)}</span>
                      <span className="font-mono font-medium w-24 text-right">{formatMoney(item.total)}</span>
                      {!isCancelled && !isRefunded && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItemMut.mutate({ id: item.id })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-2 border-t-2 border-primary">
                  <span className="font-bold text-primary font-mono text-lg">{formatMoney(order.totalAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* History Timeline */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Historico</h3>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
              {order.history.map((h: { id: string; newStatus: string; notes: string | null; userName: string; createdAt: Date }) => (
                <div key={h.id} className="relative">
                  <div className="absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-primary bg-card" />
                  <div className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {SERVICE_ORDER_STATUS_LABELS[h.newStatus as ServiceOrderStatus] ?? h.newStatus}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(h.createdAt), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{h.userName}</p>
                    {h.notes && <p className="text-xs text-muted-foreground italic mt-1">{h.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* Payment Card */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Pagamento</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Valor Total</span><span className="font-bold text-primary font-mono">{formatMoney(order.totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor Pago</span><span className="font-mono text-success">{formatMoney(order.paidAmount)}</span></div>
              {order.paymentDiscount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="text-warning font-mono">{formatMoney(order.paymentDiscount)}</span></div>
              )}
              {order.paymentMethod && (
                <div className="flex justify-between"><span className="text-muted-foreground">Forma</span><span>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span></div>
              )}
              {order.paymentDate && (
                <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{format(new Date(order.paymentDate), "dd/MM/yyyy")}</span></div>
              )}
            </div>
          </div>

          {/* Costs & Profit */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">Custos e Lucro</h3>
              {!costsEditing && !isCancelled && (
                <Button size="sm" variant="ghost" onClick={() => { setPartsCostEdit(order.partsCost); setOtherCostEdit(order.otherCost); setCostsEditing(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>
            {costsEditing ? (
              <div className="space-y-3">
                <div><Label className="text-xs">Custo de Pecas</Label><MoneyInput value={partsCostEdit} onChange={setPartsCostEdit} /></div>
                <div><Label className="text-xs">Outros Custos</Label><MoneyInput value={otherCostEdit} onChange={setOtherCostEdit} /></div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => updateCostsMut.mutate({ id, partsCost: partsCostEdit, otherCost: otherCostEdit })}>Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCostsEditing(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Receita</span><span className="font-mono">{formatMoney(order.totalAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Custo Pecas</span><span className="font-mono text-destructive">-{formatMoney(order.partsCost)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Outros Custos</span><span className="font-mono text-destructive">-{formatMoney(order.otherCost)}</span></div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="font-semibold">Lucro</span>
                  <span className={`font-mono font-bold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{formatMoney(profit)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Warranty */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Garantia</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Garantia</span><span>{order.isWarranty ? "Sim" : "Nao"}</span></div>
              {order.warrantyType && <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{WARRANTY_TYPE_LABELS[order.warrantyType] ?? order.warrantyType}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Prazo</span><span>{order.warrantyMonths} meses</span></div>
            </div>
          </div>

          {/* Responsible */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Responsaveis</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Tecnico</span><span>{order.technicianName ?? "—"}</span></div>
              {order.vendorName && <div className="flex justify-between"><span className="text-muted-foreground">Vendedor</span><span>{order.vendorName}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Criado por</span><span>{order.createdByName}</span></div>
            </div>
          </div>

          {/* NFS-e */}
          {order.nfseIssued && (
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">NFS-e</h3>
              <p className="text-sm text-success">Emitida{order.nfseNumber ? ` — ${order.nfseNumber}` : ""}</p>
            </div>
          )}

          {/* Create Quote */}
          {!isCancelled && !isRefunded && !isDelivered && !order.budgetPending && (
            <Button variant="outline" className="w-full" onClick={() => { setQuoteServiceAmount(order.serviceAmount); setQuotePartsAmount(order.partsAmount); setQuoteDiscount(order.discount); setQuoteReason(""); setQuoteAdditional(""); setQuoteDialog(true); }}>
              <Send className="mr-2 h-4 w-4" />Criar Orcamento Adicional
            </Button>
          )}

          {/* Public Link */}
          {order.publicLink && (
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Link Publico</h3>
              <Input readOnly value={`${window.location.origin}/os/${order.publicLink}`} className="text-xs font-mono" onClick={(e) => { (e.target as HTMLInputElement).select(); void navigator.clipboard.writeText(`${window.location.origin}/os/${order.publicLink}`); toast.success("Link copiado!"); }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}

      {/* Status Change Dialog */}
      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status para {nextStatus ? SERVICE_ORDER_STATUS_LABELS[nextStatus] : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Observacao</Label><Textarea value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} placeholder="Observacao opcional..." rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancelar</Button>
            <Button onClick={() => { if (nextStatus) { updateStatusMut.mutate({ id, status: nextStatus, notes: statusNotes || null }); setStatusDialog(false); } }} disabled={updateStatusMut.isPending}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Forma de Pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Desconto (opcional)</Label><MoneyInput value={paymentDiscount} onChange={setPaymentDiscount} /></div>
            <div><Label>Observacao</Label><Input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Observacao do pagamento..." /></div>
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between"><span>Valor Total</span><span className="font-mono">{formatMoney(order.totalAmount)}</span></div>
              <div className="flex justify-between"><span>Desconto</span><span className="font-mono text-warning">-{formatMoney(paymentDiscount)}</span></div>
              <div className="flex justify-between font-bold pt-1 border-t mt-1"><span>Valor a Pagar</span><span className="font-mono text-success">{formatMoney(Math.max(0, order.totalAmount - paymentDiscount))}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={() => registerPaymentMut.mutate({ id, paymentMethod, paidAmount: Math.max(0, order.totalAmount - paymentDiscount), paymentDiscount, paymentNotes: paymentNotes || null })} disabled={registerPaymentMut.isPending}>Confirmar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={addItemDialog} onOpenChange={setAddItemDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tipo</Label>
              <Select value={newItemType} onValueChange={(v) => setNewItemType(v as "SERVICE" | "PRODUCT")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="SERVICE">Servico</SelectItem><SelectItem value="PRODUCT">Produto/Peca</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Descricao</Label><Input value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantidade</Label><Input type="number" min={1} value={newItemQty} onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)} /></div>
              <div><Label>Valor Unitario</Label><MoneyInput value={newItemPrice} onChange={setNewItemPrice} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemDialog(false)}>Cancelar</Button>
            <Button disabled={!newItemDesc || addItemMut.isPending} onClick={() => addItemMut.mutate({ orderId: id, type: newItemType, description: newItemDesc, quantity: newItemQty, unitPrice: newItemPrice })}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar OS</DialogTitle></DialogHeader>
          <div><Label>Motivo do Cancelamento</Label><Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Informe o motivo..." rows={3} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>Voltar</Button>
            <Button variant="destructive" disabled={!cancelReason || cancelMut.isPending} onClick={() => { cancelMut.mutate({ id, reason: cancelReason }); setCancelDialog(false); }}>Confirmar Cancelamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Uncancel Dialog */}
      <Dialog open={uncancelDialog} onOpenChange={setUncancelDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Descancelar OS</DialogTitle></DialogHeader>
          <div><Label>Motivo</Label><Textarea value={uncancelReason} onChange={(e) => setUncancelReason(e.target.value)} rows={3} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUncancelDialog(false)}>Voltar</Button>
            <Button disabled={!uncancelReason || uncancelMut.isPending} onClick={() => { uncancelMut.mutate({ id, reason: uncancelReason }); setUncancelDialog(false); }}>Descancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundDialog} onOpenChange={setRefundDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Estornar OS</DialogTitle></DialogHeader>
          <div><Label>Motivo do Estorno (min. 10 caracteres)</Label><Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} rows={3} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialog(false)}>Voltar</Button>
            <Button variant="destructive" disabled={refundReason.length < 10 || refundMut.isPending} onClick={() => { refundMut.mutate({ id, reason: refundReason }); setRefundDialog(false); }}>Confirmar Estorno</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quote Dialog */}
      <Dialog open={quoteDialog} onOpenChange={setQuoteDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Orcamento Adicional</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Novo Valor de Servico</Label><MoneyInput value={quoteServiceAmount} onChange={setQuoteServiceAmount} /></div>
            <div><Label>Novo Valor de Pecas</Label><MoneyInput value={quotePartsAmount} onChange={setQuotePartsAmount} /></div>
            <div><Label>Desconto</Label><MoneyInput value={quoteDiscount} onChange={setQuoteDiscount} /></div>
            <div className="rounded-lg bg-muted p-3 text-sm"><div className="flex justify-between font-bold"><span>Novo Total</span><span className="font-mono text-primary">{formatMoney(quoteServiceAmount + quotePartsAmount - quoteDiscount)}</span></div></div>
            <div><Label>Motivo da Alteracao *</Label><Textarea value={quoteReason} onChange={(e) => setQuoteReason(e.target.value)} rows={2} /></div>
            <div><Label>Servicos Adicionais</Label><Textarea value={quoteAdditional} onChange={(e) => setQuoteAdditional(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteDialog(false)}>Cancelar</Button>
            <Button disabled={!quoteReason || createQuoteMut.isPending} onClick={() => createQuoteMut.mutate({ orderId: id, newServiceAmount: quoteServiceAmount, newPartsAmount: quotePartsAmount, newDiscount: quoteDiscount, reason: quoteReason, additionalServices: quoteAdditional || null })}>Criar Orcamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
