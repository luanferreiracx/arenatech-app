"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import {
  movementTypeLabels,
  paymentMethodLabels,
} from "@/lib/validators/cashier";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";

interface Props {
  id: string;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ClosingDetailEntry {
  system: number;
  reported: number;
  verified: boolean;
  difference: number;
}

export function CashDetailClient({ id }: Props) {
  const trpc = useTRPC();
  const { data: register, isLoading } = useQuery(
    trpc.cashier.getById.queryOptions({ id }),
  );

  if (isLoading) return <LoadingState variant="card" />;
  if (!register) return <p className="text-muted-foreground">Caixa não encontrado.</p>;

  const difference = register.difference ? Number(register.difference) : 0;
  const closingDetails = register.closingDetails as Record<string, ClosingDetailEntry> | null;

  // Calculate duration
  let duration: string | null = null;
  if (register.closedAt) {
    const openTime = new Date(register.openedAt).getTime();
    const closeTime = new Date(register.closedAt).getTime();
    const diffMs = closeTime - openTime;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    duration = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de Fechamento"
        subtitle={new Date(register.openedAt).toLocaleDateString("pt-BR")}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          {/* Cashier info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações do Caixa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Abertura:</span>
                <span>{new Date(register.openedAt).toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fechamento:</span>
                <span>{register.closedAt ? new Date(register.closedAt).toLocaleString("pt-BR") : "—"}</span>
              </div>
              {duration && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duração:</span>
                  <span>{duration}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sales summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo de Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Quantidade de Vendas</p>
                  <p className="text-2xl font-bold">{register.salesCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Vendas</p>
                  <p className="text-2xl font-bold text-success">{formatMoney(register.salesTotal)}</p>
                </div>
              </div>

              {register.salesSummary.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold mt-4 mb-2">Por Forma de Pagamento</h4>
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Forma</th>
                          <th className="text-center p-2 font-medium">Qtd</th>
                          <th className="text-right p-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {register.salesSummary.map((s) => (
                          <tr key={s.method} className="border-b last:border-0">
                            <td className="p-2">{s.label}</td>
                            <td className="p-2 text-center">{s.count}</td>
                            <td className="p-2 text-right">{formatMoney(s.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Cash flow */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimentações de Caixa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="p-2">Saldo Inicial</td>
                      <td className="p-2 text-right">{formatMoney(register.openingBalance)}</td>
                    </tr>
                    <tr className="border-b text-success">
                      <td className="p-2">(+) Vendas Dinheiro</td>
                      <td className="p-2 text-right">
                        {formatMoney(register.salesSummary.find((s) => s.method === "dinheiro")?.total ?? 0)}
                      </td>
                    </tr>
                    <tr className="border-b text-success">
                      <td className="p-2">(+) Suprimentos</td>
                      <td className="p-2 text-right">{formatMoney(register.totalDeposits)}</td>
                    </tr>
                    <tr className="border-b text-destructive">
                      <td className="p-2">(-) Sangrias</td>
                      <td className="p-2 text-right">{formatMoney(register.totalWithdrawals)}</td>
                    </tr>
                    <tr className="border-b text-destructive">
                      <td className="p-2">(-) Despesas</td>
                      <td className="p-2 text-right">{formatMoney(register.totalExpenses)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-primary/10 font-bold">
                      <td className="p-2">SALDO ESPERADO</td>
                      <td className="p-2 text-right text-lg">{formatMoney(register.expectedCashBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Verification */}
          <Card className={`border ${Math.abs(difference) < 0.01 ? "border-success/50" : "border-warning/50"}`}>
            <CardHeader className={Math.abs(difference) < 0.01 ? "bg-success/10" : "bg-warning/10"}>
              <CardTitle className="text-base">Conferência</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Saldo Sistema:</span>
                  <span className="font-bold">{formatMoney(register.expectedBalance ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Saldo Informado:</span>
                  <span className="font-bold">{formatMoney(register.closingBalance ?? 0)}</span>
                </div>
                <div className={`flex justify-between ${difference < 0 ? "text-destructive" : difference > 0 ? "text-success" : ""}`}>
                  <span>Diferença:</span>
                  <div className="text-right">
                    <span className="text-lg font-bold">{formatMoney(difference)}</span>
                    <br />
                    <span className="text-xs">
                      {Math.abs(difference) < 0.01
                        ? "CONFERE"
                        : difference > 0
                          ? "SOBRA"
                          : "FALTA"}
                    </span>
                  </div>
                </div>
              </div>
              {register.notes && (
                <div className="mt-3 p-3 bg-muted/50 rounded-md">
                  <span className="text-xs text-muted-foreground block mb-1">Observação:</span>
                  <span className="text-sm">{register.notes}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-method verification */}
          {closingDetails && Object.keys(closingDetails).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conferência por Forma de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Forma</th>
                        <th className="text-right p-2 font-medium">Sistema</th>
                        <th className="text-right p-2 font-medium">Informado</th>
                        <th className="text-right p-2 font-medium">Diferença</th>
                        <th className="text-center p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(closingDetails).map(([method, detail]) => {
                        const label = paymentMethodLabels[method] ?? method;
                        const d = detail.difference;
                        return (
                          <tr key={method} className="border-b last:border-0">
                            <td className="p-2">{label}</td>
                            <td className="p-2 text-right">{formatMoney(detail.system)}</td>
                            <td className="p-2 text-right">{formatMoney(detail.reported)}</td>
                            <td className={`p-2 text-right ${d < 0 ? "text-destructive" : d > 0 ? "text-success" : ""}`}>
                              {formatMoney(d)}
                            </td>
                            <td className="p-2 text-center">
                              {Math.abs(d) < 0.01 ? (
                                <Badge variant="default">OK</Badge>
                              ) : d > 0 ? (
                                <Badge variant="outline" className="text-warning">Sobra</Badge>
                              ) : (
                                <Badge variant="destructive">Falta</Badge>
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
          )}
        </div>
      </div>

      {/* All movements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas as Movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          {register.movements.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma movimentação.</p>
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
  );
}
