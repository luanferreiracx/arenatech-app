"use client";

import { Fragment, useEffect, useState } from "react";
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
  CheckCheck,
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
import { WhatsAppSendDialog } from "@/components/domain/whatsapp-send-dialog";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import {
  SERVICE_ORDER_STATUS_LABELS,
  SERVICE_ORDER_STATUS_VARIANT,
  STATUS_FLOW,
  OPTIONAL_STATUSES,
  SPECIAL_STATUSES,
  ALLOWED_TRANSITIONS,
  getNextStatusOptions,
  isSkippingSteps,
  isCancellableOsStatus,
  isRefundableOsStatus,
  isLabEligibleStatus,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";
import { type RouterOutputs } from "@/trpc/types";
import { StatusStepper } from "./status-stepper";

type ServiceOrderDetail = NonNullable<RouterOutputs["serviceOrder"]["getById"]>;
type PartProduct = RouterOutputs["serviceOrder"]["searchParts"][number];
import { ConcludeOsDialog } from "./conclude-os-dialog";
import {
  OrderHistoryTimeline,
  OrderPaymentCard,
  OrderDatesCard,
  OrderWarrantyCard,
  OrderCustomerCard,
  OrderEquipmentCard,
  OrderEntryChecklistCard,
  OrderDeviceInfoCard,
} from "./detail-sections";

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

  const order: ServiceOrderDetail | undefined = orderQuery.data;

  // Dialogs
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelForce, setCancelForce] = useState(false);
  const [uncancelDialog, setUncancelDialog] = useState(false);
  const [uncancelReason, setUncancelReason] = useState("");
  const [refundDialog, setRefundDialog] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  // Pagamento da OS hoje passa pelo PDV (ADR 0042) — nao ha mais dialog
  // local. `registerPaymentMut` permanece pro caso de garantia/cortesia
  // (valor 0) que e disparado diretamente em um botao.
  const [addItemDialog, setAddItemDialog] = useState(false);
  const [newItemType, setNewItemType] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [newItemProductId, setNewItemProductId] = useState<string | null>(null);
  const [newItemVariationId, setNewItemVariationId] = useState<string | null>(null);
  const [newItemServiceId, setNewItemServiceId] = useState<string | null>(null);
  const [newItemCostPrice, setNewItemCostPrice] = useState(0);
  // Produto com variacoes selecionado e aguardando escolha da variacao.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingVariationProduct, setPendingVariationProduct] = useState<PartProduct | null>(null);
  const [partsSearch, setPartsSearch] = useState("");
  const [partsDebounced, setPartsDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setPartsDebounced(partsSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [partsSearch]);
  // Busca de pecas (autocomplete no Adicionar Item)
  const partsQuery = useQuery(
    trpc.serviceOrder.searchParts.queryOptions(
      { query: partsDebounced || undefined, limit: 10 },
      { enabled: newItemType === "PRODUCT" && partsDebounced.length >= 2 },
    ),
  );
  // Busca de servicos no catalogo (paridade com a criacao da OS — antes a
  // edicao so aceitava texto livre).
  const servicesQuery = useQuery(
    trpc.catalog.listServices.queryOptions(
      { search: partsDebounced || undefined, active: true, pageSize: 10 },
      { enabled: newItemType === "SERVICE" && partsDebounced.length >= 2 },
    ),
  );
  const [costsEditing, setCostsEditing] = useState(false);
  const [partsCostEdit, setPartsCostEdit] = useState(0);
  const [otherCostEdit, setOtherCostEdit] = useState(0);
  // Revisao de orcamento (autorizacao pos-assinatura)
  const [budgetReason, setBudgetReason] = useState("");
  // Verificacao sob demanda da resposta do cliente ao orcamento (checkQuoteStatus).
  const [checkQuotePending, setCheckQuotePending] = useState(false);
  // Envio do orçamento ao cliente — modal de número (padrão do sistema).
  const [budgetApprovalDialog, setBudgetApprovalDialog] = useState(false);
  // Edicao inline de item
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemDesc, setEditItemDesc] = useState("");
  const [editItemQty, setEditItemQty] = useState(1);
  const [editItemPrice, setEditItemPrice] = useState(0);
  // New dialogs — Sprint 1A
  const [signatureDialog, setSignatureDialog] = useState(false);
  const [trackingDialog, setTrackingDialog] = useState(false);
  const [deliveryTermDialog, setDeliveryTermDialog] = useState(false);
  const [returnTermDialog, setReturnTermDialog] = useState(false);
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
  // Conclusao da OS: dialogo unico (avancar normal OU pular etapas) que
  // pergunta se avisa o cliente por WhatsApp. `concludeSkipping` muda a copy/nota.
  const [concludeDialog, setConcludeDialog] = useState(false);
  const [concludeSkipping, setConcludeSkipping] = useState(false);
  // Reenvio manual da notificacao de conclusao (escolhe/digita telefone).
  const [notifyCompletedDialog, setNotifyCompletedDialog] = useState(false);
  // Envio do recibo por WhatsApp (escolhe/digita telefone — padrão do sistema).
  const [receiptDialog, setReceiptDialog] = useState(false);

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
      onSuccess: () => { toast.success("Pagamento registrado!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  // Cria/reusa rascunho de Sale para pagamento da OS e navega pro PDV.
  // Substitui o registerPayment direto da OS (ADR 0042: PDV-OS integration).
  // O retorno tipado pelo tRPC e a Sale completa; extraimos `id`.
  const createFromOSMut = useMutation(
    trpc.sale.createFromOS.mutationOptions({
      onSuccess: (sale) => {
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
      onSuccess: () => {
        toast.success("Link de assinatura enviado por WhatsApp!");
        setSignatureDialog(false);
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


  const updateItemMut = useMutation(
    trpc.serviceOrder.updateItem.mutationOptions({
      onSuccess: () => { toast.success("Item atualizado!"); setEditItemId(null); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );


  const cancelQuoteMut = useMutation(
    trpc.serviceOrder.cancelQuote.mutationOptions({
      onSuccess: () => { toast.success("Alteracao cancelada — itens revertidos."); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const approveQuoteMut = useMutation(
    trpc.serviceOrder.approveQuoteManually.mutationOptions({
      onSuccess: () => { toast.success("Orcamento autorizado!"); invalidateOrder(); },
      onError: (e) => toast.error(e.message),
    })
  );

  // checkQuoteStatus e uma query — disparada sob demanda para saber se o cliente
  // ja respondeu pelo link publico (respondToQuote aplica no servidor). Refaz a
  // OS depois para refletir o novo status.
  const handleCheckQuote = async () => {
    setCheckQuotePending(true);
    try {
      const res = await queryClient.fetchQuery(
        trpc.serviceOrder.checkQuoteStatus.queryOptions({ orderId: id }),
      );
      if (res.approved) toast.success("Cliente aprovou o orcamento!");
      else if (res.rejected) toast.info("Cliente rejeitou o orcamento.");
      else if (res.pending) toast.info("Orcamento ainda aguardando resposta do cliente.");
      else toast.info("Orcamento resolvido — atualizando a OS.");
      invalidateOrder();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao verificar o orcamento.");
    } finally {
      setCheckQuotePending(false);
    }
  };

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
  const deliveryPersons = deliveryPersonsQuery.data ?? [];

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

  const requestBudgetApprovalMut = useMutation(
    trpc.serviceOrder.requestBudgetApproval.mutationOptions({
      onSuccess: (data: { whatsappSent: boolean }) => {
        toast.success(data.whatsappSent ? "Orcamento enviado ao cliente por WhatsApp!" : "Orcamento marcado como enviado (WhatsApp indisponivel).");
        invalidateOrder();
      },
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
    trpc.serviceOrder.listTechnicianAssignees.queryOptions()
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
  // Assinatura de entrada confirmada (Autentique, fisica ou signature-pad) —
  // espelha isEntrySigned() no servidor.
  const isSigned = !!order.signatureSignedAt || order.physicalSignature || !!order.entrySignatureAt;
  const isAdmin = order.viewerIsAdmin === true;
  // Itens so podem ser alterados fora dos estados finalizados (paridade com o
  // guard do servidor em add/update/removeItem).
  const canEditItems = !isCancelled && !isRefunded && !["PAID", "DELIVERED"].includes(status);
  // Custos: espelha o guard de `updateCosts` no servidor. CANCELLED/REFUNDED
  // nunca editam; PAID/DELIVERED só admin corrige; demais estados todos editam.
  const isCostClosed = ["PAID", "DELIVERED"].includes(status);
  const canEditCosts = !isCancelled && !isRefunded && (!isCostClosed || isAdmin);
  const pendingQuote = order.quotes?.find((q: { status: string }) => q.status === "pending");
  const deliveryTermSigned = !!order.deliveryTermSigned || !!order.deliveryTermPhysical;
  const returnTermSigned = !!order.returnTermSigned || !!order.returnTermPhysical;
  const labReturnPending = !!order.sentToLab && !order.labReceived;
  const canShowDeliveryTerm =
    !isCancelled &&
    !isRefunded &&
    (["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(status) || !!order.deliveryTermSent || deliveryTermSigned);
  const canSendDeliveryTerm = ["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(status) && !deliveryTermSigned;
  const canConfirmDeliveryTerm = ["PAID", "READY_FOR_PICKUP"].includes(status) && !deliveryTermSigned;
  const statusBlockers = [
    !isSigned && nextOptions.length > 0 && !isCancelled && !isRefunded
      ? {
          key: "signature",
          title: "Assinatura de entrada pendente",
          description:
            "Confirme a assinatura do cliente (digital ou fisica) antes de avancar a OS.",
        }
      : null,
    order.budgetPending
      ? {
          key: "budget",
          title: "Orcamento aguardando autorizacao",
          description:
            "Envie a revisao ao cliente, autorize como gerente ou cancele a alteracao antes de mudar o status.",
        }
      : null,
    labReturnPending
      ? {
          key: "lab",
          title: "Aparelho no laboratorio externo",
          description:
            "Confirme o retorno do aparelho do laboratorio antes de concluir a OS.",
        }
      : null,
    ["PAID", "READY_FOR_PICKUP"].includes(status) && !deliveryTermSigned
      ? {
          key: "delivery-term",
          title: "Termo de entrega pendente",
          description:
            "Envie o termo para assinatura ou confirme a entrega fisica antes de marcar como entregue.",
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; title: string; description: string }>;

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
            {/* Termo de Entrega — disponivel apos pagamento (entrega do aparelho). */}
            {["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(status) && (
              <Button variant="outline" asChild>
                <Link href={`/api/service-orders/${order.id}/termo-entrega`} target="_blank">
                  <FileText className="mr-2 h-4 w-4" />Termo Entrega
                </Link>
              </Button>
            )}
            {/* Termo de Devolucao — so no fluxo de cancelamento (termo enviado ou
                OS cancelada). No fluxo normal nao faz sentido oferecer o PDF. */}
            {!isRefunded && !isDelivered && (order.returnTermSent || isCancelled || returnTermSigned) && (
              <Button variant="outline" asChild>
                <Link href={`/api/service-orders/${order.id}/termo-devolucao`} target="_blank">
                  <FileText className="mr-2 h-4 w-4" />Termo Devolucao
                </Link>
              </Button>
            )}
            {/* Recibo PDF + reenvio WhatsApp — paridade Laravel: apos pagamento. */}
            {["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(status) && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/api/service-orders/${order.id}/recibo`} target="_blank">
                    <FileText className="mr-2 h-4 w-4" />Recibo
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={sendReceiptMut.isPending}
                  onClick={() => setReceiptDialog(true)}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {order.receiptSent ? "Reenviar Recibo" : "Enviar Recibo"}
                </Button>
              </>
            )}
            {!isCancelled && !isRefunded && (
              <Button variant="outline" asChild>
                <Link href={`/service-orders/${order.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />Editar
                </Link>
              </Button>
            )}
            {isCancellableOsStatus(status) && (
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
            {isRefundableOsStatus(status) && !isRefunded && (
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

      {/* Signature Status — antes do pagamento; continua visivel enquanto pendente. */}
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
            {!isSigned && (
              <Button
                size="sm"
                variant="outline"
                disabled={sendForSignatureMut.isPending}
                onClick={() => setSignatureDialog(true)}
              >
                <Send className="mr-1 h-3 w-3" />
                {order.signatureDocumentId ? "Reenviar para Assinatura" : "Enviar para Assinatura Digital"}
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

      {/* Communication — para avisar o cliente a retirar o aparelho. Some após
          ENTREGUE (aparelho já entregue → nada a comunicar). Aparece mesmo sem
          telefone cadastrado: o operador pode digitar um no envio. */}
      {!isCancelled && !isRefunded && ["COMPLETED", "PAID", "READY_FOR_PICKUP"].includes(status) && (
        <div className="rounded-lg border-2 border-blue-500 bg-blue-500/10 p-4 mb-6">
          <h3 className="font-semibold text-blue-400 flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />Comunicacao
          </h3>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={notifyCompletedMut.isPending}
              onClick={() => setNotifyCompletedDialog(true)}
            >
              <MessageCircle className="mr-1 h-3 w-3" />Enviar Conclusao por WhatsApp
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTrackingDialog(true)}
            >
              <Navigation className="mr-1 h-3 w-3" />Enviar Rastreamento
            </Button>
          </div>
        </div>
      )}

      {/* Delivery Term — visivel apos pagamento/retirada e mantido apos entrega para auditoria. */}
      {canShowDeliveryTerm && (
        <div className={`rounded-lg border-2 p-4 mb-6 ${deliveryTermSigned ? "border-success bg-success/10" : "border-emerald-500 bg-emerald-500/10"}`}>
          <h3 className={`font-semibold flex items-center gap-2 ${deliveryTermSigned ? "text-success" : "text-emerald-400"}`}>
            <Truck className="h-5 w-5" />
            Termo de Entrega {deliveryTermSigned ? "- Assinado" : ""}
          </h3>
          {order.deliveryTermLink && (
            <p className="text-xs text-muted-foreground mt-1">
              Enviado em {order.deliveryTermSentAt ? format(new Date(order.deliveryTermSentAt), "dd/MM/yyyy HH:mm") : "-"}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {canSendDeliveryTerm && !order.deliveryTermAutentiqueId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeliveryTermDialog(true)}
              >
                <Send className="mr-1 h-3 w-3" />Enviar Termo de Entrega
              </Button>
            )}
            {order.deliveryTermAutentiqueId && !deliveryTermSigned && (
              // Antes da assinatura, so a verificacao de status — visualizar o
              // documento no Autentique fica disponivel apos o cliente assinar.
              <Button
                size="sm"
                variant="outline"
                disabled={checkDeliveryTermStatusMut.isPending}
                onClick={() => checkDeliveryTermStatusMut.mutate({ orderId: id })}
              >
                <RefreshCw className="mr-1 h-3 w-3" />Verificar Assinatura
              </Button>
            )}
            {canConfirmDeliveryTerm && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirmPhysicalDeliveryTermMut.mutate({ orderId: id })}
                disabled={confirmPhysicalDeliveryTermMut.isPending}
              >
                <Check className="mr-1 h-3 w-3" />Confirmar Entrega Fisica
              </Button>
            )}
            {deliveryTermSigned && order.deliveryTermLink && (
              <Button size="sm" variant="outline" asChild>
                <a href={order.deliveryTermLink as string} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" />Ver Termo Assinado
                </a>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Return Term — so se cancelamento em curso (termo enviado ou OS ja cancelada).
          No fluxo normal nao aparece. Paridade com Laravel (mostrado apos `enviarTermoDevolucao`). */}
      {!isRefunded && !isDelivered && (order.returnTermSent || isCancelled || returnTermSigned) && (
        <div className={`rounded-lg border-2 p-4 mb-6 ${returnTermSigned ? "border-destructive bg-destructive/10" : "border-orange-500 bg-orange-500/10"}`}>
          <h3 className={`font-semibold flex items-center gap-2 ${returnTermSigned ? "text-destructive" : "text-orange-400"}`}>
            <RotateCcw className="h-5 w-5" />
            Termo de Devolucao {returnTermSigned ? "- Assinado (OS Cancelada)" : ""}
          </h3>
          {order.returnTermLink && (
            <p className="text-xs text-muted-foreground mt-1">
              Enviado em {order.returnTermSentAt ? format(new Date(order.returnTermSentAt), "dd/MM/yyyy HH:mm") : "-"}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {!returnTermSigned && !order.returnTermAutentiqueId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setReturnTermReason("Equipamento devolvido ao cliente"); setReturnTermDialog(true); }}
              >
                <Send className="mr-1 h-3 w-3" />Enviar Termo de Devolucao
              </Button>
            )}
            {order.returnTermAutentiqueId && !returnTermSigned && (
              // Antes da assinatura, so a verificacao de status — visualizar o
              // documento no Autentique fica disponivel apos o cliente assinar.
              <Button
                size="sm"
                variant="outline"
                disabled={checkReturnTermStatusMut.isPending}
                onClick={() => checkReturnTermStatusMut.mutate({ orderId: id })}
              >
                <RefreshCw className="mr-1 h-3 w-3" />Verificar Assinatura
              </Button>
            )}
            {!returnTermSigned && !isCancelled && (
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

      {/* Budget revision pending authorization */}
      {pendingQuote && (() => {
        const diff = pendingQuote.newTotal - pendingQuote.previousTotal;
        const sent = pendingQuote.sentToCustomer;
        return (
          <div id="orcamento-pendente" className="rounded-lg border-2 border-purple-500 bg-purple-500/10 p-4 mb-6">
            <h3 className="font-semibold text-purple-400 flex items-center gap-2 mb-1">
              <DollarSign className="h-5 w-5" />Alteracao de Orcamento — Aguardando Autorizacao
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              {sent
                ? "Enviado ao cliente — aguardando resposta. Voce pode reenviar, autorizar manualmente ou cancelar a alteracao."
                : "O orcamento foi alterado apos a assinatura. Envie ao cliente para autorizar, autorize manualmente (gerente) ou cancele a alteracao."}
            </p>
            {/* responsive-audit-ignore: 3 valores monetários curtos (text-sm), legível a 320px */}
            <div className="grid grid-cols-3 gap-3 text-sm mb-3">
              <div>
                <p className="text-muted-foreground text-xs">Valor Anterior</p>
                <p className="font-semibold font-mono">{formatMoney(pendingQuote.previousTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Novo Valor</p>
                <p className="font-semibold text-purple-400 font-mono">{formatMoney(pendingQuote.newTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Diferenca</p>
                <p className={`font-semibold font-mono ${diff > 0 ? "text-warning" : diff < 0 ? "text-success" : ""}`}>
                  {diff > 0 ? "+" : ""}{formatMoney(diff)}
                </p>
              </div>
            </div>
            <div className="mb-3">
              <Label className="text-xs">Motivo da alteracao (enviado ao cliente)</Label>
              <Textarea
                value={budgetReason}
                onChange={(e) => setBudgetReason(e.target.value)}
                placeholder="Ex.: Diagnostico identificou troca de bateria alem da tela."
                rows={2}
                className="mt-1"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!budgetReason.trim() || requestBudgetApprovalMut.isPending}
                onClick={() => setBudgetApprovalDialog(true)}
              >
                <MessageCircle className="mr-1 h-3 w-3" />{sent ? "Reenviar ao cliente" : "Enviar para autorizacao"}
              </Button>
              {sent && (
                <Button size="sm" variant="outline" onClick={handleCheckQuote} disabled={checkQuotePending}>
                  <RefreshCw className={`mr-1 h-3 w-3 ${checkQuotePending ? "animate-spin" : ""}`} />Verificar resposta do cliente
                </Button>
              )}
              {order.viewerCanAuthorize && (
                <Button size="sm" variant="outline" onClick={() => approveQuoteMut.mutate({ orderId: id })} disabled={approveQuoteMut.isPending}>
                  <Check className="mr-1 h-3 w-3" />Autorizar agora (gerente)
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/service-orders/${id}/quote-pdf`} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-1 h-3 w-3" />PDF Orcamento
                </a>
              </Button>
              <Button size="sm" variant="destructive" onClick={() => cancelQuoteMut.mutate({ orderId: id })} disabled={cancelQuoteMut.isPending}>
                <X className="mr-1 h-3 w-3" />Cancelar alteracao (reverter)
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Lab External — paridade Laravel: 4 acoes (enviar, receber, cancelar, notificar entregador).
          Mostra card de envio quando OS esta em andamento (nao iniciada, nao cancelada).
          Aparece tambem para registrar/cancelar envio sem assistencia externa concreta. */}
      {isLabEligibleStatus(status) && (
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
          <OrderCustomerCard customer={order.customer} />

          <OrderEquipmentCard {...order} />

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

          <OrderEntryChecklistCard {...order} />

          <OrderDeviceInfoCard {...order} />

          {/* Items */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">Itens</h3>
              {canEditItems && (
                <Button size="sm" variant="outline" onClick={() => { setNewItemDesc(""); setNewItemQty(1); setNewItemPrice(0); setAddItemDialog(true); }}>
                  <Plus className="mr-1 h-3 w-3" />Adicionar
                </Button>
              )}
            </div>
            {/* Aviso: edicao apos assinatura exige autorizacao do cliente */}
            {canEditItems && isSigned && !order.budgetPending && (
              <p className="text-xs text-warning mb-3 rounded bg-warning/10 px-2 py-1">
                Alterar itens apos a assinatura cria uma revisao de orcamento que precisa da autorizacao do cliente (ou de um gerente).
              </p>
            )}
            {order.items.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum item cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {order.items.map((item: { id: string; type: string; description: string; quantity: number; unitPrice: number; total: number }) => (
                  editItemId === item.id ? (
                    <div key={item.id} className="space-y-2 py-2 border-b border-border last:border-b-0">
                      <Input value={editItemDesc} onChange={(e) => setEditItemDesc(e.target.value)} placeholder="Descricao" className="text-sm" />
                      <div className="flex items-center gap-2">
                        <div className="w-20">
                          <Label className="text-[10px] text-muted-foreground">Qtd</Label>
                          <Input type="number" min={1} value={editItemQty} onChange={(e) => setEditItemQty(Math.max(1, Number(e.target.value) || 1))} className="text-sm" />
                        </div>
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Valor unitario</Label>
                          <MoneyInput value={editItemPrice} onChange={setEditItemPrice} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" disabled={!editItemDesc.trim() || updateItemMut.isPending} onClick={() => updateItemMut.mutate({ id: item.id, description: editItemDesc.trim(), quantity: editItemQty, unitPrice: editItemPrice })}>
                          <Check className="mr-1 h-3 w-3" />Salvar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditItemId(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
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
                        {canEditItems && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar item" onClick={() => { setEditItemId(item.id); setEditItemDesc(item.description); setEditItemQty(item.quantity); setEditItemPrice(item.unitPrice); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Remover item" onClick={() => removeItemMut.mutate({ id: item.id })}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                ))}
                {/* Breakdown: servico + pecas = total (BRUTO). Desconto é dado
                    no PDV, não na OS (decisão do dono). */}
                <div className="pt-2 border-t-2 border-primary space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal servicos</span><span className="font-mono">{formatMoney(order.serviceAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal pecas</span><span className="font-mono">{formatMoney(order.partsAmount)}</span></div>
                  <div className="flex justify-between pt-1 border-t border-border">
                    <span className="font-bold text-primary">Total</span>
                    <span className="font-bold text-primary font-mono text-lg">{formatMoney(order.totalAmount)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <OrderHistoryTimeline {...order} />
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* Status Stepper — coluna de acoes (status fica no topo da sidebar,
              deixando a coluna esquerda na ordem do Laravel:
              Cliente -> Equipamento -> Problema -> ...). */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Status</h3>
            <StatusStepper status={status} />

            {/* Pendencias que bloqueiam avanço/finalização. Espelha os guards do router. */}
            {statusBlockers.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="rounded border border-warning bg-warning/10 p-3 text-sm space-y-3">
                  <div>
                    <strong className="text-warning">Pendencias para avancar a OS</strong>
                    <p className="text-muted-foreground mt-1">
                      Resolva os itens abaixo antes de mudar o status. Esses bloqueios evitam finalizar ou entregar uma OS sem os documentos/etapas obrigatorias.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {statusBlockers.map((blocker) => (
                      <div key={blocker.key} className="rounded bg-background/60 border border-border/60 p-2">
                        <p className="font-medium text-foreground">{blocker.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{blocker.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {blocker.key === "signature" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setSignatureDialog(true)} disabled={sendForSignatureMut.isPending}>
                                <Send className="mr-1 h-3 w-3" />Enviar assinatura
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => confirmSigMut.mutate({ orderId: id, type: "entry" })} disabled={confirmSigMut.isPending}>
                                <Check className="mr-1 h-3 w-3" />Confirmar fisica
                              </Button>
                            </>
                          )}
                          {blocker.key === "budget" && pendingQuote && (
                            <Button size="sm" variant="outline" asChild>
                              <a href="#orcamento-pendente">
                                <DollarSign className="mr-1 h-3 w-3" />Ver autorizacao
                              </a>
                            </Button>
                          )}
                          {blocker.key === "lab" && (
                            <Button size="sm" variant="outline" onClick={() => receiveFromLabMut.mutate({ orderId: id })} disabled={receiveFromLabMut.isPending}>
                              <Check className="mr-1 h-3 w-3" />Confirmar retorno do laboratorio
                            </Button>
                          )}
                          {blocker.key === "delivery-term" && (
                            <>
                              {!order.deliveryTermAutentiqueId && (
                                <Button size="sm" variant="outline" onClick={() => setDeliveryTermDialog(true)} disabled={sendDeliveryTermMut.isPending}>
                                  <Send className="mr-1 h-3 w-3" />Enviar termo
                                </Button>
                              )}
                              {order.deliveryTermAutentiqueId && (
                                <Button size="sm" variant="outline" onClick={() => checkDeliveryTermStatusMut.mutate({ orderId: id })} disabled={checkDeliveryTermStatusMut.isPending}>
                                  <RefreshCw className="mr-1 h-3 w-3" />Verificar assinatura
                                </Button>
                              )}
                              {canConfirmDeliveryTerm && (
                                <Button size="sm" variant="outline" onClick={() => confirmPhysicalDeliveryTermMut.mutate({ orderId: id })} disabled={confirmPhysicalDeliveryTermMut.isPending}>
                                  <Check className="mr-1 h-3 w-3" />Confirmar entrega fisica
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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
                    // OS sem valor: cortesia direta (R$0).
                    if (Number(order.totalAmount) <= 0) {
                      return (
                        <Button
                          key={s}
                          size="sm"
                          onClick={() => registerPaymentMut.mutate({ id, paymentMethod: "cortesia", paidAmount: 0 })}
                          disabled={registerPaymentMut.isPending}
                        >
                          <DollarSign className="mr-1 h-3 w-3" />Marcar como Paga
                        </Button>
                      );
                    }
                    // Garantia: pode ser cortesia (defeito de fabrica → R$0) OU
                    // cobrada (mau uso / defeito nao relacionado → PDV). O operador
                    // escolhe por caso (decisao do dono).
                    if (order.isWarranty) {
                      return (
                        <Fragment key={s}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => registerPaymentMut.mutate({ id, paymentMethod: "garantia", paidAmount: 0 })}
                            disabled={registerPaymentMut.isPending}
                          >
                            <DollarSign className="mr-1 h-3 w-3" />Cortesia (garantia)
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => createFromOSMut.mutate({ serviceOrderId: id })}
                            disabled={createFromOSMut.isPending}
                          >
                            <DollarSign className="mr-1 h-3 w-3" />Cobrar via PDV
                          </Button>
                        </Fragment>
                      );
                    }
                    // OS normal com valor: pagamento via PDV.
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
                      onClick={() => {
                        // Conclusao passa pelo dialogo (pergunta WhatsApp); demais
                        // transicoes seguem diretas.
                        if (s === "COMPLETED") {
                          setConcludeSkipping(false);
                          setConcludeDialog(true);
                        } else {
                          updateStatusMut.mutate({ id, status: s, notes: null });
                        }
                      }}
                      disabled={updateStatusMut.isPending}
                    >
                      Avancar para: {SERVICE_ORDER_STATUS_LABELS[s]}
                    </Button>
                  );
                })}

                {/* Atalho: concluir direto pulando etapas (item 3). So aparece
                    se o fluxo principal tem etapas intermediarias e a transicao
                    direta para COMPLETED e permitida pelo backend. */}
                {status !== "COMPLETED" &&
                  isSkippingSteps(status, "COMPLETED") &&
                  (ALLOWED_TRANSITIONS[status] ?? []).includes("COMPLETED") &&
                  !nextOptions.includes("COMPLETED") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setConcludeSkipping(true);
                        setConcludeDialog(true);
                      }}
                      disabled={updateStatusMut.isPending}
                    >
                      <CheckCheck className="mr-1 h-3 w-3" />Concluir agora (pular etapas)
                    </Button>
                  )}
              </div>
            )}
            {nextOptions.length === 0 && allowed.length === 0 && (
              <div className="mt-4 pt-4 border-t border-border text-sm text-muted-foreground">
                {SPECIAL_STATUSES.includes(status) ? "OS em estado especial." : "Sem transicoes disponiveis."}
              </div>
            )}
          </div>

          <OrderPaymentCard {...order} />

          <OrderDatesCard {...order} />

          {/* Costs & Profit */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">Custos e Lucro</h3>
              {!costsEditing && canEditCosts && (
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

          <OrderWarrantyCard {...order} />

          {/* Responsible */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">Responsaveis</h3>
              {!isCancelled && !isRefunded && (
                <Button size="sm" variant="ghost" onClick={() => {
                  setSelectedTechId(
                    order.technicianId
                      ? `user:${order.technicianId}`
                      : order.serviceProviderId
                        ? `provider:${order.serviceProviderId}`
                        : "",
                  );
                  setChangeTechDialog(true);
                }}>
                  <UserCog className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Tecnico</span><span>{order.technicianName ?? (order.serviceProviderName ? `${order.serviceProviderName} (prestador)` : "—")}</span></div>
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

      {/* Reenvio manual da notificacao de conclusao (escolhe/digita telefone) */}
      <WhatsAppSendDialog
        open={notifyCompletedDialog}
        onOpenChange={setNotifyCompletedDialog}
        title="Enviar Conclusao por WhatsApp"
        description="Selecione um numero ou digite outro para avisar que o aparelho esta pronto."
        customerName={order.customer?.name ?? null}
        primaryPhone={order.customer?.phone ?? null}
        secondaryPhone={(order.customer as { phoneSecondary?: string | null })?.phoneSecondary ?? null}
        isLoading={notifyCompletedMut.isPending}
        confirmLabel="Enviar"
        onConfirm={async (phone) => {
          await notifyCompletedMut.mutateAsync({ serviceOrderId: id, phone });
          setNotifyCompletedDialog(false);
        }}
      />

      {/* Envio do recibo por WhatsApp (escolhe/digita telefone) */}
      <WhatsAppSendDialog
        open={receiptDialog}
        onOpenChange={setReceiptDialog}
        title="Enviar Recibo por WhatsApp"
        description="Selecione um numero ou digite outro para enviar o recibo da OS."
        customerName={order.customer?.name ?? null}
        primaryPhone={order.customer?.phone ?? null}
        secondaryPhone={(order.customer as { phoneSecondary?: string | null })?.phoneSecondary ?? null}
        isLoading={sendReceiptMut.isPending}
        confirmLabel="Enviar Recibo"
        onConfirm={async (phone) => {
          await sendReceiptMut.mutateAsync({ orderId: id, phone });
          setReceiptDialog(false);
        }}
      />

      {/* Signature WhatsApp Dialog */}
      <WhatsAppSendDialog
        open={signatureDialog}
        onOpenChange={setSignatureDialog}
        title={order.signatureDocumentId ? "Reenviar para Assinatura" : "Enviar para Assinatura Digital"}
        description="Selecione um número ou digite outro para receber o link de assinatura."
        customerName={order.customer?.name ?? null}
        primaryPhone={order.customer?.phone ?? null}
        secondaryPhone={(order.customer as { phoneSecondary?: string | null })?.phoneSecondary ?? null}
        isLoading={sendForSignatureMut.isPending}
        confirmLabel="Enviar para Autentique"
        onConfirm={async (phone) => {
          await sendForSignatureMut.mutateAsync({ orderId: id, whatsappOverride: phone });
        }}
      />

      {/* Add Item Dialog */}
      <Dialog open={addItemDialog} onOpenChange={(open) => {
        setAddItemDialog(open);
        if (!open) {
          setNewItemProductId(null);
          setNewItemVariationId(null);
          setNewItemServiceId(null);
          setPendingVariationProduct(null);
          setNewItemCostPrice(0);
          setPartsSearch("");
          setPartsDebounced("");
        }
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tipo</Label>
              <Select value={newItemType} onValueChange={(v) => {
                setNewItemType(v as "SERVICE" | "PRODUCT");
                setNewItemProductId(null);
                setNewItemVariationId(null);
                setNewItemServiceId(null);
                setNewItemDesc("");
                setNewItemPrice(0);
                setPendingVariationProduct(null);
                setNewItemCostPrice(0);
                setPartsSearch("");
                setPartsDebounced("");
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="SERVICE">Servico</SelectItem><SelectItem value="PRODUCT">Produto/Peca</SelectItem></SelectContent>
              </Select>
            </div>

            {newItemType === "PRODUCT" && !newItemProductId && (
              <div className="space-y-2">
                <Label>Buscar peca no estoque</Label>
                <Input
                  value={partsSearch}
                  onChange={(e) => setPartsSearch(e.target.value)}
                  placeholder="Nome, SKU ou marca..."
                  autoComplete="off"
                />
                {partsDebounced.length >= 2 && (
                  <div className="border border-border rounded-md max-h-48 overflow-y-auto bg-background">
                    {partsQuery.isFetching ? (
                      <p className="p-3 text-sm text-muted-foreground">Buscando...</p>
                    ) : (partsQuery.data ?? []).length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Nenhuma peca encontrada.</p>
                    ) : (
                      (partsQuery.data ?? []).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            // Produto com variacoes: abre escolha da variacao em
                            // vez de finalizar (o estoque vive na variacao).
                            if (p.hasVariations && p.variations.length > 0) {
                              setPendingVariationProduct(p);
                              setPartsSearch("");
                              setPartsDebounced("");
                              return;
                            }
                            setNewItemProductId(p.id);
                            setNewItemVariationId(null);
                            setNewItemDesc(p.name);
                            setNewItemPrice(p.salePrice);
                            setNewItemCostPrice(p.costPrice);
                            setPartsSearch("");
                            setPartsDebounced("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-muted border-b border-border/40 last:border-b-0 transition-colors"
                        >
                          <div className="text-sm font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground flex justify-between">
                            <span>
                              {p.brand && `${p.brand} `}
                              {p.sku && `• ${p.sku}`}
                            </span>
                            <span>
                              {p.hasVariations
                                ? `${p.variations.length} variacao(oes)`
                                : `Estoque: ${p.stock} • ${(p.salePrice / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Selecione uma peca acima ou digite a descricao manualmente abaixo.
                </p>
              </div>
            )}

            {/* Escolha da variacao do produto selecionado. */}
            {newItemType === "PRODUCT" && !newItemProductId && pendingVariationProduct && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Variacao de {pendingVariationProduct.name}</Label>
                  <Button variant="ghost" size="sm" onClick={() => setPendingVariationProduct(null)}>Voltar</Button>
                </div>
                <div className="border border-border rounded-md max-h-48 overflow-y-auto bg-background">
                  {pendingVariationProduct.variations.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={v.stock <= 0}
                      onClick={() => {
                        setNewItemProductId(pendingVariationProduct.id);
                        setNewItemVariationId(v.id);
                        setNewItemDesc(`${pendingVariationProduct.name} — ${v.label}`);
                        setNewItemPrice(v.salePrice);
                        setNewItemCostPrice(v.costPrice);
                        setPendingVariationProduct(null);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-muted border-b border-border/40 last:border-b-0 transition-colors disabled:opacity-50"
                    >
                      <div className="text-sm font-medium">{v.label}</div>
                      <div className="text-xs text-muted-foreground flex justify-between">
                        <span>{v.stock <= 0 ? "Sem estoque" : `Estoque: ${v.stock}`}</span>
                        <span>{(v.salePrice / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {newItemType === "PRODUCT" && newItemProductId && (
              <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <div className="text-sm">
                  <p className="font-medium">{newItemDesc}</p>
                  <p className="text-xs text-muted-foreground">Vinculado ao estoque (baixa automatica)</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewItemProductId(null);
                    setNewItemVariationId(null);
                    setNewItemCostPrice(0);
                    setNewItemDesc("");
                    setNewItemPrice(0);
                  }}
                >
                  Trocar
                </Button>
              </div>
            )}

            {/* Busca de serviço no catálogo (paridade com a criação da OS). */}
            {newItemType === "SERVICE" && !newItemServiceId && (
              <div className="space-y-2">
                <Label>Buscar servico no catalogo</Label>
                <Input
                  value={partsSearch}
                  onChange={(e) => setPartsSearch(e.target.value)}
                  placeholder="Nome, tipo ou modelo..."
                  autoComplete="off"
                />
                {partsDebounced.length >= 2 && (
                  <div className="border border-border rounded-md max-h-48 overflow-y-auto bg-background">
                    {servicesQuery.isFetching ? (
                      <p className="p-3 text-sm text-muted-foreground">Buscando...</p>
                    ) : (servicesQuery.data?.data ?? []).length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Nenhum servico encontrado.</p>
                    ) : (
                      (servicesQuery.data?.data ?? []).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setNewItemServiceId(s.id);
                            setNewItemDesc(s.name);
                            setNewItemPrice(s.basePrice);
                            setPartsSearch("");
                            setPartsDebounced("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-muted border-b border-border/40 last:border-b-0 transition-colors"
                        >
                          <div className="text-sm font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{s.serviceType}{s.deviceModel ? ` • ${s.deviceModel}` : ""}</span>
                            <span>{(s.basePrice / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Selecione um servico acima ou digite a descricao manualmente abaixo.
                </p>
              </div>
            )}

            {newItemType === "SERVICE" && newItemServiceId && (
              <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <div className="text-sm">
                  <p className="font-medium">{newItemDesc}</p>
                  <p className="text-xs text-muted-foreground">Servico do catalogo</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setNewItemServiceId(null); setNewItemDesc(""); setNewItemPrice(0); }}
                >
                  Trocar
                </Button>
              </div>
            )}

            <div>
              <Label>Descricao</Label>
              <Input
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
                disabled={!!newItemProductId || !!newItemServiceId}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantidade</Label><Input type="number" min={1} value={newItemQty} onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)} /></div>
              <div><Label>Valor Unitario</Label><MoneyInput value={newItemPrice} onChange={setNewItemPrice} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemDialog(false)}>Cancelar</Button>
            <Button
              disabled={!newItemDesc || addItemMut.isPending}
              onClick={() =>
                addItemMut.mutate({
                  orderId: id,
                  type: newItemType,
                  description: newItemDesc,
                  quantity: newItemQty,
                  unitPrice: newItemPrice,
                  ...(newItemProductId
                    ? { productId: newItemProductId, costPrice: newItemCostPrice, variationId: newItemVariationId }
                    : {}),
                  ...(newItemServiceId ? { serviceId: newItemServiceId } : {}),
                })
              }
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conclusao da OS (com opcao de avisar o cliente por WhatsApp) */}
      <ConcludeOsDialog
        open={concludeDialog}
        onOpenChange={setConcludeDialog}
        customerName={order.customer?.name ?? null}
        primaryPhone={order.customer?.phone ?? null}
        secondaryPhone={(order.customer as { phoneSecondary?: string | null })?.phoneSecondary ?? null}
        skipping={concludeSkipping}
        isLoading={updateStatusMut.isPending}
        onConfirm={({ notifyWhatsapp, notifyPhone }) => {
          updateStatusMut.mutate(
            {
              id,
              status: "COMPLETED",
              notes: concludeSkipping ? "Concluida pulando etapas" : null,
              notifyWhatsapp,
              notifyPhone,
            },
            { onSuccess: () => setConcludeDialog(false) },
          );
        }}
      />

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar OS</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Termo de devolucao so e exigido se a ENTRADA foi assinada (aparelho
                sob custodia formal da loja). OS ainda nao assinada pelo cliente
                cancela direto — espelha o guard do servidor. */}
            {isSigned && !returnTermSigned && (
              <div className="rounded border border-warning bg-warning/10 p-3 text-sm space-y-3">
                <div>
                  <strong className="text-warning">Termo de devolucao pendente.</strong>
                  <p className="text-muted-foreground mt-1">
                    Esta OS ja foi assinada na entrada — o aparelho esta sob responsabilidade
                    da loja, entao exige termo de devolucao assinado antes do cancelamento.
                    Envie o termo para assinatura digital ou confirme a devolucao fisica.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!order.returnTermAutentiqueId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReturnTermReason(cancelReason || "Equipamento devolvido ao cliente");
                        setReturnTermDialog(true);
                      }}
                      disabled={sendReturnTermMut.isPending}
                    >
                      <Send className="mr-1 h-3 w-3" />Enviar termo de devolucao
                    </Button>
                  )}
                  {order.returnTermAutentiqueId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => checkReturnTermStatusMut.mutate({ orderId: id })}
                      disabled={checkReturnTermStatusMut.isPending}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />Verificar assinatura
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => confirmPhysicalReturnTermMut.mutate({ orderId: id, reason: cancelReason || "Equipamento devolvido ao cliente" })}
                    disabled={confirmPhysicalReturnTermMut.isPending}
                  >
                    <Check className="mr-1 h-3 w-3" />Confirmar devolucao fisica
                  </Button>
                </div>
                <div className="border-t border-warning/30 pt-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Override administrativo: use apenas quando houver justificativa para cancelar sem termo assinado.
                  </p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={cancelForce}
                      onChange={(e) => setCancelForce(e.target.checked)}
                    />
                    <span className="text-sm">Forcar cancelamento sem termo (admin/gerente)</span>
                  </label>
                </div>
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
              disabled={
                !cancelReason ||
                // Termo so trava o cancelamento se a entrada foi assinada.
                (isSigned && !returnTermSigned && !cancelForce) ||
                cancelMut.isPending
              }
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

      {/* Send to Lab Dialog */}
      <Dialog open={sendLabDialog} onOpenChange={setSendLabDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar para Laboratorio Externo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Marca a OS como enviada ao laboratorio externo, associando o entregador
              responsavel e disparando uma mensagem via WhatsApp.
            </p>
            <div>
              <Label>Entregador *</Label>
              <Select value={labDeliveryPersonId} onValueChange={setLabDeliveryPersonId}>
                <SelectTrigger><SelectValue placeholder="Selecione o entregador" /></SelectTrigger>
                <SelectContent>
                  {deliveryPersons.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mensagem WhatsApp ao entregador *</Label>
              <Textarea
                value={notifyDeliveryMessage}
                onChange={(e) => setNotifyDeliveryMessage(e.target.value)}
                placeholder={`Ex.: Por favor, levar a OS ${order.number} ao laboratorio X.`}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendLabDialog(false)}>Cancelar</Button>
            <Button
              disabled={sendToLabMut.isPending || !labDeliveryPersonId || !notifyDeliveryMessage.trim()}
              onClick={() =>
                sendToLabMut.mutate({
                  orderId: id,
                  deliveryPersonId: labDeliveryPersonId,
                  message: notifyDeliveryMessage.trim(),
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

      {/* Tracking — modal padrão de número (números cadastrados + digitar) */}
      <WhatsAppSendDialog
        open={trackingDialog}
        onOpenChange={setTrackingDialog}
        title="Enviar Rastreamento por WhatsApp"
        description="Selecione um numero ou digite outro para enviar o link de acompanhamento."
        customerName={order.customer?.name ?? null}
        primaryPhone={order.customer?.phone ?? null}
        secondaryPhone={(order.customer as { phoneSecondary?: string | null })?.phoneSecondary ?? null}
        isLoading={sendTrackingMut.isPending}
        confirmLabel="Enviar"
        onConfirm={async (phone) => {
          await sendTrackingMut.mutateAsync({ orderId: id, phone });
          setTrackingDialog(false);
        }}
      />

      {/* Termo de Entrega — modal padrão de número */}
      <WhatsAppSendDialog
        open={deliveryTermDialog}
        onOpenChange={setDeliveryTermDialog}
        title="Enviar Termo de Entrega"
        description="O termo vai para assinatura digital (Autentique) e é notificado por WhatsApp."
        customerName={order.customer?.name ?? null}
        primaryPhone={order.customer?.phone ?? null}
        secondaryPhone={(order.customer as { phoneSecondary?: string | null })?.phoneSecondary ?? null}
        isLoading={sendDeliveryTermMut.isPending}
        confirmLabel="Enviar Termo"
        onConfirm={async (phone) => {
          await sendDeliveryTermMut.mutateAsync({ orderId: id, phone });
          setDeliveryTermDialog(false);
        }}
      />

      {/* Envio do orçamento ao cliente — modal padrão de número */}
      <WhatsAppSendDialog
        open={budgetApprovalDialog}
        onOpenChange={setBudgetApprovalDialog}
        title="Enviar orcamento ao cliente"
        description="Selecione um numero ou digite outro para enviar o orcamento para autorizacao."
        customerName={order.customer?.name ?? null}
        primaryPhone={order.customer?.phone ?? null}
        secondaryPhone={(order.customer as { phoneSecondary?: string | null })?.phoneSecondary ?? null}
        isLoading={requestBudgetApprovalMut.isPending}
        confirmLabel="Enviar"
        onConfirm={async (phone) => {
          await requestBudgetApprovalMut.mutateAsync({
            orderId: id,
            reason: budgetReason.trim(),
            additionalServices: null,
            phone,
          });
          setBudgetApprovalDialog(false);
        }}
      />

      {/* Termo de Devolução — modal padrão de número + motivo (children) */}
      <WhatsAppSendDialog
        open={returnTermDialog}
        onOpenChange={setReturnTermDialog}
        title="Enviar Termo de Devolucao"
        description="O termo vai para assinatura digital. Após assinado, a OS é cancelada automaticamente."
        customerName={order.customer?.name ?? null}
        primaryPhone={order.customer?.phone ?? null}
        secondaryPhone={(order.customer as { phoneSecondary?: string | null })?.phoneSecondary ?? null}
        isLoading={sendReturnTermMut.isPending}
        confirmLabel="Enviar Termo"
        onConfirm={async (phone) => {
          await sendReturnTermMut.mutateAsync({ orderId: id, phone, reason: returnTermReason || null });
          setReturnTermDialog(false);
        }}
      >
        <div>
          <Label>Motivo da Devolucao</Label>
          <Textarea value={returnTermReason} onChange={(e) => setReturnTermReason(e.target.value)} rows={2} />
        </div>
      </WhatsAppSendDialog>

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
                  {(techniciansQuery.data ?? []).map((t: { id: string; name: string; role: string | null; kind: "user" | "provider" }) => (
                    <SelectItem key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                      {t.name}{t.kind === "provider" ? " (prestador)" : t.role ? ` (${t.role})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeTechDialog(false)}>Cancelar</Button>
            <Button
              disabled={!selectedTechId || updateTechnicianMut.isPending}
              onClick={() => {
                const sep = selectedTechId.indexOf(":");
                const kind = selectedTechId.slice(0, sep) as "user" | "provider";
                const assigneeId = selectedTechId.slice(sep + 1);
                updateTechnicianMut.mutate({ orderId: id, kind, assigneeId });
              }}
            >
              Alterar Tecnico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
