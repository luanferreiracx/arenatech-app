"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Pencil,
  Trash2,
  Copy,
  Plus,
  CreditCard,
  FileText,
  Send,
  MessageCircle,
  Check,
  X,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { LoadingState } from "@/components/domain/loading-state";
import { MoneyInput } from "@/components/inputs/money-input";
import { EntitySelector } from "@/components/domain/entity-selector";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  ALLOWED_TRANSITIONS,
  CHECKLIST_LABELS,
  DEVICE_INFO_LABELS,
  type ServiceOrderStatusValue,
} from "@/lib/validators/service-order";

interface Props {
  id: string;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("pt-BR");
}

// Status actions config
function getStatusActions(status: ServiceOrderStatusValue): Array<{
  label: string;
  targetStatus: ServiceOrderStatusValue;
  variant?: "default" | "destructive" | "outline";
}> {
  const actions: Array<{
    label: string;
    targetStatus: ServiceOrderStatusValue;
    variant?: "default" | "destructive" | "outline";
  }> = [];

  const transitions = ALLOWED_TRANSITIONS[status];

  if (transitions.includes("IN_DIAGNOSIS")) actions.push({ label: "Iniciar Diagnóstico", targetStatus: "IN_DIAGNOSIS" });
  if (transitions.includes("WAITING_APPROVAL")) actions.push({ label: "Aguardando Aprovação", targetStatus: "WAITING_APPROVAL" });
  if (transitions.includes("APPROVED")) actions.push({ label: "Aprovar", targetStatus: "APPROVED" });
  if (transitions.includes("WAITING_PARTS")) actions.push({ label: "Aguardando Peças", targetStatus: "WAITING_PARTS" });
  if (transitions.includes("IN_PROGRESS")) actions.push({ label: "Iniciar Serviço", targetStatus: "IN_PROGRESS" });
  if (transitions.includes("COMPLETED")) actions.push({ label: "Concluir", targetStatus: "COMPLETED" });
  if (transitions.includes("READY_FOR_PICKUP")) actions.push({ label: "Pronto p/ Retirada", targetStatus: "READY_FOR_PICKUP" });
  if (transitions.includes("DELIVERED")) actions.push({ label: "Entregar", targetStatus: "DELIVERED" });
  if (transitions.includes("OPEN")) actions.push({ label: "Reabrir como Nova OS", targetStatus: "OPEN" });
  if (transitions.includes("CANCELLED")) actions.push({ label: "Cancelar", targetStatus: "CANCELLED", variant: "destructive" });
  if (transitions.includes("REFUNDED")) actions.push({ label: "Estornar", targetStatus: "REFUNDED", variant: "destructive" });

  return actions;
}

interface ServiceCatalogItem {
  id: string;
  name: string;
  basePrice: unknown;
}

interface ProductCatalogItem {
  id: string;
  name: string;
  salePrice: unknown;
  costPrice: unknown;
}

