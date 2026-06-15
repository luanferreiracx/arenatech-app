"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
import {
  ArrowLeft,
  ShoppingCart,
  XCircle,
  RotateCcw,
  User,
  Receipt,
  Calendar,
  FileText,
  Shield,
  Package,
  Send,
  PenLine,
  CheckCircle2,
  ExternalLink,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { WhatsappRecipientPicker, type PhoneOption } from "@/components/domain/whatsapp-recipient-picker";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/domain/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { SALE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/validators/sale";
import { toast } from "@/lib/toast";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_VARIANTS: Record<string, "success" | "destructive" | "warning" | "default"> = {
  COMPLETED: "success",
  CANCELLED: "destructive",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
  DRAFT: "default",
};

interface SaleDetailProps {
  saleId: string;
}

export function SaleDetail({ saleId }: SaleDetailProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sale, isLoading } = useQuery(
    trpc.sale.getById.queryOptions({ id: saleId }),
  ) as { data: Record<string, any> | undefined; isLoading: boolean };

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [showSendReceiptDialog, setShowSendReceiptDialog] = useState(false);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [showPhysicalSignDialog, setShowPhysicalSignDialog] = useState(false);
  const [showSellerDialog, setShowSellerDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [returnStock, setReturnStock] = useState(true);
  const [receiptPhone, setReceiptPhone] = useState("");
  const [signaturePhone, setSignaturePhone] = useState("");
  const [newSellerId, setNewSellerId] = useState("");
  const [sellerReason, setSellerReason] = useState("");

  // Troca de vendedor e operacao administrativa (mesma RBAC do backend).
  const canChangeSeller = useIsTenantAdmin();

  const cancelMutation = useMutation(trpc.sale.cancel.mutationOptions());
  const refundMutation = useMutation(trpc.sale.refund.mutationOptions());
  const sendReceiptMutation = useMutation(trpc.sale.sendReceipt.mutationOptions());
  const sendSignatureMutation = useMutation(trpc.sale.sendForSignature.mutationOptions());
  const confirmPhysicalMutation = useMutation(trpc.sale.confirmPhysicalSignature.mutationOptions());
  const updateSellerMutation = useMutation(trpc.sale.updateSaleSeller.mutationOptions());

  // Lista de vendedores so e buscada quando o admin abre o dialog.
  const sellersQuery = useQuery({
    ...trpc.sale.listSellers.queryOptions(),
    enabled: showSellerDialog,
  });
  const sellers = (sellersQuery.data ?? []) as Array<{ id: string; name: string }>;

  const handleChangeSeller = () => {
    if (!newSellerId) {
      toast.error("Selecione o vendedor.");
      return;
    }
    if (sellerReason.trim().length < 1) {
      toast.error("Informe o motivo da alteracao.");
      return;
    }
    updateSellerMutation.mutate(
      { saleId, sellerId: newSellerId, reason: sellerReason.trim() },
      {
        onSuccess: () => {
          toast.success("Vendedor atualizado");
          setShowSellerDialog(false);
          setNewSellerId("");
          setSellerReason("");
          queryClient.invalidateQueries({ queryKey: trpc.sale.getById.queryKey({ id: saleId }) });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  // Polling do status de assinatura enquanto enviada mas nao assinada.
  const hasPendingSignature =
    !!(sale as Record<string, unknown> | undefined)?.signatureDocumentId &&
    !(sale as Record<string, unknown> | undefined)?.signatureSignedAt;
  const { data: signatureStatus } = useQuery({
    ...trpc.sale.checkSignatureStatus.queryOptions({ saleId }),
    enabled: hasPendingSignature,
    refetchInterval: hasPendingSignature ? 10_000 : false,
  });

  useEffect(() => {
    if (signatureStatus?.signed) {
      queryClient.invalidateQueries({ queryKey: trpc.sale.getById.queryKey({ id: saleId }) });
    }
  }, [signatureStatus?.signed, queryClient, trpc, saleId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.sale.getById.queryKey({ id: saleId }) });
  };

  const handleCancel = () => {
    if (!cancelReason.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    cancelMutation.mutate(
      { saleId, reason: cancelReason },
      {
        onSuccess: () => {
          toast.success("Venda cancelada");
          invalidate();
          setShowCancelDialog(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleSendReceipt = () => {
    sendReceiptMutation.mutate(
      { saleId, phone: receiptPhone.trim() || null },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast.success("Recibo enviado por WhatsApp");
            invalidate();
            setShowSendReceiptDialog(false);
          } else {
            toast.error("Nao foi possivel enviar o recibo. Verifique o numero.");
          }
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleSendSignature = () => {
    sendSignatureMutation.mutate(
      { saleId, whatsappOverride: signaturePhone.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Termo enviado para Autentique");
          invalidate();
          setShowSignatureDialog(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleConfirmPhysical = () => {
    confirmPhysicalMutation.mutate(
      { saleId },
      {
        onSuccess: () => {
          toast.success("Assinatura fisica confirmada");
          invalidate();
          setShowPhysicalSignDialog(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleRefund = () => {
    if (!refundReason.trim()) {
      toast.error("Informe o motivo do estorno");
      return;
    }
    refundMutation.mutate(
      { saleId, reason: refundReason, returnStock },
      {
        onSuccess: () => {
          toast.success("Venda estornada");
          invalidate();
          setShowRefundDialog(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  if (isLoading) return <LoadingState />;
  if (!sale) return <div className="text-center py-12 text-muted-foreground">Venda nao encontrada</div>;

  const statusStr = sale.status as string;
  const isCompleted = statusStr === "COMPLETED";
  const items = (sale.items ?? []) as Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  const paymentDetails = sale.paymentDetails as Array<{
    method: string;
    amount: number;
    installments: number;
  }> | null;

  const receiptSent = !!sale.receiptSent;
  const signatureDocumentId = sale.signatureDocumentId as string | null;
  const signatureUrl = sale.signatureUrl as string | null;
  const signatureSentAt = sale.signatureSentAt as string | null;
  const signatureSignedAt = sale.signatureSignedAt as string | null;
  const physicalSignature = !!sale.physicalSignature;
  const isSigned = !!signatureSignedAt || physicalSignature;
  const isSignaturePending = !!signatureDocumentId && !signatureSignedAt && !physicalSignature;
  // Policy de impressao do recibo (computada pelo backend).
  const receiptPolicy = (sale as Record<string, unknown>).receiptPolicy as
    | { canPrint: boolean; pendingReasons: string[]; requiresDeliveryTerm: boolean }
    | undefined;
  const canPrintReceipt = receiptPolicy?.canPrint ?? true;
  const receiptBlockReason = receiptPolicy?.pendingReasons.join("; ") ?? "";
  const hasUpgrade = !!((sale as Record<string, unknown>).hasUpgrade);
  const hasDevice = !!((sale as Record<string, unknown>).hasDevice);

  // Telefones cadastrados do cliente, prontos pro picker do dialog WhatsApp.
  const customerPhone = (sale as Record<string, unknown>).customerPhone as string | null;
  const customerPhoneSecondary = (sale as Record<string, unknown>).customerPhoneSecondary as string | null;
  const phoneOptions: PhoneOption[] = [
    customerPhone ? { label: "WhatsApp principal", value: customerPhone } : null,
    customerPhoneSecondary ? { label: "Telefone alternativo", value: customerPhoneSecondary } : null,
  ].filter((o): o is PhoneOption => o !== null);

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild aria-label="Voltar para historico de vendas">
              <Link href="/pdv/history">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span>Venda {sale.number as string}</span>
            <StatusBadge variant={STATUS_VARIANTS[statusStr] ?? "default"}>
              {SALE_STATUS_LABELS[statusStr] ?? statusStr}
            </StatusBadge>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isCompleted && (
              <>
                {canPrintReceipt ? (
                  <Button variant="outline" asChild>
                    <a href={`/api/pdv/${saleId}/recibo`} target="_blank" rel="noopener noreferrer">
                      <FileText className="mr-2 h-4 w-4" />
                      Recibo
                    </a>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled
                    title={`Aguardando assinatura do termo${hasUpgrade ? " (entrega/responsabilidade)" : " de entrega"}.`}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Recibo
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <a href={`/api/pdv/${saleId}/termo-garantia`} target="_blank" rel="noopener noreferrer">
                    <Shield className="mr-2 h-4 w-4" />
                    Garantia
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={`/api/pdv/${saleId}/termo-entrega`} target="_blank" rel="noopener noreferrer">
                    <Package className="mr-2 h-4 w-4" />
                    Entrega
                  </a>
                </Button>
                <Button
                  variant="outline"
                  disabled={!canPrintReceipt}
                  title={
                    !canPrintReceipt
                      ? `Aguardando assinatura do termo${hasUpgrade ? " (entrega/responsabilidade)" : " de entrega"}.`
                      : undefined
                  }
                  onClick={() => {
                    setReceiptPhone("");
                    setShowSendReceiptDialog(true);
                  }}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {receiptSent ? "Reenviar recibo" : "Enviar recibo"}
                </Button>
                {!isSigned && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSignaturePhone("");
                      setShowSignatureDialog(true);
                    }}
                  >
                    <PenLine className="mr-2 h-4 w-4" />
                    {signatureDocumentId ? "Reenviar termo" : "Enviar termo"}
                  </Button>
                )}
                {!isSigned && (
                  <Button
                    variant="outline"
                    onClick={() => setShowPhysicalSignDialog(true)}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Assinatura fisica
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30"
                  onClick={() => {
                    setCancelReason("");
                    setShowCancelDialog(true);
                  }}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  className="text-yellow-500 border-yellow-500/30"
                  onClick={() => {
                    setRefundReason("");
                    setReturnStock(true);
                    setShowRefundDialog(true);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Estornar
                </Button>
              </>
            )}
          </div>
        }
      />

      {isCompleted && hasDevice && !canPrintReceipt && (
        <div className="mt-4 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-sm text-yellow-900 dark:text-yellow-200">
          <strong>Recibo bloqueado:</strong> {receiptBlockReason}. Envie o termo
          para assinatura digital (Autentique) ou confirme a assinatura fisica
          em loja antes de imprimir/enviar o recibo.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Info cards */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Informacoes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Numero</span>
              <span className="font-medium">{sale.number as string}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span>{formatDate(sale.saleDate as string)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Vendedor</span>
              <span className="flex items-center gap-2">
                {sale.sellerName as string}
                {canChangeSeller && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setNewSellerId("");
                      setSellerReason("");
                      setShowSellerDialog(true);
                    }}
                  >
                    Trocar
                  </Button>
                )}
              </span>
            </div>
            {sale.observations && (
              <div>
                <span className="text-muted-foreground block">Observacoes</span>
                <span className="text-xs">{sale.observations as string}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {sale.customerName ? (
              <div>
                <p className="font-medium">{sale.customerName as string}</p>
                {sale.customerId && (
                  <Link href={`/customers/${sale.customerId}`} className="text-xs text-primary hover:underline">
                    Ver perfil
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Sem cliente vinculado</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {paymentDetails && paymentDetails.length > 0 ? (
              paymentDetails.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    {p.installments > 1 && ` (${p.installments}x)`}
                  </span>
                  <span className="font-medium">{formatCurrency(p.amount)}</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">-</p>
            )}
            {(sale.changeAmount as number) > 0 && (
              <div className="flex justify-between text-green-500 border-t pt-2">
                <span>Troco</span>
                <span className="font-medium">
                  {formatCurrency(sale.changeAmount as number)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items table */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Itens da Venda</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary/20 bg-muted/50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Produto
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-20">
                  Qtd
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28">
                  Preco Unit.
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border">
                  <td className="px-4 py-3 font-medium">{item.description}</td>
                  <td className="px-4 py-3 text-center">{item.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="mt-4">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(sale.subtotal as number)}</span>
          </div>
          {(sale.discountAmount as number) > 0 && (
            <>
              <div className="flex justify-between text-sm text-destructive">
                <span>
                  Desconto
                  {sale.discountType === "percentage" && ` (${sale.discountValue}%)`}
                </span>
                <span>-{formatCurrency(sale.discountAmount as number)}</span>
              </div>
              {sale.discountReason && (
                <div className="text-xs text-muted-foreground pl-2">
                  Motivo: {sale.discountReason as string}
                </div>
              )}
            </>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(sale.totalAmount as number)}</span>
          </div>
          {(sale.surchargeAmount as number) > 0 && (
            <>
              <div className="flex justify-between text-sm text-muted-foreground pt-1">
                <span>Acrescimo (cartao/parcelamento)</span>
                <span>+{formatCurrency(sale.surchargeAmount as number)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Total pago pelo cliente</span>
                <span>{formatCurrency((sale.totalAmount as number) + (sale.surchargeAmount as number))}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cancellation info */}
      {(statusStr === "CANCELLED" || statusStr === "REFUNDED") && sale.cancellationReason && (
        <Card className="mt-4 border-destructive/20">
          <CardContent className="p-4">
            <div className="text-sm font-semibold text-destructive mb-1">
              {statusStr === "CANCELLED" ? "Cancelamento" : "Estorno"}
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Motivo: {sale.cancellationReason as string}</p>
              {sale.cancelledByName && (
                <p className="text-muted-foreground text-xs mt-1">
                  Por: {sale.cancelledByName as string} em {formatDate(sale.cancelledAt as string)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signature status */}
      {isCompleted && (signatureDocumentId || isSigned) && (
        <Card className="mt-4 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Assinatura digital
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {isSigned ? (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {physicalSignature
                    ? "Assinado fisicamente"
                    : "Assinado digitalmente"}
                  {signatureSignedAt && ` em ${formatDate(signatureSignedAt)}`}
                </span>
              </div>
            ) : isSignaturePending ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-yellow-500">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
                  </span>
                  Aguardando assinatura do cliente...
                </div>
                {signatureSentAt && (
                  <p className="text-muted-foreground text-xs">
                    Enviado em {formatDate(signatureSentAt)}
                  </p>
                )}
                {signatureUrl && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={signatureUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-3 w-3" />
                        Abrir link de assinatura
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(signatureUrl);
                        toast.success("Link copiado");
                      }}
                    >
                      <Copy className="mr-2 h-3 w-3" />
                      Copiar
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Venda</DialogTitle>
            <DialogDescription>Esta acao nao pode ser desfeita</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motivo do cancelamento</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Informe o motivo..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelMutation.isPending}>
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar Venda</DialogTitle>
            <DialogDescription>Os valores serao revertidos</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Motivo do estorno</Label>
              <Textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Informe o motivo..."
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="returnStock"
                checked={returnStock}
                onCheckedChange={(v) => setReturnStock(!!v)}
              />
              <Label htmlFor="returnStock">Devolver itens ao estoque</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefundDialog(false)}>
              Voltar
            </Button>
            <Button
              variant="default"
              className="bg-yellow-600 hover:bg-yellow-700"
              onClick={handleRefund}
              disabled={refundMutation.isPending}
            >
              Confirmar Estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Receipt via WhatsApp */}
      <Dialog open={showSendReceiptDialog} onOpenChange={setShowSendReceiptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar recibo via WhatsApp</DialogTitle>
            <DialogDescription>
              {sale.customerName
                ? `O recibo sera enviado para ${sale.customerName as string}.`
                : "Informe um numero para envio do recibo."}
            </DialogDescription>
          </DialogHeader>
          <WhatsappRecipientPicker
            options={phoneOptions}
            value={receiptPhone}
            onValueChange={setReceiptPhone}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendReceiptDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendReceipt} disabled={sendReceiptMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send for Signature (Autentique) */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar termo para assinatura digital</DialogTitle>
            <DialogDescription>
              Cria o documento no Autentique e envia o link de assinatura por WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <WhatsappRecipientPicker
            options={phoneOptions}
            value={signaturePhone}
            onValueChange={setSignaturePhone}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignatureDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendSignature} disabled={sendSignatureMutation.isPending}>
              <PenLine className="mr-2 h-4 w-4" />
              {signatureDocumentId ? "Reenviar" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Physical Signature */}
      <Dialog open={showPhysicalSignDialog} onOpenChange={setShowPhysicalSignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar assinatura fisica</DialogTitle>
            <DialogDescription>
              Marca a venda como assinada presencialmente (sem Autentique).
              Use quando o cliente assinou o termo no papel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhysicalSignDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmPhysical}
              disabled={confirmPhysicalMutation.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trocar vendedor — somente admin (RBAC reforcada no backend) */}
      <Dialog open={showSellerDialog} onOpenChange={setShowSellerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar vendedor</DialogTitle>
            <DialogDescription>
              Corrige o vendedor atribuido a esta venda. A alteracao fica
              registrada na auditoria da venda.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vendedor atual</Label>
              <p className="text-sm text-muted-foreground">{sale.sellerName as string}</p>
            </div>
            <div className="space-y-2">
              <Label>Novo vendedor *</Label>
              <Select value={newSellerId} onValueChange={setNewSellerId}>
                <SelectTrigger>
                  <SelectValue placeholder={sellersQuery.isLoading ? "Carregando..." : "Selecione o vendedor"} />
                </SelectTrigger>
                <SelectContent>
                  {sellers
                    .filter((s) => s.id !== (sale.sellerId as string))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Textarea
                value={sellerReason}
                onChange={(e) => setSellerReason(e.target.value)}
                placeholder="Ex.: vendedor lancado errado no fechamento da venda."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSellerDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleChangeSeller}
              disabled={updateSellerMutation.isPending || !newSellerId || sellerReason.trim().length < 1}
            >
              {updateSellerMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
