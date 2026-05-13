"use client";

import { useState } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShoppingCart, XCircle, RotateCcw, User, Receipt, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  const [cancelReason, setCancelReason] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [returnStock, setReturnStock] = useState(true);

  const cancelMutation = useMutation(trpc.sale.cancel.mutationOptions());
  const refundMutation = useMutation(trpc.sale.refund.mutationOptions());

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

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
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
          isCompleted && (
            <div className="flex gap-2">
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
            </div>
          )
        }
      />

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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vendedor</span>
              <span>{sale.sellerName as string}</span>
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
    </div>
  );
}