export function ServiceOrderDetailClient({ id }: Props) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const searchServices = useCallback(
    async (query: string): Promise<ServiceCatalogItem[]> => {
      const opts = trpc.catalog.listServices.queryOptions({
        search: query,
        page: 0,
        pageSize: 20,
      });
      const result = await queryClient.fetchQuery(opts);
      return result.items as ServiceCatalogItem[];
    },
    [trpc.catalog.listServices, queryClient],
  );

  const searchProducts = useCallback(
    async (query: string): Promise<ProductCatalogItem[]> => {
      const opts = trpc.stock.listProducts.queryOptions({
        search: query,
        active: true,
        page: 0,
        pageSize: 20,
      });
      const result = await queryClient.fetchQuery(opts);
      return result.items as ProductCatalogItem[];
    },
    [trpc.stock.listProducts, queryClient],
  );
  // Inline cost editing
  const [costPartsCost, setCostPartsCost] = useState(0);
  const [costOtherCost, setCostOtherCost] = useState(0);
  const [costsInitialized, setCostsInitialized] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    targetStatus: ServiceOrderStatusValue | null;
    label: string;
  }>({ open: false, targetStatus: null, label: "" });
  const [statusNotes, setStatusNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDiscount, setPaymentDiscountVal] = useState(0);
  const [paymentNotes, setPaymentNotes] = useState("");

  // Add item dialog
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [newItemType, setNewItemType] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemUnitPrice, setNewItemUnitPrice] = useState(0);
  const [newItemServiceId, setNewItemServiceId] = useState<string | undefined>();
  const [newItemProductId, setNewItemProductId] = useState<string | undefined>();
  const [newItemCostPrice, setNewItemCostPrice] = useState(0);
  const [newItemManualMode, setNewItemManualMode] = useState(false);

  const {
    data: order,
    isLoading,
    refetch,
  } = useQuery(trpc.serviceOrders.getById.queryOptions({ id }));

  const deleteMutation = useMutation(
    trpc.serviceOrders.delete.mutationOptions({
      onSuccess: () => {
        toast.success("OS removida.");
        router.push("/service-orders");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateStatusMutation = useMutation(
    trpc.serviceOrders.updateStatus.mutationOptions({
      onSuccess: () => {
        toast.success("Status atualizado.");
        setStatusDialog({ open: false, targetStatus: null, label: "" });
        setStatusNotes("");
        setCancelReason("");
        setRefundReason("");
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const paymentMutation = useMutation(
    trpc.serviceOrders.registerPayment.mutationOptions({
      onSuccess: () => {
        toast.success("Pagamento registrado.");
        setPaymentOpen(false);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const addItemMutation = useMutation(
    trpc.serviceOrders.addItem.mutationOptions({
      onSuccess: () => {
        toast.success("Item adicionado.");
        setAddItemOpen(false);
        setNewItemDescription("");
        setNewItemQuantity(1);
        setNewItemUnitPrice(0);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const removeItemMutation = useMutation(
    trpc.serviceOrders.removeItem.mutationOptions({
      onSuccess: () => {
        toast.success("Item removido.");
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateCostsMutation = useMutation(
    trpc.serviceOrders.updateCosts.mutationOptions({
      onSuccess: () => {
        toast.success("Custos atualizados.");
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const whatsappMutation = useMutation(
    trpc.communication.notifyOsCompleted.mutationOptions({
      onSuccess: () => {
        toast.success("Notificacao WhatsApp enviada!");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  // Initialize cost values from order data
  if (order && !costsInitialized) {
    setCostPartsCost(Math.round(Number(order.partsCost) * 100));
    setCostOtherCost(Math.round(Number(order.otherCost) * 100));
    setCostsInitialized(true);
  }

  if (isLoading) return <LoadingState variant="card" />;
  if (!order)
    return (
      <p className="text-muted-foreground">Ordem de Serviço não encontrada.</p>
    );

  const status = order.status as ServiceOrderStatusValue;
  const statusActions = getStatusActions(status);
  const isTerminal = ["CANCELLED", "REFUNDED"].includes(status);
  const isEditable = !["DELIVERED", "CANCELLED", "REFUNDED"].includes(status);

  const handleStatusChange = (targetStatus: ServiceOrderStatusValue, label: string) => {
    // PAID has special handling via payment dialog
    if (targetStatus === "PAID") {
      setPaymentAmount(Math.round(Number(order.totalAmount) * 100));
      setPaymentOpen(true);
      return;
    }
    setStatusDialog({ open: true, targetStatus, label });
  };

  const confirmStatusChange = () => {
    if (!statusDialog.targetStatus) return;
    updateStatusMutation.mutate({
      orderId: id,
      status: statusDialog.targetStatus,
      notes: statusNotes || undefined,
      cancellationReason: statusDialog.targetStatus === "CANCELLED" ? cancelReason : undefined,
      refundReason: statusDialog.targetStatus === "REFUNDED" ? refundReason : undefined,
    });
  };

  const handlePayment = () => {
    paymentMutation.mutate({
      orderId: id,
      paymentMethod,
      paidAmount: paymentAmount / 100,
      paymentDiscount: paymentDiscount > 0 ? paymentDiscount / 100 : undefined,
      paymentNotes: paymentNotes || undefined,
    });
  };

  const copyPublicLink = () => {
    const url = `${window.location.origin}/os/${order.publicLink}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const entryChecklist = order.entryChecklist as Record<string, boolean | null> | null;
  const exitChecklist = order.exitChecklist as Record<string, boolean | null> | null;
  const deviceInfo = order.deviceInfo as Record<string, boolean> | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{order.number}</span>
            <StatusBadge variant={STATUS_VARIANTS[status]}>
              {STATUS_LABELS[status]}
            </StatusBadge>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Status action buttons */}
            {statusActions.map((action) => {
              // Payment button for COMPLETED status
              if (action.targetStatus === "PAID" && status === "COMPLETED") {
                return (
                  <Button
                    key={action.targetStatus}
                    size="sm"
                    onClick={() => handleStatusChange("PAID", "Registrar Pagamento")}
                  >
                    <CreditCard className="mr-1 h-4 w-4" />
                    Registrar Pagamento
                  </Button>
                );
              }
              return (
                <Button
                  key={action.targetStatus}
                  size="sm"
                  variant={action.variant === "destructive" ? "destructive" : "default"}
                  onClick={() =>
                    handleStatusChange(action.targetStatus, action.label)
                  }
                >
                  {action.label}
                </Button>
              );
            })}

            {isEditable && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/service-orders/${id}/edit`}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Editar
                </Link>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={copyPublicLink}>
              <Copy className="mr-1 h-4 w-4" />
              Link Público
            </Button>

            {/* PDF */}
            <Button
              size="sm"
              variant="outline"
              asChild
            >
              <a href={`/api/service-orders/${id}/pdf`} target="_blank" rel="noopener noreferrer">
                <FileText className="mr-1 h-4 w-4" />
                PDF
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toast.info("Em breve — integração Fase 9")
              }
              disabled
            >
              <Send className="mr-1 h-4 w-4" />
              Assinatura
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={whatsappMutation.isPending}
              onClick={() => whatsappMutation.mutate({ serviceOrderId: id })}
            >
              <MessageCircle className="mr-1 h-4 w-4" />
              {whatsappMutation.isPending ? "Enviando..." : "WhatsApp"}
            </Button>

            {!isTerminal && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content — 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.customer && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nome</span>
                    <Link
                      href={`/customers/${order.customer.id}`}
                      className="text-primary hover:underline"
                    >
                      {order.customer.name}
                    </Link>
                  </div>
                  {order.customer.cpf && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CPF</span>
                      <span className="font-mono">{order.customer.cpf}</span>
                    </div>
                  )}
                  {order.customer.phone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Telefone</span>
                      <span>{order.customer.phone}</span>
                    </div>
                  )}
                  {order.customer.email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">E-mail</span>
                      <span>{order.customer.email}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Device */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Equipamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {order.deviceType && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo</span>
                    <span>{order.deviceType}</span>
                  </div>
                )}
                {order.deviceBrand && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Marca</span>
                    <span>{order.deviceBrand}</span>
                  </div>
                )}
                {order.deviceModel && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Modelo</span>
                    <span>{order.deviceModel}</span>
                  </div>
                )}
                {order.serialNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Serial</span>
                    <span className="font-mono">{order.serialNumber}</span>
                  </div>
                )}
                {order.imei && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IMEI</span>
                    <span className="font-mono">{order.imei}</span>
                  </div>
                )}
                {order.devicePassword && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Senha</span>
                    <span className="font-mono">{order.devicePassword}</span>
                  </div>
                )}
                {order.accessories && (
                  <div className="flex justify-between sm:col-span-2">
                    <span className="text-muted-foreground">Acessórios</span>
                    <span>{order.accessories}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Problem */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Problema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.reportedProblem && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">
                    Problema relatado
                  </p>
                  <p className="whitespace-pre-line">{order.reportedProblem}</p>
                </div>
              )}
              {order.diagnosedProblem && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">
                    Defeito diagnosticado
                  </p>
                  <p className="whitespace-pre-line">
                    {order.diagnosedProblem}
                  </p>
                </div>
              )}

              {/* Checklists */}
              {entryChecklist &&
                Object.keys(entryChecklist).length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-2">
                      Checklist de Entrada
                    </p>
                    <div className="grid gap-1 grid-cols-2 sm:grid-cols-3">
                      {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
                        const val = entryChecklist[key];
                        if (val === undefined) return null;
                        return (
                          <span
                            key={key}
                            className={`flex items-center gap-1 text-xs ${
                              val === true
                                ? "text-green-600"
                                : val === false
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {val === true ? (
                              <Check className="h-3 w-3" />
                            ) : val === false ? (
                              <X className="h-3 w-3" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

              {exitChecklist &&
                Object.keys(exitChecklist).length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-2">
                      Checklist de Saída
                    </p>
                    <div className="grid gap-1 grid-cols-2 sm:grid-cols-3">
                      {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
                        const val = exitChecklist[key];
                        if (val === undefined) return null;
                        return (
                          <span
                            key={key}
                            className={`flex items-center gap-1 text-xs ${
                              val === true
                                ? "text-green-600"
                                : val === false
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {val === true ? (
                              <Check className="h-3 w-3" />
                            ) : val === false ? (
                              <X className="h-3 w-3" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

              {deviceInfo &&
                Object.keys(deviceInfo).some((k) => deviceInfo[k]) && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-2">
                      Informações adicionais
                    </p>
                    <div className="grid gap-1 grid-cols-1 sm:grid-cols-2">
                      {Object.entries(DEVICE_INFO_LABELS).map(
                        ([key, label]) => {
                          const val = deviceInfo[key];
                          if (!val) return null;
                          return (
                            <span
                              key={key}
                              className="text-xs text-warning"
                            >
                              ⚠ {label}
                            </span>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Serviços e Produtos</CardTitle>
              {isEditable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddItemOpen(true)}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {order.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum item adicionado.
                </p>
              ) : (
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border p-2 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {item.type === "SERVICE" ? "Serviço" : "Produto"}
                          </Badge>
                          <span className="truncate">{item.description}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {Number(item.quantity)} x{" "}
                          {formatMoney(item.unitPrice)} ={" "}
                          {formatMoney(item.total)}
                        </span>
                      </div>
                      {isEditable && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                          onClick={() =>
                            removeItemMutation.mutate({ itemId: item.id })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}

                  <div className="border-t pt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Serviços</span>
                      <span className="font-mono">
                        {formatMoney(order.serviceAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Peças</span>
                      <span className="font-mono">
                        {formatMoney(order.partsAmount)}
                      </span>
                    </div>
                    {Number(order.discount) > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Desconto</span>
                        <span className="font-mono">
                          -{formatMoney(order.discount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span className="font-mono">
                        {formatMoney(order.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment info */}
          {["PAID", "READY_FOR_PICKUP", "DELIVERED", "REFUNDED"].includes(
            status,
          ) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pagamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Forma de pagamento
                  </span>
                  <span>{order.paymentMethod ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor pago</span>
                  <span className="font-mono font-medium">
                    {formatMoney(order.paidAmount)}
                  </span>
                </div>
                {Number(order.paymentDiscount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Desconto no pagamento
                    </span>
                    <span className="font-mono text-destructive">
                      -{formatMoney(order.paymentDiscount)}
                    </span>
                  </div>
                )}
                {order.paymentDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data pagamento</span>
                    <span>{formatDateTime(order.paymentDate)}</span>
                  </div>
                )}
                {order.paymentNotes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Observações</span>
                    <span>{order.paymentNotes}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar — 1 col */}
        <div className="space-y-6">
          {/* Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Criada por</span>
                <span>{order.createdBy?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Técnico</span>
                <span>{order.technician?.name ?? "Não definido"}</span>
              </div>
              {order.vendor && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendedor</span>
                  <span>{order.vendor.name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrada</span>
                <span>{formatDate(order.entryDate)}</span>
              </div>
              {order.estimatedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Previsão</span>
                  <span>{formatDate(order.estimatedDate)}</span>
                </div>
              )}
              {order.completedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Conclusão</span>
                  <span>{formatDate(order.completedDate)}</span>
                </div>
              )}
              {order.deliveredDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entrega</span>
                  <span>{formatDate(order.deliveredDate)}</span>
                </div>
              )}
              {order.isWarranty && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Garantia</span>
                  <Badge variant="outline" className="text-warning">
                    Sim — {order.warrantyType ?? "N/A"}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.internalNotes && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">
                    Notas internas
                  </p>
                  <p className="whitespace-pre-line text-xs">
                    {order.internalNotes}
                  </p>
                </div>
              )}
              {order.customerNotes && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">
                    Notas para o cliente
                  </p>
                  <p className="whitespace-pre-line text-xs">
                    {order.customerNotes}
                  </p>
                </div>
              )}
              {!order.internalNotes && !order.customerNotes && (
                <p className="text-muted-foreground text-xs">
                  Nenhuma nota registrada.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Costs — inline editable like Laravel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Custos e Lucro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Serviços</span>
                <span className="font-mono">{formatMoney(order.serviceAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peças</span>
                <span className="font-mono">{formatMoney(order.partsAmount)}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>Desconto</span>
                  <span className="font-mono">-{formatMoney(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total</span>
                <span className="font-mono text-primary">{formatMoney(order.totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-muted-foreground">Custo Peças</span>
                <MoneyInput
                  value={costPartsCost}
                  onChange={setCostPartsCost}
                  className="w-28 h-8 text-xs"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Outros Custos</span>
                <MoneyInput
                  value={costOtherCost}
                  onChange={setCostOtherCost}
                  className="w-28 h-8 text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={updateCostsMutation.isPending}
                onClick={() => {
                  updateCostsMutation.mutate({
                    orderId: id,
                    partsCost: costPartsCost / 100,
                    otherCost: costOtherCost / 100,
                  });
                }}
              >
                {updateCostsMutation.isPending ? "Salvando..." : "Salvar Custos"}
              </Button>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Lucro</span>
                {(() => {
                  const lucro = Number(order.totalAmount) - (costPartsCost / 100) - (costOtherCost / 100);
                  return (
                    <span className={`font-mono font-semibold ${lucro >= 0 ? "text-green-600" : "text-destructive"}`}>
                      {formatMoney(lucro)}
                    </span>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          {/* NFS-e info */}
          {(order.nfseIssued || order.nfseNumber) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">NFS-e</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Emitida</span>
                  <Badge variant={order.nfseIssued ? "default" : "outline"}>
                    {order.nfseIssued ? "Sim" : "Não"}
                  </Badge>
                </div>
                {order.nfseNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Número</span>
                    <span className="font-mono">{order.nfseNumber}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              {order.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros.</p>
              ) : (
                <div className="space-y-3">
                  {order.history.map((entry) => (
                    <div
                      key={entry.id}
                      className="relative pl-4 border-l-2 border-muted pb-3 last:pb-0"
                    >
                      <div className="absolute -left-1.5 top-0 h-3 w-3 rounded-full bg-primary" />
                      <div className="text-xs">
                        <span className="font-medium">
                          {STATUS_LABELS[entry.newStatus as ServiceOrderStatusValue] ?? entry.newStatus}
                        </span>
                        {entry.previousStatus && (
                          <span className="text-muted-foreground">
                            {" "}
                            (de{" "}
                            {STATUS_LABELS[entry.previousStatus as ServiceOrderStatusValue] ??
                              entry.previousStatus}
                            )
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.user?.name ?? "Sistema"} —{" "}
                        {formatDateTime(entry.createdAt)}
                      </p>
                      {entry.notes && (
                        <p className="text-xs mt-0.5">{entry.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}

      {/* Status change dialog */}
      <Dialog
        open={statusDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setStatusDialog({ open: false, targetStatus: null, label: "" });
            setStatusNotes("");
            setCancelReason("");
            setRefundReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusDialog.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {statusDialog.targetStatus === "CANCELLED" && (
              <div className="space-y-2">
                <Label>Motivo do cancelamento *</Label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Informe o motivo..."
                  rows={3}
                />
              </div>
            )}
            {statusDialog.targetStatus === "REFUNDED" && (
              <div className="space-y-2">
                <Label>Motivo do estorno *</Label>
                <Textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Informe o motivo..."
                  rows={3}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Notas sobre a mudança..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setStatusDialog({ open: false, targetStatus: null, label: "" })
              }
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmStatusChange}
              disabled={
                updateStatusMutation.isPending ||
                (statusDialog.targetStatus === "CANCELLED" &&
                  !cancelReason.trim()) ||
                (statusDialog.targetStatus === "REFUNDED" &&
                  !refundReason.trim())
              }
            >
              {updateStatusMutation.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Forma de pagamento *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                  <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor pago</Label>
              <MoneyInput value={paymentAmount} onChange={setPaymentAmount} />
            </div>
            <div className="space-y-2">
              <Label>Desconto no pagamento</Label>
              <MoneyInput
                value={paymentDiscount}
                onChange={setPaymentDiscountVal}
              />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handlePayment}
              disabled={
                paymentMutation.isPending ||
                !paymentMethod ||
                paymentAmount <= 0
              }
            >
              {paymentMutation.isPending
                ? "Registrando..."
                : "Registrar Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add item dialog */}
      <Dialog
        open={addItemOpen}
        onOpenChange={(open) => {
          setAddItemOpen(open);
          if (!open) {
            setNewItemType("SERVICE");
            setNewItemDescription("");
            setNewItemQuantity(1);
            setNewItemUnitPrice(0);
            setNewItemServiceId(undefined);
            setNewItemProductId(undefined);
            setNewItemCostPrice(0);
            setNewItemManualMode(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={newItemType}
                onValueChange={(v) => {
                  setNewItemType(v as "SERVICE" | "PRODUCT");
                  setNewItemDescription("");
                  setNewItemUnitPrice(0);
                  setNewItemServiceId(undefined);
                  setNewItemProductId(undefined);
                  setNewItemCostPrice(0);
                  setNewItemManualMode(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SERVICE">Serviço</SelectItem>
                  <SelectItem value="PRODUCT">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!newItemManualMode ? (
              <div className="space-y-2">
                <Label>{newItemType === "SERVICE" ? "Buscar serviço" : "Buscar produto"}</Label>
                {newItemType === "SERVICE" ? (
                  <EntitySelector<ServiceCatalogItem>
                    value={newItemServiceId}
                    onChange={(val) => {
                      if (!val) {
                        setNewItemServiceId(undefined);
                      }
                    }}
                    onSelect={(svc) => {
                      setNewItemServiceId(svc.id);
                      setNewItemDescription(svc.name);
                      setNewItemUnitPrice(Math.round(Number(svc.basePrice) * 100));
                    }}
                    searchFn={searchServices}
                    getOptionLabel={(s) => `${s.name} — R$ ${Number(s.basePrice).toFixed(2).replace(".", ",")}`}
                    getOptionValue={(s) => s.id}
                    placeholder="Buscar serviço do catálogo..."
                    emptyMessage="Nenhum serviço encontrado."
                  />
                ) : (
                  <EntitySelector<ProductCatalogItem>
                    value={newItemProductId}
                    onChange={(val) => {
                      if (!val) {
                        setNewItemProductId(undefined);
                      }
                    }}
                    onSelect={(prod) => {
                      setNewItemProductId(prod.id);
                      setNewItemDescription(prod.name);
                      setNewItemUnitPrice(Math.round(Number(prod.salePrice) * 100));
                      setNewItemCostPrice(Math.round(Number(prod.costPrice) * 100));
                    }}
                    searchFn={searchProducts}
                    getOptionLabel={(p) => `${p.name} — R$ ${Number(p.salePrice).toFixed(2).replace(".", ",")}`}
                    getOptionValue={(p) => p.id}
                    placeholder="Buscar produto do estoque..."
                    emptyMessage="Nenhum produto encontrado."
                  />
                )}
                {(newItemServiceId || newItemProductId) && (
                  <p className="text-xs text-muted-foreground">
                    Selecionado: <span className="font-medium">{newItemDescription}</span>
                  </p>
                )}
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => {
                    setNewItemManualMode(true);
                    setNewItemServiceId(undefined);
                    setNewItemProductId(undefined);
                  }}
                >
                  Não encontrou? Digite manualmente
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Input
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  placeholder={newItemType === "SERVICE" ? "Descrição do serviço..." : "Descrição do produto..."}
                />
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => {
                    setNewItemManualMode(false);
                    setNewItemDescription("");
                    setNewItemUnitPrice(0);
                  }}
                >
                  Buscar no catálogo
                </button>
              </div>
            )}

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Preço unitário</Label>
                <MoneyInput
                  value={newItemUnitPrice}
                  onChange={setNewItemUnitPrice}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                addItemMutation.mutate({
                  orderId: id,
                  type: newItemType,
                  serviceId: newItemServiceId,
                  productId: newItemProductId,
                  description: newItemDescription,
                  quantity: newItemQuantity,
                  unitPrice: newItemUnitPrice / 100,
                  costPrice: newItemCostPrice > 0 ? newItemCostPrice / 100 : undefined,
                })
              }
              disabled={
                addItemMutation.isPending ||
                !newItemDescription.trim() ||
                newItemQuantity <= 0
              }
            >
              {addItemMutation.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remover Ordem de Serviço?"
        description="A OS será marcada como removida mas pode ser restaurada."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate({ id })}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
