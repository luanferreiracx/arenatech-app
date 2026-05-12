"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle, Trash2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/domain/page-header";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { LoadingState } from "@/components/domain/loading-state";
import { MoneyInput } from "@/components/inputs/money-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

interface Props {
  id: string;
}

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
  PARTIALLY_PAID: "Parcial",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  PAID: "default",
  OVERDUE: "destructive",
  CANCELLED: "secondary",
  PARTIALLY_PAID: "outline",
};

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TransactionDetailClient({ id }: Props) {
  const trpc = useTRPC();
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [payDialog, setPayDialog] = useState<{ installmentId: string; defaultAmount: number } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const { data: transaction, isLoading, refetch } = useQuery(
    trpc.financial.getTransaction.queryOptions({ id }),
  );

  const cancelMutation = useMutation(
    trpc.financial.cancelTransaction.mutationOptions({
      onSuccess: () => {
        toast.success("Transação cancelada.");
        setCancelOpen(false);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.financial.deleteTransaction.mutationOptions({
      onSuccess: () => {
        toast.success("Transação removida.");
        router.push("/financial");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const payMutation = useMutation(
    trpc.financial.payInstallment.mutationOptions({
      onSuccess: () => {
        toast.success("Pagamento registrado.");
        setPayDialog(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState variant="card" />;
  if (!transaction) return <p className="text-muted-foreground">Transação não encontrada.</p>;

  const remaining = Number(transaction.totalAmount) - Number(transaction.paidAmount);

  return (
    <div className="space-y-6">
      <PageHeader
        title={transaction.description}
        subtitle={`${statusLabels[transaction.status] ?? transaction.status} — ${transaction.type === "PAYABLE" ? "A Pagar" : "A Receber"}`}
        actions={
          <div className="flex gap-2">
            {transaction.status !== "CANCELLED" && transaction.status !== "PAID" && (
              <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
                <XCircle className="mr-1 h-4 w-4" />
                Cancelar
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              Remover
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(transaction.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{formatMoney(transaction.paidAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor Restante</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatMoney(remaining)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Vencimento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{new Date(transaction.dueDate).toLocaleDateString("pt-BR")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Detalhes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {transaction.category && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Categoria</span>
              <span>{transaction.category}</span>
            </div>
          )}
          {Boolean((transaction as Record<string, unknown>).supplier) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fornecedor</span>
              <span>{String((transaction as Record<string, unknown>).supplier)}</span>
            </div>
          )}
          {Boolean((transaction as Record<string, unknown>).customerName) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span>{String((transaction as Record<string, unknown>).customerName)}</span>
            </div>
          )}
          {Boolean((transaction as Record<string, unknown>).paymentMethod) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Forma de Pagamento</span>
              <span>{String((transaction as Record<string, unknown>).paymentMethod)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Parcelas</span>
            <span>
              {transaction.installments.filter((i) => i.status === "PAID").length}/{transaction.installments.length}
            </span>
          </div>
          {Boolean((transaction as Record<string, unknown>).emissionDate) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data de Emissão</span>
              <span>{new Date(String((transaction as Record<string, unknown>).emissionDate)).toLocaleDateString("pt-BR")}</span>
            </div>
          )}
          {transaction.paidAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data de Pagamento</span>
              <span>{new Date(transaction.paidAt).toLocaleDateString("pt-BR")}</span>
            </div>
          )}
          {transaction.notes && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Observações</span>
              <span className="max-w-[300px] text-right">{transaction.notes}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installments table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parcelas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">N.</th>
                  <th className="text-right p-2 font-medium">Valor</th>
                  <th className="text-left p-2 font-medium">Vencimento</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-right p-2 font-medium">Pago</th>
                  <th className="text-right p-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {transaction.installments.map((inst) => {
                  const isOverdue = new Date(inst.dueDate) < new Date() && inst.status !== "PAID" && inst.status !== "CANCELLED";
                  return (
                    <tr key={inst.id} className="border-b last:border-0">
                      <td className="p-2">{inst.number}</td>
                      <td className="p-2 text-right">{formatMoney(inst.amount)}</td>
                      <td className={`p-2 ${isOverdue ? "text-destructive font-medium" : ""}`}>
                        {new Date(inst.dueDate).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="p-2">
                        <Badge variant={statusVariants[inst.status] ?? "outline"}>
                          {statusLabels[inst.status] ?? inst.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{formatMoney(inst.paidAmount)}</td>
                      <td className="p-2 text-right">
                        {(inst.status === "PENDING" || inst.status === "PARTIALLY_PAID") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const defaultAmt = Number(inst.amount) - Number(inst.paidAmount);
                              setPayAmount(defaultAmt);
                              setPayDialog({ installmentId: inst.id, defaultAmount: defaultAmt });
                            }}
                          >
                            <DollarSign className="mr-1 h-3 w-3" />
                            Pagar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pay installment dialog */}
      <Dialog open={!!payDialog} onOpenChange={(open) => { if (!open) { setPayDialog(null); setPayMethod(""); setPayNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>Informe o valor pago e a forma de pagamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor Pago *</Label>
              <MoneyInput value={Math.round(payAmount * 100)} onChange={(centavos) => setPayAmount(centavos / 100)} />
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Observações do pagamento..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayDialog(null); setPayMethod(""); setPayNotes(""); }}>Cancelar</Button>
            <Button
              disabled={payMutation.isPending || payAmount <= 0}
              onClick={() => {
                if (payDialog) {
                  payMutation.mutate({
                    installmentId: payDialog.installmentId,
                    paidAmount: payAmount,
                    paymentMethod: payMethod || undefined,
                    notes: payNotes || undefined,
                  });
                }
              }}
            >
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar transação?"
        description="Todas as parcelas pendentes serão canceladas."
        confirmLabel="Cancelar Transação"
        variant="destructive"
        onConfirm={() => cancelMutation.mutate({ id })}
        isLoading={cancelMutation.isPending}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remover transação?"
        description="A transação será marcada como removida."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate({ id })}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
