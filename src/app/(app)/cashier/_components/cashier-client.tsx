"use client";

import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, XCircle, Lock, Unlock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  movementTypeLabels,
  paymentMethodLabels,
} from "@/lib/validators/cashier";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ClosingDetailState {
  system: number;
  reported: number;
  verified: boolean;
}

export function CashierClient() {
  const trpc = useTRPC();
  const [openDialog, setOpenDialog] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingNotes, setOpeningNotes] = useState("");
  const [movDialog, setMovDialog] = useState<"WITHDRAWAL" | "DEPOSIT" | null>(null);
  const [movAmount, setMovAmount] = useState(0);
  const [movDesc, setMovDesc] = useState("");
  const [closeDialog, setCloseDialog] = useState(false);
  const [closingBalance, setClosingBalance] = useState(0);
  const [closeNotes, setCloseNotes] = useState("");
  const [closingDetails, setClosingDetails] = useState<Record<string, ClosingDetailState>>({});

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
        setOpeningNotes("");
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
            title="Caixa Fechado"
            description="Clique em 'Abrir Caixa' para iniciar suas operações do dia."
          />
          <Button size="lg" onClick={() => setOpenDialog(true)}>
            <Unlock className="mr-2 h-5 w-5" />
            Abrir Caixa
          </Button>

          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir Caixa</DialogTitle>
                <DialogDescription>Conte o dinheiro em espécie e informe o valor total.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Saldo Inicial (Dinheiro em Espécie) *</Label>
                  <MoneyInput value={openingBalance} onChange={setOpeningBalance} />
                </div>
                <div>
                  <Label>Observação (opcional)</Label>
                  <Textarea
                    placeholder="Alguma observação sobre a abertura..."
                    value={openingNotes}
                    onChange={(e) => setOpeningNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
                <Button
                  disabled={openMutation.isPending}
                  onClick={() => openMutation.mutate({
                    openingBalance: openingBalance / 100,
                    openingNotes: openingNotes || undefined,
                  })}
                >
                  <Unlock className="mr-2 h-4 w-4" />
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
  const expectedCashBalance = summary?.expectedCashBalance ?? 0;
  const closingBalanceReais = closingBalance / 100;
  const difference = closingBalance > 0 ? closingBalanceReais - expectedCashBalance : 0;

  const handleOpenCloseDialog = () => {
    setClosingBalance(0);
    setCloseNotes("");
    // Pre-fill closing details from summary
    const details: Record<string, ClosingDetailState> = {};
    if (summary?.byPaymentMethod) {
      for (const m of summary.byPaymentMethod) {
        if (m.method !== "dinheiro" && m.total > 0) {
          details[m.method] = {
            system: m.total,
            reported: m.total,
            verified: false,
          };
        }
      }
    }
    setClosingDetails(details);
    setCloseDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saldo Atual (Dinheiro)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(expectedCashBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{formatMoney(summary?.totalSales ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{summary?.totalSalesCount ?? 0} venda(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Sangrias</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-warning">{formatMoney(summary?.totalWithdrawals ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Suprimentos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-sky-400">{formatMoney(summary?.totalDeposits ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setMovDialog("DEPOSIT")}>
          <ArrowDownCircle className="mr-1 h-4 w-4" />
          Suprimento
        </Button>
        <Button variant="outline" className="text-warning border-warning/30" onClick={() => setMovDialog("WITHDRAWAL")}>
          <ArrowUpCircle className="mr-1 h-4 w-4" />
          Sangria
        </Button>
        <Button variant="destructive" onClick={handleOpenCloseDialog}>
          <Lock className="mr-1 h-4 w-4" />
          Fechar Caixa
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Movements list */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimentações</CardTitle>
            </CardHeader>
            <CardContent>
              {register.movements.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma movimentação registrada ainda.</p>
              ) : (
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Hora</th>
                        <th className="text-left p-2 font-medium">Tipo</th>
                        <th className="text-left p-2 font-medium">Descrição</th>
                        <th className="text-left p-2 font-medium">Forma</th>
                        <th className="text-right p-2 font-medium">Valor</th>
                        <th className="text-right p-2 font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {register.movements.map((mov) => {
                        const isOutflow = mov.nature === "OUTFLOW";
                        return (
                          <tr key={mov.id} className="border-b last:border-0">
                            <td className="p-2 text-muted-foreground">
                              {new Date(mov.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="p-2">
                              <Badge variant={isOutflow ? "destructive" : "default"}>
                                {movementTypeLabels[mov.type] ?? mov.type}
                              </Badge>
                            </td>
                            <td className="p-2">{mov.description ?? "—"}</td>
                            <td className="p-2">{mov.paymentMethod ? (paymentMethodLabels[mov.paymentMethod] ?? mov.paymentMethod) : "—"}</td>
                            <td className={`p-2 text-right font-medium ${isOutflow ? "text-destructive" : "text-success"}`}>
                              {isOutflow ? "- " : "+ "}
                              {formatMoney(Number(mov.amount))}
                            </td>
                            <td className="p-2 text-right text-muted-foreground">
                              {mov.currentBalance != null ? formatMoney(Number(mov.currentBalance)) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment method summary */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vendas por Forma de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              {summary?.byPaymentMethod && summary.byPaymentMethod.length > 0 ? (
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <tbody>
                      {summary.byPaymentMethod.map((m) => (
                        <tr key={m.method} className="border-b last:border-0">
                          <td className="p-2">
                            <Badge variant="outline">{m.label}</Badge>
                          </td>
                          <td className="p-2 text-center text-muted-foreground">{m.count}x</td>
                          <td className="p-2 text-right font-medium">{formatMoney(m.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50">
                        <td className="p-2 font-bold" colSpan={2}>TOTAL</td>
                        <td className="p-2 text-right font-bold">{formatMoney(summary.totalSales)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma venda ainda.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Movement dialog (sangria/suprimento) */}
      <Dialog open={!!movDialog} onOpenChange={(open) => !open && setMovDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{movDialog === "WITHDRAWAL" ? "Registrar Sangria" : "Registrar Suprimento"}</DialogTitle>
            <DialogDescription>
              {movDialog === "WITHDRAWAL"
                ? `Sangria é a retirada de dinheiro do caixa. Saldo disponível: ${formatMoney(expectedCashBalance)}`
                : "Suprimento é a entrada de dinheiro no caixa. Use para adicionar troco ou repor valores."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor *</Label>
              <MoneyInput value={movAmount} onChange={setMovAmount} />
            </div>
            <div>
              <Label>Motivo *</Label>
              <Input
                placeholder={movDialog === "WITHDRAWAL" ? "Ex: Transferência para cofre" : "Ex: Reposição de troco"}
                value={movDesc}
                onChange={(e) => setMovDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(null)}>Cancelar</Button>
            <Button
              variant={movDialog === "WITHDRAWAL" ? "destructive" : "default"}
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
              {movDialog === "WITHDRAWAL" ? "Registrar Sangria" : "Registrar Suprimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close cash register dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
            <DialogDescription>Conferência e fechamento do caixa.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Cash flow summary */}
            <div className="rounded-md border p-4 space-y-2">
              <h4 className="font-semibold text-sm">Fluxo de Dinheiro</h4>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td>Saldo Inicial</td>
                    <td className="text-right">{formatMoney(summary?.openingBalance ?? 0)}</td>
                  </tr>
                  <tr className="text-success">
                    <td>(+) Vendas em Dinheiro</td>
                    <td className="text-right">
                      {formatMoney(summary?.byPaymentMethod?.find((m) => m.method === "dinheiro")?.total ?? 0)}
                    </td>
                  </tr>
                  <tr className="text-success">
                    <td>(+) Suprimentos</td>
                    <td className="text-right">{formatMoney(summary?.totalDeposits ?? 0)}</td>
                  </tr>
                  <tr className="text-destructive">
                    <td>(-) Sangrias</td>
                    <td className="text-right">{formatMoney(summary?.totalWithdrawals ?? 0)}</td>
                  </tr>
                  <tr className="text-destructive">
                    <td>(-) Despesas</td>
                    <td className="text-right">{formatMoney(summary?.totalExpenses ?? 0)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t">
                    <td className="pt-2">SALDO ESPERADO (DINHEIRO)</td>
                    <td className="pt-2 text-right text-lg">{formatMoney(expectedCashBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Cash verification */}
            <div className="rounded-md border border-warning/50 p-4 space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Conferência - Dinheiro
              </h4>
              <p className="text-xs text-muted-foreground">
                Conte todo o dinheiro em espécie do caixa e informe o valor total.
              </p>
              <div className="p-3 rounded-md bg-muted/50 space-y-1">
                <div className="text-xs text-muted-foreground">Saldo Esperado (Sistema)</div>
                <div className="text-xl font-bold">{formatMoney(expectedCashBalance)}</div>
              </div>
              <div>
                <Label>Saldo Contado (Informado por Você) *</Label>
                <MoneyInput value={closingBalance} onChange={setClosingBalance} />
              </div>
              {closingBalance > 0 && (
                <div className={`p-3 rounded-md ${Math.abs(difference) < 0.01 ? "bg-success/10 text-success" : difference > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  <div className="text-xs">Diferença Dinheiro</div>
                  <div className="text-lg font-bold">
                    {formatMoney(Math.abs(difference))}
                  </div>
                  <div className="text-xs">
                    {Math.abs(difference) < 0.01
                      ? "Caixa confere!"
                      : difference > 0
                        ? "SOBRA de caixa"
                        : "FALTA de caixa"}
                  </div>
                </div>
              )}
            </div>

            {/* Per-payment-method verification (non-cash methods) */}
            {Object.keys(closingDetails).length > 0 && (
              <div className="rounded-md border p-4 space-y-3">
                <h4 className="font-semibold text-sm">Conferência - Outras Formas</h4>
                <p className="text-xs text-muted-foreground">
                  Confira os valores com a maquininha de cartão e comprovantes.
                </p>
                {Object.entries(closingDetails).map(([method, detail]) => {
                  const label = paymentMethodLabels[method] ?? method;
                  const diff = detail.reported - detail.system;
                  return (
                    <div key={method} className="p-3 rounded-md bg-muted/50 border-l-2 border-primary space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({summary?.byPaymentMethod?.find((m) => m.method === method)?.count ?? 0} vendas)
                          </span>
                        </div>
                        <span className="font-bold">{formatMoney(detail.system)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`conf_${method}`}
                            checked={detail.verified}
                            onCheckedChange={(checked) => {
                              setClosingDetails((prev) => ({
                                ...prev,
                                [method]: {
                                  ...detail,
                                  verified: !!checked,
                                  reported: checked ? detail.system : detail.reported,
                                },
                              }));
                            }}
                          />
                          <label htmlFor={`conf_${method}`} className="text-sm">Valor confere</label>
                        </div>
                        {!detail.verified && (
                          <div className="flex-1">
                            <MoneyInput
                              value={Math.round(detail.reported * 100)}
                              onChange={(centavos) => {
                                setClosingDetails((prev) => ({
                                  ...prev,
                                  [method]: { ...detail, reported: centavos / 100 },
                                }));
                              }}
                            />
                          </div>
                        )}
                        {detail.verified ? (
                          <Badge variant="default">OK</Badge>
                        ) : Math.abs(diff) < 0.01 ? (
                          <Badge variant="default">OK</Badge>
                        ) : diff > 0 ? (
                          <Badge variant="outline" className="text-warning">+{formatMoney(diff)}</Badge>
                        ) : (
                          <Badge variant="destructive">{formatMoney(diff)}</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Notes */}
            <div>
              <Label>Observação (opcional)</Label>
              <Textarea
                placeholder="Justificativa em caso de diferença..."
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
              onClick={() => {
                // Build closing details for all payment methods
                const details: Record<string, { system: number; reported: number; verified: boolean; difference: number }> = {};

                // Add dinheiro
                details["dinheiro"] = {
                  system: expectedCashBalance,
                  reported: closingBalanceReais,
                  verified: Math.abs(difference) < 0.01,
                  difference,
                };

                // Add other methods
                for (const [method, detail] of Object.entries(closingDetails)) {
                  details[method] = {
                    system: detail.system,
                    reported: detail.reported,
                    verified: detail.verified,
                    difference: detail.reported - detail.system,
                  };
                }

                closeMutation.mutate({
                  closingBalance: closingBalanceReais,
                  notes: closeNotes || undefined,
                  closingDetails: details,
                });
              }}
            >
              <Lock className="mr-2 h-4 w-4" />
              Fechar Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
