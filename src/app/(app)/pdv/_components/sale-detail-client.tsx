"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Loader2, Plus, FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/domain/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { toast } from "@/lib/toast";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  SALE_STATUS_LABELS,
  SALE_STATUS_VARIANTS,
  type SaleStatusValue,
} from "@/lib/validators/sale";
import type { PaymentDetail } from "@/lib/validators/sale";

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface SaleDetailClientProps {
  id: string;
}

export function SaleDetailClient({ id }: SaleDetailClientProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showRefund, setShowRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");

  const { data: sale, isLoading } = useQuery(
    trpc.sales.getById.queryOptions({ id }),
  );

  const refundMutation = useMutation(
    trpc.sales.refund.mutationOptions({
      onSuccess: () => {
        toast.success("Venda estornada com sucesso");
        void queryClient.invalidateQueries();
        setShowRefund(false);
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  if (isLoading) {
    return <LoadingState variant="card" />;
  }

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Venda nao encontrada</p>
        <Button variant="outline" onClick={() => router.push("/pdv/history")} className="mt-4">
          Voltar ao historico
        </Button>
      </div>
    );
  }

  const status = sale.status as SaleStatusValue;
  const paymentDetails = (sale.paymentDetails as PaymentDetail[] | null) ?? [];
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/pdv/history")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span>Venda #{sale.number}</span>
            <StatusBadge variant={SALE_STATUS_VARIANTS[status]}>
              {SALE_STATUS_LABELS[status]}
            </StatusBadge>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {(status === "COMPLETED" || status === "PARTIALLY_REFUNDED") && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowRefund(true)}
              >
                <RotateCcw className="mr-1 h-4 w-4" />
                Estornar
              </Button>
            )}
            <Button size="sm" asChild>
              <Link href="/pdv">
                <Plus className="mr-1 h-4 w-4" />
                Nova Venda
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/pdv/history">Voltar</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Sale Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dados da Venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vendedor</span>
              <span>{sale.seller?.name ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span>
                {sale.customer ? (
                  <Link href={`/customers/${sale.customer.id}`} className="text-primary hover:underline">
                    {sale.customer.name}
                  </Link>
                ) : (
                  "Sem cliente"
                )}
              </span>
            </div>
            {sale.customer?.cpf && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPF</span>
                <span className="font-mono text-xs">{sale.customer.cpf}</span>
              </div>
            )}
            {sale.customer?.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Telefone</span>
                <span className="text-xs">{sale.customer.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span>{new Date(sale.saleDate).toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Itens</span>
              <span>{itemCount}</span>
            </div>
            {sale.observations && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Observacoes</span>
                <span className="max-w-[250px] text-right">{sale.observations}</span>
              </div>
            )}
            {sale.discountReason && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Motivo desconto</span>
                <span className="text-right">{sale.discountReason}</span>
              </div>
            )}
            {sale.cancellationReason && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Motivo cancelamento</span>
                  <span className="text-destructive">{sale.cancellationReason}</span>
                </div>
                {sale.cancelledAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data cancelamento</span>
                    <span className="text-xs">
                      {new Date(sale.cancelledAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                )}
                {(sale as Record<string, unknown>).cancelledBy && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cancelado por</span>
                    <span>{((sale as Record<string, unknown>).cancelledBy as { name: string })?.name}</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Payment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {paymentDetails.length > 0 ? (
              paymentDetails.map((payment, index) => (
                <div key={index} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {payment.method}
                    {payment.installments && payment.installments > 1
                      ? ` (${payment.installments}x)`
                      : ""}
                  </span>
                  <span className="font-mono">{formatMoney(payment.amount)}</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">Sem detalhes de pagamento</p>
            )}
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total pago</span>
              <span className="font-mono">{formatMoney(sale.paidAmount)}</span>
            </div>
            {Number(sale.changeAmount) > 0 && (
              <div className="flex justify-between font-bold text-green-500">
                <span>Troco</span>
                <span className="font-mono">{formatMoney(sale.changeAmount)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Itens da Venda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4">Produto</th>
                  <th className="pb-2 pr-4 text-center">Qtd</th>
                  <th className="pb-2 pr-4 text-right">Preco Unit.</th>
                  <th className="pb-2 pr-4 text-right">Desconto</th>
                  <th className="pb-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{item.description}</td>
                    <td className="py-2 pr-4 text-center">{item.quantity}</td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {formatMoney(item.unitPrice)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {Number(item.discount) > 0 ? formatMoney(item.discount) : "-"}
                    </td>
                    <td className="py-2 text-right font-mono font-bold">
                      {formatMoney(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-right font-medium">
                    Subtotal
                  </td>
                  <td className="pt-3 text-right font-mono font-bold">
                    {formatMoney(sale.subtotal)}
                  </td>
                </tr>
                {Number(sale.discountAmount) > 0 && (
                  <tr>
                    <td colSpan={4} className="pt-1 text-right text-destructive">
                      Desconto
                      {sale.discountReason && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({sale.discountReason})
                        </span>
                      )}
                    </td>
                    <td className="pt-1 text-right font-mono text-destructive">
                      -{formatMoney(sale.discountAmount)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={4} className="pt-2 text-right text-lg font-bold">
                    Total
                  </td>
                  <td className="pt-2 text-right font-mono text-lg font-bold text-primary">
                    {formatMoney(sale.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Refund Dialog */}
      {showRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Estornar venda</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta acao ira reverter o estoque e cancelar as transacoes financeiras.
            </p>
            <textarea
              className="mt-4 w-full rounded-md border bg-background p-2 text-sm"
              rows={3}
              placeholder="Motivo do estorno..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRefund(false)} disabled={refundMutation.isPending}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  refundMutation.mutate({
                    saleId: id,
                    reason: refundReason || "Estorno solicitado pelo operador",
                  })
                }
                disabled={refundMutation.isPending}
              >
                {refundMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar Estorno
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
