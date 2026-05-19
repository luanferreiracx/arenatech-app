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
  getNextStatusOptions,
  type ServiceOrderStatus,
  type ChecklistData,
  type DeviceInfoData,
} from "@/lib/validators/service-order";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/cashier";
import { StatusStepper } from "./status-stepper";

function formatMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelForce, setCancelForce] = useState(false);
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
  // Laboratorio Externo
  const [sendLabDialog, setSendLabDialog] = useState(false);
  const [labDeliveryPersonId, setLabDeliveryPersonId] = useState<string>("");
  const [notifyDeliveryDialog, setNotifyDeliveryDialog] = useState(false);
  const [notifyDeliveryContext, setNotifyDeliveryContext] = useState<"retirada" | "envio" | "generico">("retirada");
  const [notifyDeliveryMessage, setNotifyDeliveryMessage] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);

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

  // Cria/reusa rascunho de Sale para pagamento da OS e navega pro PDV.
  // Substitui o registerPayment direto da OS (ADR 0042: PDV-OS integration).
  // O retorno tipado pelo tRPC e a Sale completa; extraimos `id`.
  const createFromOSMut = useMutation(
    trpc.sale.createFromOS.mutationOptions({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSuccess: (sale: any) => {
        if (sale?.id) router.push(`/pdv?saleId=${sale.id}`);
      },
      onError: (e: { message: string }) => toast.error(e.message),
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

  // Sprint 1A mutations
  const sendTrackingMut = useMutation(
    trpc.serviceOrder.sendTracking.mutationOptions({
      onSuccess: () => { toast.success("Link de rastreamento enviado!"); setTrackingDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  // ── Laboratorio Externo ──
  const sendToLabMut = useMutation(
    trpc.serviceOrder.sendToLab.mutationOptions({
      onSuccess: () => { toast.success("Aparelho enviado ao laboratorio."); setSendLabDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );
  const receiveFromLabMut = useMutation(
    trpc.serviceOrder.receiveFromLab.mutationOptions({
      onSuccess: () => { toast.success("Recebimento confirmado."); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );
  const cancelLabMut = useMutation(
    trpc.serviceOrder.cancelLab.mutationOptions({
      onSuccess: () => { toast.success("Envio cancelado."); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );
  const notifyDeliveryPersonMut = useMutation(
    trpc.serviceOrder.notifyDeliveryPerson.mutationOptions({
      onSuccess: (data: { whatsappSent: boolean }) => {
        toast.success(data.whatsappSent ? "Entregador notificado." : "Entregador atualizado (WhatsApp indisponivel).");
        setNotifyDeliveryDialog(false);
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendReceiptMut = useMutation(
    trpc.serviceOrder.sendReceipt.mutationOptions({
      onSuccess: () => toast.success("Recibo enviado via WhatsApp."),
      onError: (e) => toast.error(e.message),
    })
  );

  // Lista de entregadores ativos para os dialogs
  const deliveryPersonsQuery = useQuery(
    trpc.operation.listDeliveryPersons.queryOptions({ active: true }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deliveryPersons = (deliveryPersonsQuery.data as any[] | undefined) ?? [];

  const sendDeliveryTermMut = useMutation(
    trpc.serviceOrder.sendDeliveryTerm.mutationOptions({
      onSuccess: (data) => {
        toast.success("Termo de entrega enviado!");
        setDeliveryTermDialog(false);
        if (data.signatureLink) window.open(data.signatureLink, "_blank");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const confirmPhysicalDeliveryTermMut = useMutation(
    trpc.serviceOrder.confirmPhysicalDeliveryTerm.mutationOptions({
      onSuccess: () => { toast.success("Termo de entrega confirmado e OS entregue!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const checkDeliveryTermStatusMut = useMutation(
    trpc.serviceOrder.checkDeliveryTermStatus.mutationOptions({
      onSuccess: (data) => {
        if (data.signed) toast.success("Termo de entrega assinado! OS entregue.");
        else toast.info("Termo de entrega ainda nao foi assinado.");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendReturnTermMut = useMutation(
    trpc.serviceOrder.sendReturnTerm.mutationOptions({
      onSuccess: (data) => {
        toast.success("Termo de devolucao enviado!");
        setReturnTermDialog(false);
        if (data.signatureLink) window.open(data.signatureLink, "_blank");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const confirmPhysicalReturnTermMut = useMutation(
    trpc.serviceOrder.confirmPhysicalReturnTerm.mutationOptions({
      onSuccess: () => { toast.success("Termo de devolucao confirmado! OS cancelada."); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const checkReturnTermStatusMut = useMutation(
    trpc.serviceOrder.checkReturnTermStatus.mutationOptions({
      onSuccess: (data) => {
        if (data.signed && data.cancelled) toast.success("Termo assinado e OS cancelada!");
        else if (data.signed) toast.success("Termo assinado!");
        else toast.info("Termo de devolucao ainda nao assinado.");
        invalidateOrder();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const sendQuoteWhatsAppMut = useMutation(
    trpc.serviceOrder.sendQuoteWhatsApp.mutationOptions({
      onSuccess: () => { toast.success("Orcamento enviado por WhatsApp!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const updateTechnicalInfoMut = useMutation(
    trpc.serviceOrder.updateTechnicalInfo.mutationOptions({
      onSuccess: () => { toast.success("Informacoes tecnicas atualizadas!"); setTechInfoDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const updateTechnicianMut = useMutation(
    trpc.serviceOrder.updateTechnician.mutationOptions({
      onSuccess: () => { toast.success("Tecnico atualizado!"); setChangeTechDialog(false); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  // Query for technicians list (for change technician dialog)
  const techniciansQuery = useQuery(
    trpc.serviceOrder.listTechnicians.queryOptions()
  );

  if (isLoading || !order) {
    return <div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div>;
  }

  const status = order.status as ServiceOrderStatus;
  const allowed = ALLOWED_TRANSITIONS[status] ?? [];
  const nextOptions = getNextStatusOptions(status);
  const isCancelled = status === "CANCELLED";
  const isRefunded = status === "REFUNDED";
  const isDelivered = status === "DELIVERED";
  const isSigned = !!order.signatureSignedAt || order.physicalSignature;
  const isAdmin = order.viewerIsAdmin === true;
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
            {/* Recibo PDF + reenvio WhatsApp — paridade Laravel: apos pagamento. */}
            {["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(status) && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/api/service-orders/${order.id}/recibo`} target="_blank">
                    <FileText className="mr-2 h-4 w-4" />Recibo
                  </Link>
                </Button>
                {order.customer?.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendReceiptMut.isPending}
                    onClick={() => sendReceiptMut.mutate({ orderId: id })}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    {order.receiptSent ? "Reenviar Recibo" : "Enviar Recibo"}
                  </Button>
                )}
              </>
            )}
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
            {/* Excluir permanente: admin only, OS cancelada — paridade Laravel show.blade.php:582-590 */}
            {isCancelled && isAdmin && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteDialog(true)}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir
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

      {/* Signature Status — so antes do pagamento. Some apos assinatura confirmada. */}
      {!isCancelled && !isRefunded && !isSigned && !["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(status) && (
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

      {/* Communication — so apos OS concluida (paridade com Laravel). */}
      {!isCancelled && !isRefunded && order.customer?.phone && ["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(status) && (
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setTrackingPhone(order.customer?.phone ?? ""); setTrackingDialog(true); }}
            >
              <Navigation className="mr-1 h-3 w-3" />Enviar Rastreamento
            </Button>
          </div>
        </div>
      )}

      {/* Delivery Term — durante PAID/READY_FOR_PICKUP. Some apos DELIVERED. */}
      {!isCancelled && !isRefunded && !isDelivered && ["PAID", "READY_FOR_PICKUP"].includes(status) && (
        <div className={`rounded-lg border-2 p-4 mb-6 ${order.deliveryTermSigned ? "border-success bg-success/10" : "border-emerald-500 bg-emerald-500/10"}`}>
          <h3 className={`font-semibold flex items-center gap-2 ${order.deliveryTermSigned ? "text-success" : "text-emerald-400"}`}>
            <Truck className="h-5 w-5" />
            Termo de Entrega {order.deliveryTermSigned ? "- Assinado" : ""}
          </h3>
          {order.deliveryTermLink && (
            <p className="text-xs text-muted-foreground mt-1">
              Enviado em {order.deliveryTermSentAt ? format(new Date(order.deliveryTermSentAt), "dd/MM/yyyy HH:mm") : "-"}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {!order.deliveryTermSigned && !order.deliveryTermAutentiqueId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setDeliveryTermPhone(order.customer?.phone ?? ""); setDeliveryTermDialog(true); }}
              >
                <Send className="mr-1 h-3 w-3" />Enviar Termo de Entrega
              </Button>
            )}
            {order.deliveryTermAutentiqueId && !order.deliveryTermSigned && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={checkDeliveryTermStatusMut.isPending}
                  onClick={() => checkDeliveryTermStatusMut.mutate({ orderId: id })}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />Verificar Assinatura
                </Button>
                {order.deliveryTermLink && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={order.deliveryTermLink as string} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3 w-3" />Ver Documento
                    </a>
                  </Button>
                )}
              </>
            )}
            {!order.deliveryTermSigned && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirmPhysicalDeliveryTermMut.mutate({ orderId: id })}
                disabled={confirmPhysicalDeliveryTermMut.isPending}
              >
                <Check className="mr-1 h-3 w-3" />Confirmar Entrega Fisica
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Return Term — so se cancelamento em curso (termo enviado ou OS ja cancelada).
          No fluxo normal nao aparece. Paridade com Laravel (mostrado apos `enviarTermoDevolucao`). */}
      {!isRefunded && !isDelivered && (order.returnTermSent || isCancelled) && (
        <div className={`rounded-lg border-2 p-4 mb-6 ${order.returnTermSigned ? "border-destructive bg-destructive/10" : "border-orange-500 bg-orange-500/10"}`}>
          <h3 className={`font-semibold flex items-center gap-2 ${order.returnTermSigned ? "text-destructive" : "text-orange-400"}`}>
            <RotateCcw className="h-5 w-5" />
            Termo de Devolucao {order.returnTermSigned ? "- Assinado (OS Cancelada)" : ""}
          </h3>
          {order.returnTermLink && (
            <p className="text-xs text-muted-foreground mt-1">
              Enviado em {order.returnTermSentAt ? format(new Date(order.returnTermSentAt), "dd/MM/yyyy HH:mm") : "-"}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {!order.returnTermSigned && !order.returnTermAutentiqueId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setReturnTermPhone(order.customer?.phone ?? ""); setReturnTermReason("Equipamento devolvido ao cliente"); setReturnTermDialog(true); }}
              >
                <Send className="mr-1 h-3 w-3" />Enviar Termo de Devolucao
              </Button>
            )}
            {order.returnTermAutentiqueId && !order.returnTermSigned && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={checkReturnTermStatusMut.isPending}
                  onClick={() => checkReturnTermStatusMut.mutate({ orderId: id })}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />Verificar Assinatura
                </Button>
                {order.returnTermLink && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={order.returnTermLink as string} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3 w-3" />Ver Documento
                    </a>
                  </Button>
                )}
              </>
            )}
            {!order.returnTermSigned && !isCancelled && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => confirmPhysicalReturnTermMut.mutate({ orderId: id })}
                disabled={confirmPhysicalReturnTermMut.isPending}
              >
                <Check className="mr-1 h-3 w-3" />Confirmar Devolucao Fisica
              </Button>
            )}
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
            <Button
              size="sm"
              variant="outline"
              disabled={sendQuoteWhatsAppMut.isPending}
              onClick={() => sendQuoteWhatsAppMut.mutate({ orderId: id })}
            >
              <MessageCircle className="mr-1 h-3 w-3" />Enviar por WhatsApp
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/service-orders/${id}/quote-pdf`} target="_blank" rel="noopener noreferrer">
                <FileText className="mr-1 h-3 w-3" />PDF Orcamento
              </a>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => cancelQuoteMut.mutate({ orderId: id })}>
              <X className="mr-1 h-3 w-3" />Cancelar Orcamento
            </Button>
          </div>
        </div>
      )}

      {/* Lab External — paridade Laravel: 4 acoes (enviar, receber, cancelar, notificar entregador).
          Mostra card de envio quando OS esta em andamento (nao iniciada, nao cancelada).
          Aparece tambem para registrar/cancelar envio sem assistencia externa concreta. */}
      {!isCancelled && !isRefunded && !isDelivered && !["PAID", "READY_FOR_PICKUP"].includes(status) && (
        <div className={`rounded-lg border-2 p-4 mb-6 ${order.sentToLab && !order.labReceived ? "border-warning bg-warning/10" : "border-border bg-muted/30"}`}>
          <h3 className={`font-semibold flex items-center gap-2 ${order.sentToLab && !order.labReceived ? "text-warning" : "text-muted-foreground"}`}>
            <FlaskConical className="h-5 w-5" />
            Laboratorio Externo
            {order.sentToLab && !order.labReceived && <span className="text-xs font-normal">— Aguardando Retorno</span>}
            {order.sentToLab && order.labReceived && <span className="text-xs font-normal text-success">— Recebido</span>}
          </h3>
          <div className="flex flex-wrap gap-2 mt-3">
            {!order.sentToLab && (
              <Button size="sm" variant="outline" onClick={() => { setLabDeliveryPersonId(""); setSendLabDialog(true); }}>
                <Send className="mr-1 h-3 w-3" />Enviar para Laboratorio
              </Button>
            )}
            {order.sentToLab && !order.labReceived && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={receiveFromLabMut.isPending}
                  onClick={() => receiveFromLabMut.mutate({ orderId: id })}
                >
                  <Check className="mr-1 h-3 w-3" />Confirmar Recebimento
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setNotifyDeliveryContext("retirada"); setNotifyDeliveryMessage(`Por favor, retirar a OS ${order.number} no laboratorio externo.`); setNotifyDeliveryDialog(true); }}
                >
                  <MessageCircle className="mr-1 h-3 w-3" />Notificar Entregador
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={cancelLabMut.isPending}
                  onClick={() => cancelLabMut.mutate({ orderId: id })}
                >
                  <X className="mr-1 h-3 w-3" />Cancelar Envio
                </Button>
              </>
            )}
          </div>
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

            {/* Bloqueio: nao avancar status enquanto OS nao foi assinada */}
            {!isSigned && !isCancelled && !isRefunded && nextOptions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="rounded border border-warning bg-warning/10 p-3 text-sm">
                  <strong className="text-warning">Assinatura de entrada pendente.</strong>
                  <p className="text-muted-foreground mt-1">
                    Confirme a assinatura do cliente (Autentique ou fisica) antes de avancar
                    o status da OS. O aparelho fica sob responsabilidade da loja apenas
                    apos a assinatura.
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons — paridade com Laravel: so o proximo status do fluxo
                (e o seguinte se o proximo for opcional). PAID abre dialog de pagamento.
                Bloqueado enquanto OS nao for assinada. */}
            {nextOptions.length > 0 && !order.budgetPending && !isCancelled && !isRefunded && isSigned && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                {nextOptions.map((s) => {
                  if (s === "PAID") {
                    // OS sem valor ou garantia: pula PDV e registra direto via
                    // registerPayment (paridade com Laravel `podePularPdv`).
                    const skipPdv = Number(order.totalAmount) <= 0 || order.isWarranty;
                    if (skipPdv) {
                      return (
                        <Button
                          key={s}
                          size="sm"
                          onClick={() => registerPaymentMut.mutate({
                            id,
                            paymentMethod: order.isWarranty ? "garantia" : "cortesia",
                            paidAmount: order.totalAmount,
                          })}
                          disabled={registerPaymentMut.isPending}
                        >
                          <DollarSign className="mr-1 h-3 w-3" />Marcar como Paga
                        </Button>
                      );
                    }
                    return (
                      <Button
                        key={s}
                        size="sm"
                        onClick={() => createFromOSMut.mutate({ serviceOrderId: id })}
                        disabled={createFromOSMut.isPending}
                      >
                        <DollarSign className="mr-1 h-3 w-3" />Receber Pagamento (PDV)
                      </Button>
                    );
                  }
                  return (
                    <Button
                      key={s}
                      size="sm"
                      onClick={() => updateStatusMut.mutate({ id, status: s, notes: null })}
                      disabled={updateStatusMut.isPending}
                    >
                      Avancar para: {SERVICE_ORDER_STATUS_LABELS[s]}
                    </Button>
                  );
                })}
              </div>
            )}
            {nextOptions.length === 0 && allowed.length === 0 && (
              <div className="mt-4 pt-4 border-t border-border text-sm text-muted-foreground">
                {SPECIAL_STATUSES.includes(status) ? "OS em estado especial." : "Sem transicoes disponiveis."}
              </div>
            )}
          </div>

          {/* Problem & Diagnostics */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">Problema e Diagnostico</h3>
              {!isCancelled && !isRefunded && !["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(status) && (
                <Button size="sm" variant="ghost" onClick={() => { setTechDiagnosed(order.diagnosedProblem ?? ""); setTechNotes(order.internalNotes ?? ""); setTechInfoDialog(true); }}>
                  <Wrench className="h-3 w-3" />
                </Button>
              )}
            </div>
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

          {/* History Timeline (mescla mudancas de status com eventos de assinatura,
              paridade Laravel show.blade.php:1353-1413) */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Historico</h3>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
              {(() => {
                type TimelineEvent = {
                  id: string;
                  label: string;
                  detail: string | null;
                  date: Date;
                  kind: "status" | "signature";
                };
                const events: TimelineEvent[] = [];
                // Status changes
                for (const h of order.history as Array<{ id: string; newStatus: string; notes: string | null; userName: string; createdAt: Date }>) {
                  events.push({
                    id: h.id,
                    label: SERVICE_ORDER_STATUS_LABELS[h.newStatus as ServiceOrderStatus] ?? h.newStatus,
                    detail: [h.userName, h.notes].filter(Boolean).join(" — ") || null,
                    date: new Date(h.createdAt),
                    kind: "status",
                  });
                }
                // Eventos de assinatura — exibidos quando datados.
                if (order.signatureSignedAt) {
                  events.push({
                    id: "sig-entry",
                    label: "Assinatura de Entrada",
                    detail: order.physicalSignature ? "Assinatura fisica confirmada" : "Assinatura digital (Autentique)",
                    date: new Date(order.signatureSignedAt),
                    kind: "signature",
                  });
                }
                if (order.deliveryTermSignedAt) {
                  events.push({
                    id: "sig-delivery",
                    label: "Termo de Entrega Assinado",
                    detail: order.deliveryTermPhysical ? "Assinatura fisica" : "Assinatura digital (Autentique)",
                    date: new Date(order.deliveryTermSignedAt),
                    kind: "signature",
                  });
                }
                if (order.returnTermSignedAt) {
                  events.push({
                    id: "sig-return",
                    label: "Termo de Devolucao Assinado",
                    detail: order.returnTermPhysical ? "Assinatura fisica" : "Assinatura digital (Autentique)",
                    date: new Date(order.returnTermSignedAt),
                    kind: "signature",
                  });
                }
                // Ordem cronologica decrescente (mais recente primeiro)
                events.sort((a, b) => b.date.getTime() - a.date.getTime());

                return events.map((e) => (
                  <div key={e.id} className="relative">
                    <div
                      className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 bg-card ${
                        e.kind === "signature" ? "border-amber-500" : "border-primary"
                      }`}
                    />
                    <div className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{e.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(e.date, "dd/MM/yyyy HH:mm")}
                        </span>
                      </div>
                      {e.detail && <p className="text-xs text-muted-foreground italic mt-1">{e.detail}</p>}
                    </div>
                  </div>
                ));
              })()}
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
              {(() => {
                const pending = Math.max(0, order.totalAmount - order.paidAmount - order.paymentDiscount);
                if (pending > 0) {
                  return (
                    <div className="flex justify-between rounded bg-warning/10 px-2 py-1">
                      <span className="text-warning font-semibold">Pendente</span>
                      <span className="text-warning font-mono font-bold">{formatMoney(pending)}</span>
                    </div>
                  );
                }
                return null;
              })()}
              {order.paymentDiscount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="text-warning font-mono">{formatMoney(order.paymentDiscount)}</span></div>
              )}
              {order.paymentMethod && (
                <div className="flex justify-between"><span className="text-muted-foreground">Forma</span><span>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span></div>
              )}
              {order.paymentDate && (
                <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{format(new Date(order.paymentDate), "dd/MM/yyyy")}</span></div>
              )}
              {order.linkedSale && (
                <div className="flex justify-between border-t border-border pt-2 mt-2">
                  <span className="text-muted-foreground">Venda PDV</span>
                  <Link
                    href={`/pdv/${order.linkedSale.id}`}
                    className="text-primary hover:underline font-mono text-xs"
                  >
                    #{order.linkedSale.number}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Card Datas — paridade Laravel show.blade.php:1666-1691 */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Datas</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrada</span>
                <span>{format(new Date(order.entryDate), "dd/MM/yyyy HH:mm")}</span>
              </div>
              {order.estimatedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Previsao</span>
                  <span>{format(new Date(order.estimatedDate), "dd/MM/yyyy")}</span>
                </div>
              )}
              {order.completedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Conclusao</span>
                  <span>{format(new Date(order.completedDate), "dd/MM/yyyy HH:mm")}</span>
                </div>
              )}
              {order.deliveredDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entrega</span>
                  <span>{format(new Date(order.deliveredDate), "dd/MM/yyyy HH:mm")}</span>
                </div>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">Responsaveis</h3>
              {!isCancelled && !isRefunded && (
                <Button size="sm" variant="ghost" onClick={() => { setSelectedTechId(order.technicianId ?? ""); setChangeTechDialog(true); }}>
                  <UserCog className="h-3 w-3" />
                </Button>
              )}
            </div>
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
          <div className="space-y-4">
            {!order.returnTermSigned && !order.returnTermPhysical && (
              <div className="rounded border border-warning bg-warning/10 p-3 text-sm">
                <strong className="text-warning">Termo de devolucao pendente.</strong>
                <p className="text-muted-foreground mt-1">
                  Toda OS exige termo de devolucao assinado antes do cancelamento — o aparelho
                  esta sob responsabilidade da loja. Envie o termo ou confirme a devolucao
                  fisica. Administradores podem forcar o cancelamento marcando a opcao abaixo.
                </p>
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={cancelForce}
                    onChange={(e) => setCancelForce(e.target.checked)}
                  />
                  <span className="text-sm">Forcar cancelamento sem termo (apenas admin)</span>
                </label>
              </div>
            )}
            <div>
              <Label>Motivo do Cancelamento</Label>
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Informe o motivo..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason || cancelMut.isPending}
              onClick={() => {
                cancelMut.mutate({ id, reason: cancelReason, force: cancelForce });
                setCancelDialog(false);
              }}
            >
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog (admin only, OS cancelada) */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir OS permanentemente</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Esta acao remove a OS <strong>#{order.number}</strong> de forma permanente (soft delete).</p>
            <p className="text-destructive">
              Voce so deve excluir uma OS por erro de cadastro. Para fluxo normal, prefira <strong>Cancelar</strong>.
            </p>
            <p className="text-muted-foreground text-xs">
              Se esta OS for referenciada como OS original em garantias/retornos, a exclusao sera bloqueada.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => { deleteMut.mutate({ id }); setDeleteDialog(false); }}
            >
              Excluir permanentemente
            </Button>
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

      {/* Send to Lab Dialog */}
      <Dialog open={sendLabDialog} onOpenChange={setSendLabDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar para Laboratorio Externo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Marca a OS como enviada ao laboratorio externo. Opcionalmente associa um entregador
              e envia mensagem via WhatsApp.
            </p>
            <div>
              <Label>Entregador (opcional)</Label>
              <Select value={labDeliveryPersonId} onValueChange={setLabDeliveryPersonId}>
                <SelectTrigger><SelectValue placeholder="Sem entregador" /></SelectTrigger>
                <SelectContent>
                  {deliveryPersons.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {labDeliveryPersonId && (
              <div>
                <Label>Mensagem WhatsApp (opcional)</Label>
                <Textarea
                  value={notifyDeliveryMessage}
                  onChange={(e) => setNotifyDeliveryMessage(e.target.value)}
                  placeholder={`Ex.: Por favor, entregar a OS ${order.number} no laboratorio X.`}
                  rows={3}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendLabDialog(false)}>Cancelar</Button>
            <Button
              disabled={sendToLabMut.isPending}
              onClick={() =>
                sendToLabMut.mutate({
                  orderId: id,
                  deliveryPersonId: labDeliveryPersonId || null,
                  message: labDeliveryPersonId && notifyDeliveryMessage ? notifyDeliveryMessage : null,
                })
              }
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notify Delivery Person Dialog */}
      <Dialog open={notifyDeliveryDialog} onOpenChange={setNotifyDeliveryDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Notificar Entregador via WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Entregador *</Label>
              <Select value={labDeliveryPersonId} onValueChange={setLabDeliveryPersonId}>
                <SelectTrigger><SelectValue placeholder="Selecione um entregador" /></SelectTrigger>
                <SelectContent>
                  {deliveryPersons.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : " (sem WhatsApp)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea
                value={notifyDeliveryMessage}
                onChange={(e) => setNotifyDeliveryMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyDeliveryDialog(false)}>Cancelar</Button>
            <Button
              disabled={!labDeliveryPersonId || !notifyDeliveryMessage || notifyDeliveryPersonMut.isPending}
              onClick={() =>
                notifyDeliveryPersonMut.mutate({
                  orderId: id,
                  deliveryPersonId: labDeliveryPersonId,
                  message: notifyDeliveryMessage,
                  context: notifyDeliveryContext,
                })
              }
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tracking Dialog */}
      <Dialog open={trackingDialog} onOpenChange={setTrackingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar Rastreamento via WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Telefone</Label><Input value={trackingPhone} onChange={(e) => setTrackingPhone(e.target.value)} placeholder="(11) 99999-9999" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrackingDialog(false)}>Cancelar</Button>
            <Button disabled={!trackingPhone || sendTrackingMut.isPending} onClick={() => sendTrackingMut.mutate({ orderId: id, phone: trackingPhone })}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Term Dialog */}
      <Dialog open={deliveryTermDialog} onOpenChange={setDeliveryTermDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar Termo de Entrega</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">O termo sera enviado para assinatura digital via Autentique e notificado por WhatsApp.</p>
            <div><Label>Telefone do Cliente</Label><Input value={deliveryTermPhone} onChange={(e) => setDeliveryTermPhone(e.target.value)} placeholder="(11) 99999-9999" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryTermDialog(false)}>Cancelar</Button>
            <Button disabled={sendDeliveryTermMut.isPending} onClick={() => sendDeliveryTermMut.mutate({ orderId: id, phone: deliveryTermPhone || null })}>Enviar Termo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Term Dialog */}
      <Dialog open={returnTermDialog} onOpenChange={setReturnTermDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar Termo de Devolucao</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">O termo sera enviado para assinatura digital. Apos assinado, a OS sera cancelada automaticamente.</p>
            <div><Label>Telefone do Cliente</Label><Input value={returnTermPhone} onChange={(e) => setReturnTermPhone(e.target.value)} placeholder="(11) 99999-9999" /></div>
            <div><Label>Motivo da Devolucao</Label><Textarea value={returnTermReason} onChange={(e) => setReturnTermReason(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnTermDialog(false)}>Cancelar</Button>
            <Button disabled={sendReturnTermMut.isPending} onClick={() => sendReturnTermMut.mutate({ orderId: id, phone: returnTermPhone || null, reason: returnTermReason || null })}>Enviar Termo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Technical Info Dialog */}
      <Dialog open={techInfoDialog} onOpenChange={setTechInfoDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Informacoes Tecnicas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Defeito Constatado</Label><Textarea value={techDiagnosed} onChange={(e) => setTechDiagnosed(e.target.value)} rows={3} placeholder="Descreva o defeito encontrado..." /></div>
            <div><Label>Observacoes Internas</Label><Textarea value={techNotes} onChange={(e) => setTechNotes(e.target.value)} rows={3} placeholder="Observacoes internas da equipe..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTechInfoDialog(false)}>Cancelar</Button>
            <Button disabled={updateTechnicalInfoMut.isPending} onClick={() => updateTechnicalInfoMut.mutate({ orderId: id, diagnosedProblem: techDiagnosed || null, internalNotes: techNotes || null })}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Technician Dialog */}
      <Dialog open={changeTechDialog} onOpenChange={setChangeTechDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alterar Tecnico Responsavel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tecnico</Label>
              <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                <SelectTrigger><SelectValue placeholder="Selecione um tecnico" /></SelectTrigger>
                <SelectContent>
                  {(techniciansQuery.data ?? []).map((t: { id: string; name: string; role: string }) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeTechDialog(false)}>Cancelar</Button>
            <Button disabled={!selectedTechId || updateTechnicianMut.isPending} onClick={() => updateTechnicianMut.mutate({ orderId: id, technicianId: selectedTechId })}>Alterar Tecnico</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
