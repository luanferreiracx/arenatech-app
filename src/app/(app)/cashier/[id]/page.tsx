"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/domain/page-header";
import {
  MOVEMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/validators/cashier";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(openedAt: Date, closedAt: Date): string {
  const diff = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function CashierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const trpc = useTRPC();

  const detailQuery = useQuery(trpc.cashier.byId.queryOptions({ id }));

  if (detailQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Relatorio de Fechamento" />
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div>
        <PageHeader title="Relatorio de Fechamento" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Caixa nao encontrado.
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => router.push("/cashier/history")}
              >
                Voltar ao Historico
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { register, movements, summary, paymentMethodSummary } =
    detailQuery.data;


  return (
    <div>
      <PageHeader
        title="Relatorio de Fechamento"
        subtitle={formatDateTime(register.openedAt)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => window.open(`/api/cashier/report?id=${id}`, "_blank")}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/cashier/history")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Register info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informacoes do Caixa</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Abertura:
                    </TableCell>
                    <TableCell>{formatDateTime(register.openedAt)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Fechamento:
                    </TableCell>
                    <TableCell>
                      {register.closedAt
                        ? formatDateTime(register.closedAt)
                        : "-"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Duracao:
                    </TableCell>
                    <TableCell>
                      {register.closedAt
                        ? formatDuration(register.openedAt, register.closedAt)
                        : "-"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Status:
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          register.status === "OPEN" ? "default" : "secondary"
                        }
                      >
                        {register.status === "OPEN" ? "Aberto" : "Fechado"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
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
                  <div className="text-sm text-muted-foreground">
                    Quantidade de Vendas
                  </div>
                  <div className="text-2xl font-bold">{summary.salesCount}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Total de Vendas
                  </div>
                  <div className="text-2xl font-bold text-success">
                    {formatCents(summary.totalSales)}
                  </div>
                </div>
              </div>

              <h4 className="text-sm font-medium mb-2 mt-4">
                Por Forma de Pagamento
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Forma</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(paymentMethodSummary).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-muted-foreground"
                      >
                        Nenhuma venda registrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    Object.entries(paymentMethodSummary).map(
                      ([method, data]) => (
                        <TableRow key={method}>
                          <TableCell>
                            {PAYMENT_METHOD_LABELS[method] ?? method}
                          </TableCell>
                          <TableCell className="text-center">
                            {data.count}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCents(data.total)}
                          </TableCell>
                        </TableRow>
                      ),
                    )
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Full movements list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Todas as Movimentacoes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descricao</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        Nenhuma movimentacao
                      </TableCell>
                    </TableRow>
                  ) : (
                    movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">
                          {formatTime(m.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              m.nature === "INCOME" ? "default" : "secondary"
                            }
                          >
                            {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {m.description ?? "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.paymentMethod
                            ? (PAYMENT_METHOD_LABELS[m.paymentMethod] ??
                              m.paymentMethod)
                            : "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono text-sm ${
                            m.nature === "INCOME"
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          {m.nature === "INCOME" ? "+" : "-"}{" "}
                          {formatCents(m.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Cash flow */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimentacoes de Caixa</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell>Saldo Inicial</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCents(summary.openingBalance)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-success">
                      (+) Entradas Dinheiro
                    </TableCell>
                    <TableCell className="text-right font-mono text-success">
                      {formatCents(summary.totalSalesCash)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-success">
                      (+) Suprimentos
                    </TableCell>
                    <TableCell className="text-right font-mono text-success">
                      {formatCents(summary.totalDeposits)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-destructive">
                      (-) Sangrias
                    </TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {formatCents(summary.totalWithdrawals)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-destructive">
                      (-) Despesas
                    </TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {formatCents(summary.totalExpenses)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="mt-2 p-3 bg-primary/10 rounded-md flex justify-between items-center">
                <span className="font-medium">SALDO ESPERADO</span>
                <span className="text-lg font-bold font-mono">
                  {formatCents(summary.expectedCashBalance)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Verification result */}
          {register.status === "CLOSED" && (
            <Card
              className={
                register.difference != null && register.difference !== 0
                  ? "border-warning/40"
                  : "border-success/40"
              }
            >
              <CardHeader
                className={
                  register.difference != null && register.difference !== 0
                    ? "bg-warning/10"
                    : "bg-success/10"
                }
              >
                <CardTitle className="text-base">Conferencia</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell>Saldo Sistema:</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {register.expectedBalance != null
                          ? formatCents(register.expectedBalance)
                          : "-"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Saldo Informado:</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {register.closingBalance != null
                          ? formatCents(register.closingBalance)
                          : "-"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Diferenca:</TableCell>
                      <TableCell className="text-right">
                        {register.difference != null ? (
                          <>
                            <span
                              className={`font-mono font-bold text-lg ${
                                register.difference < 0
                                  ? "text-destructive"
                                  : register.difference > 0
                                    ? "text-success"
                                    : ""
                              }`}
                            >
                              {formatCents(register.difference)}
                            </span>
                            <br />
                            <span
                              className={`text-xs ${
                                register.difference < 0
                                  ? "text-destructive"
                                  : register.difference > 0
                                    ? "text-success"
                                    : "text-success"
                              }`}
                            >
                              {register.difference > 0
                                ? "SOBRA"
                                : register.difference < 0
                                  ? "FALTA"
                                  : "CONFERE"}
                            </span>
                          </>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                {register.notes && (
                  <div className="mt-3 p-3 bg-muted rounded-md">
                    <span className="text-sm text-muted-foreground block mb-1">
                      Observacao:
                    </span>
                    <span className="text-sm">{register.notes}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
