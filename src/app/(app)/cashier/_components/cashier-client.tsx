"use client";

import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { MoneyInput } from "@/components/inputs/money-input";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const movementTypeLabels: Record<string, string> = {
  SALE: "Venda",
  SERVICE_ORDER: "Ordem de Serviço",
  WITHDRAWAL: "Sangria",
  DEPOSIT: "Suprimento",
  ADJUSTMENT: "Ajuste",
};

export function CashierClient() {
  const trpc = useTRPC();
  const [openDialog, setOpenDialog] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [movDialog, setMovDialog] = useState<"WITHDRAWAL" | "DEPOSIT" | null>(null);
  const [movAmount, setMovAmount] = useState(0);
  const [movDesc, setMovDesc] = useState("");
  const [closeDialog, setCloseDialog] = useState(false);
  const [closingBalance, setClosingBalance] = useState(0);
  const [closeNotes, setCloseNotes] = useState("");

  const { data: register, isLoading, refetch } = useQuery(
    trpc.cashier.getCurrent.queryOptions(),
  );

  const { data: summary, refetch: refetchSummary } = useQuery(
    trpc.cashier.summary.queryOptions(),
  );

  const openMutation = useMutation(
    trpc.cashier.open.mutationOptions({
      onSuccess: () => {
        toast.success("Caixa aberto com sucesso!");
        setOpenDialog(false);
        setOpeningBalance(0);
        void refetch();
        void refetchSummary();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const movMutation = useMutation(
    trpc.cashier.addMovement.mutationOptions({
      onSuccess: () => {
        toast.success(movDialog === "WITHDRAWAL" ? "Sangria registrada." : "Suprimento registrado.");
        setMovDialog(null);
        setMovAmount(0);
        setMovDesc("");
        void refetch();
        void refetchSummary();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const closeMutation = useMutation(
    trpc.cashier.close.mutationOptions({
      onSuccess: () => {
        toast.success("Caixa fechado com sucesso!");
        setCloseDialog(false);
        void refetch();
        void refetchSummary();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState variant="card" />;

  // No open register
  if (!register) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="pt-6 text-center space-y-4">
          <EmptyState
            title="Nenhum caixa aberto"
            description="Abra um caixa para começar a registrar movimentações."
          />
          <Button onClick={() => setOpenDialog(true)}>Abrir Caixa</Button>

          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir Caixa</DialogTitle>
                <DialogDescription>Informe o saldo inicial do caixa.</DialogDescription>
              </DialogHeader>
              <div>
                <label className="text-sm font-medium">Saldo Inicial</label>
                <MoneyInput value={openingBalance} onChange={setOpeningBalance} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
                <Button
                  disabled={openMutation.isPending}
                  onClick={() => openMutation.mutate({ openingBalance: openingBalance / 100 })}
                >
                  Abrir Caixa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  // Open register
  const expectedBalance = summary?.currentBalance ?? 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saldo Inicial</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(summary?.openingBalance ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Entradas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{formatMoney(summary?.totalInflows ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saídas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatMoney(summary?.totalOutflows ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saldo Atual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(expectedBalance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment method summary */}
      {summary?.byPaymentMethod && summary.byPaymentMethod.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo por Forma de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Forma</th>
                    <th className="text-right p-2 font-medium">Entradas</th>
                    <th className="text-right p-2 font-medium">Saídas</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byPaymentMethod.map((m) => (
                    <tr key={m.method} className="border-b last:border-0">
                      <td className="p-2">{m.method}</td>
                      <td className="p-2 text-right text-success">{formatMoney(m.inflows)}</td>
                      <td className="p-2 text-right text-destructive">{formatMoney(m.outflows)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setMovDialog("DEPOSIT")}>
          <ArrowDownCircle className="mr-1 h-4 w-4" />
          Suprimento
        </Button>
        <Button variant="outline" onClick={() => setMovDialog("WITHDRAWAL")}>
          <ArrowUpCircle className="mr-1 h-4 w-4" />
          Sangria
        </Button>
        <Button variant="destructive" onClick={() => { setClosingBalance(0); setCloseDialog(true); }}>
          <XCircle className="mr-1 h-4 w-4" />
          Fechar Caixa
        </Button>
      </div>

      {/* Movements list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          {register.movements.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma movimentação registrada.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Data</th>
                    <th className="text-left p-2 font-medium">Tipo</th>
                    <th className="text-left p-2 font-medium">Descrição</th>
                    <th className="text-left p-2 font-medium">Forma</th>
                    <th className="text-right p-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {register.movements.map((mov) => (
                    <tr key={mov.id} className="border-b last:border-0">
                      <td className="p-2">{new Date(mov.createdAt).toLocaleString("pt-BR")}</td>
                      <td className="p-2">
                        <Badge variant={mov.type === "WITHDRAWAL" ? "destructive" : "default"}>
                          {movementTypeLabels[mov.type] ?? mov.type}
                        </Badge>
                      </td>
                      <td className="p-2">{mov.description ?? "—"}</td>
                      <td className="p-2">{mov.paymentMethod ?? "—"}</td>
                      <td className="p-2 text-right font-medium">
                        <span className={mov.type === "WITHDRAWAL" ? "text-destructive" : "text-success"}>
                          {mov.type === "WITHDRAWAL" ? "- " : "+ "}
                          {formatMoney(Number(mov.amount))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Movement dialog (sangria/suprimento) */}
      <Dialog open={!!movDialog} onOpenChange={(open) => !open && setMovDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{movDialog === "WITHDRAWAL" ? "Sangria" : "Suprimento"}</DialogTitle>
            <DialogDescription>
              {movDialog === "WITHDRAWAL"
                ? "Registre uma retirada de valor do caixa."
                : "Registre um suprimento (entrada) no caixa."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Valor</label>
              <MoneyInput value={movAmount} onChange={setMovAmount} />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição *</label>
              <Input
                placeholder="Motivo..."
                value={movDesc}
                onChange={(e) => setMovDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(null)}>Cancelar</Button>
            <Button
              disabled={movMutation.isPending || !movDesc.trim() || movAmount <= 0}
              onClick={() => {
                if (movDialog) {
                  movMutation.mutate({
                    type: movDialog,
                    amount: movAmount / 100,
                    description: movDesc,
                  });
                }
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close cash register dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
            <DialogDescription>Confira o saldo e informe o valor contado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-muted/50 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Saldo esperado (calculado)</span>
                <span className="font-bold">{formatMoney(expectedBalance)}</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Saldo Contado</label>
              <MoneyInput value={closingBalance} onChange={setClosingBalance} />
            </div>
            {closingBalance > 0 && (
              <div className="p-3 rounded-md bg-muted/50">
                <div className="flex justify-between text-sm">
                  <span>Diferença</span>
                  <span className={`font-bold ${closingBalance / 100 - expectedBalance === 0 ? "text-success" : "text-destructive"}`}>
                    {formatMoney(closingBalance / 100 - expectedBalance)}
                  </span>
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Observações</label>
              <Textarea
                placeholder="Observações sobre o fechamento..."
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={closeMutation.isPending}
              onClick={() =>
                closeMutation.mutate({
                  closingBalance: closingBalance / 100,
                  notes: closeNotes || undefined,
                })
              }
            >
              Fechar Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
