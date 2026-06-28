"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { ArrowLeft, Ban, Undo2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";
import { PageHeader } from "@/components/domain/page-header";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
} from "@/lib/validators/financial";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/cashier";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
}

function statusVariant(status: string) {
  switch (status) {
    case "PENDING":
      return "warning" as const;
    case "PAID":
      return "success" as const;
    case "OVERDUE":
      return "destructive" as const;
    case "PARTIALLY_PAID":
      return "info" as const;
    case "CANCELLED":
      return "default" as const;
    default:
      return "default" as const;
  }
}

interface TransactionDetailProps {
  transactionId: string;
}

export function TransactionDetail({ transactionId }: TransactionDetailProps) {
  const trpc = useTRPC();
  const isAdmin = useIsTenantAdmin();
  const queryClient = useQueryClient();

  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<{
    id: string;
    number: number;
    amount: number;
    paidAmount: number;
  } | null>(null);

  // Pay dialog state
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("");
  const [payNotes, setPayNotes] = useState("");

  // Reverse dialog state
  const [reverseReason, setReverseReason] = useState("");

  const query = useQuery(
    trpc.financial.getById.queryOptions({ id: transactionId }),
  );

  const payMutation = useMutation(
    trpc.financial.payInstallment.mutationOptions({
      onSuccess: () => {
        toast.success(`Parcela #${selectedInstallment?.number} baixada com sucesso!`);
        setShowPayDialog(false);
        resetPayDialog();
        queryClient.invalidateQueries({ queryKey: trpc.financial.getById.queryKey({ id: transactionId }) });
        queryClient.invalidateQueries({ queryKey: trpc.financial.stats.queryKey() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const reverseMutation = useMutation(
    trpc.financial.reverseInstallment.mutationOptions({
      onSuccess: () => {
        toast.success(`Parcela #${selectedInstallment?.number} estornada!`);
        setShowReverseDialog(false);
        setReverseReason("");
        setSelectedInstallment(null);
        queryClient.invalidateQueries({ queryKey: trpc.financial.getById.queryKey({ id: transactionId }) });
        queryClient.invalidateQueries({ queryKey: trpc.financial.stats.queryKey() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const cancelMutation = useMutation(
    trpc.financial.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Transacao cancelada!");
        setShowCancelDialog(false);
        queryClient.invalidateQueries({ queryKey: trpc.financial.getById.queryKey({ id: transactionId }) });
        queryClient.invalidateQueries({ queryKey: trpc.financial.stats.queryKey() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  function resetPayDialog() {
    setPayAmount(0);
    setPayMethod("");
    setPayNotes("");
    setSelectedInstallment(null);
  }

  function openPayDialog(inst: { id: string; number: number; amount: number; paidAmount: number }) {
    setSelectedInstallment(inst);
    setPayAmount(inst.amount - inst.paidAmount);
    setPayMethod("");
    setPayNotes("");
    setShowPayDialog(true);
  }

  function openReverseDialog(inst: { id: string; number: number; amount: number; paidAmount: number }) {
    setSelectedInstallment(inst);
    setReverseReason("");
    setShowReverseDialog(true);
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Transacao nao encontrada
        </CardContent>
      </Card>
    );
  }

  const t = query.data;
  const isReceivable = t.type === "RECEIVABLE";
  // Cancelar conta e estornar parcela paga sao operacoes de admin no server
  // (financial.cancel / financial.reverseInstallment). Esconde os botoes pra
  // operador comum em vez de mostrar um CTA que daria FORBIDDEN.
  const canCancel = isAdmin && !["PAID", "CANCELLED"].includes(t.status);
  const paidInstallments = t.installments?.filter((i) => i.status === "PAID").length ?? 0;
  const totalInstallments = t.installments?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.description}
        subtitle={
          <span>
            {t.referenceType === "service_order"
              ? "Originada de Ordem de Servico"
              : t.referenceType === "sale"
                ? "Originada de Venda PDV"
                : "Cadastro Manual"}
          </span>
        }
        actions={
          <div className="flex gap-2">
            {canCancel && (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setShowCancelDialog(true)}
              >
                <Ban className="mr-2 h-4 w-4" />
                Cancelar Conta
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/financial">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase">Valor Total</p>
            <p className="text-2xl font-bold font-mono text-primary">
              {formatCents(t.totalAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase">Valor Pago</p>
            <p className="text-2xl font-bold font-mono text-success">
              {formatCents(t.paidAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase">Valor Restante</p>
            <p className={`text-2xl font-bold font-mono ${t.remainingAmount > 0 ? "text-warning" : "text-success"}`}>
              {formatCents(t.remainingAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase">Status</p>
            <div className="mt-1">
              <StatusBadge variant={statusVariant(t.status)}>
                {TRANSACTION_STATUS_LABELS[t.status] ?? t.status}
              </StatusBadge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {isReceivable && (
              <div>
                <p className="text-xs text-muted-foreground uppercase">Cliente</p>
                <p className="text-sm">{t.customerName ?? "-"}</p>
              </div>
            )}
            {!isReceivable && (
              <div>
                <p className="text-xs text-muted-foreground uppercase">Fornecedor</p>
                <p className="text-sm">{t.supplier ?? "-"}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground uppercase">Tipo</p>
              <p className="text-sm">{TRANSACTION_TYPE_LABELS[t.type]}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Categoria</p>
              <p className="text-sm">{t.category ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Forma Pagamento</p>
              <p className="text-sm">
                {t.paymentMethod ? (PAYMENT_METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod) : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Parcelas</p>
              <p className="text-sm">{paidInstallments}/{totalInstallments}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Data Emissao</p>
              <p className="text-sm">{formatDate(t.emissionDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Vencimento</p>
              <p className="text-sm">{formatDate(t.dueDate)}</p>
            </div>
            {t.notes && (
              <div className="col-span-full">
                <p className="text-xs text-muted-foreground uppercase">Observacoes</p>
                <p className="text-sm">{t.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Installments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parcelas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Valor Pago</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Data Pgto</TableHead>
                <TableHead>Forma Pgto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.installments?.map((inst) => {
                const isOverdue =
                  ["PENDING", "OVERDUE"].includes(inst.status) &&
                  new Date(inst.dueDate) < new Date();

                return (
                  <TableRow key={inst.id}>
                    <TableCell className="font-medium">
                      {inst.number}/{totalInstallments}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCents(inst.amount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-success">
                      {formatCents(inst.paidAmount)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(inst.dueDate)}
                      {isOverdue && (
                        <span className="block text-xs text-destructive">Vencida</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(inst.paidAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {inst.paymentMethod
                        ? (PAYMENT_METHOD_LABELS[inst.paymentMethod] ?? inst.paymentMethod)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={statusVariant(inst.status)}>
                        {INSTALLMENT_STATUS_LABELS[inst.status] ?? inst.status}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {["PENDING", "OVERDUE"].includes(inst.status) && (
                        <Button
                          size="sm"
                          onClick={() =>
                            openPayDialog({
                              id: inst.id,
                              number: inst.number,
                              amount: inst.amount,
                              paidAmount: inst.paidAmount,
                            })
                          }
                        >
                          Baixar
                        </Button>
                      )}
                      {inst.status === "PAID" && isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-warning border-warning"
                          onClick={() =>
                            openReverseDialog({
                              id: inst.id,
                              number: inst.number,
                              amount: inst.amount,
                              paidAmount: inst.paidAmount,
                            })
                          }
                        >
                          <Undo2 className="mr-1 h-3 w-3" />
                          Estornar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pay Installment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={(open) => { if (!open) { setShowPayDialog(false); resetPayDialog(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Baixar Parcela #{selectedInstallment?.number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Valor Pago (R$) *</Label>
              <MoneyInput value={payAmount} onChange={setPayAmount} autoFocus />
              <p className="text-xs text-muted-foreground mt-1">
                Saldo: {formatCents((selectedInstallment?.amount ?? 0) - (selectedInstallment?.paidAmount ?? 0))}
              </p>
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observacoes</Label>
              <Textarea
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Observacoes (opcional)"
                rows={2}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowPayDialog(false); resetPayDialog(); }}
              disabled={payMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!selectedInstallment) return;
                payMutation.mutate({
                  installmentId: selectedInstallment.id,
                  amountPaid: payAmount,
                  paymentMethod: payMethod || null,
                  notes: payNotes || null,
                });
              }}
              disabled={payMutation.isPending || payAmount <= 0}
            >
              {payMutation.isPending ? "Processando..." : "Confirmar Baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse Installment Dialog */}
      <Dialog open={showReverseDialog} onOpenChange={(open) => { if (!open) { setShowReverseDialog(false); setReverseReason(""); setSelectedInstallment(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Estornar Parcela #{selectedInstallment?.number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              O valor sera lancado como {isReceivable ? "saida" : "entrada"} no seu caixa aberto (se houver).
            </p>
            <div>
              <Label>Motivo do Estorno *</Label>
              <Textarea
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Informe o motivo (min. 3 caracteres)"
                rows={2}
                maxLength={500}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowReverseDialog(false); setReverseReason(""); setSelectedInstallment(null); }}
              disabled={reverseMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              className="bg-warning hover:bg-warning/90 text-warning-foreground"
              onClick={() => {
                if (!selectedInstallment) return;
                reverseMutation.mutate({
                  installmentId: selectedInstallment.id,
                  reason: reverseReason,
                });
              }}
              disabled={reverseMutation.isPending || reverseReason.trim().length < 3}
            >
              {reverseMutation.isPending ? "Processando..." : "Confirmar Estorno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Transaction Dialog */}
      <ConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title="Cancelar Transacao"
        description="Tem certeza que deseja cancelar esta transacao? Todas as parcelas pendentes serao canceladas."
        confirmLabel={cancelMutation.isPending ? "Cancelando..." : "Cancelar Transacao"}
        variant="destructive"
        onConfirm={() => {
          cancelMutation.mutate({ id: transactionId });
        }}
      />
    </div>
  );
}
