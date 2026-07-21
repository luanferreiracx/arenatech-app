"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowLeft } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/inputs/money-input";
import { PageHeader } from "@/components/domain/page-header";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/cashier";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function CloseCashierPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const summaryQuery = useQuery(trpc.cashier.closingSummary.queryOptions());

  const [reportedBalance, setReportedBalance] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [notes, setNotes] = useState("");
  const [verifiedMethods, setVerifiedMethods] = useState<Record<string, boolean>>({});
  const [methodAmounts, setMethodAmounts] = useState<Record<string, number>>({});

  const closeMutation = useMutation(
    trpc.cashier.close.mutationOptions({
      onSuccess: (result) => {
        const diffFormatted = formatCents(Math.abs(result.difference));
        if (result.difference === 0) {
          toast.success("Caixa fechado com sucesso! Caixa confere.");
        } else if (result.difference > 0) {
          toast.success(`Caixa fechado. Sobra de ${diffFormatted}.`);
        } else {
          toast.warning(`Caixa fechado. Falta de ${diffFormatted}.`);
        }
        queryClient.invalidateQueries({ queryKey: trpc.cashier.current.queryKey() });
        router.push("/cashier");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  if (summaryQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Fechar Caixa" subtitle="Conferencia e fechamento" />
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <div>
        <PageHeader title="Fechar Caixa" subtitle="Conferencia e fechamento" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum caixa aberto encontrado.
            <div className="mt-4">
              <Button variant="outline" onClick={() => router.push("/cashier")}>
                Voltar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, paymentMethodSummary } = summaryQuery.data;
  const difference = reportedBalance - summary.expectedCashBalance;

  const closeConfirmDescription =
    `Saldo esperado ${formatCents(summary.expectedCashBalance)}, informado ${formatCents(reportedBalance)}` +
    (difference === 0
      ? " — sem diferenca."
      : difference > 0
        ? ` — sobra de ${formatCents(difference)}.`
        : ` — falta de ${formatCents(Math.abs(difference))}.`) +
    " Esta acao fecha a sessao e nao pode ser desfeita.";

  const nonCashMethods = Object.entries(paymentMethodSummary).filter(
    ([method]) => method !== "dinheiro",
  );

  function handleClose() {
    // Empacota a conferencia das formas nao-dinheiro pra audit no
    // closing note (ANTES, o backend ignorava methodAmounts/verifiedMethods
    // — operador conferia mas nada era persistido).
    const methodVerifications = nonCashMethods.map(([method, data]) => ({
      method,
      verified: verifiedMethods[method] ?? false,
      expectedAmount: data.total,
      reportedAmount: methodAmounts[method] ?? data.total,
    }));

    closeMutation.mutate({
      declaredBalance: reportedBalance,
      closingNote: notes || undefined,
      methodVerifications: methodVerifications.length > 0 ? methodVerifications : undefined,
    });
  }

  return (
    <div>
      <PageHeader
        title="Fechar Caixa"
        subtitle="Conferencia e fechamento"
        actions={
          <Button variant="outline" onClick={() => router.push("/cashier")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Summary */}
        <div className="space-y-6">
          {/* Sales Summary */}
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
                    Object.entries(paymentMethodSummary).map(([method, data]) => (
                      <TableRow key={method}>
                        <TableCell>
                          {PAYMENT_METHOD_LABELS[method] ?? method}
                        </TableCell>
                        <TableCell className="text-center">{data.count}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCents(data.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Cash Flow */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fluxo de Dinheiro</CardTitle>
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
                <span className="font-medium">SALDO ESPERADO (DINHEIRO)</span>
                <span className="text-xl font-bold font-mono">
                  {formatCents(summary.expectedCashBalance)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Verification Form */}
        <div className="space-y-6">
          {/* Cash Verification */}
          <Card className="border-warning/40">
            <CardHeader className="bg-warning/10">
              <CardTitle className="text-base">
                Conferencia - Dinheiro
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                Conte todo o dinheiro em especie do caixa e informe o valor
                total.
              </div>

              <div className="p-3 bg-primary/5 rounded-md">
                <div className="text-sm text-muted-foreground">
                  Saldo Esperado (Sistema)
                </div>
                <div className="text-2xl font-bold text-primary font-mono">
                  {formatCents(summary.expectedCashBalance)}
                </div>
              </div>

              <div>
                <Label>Saldo Contado (Informado por Voce) *</Label>
                <MoneyInput
                  value={reportedBalance}
                  onChange={setReportedBalance}
                  autoFocus
                />
              </div>

              {reportedBalance > 0 && (
                <div
                  className={`p-3 rounded-md ${
                    difference > 0
                      ? "bg-success/10 text-success"
                      : difference < 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-success/10 text-success"
                  }`}
                >
                  <div className="text-sm">Diferenca Dinheiro</div>
                  <div className="text-lg font-bold font-mono">
                    {formatCents(Math.abs(difference))}
                  </div>
                  <div className="text-sm">
                    {difference > 0
                      ? "SOBRA de caixa"
                      : difference < 0
                        ? "FALTA de caixa"
                        : "Caixa confere!"}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Other payment method verification */}
          {nonCashMethods.length > 0 && (
            <Card>
              <CardHeader className="bg-muted/50">
                <CardTitle className="text-base">
                  Conferencia - Outras Formas
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                  Confira os valores com a maquininha de cartao e comprovantes.
                  Marque cada forma como conferida ou informe o valor real.
                </div>

                {nonCashMethods.map(([method, data]) => {
                  const isVerified = verifiedMethods[method] ?? false;
                  const reported = methodAmounts[method] ?? data.total;
                  const diff = isVerified ? 0 : reported - data.total;

                  return (
                    <div
                      key={method}
                      className="p-3 rounded-md bg-muted/30 border border-primary/20 space-y-2"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium">
                            {PAYMENT_METHOD_LABELS[method] ?? method}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2">
                            ({data.count} venda{data.count > 1 ? "s" : ""})
                          </span>
                        </div>
                        <span className="font-bold font-mono">
                          {formatCents(data.total)}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`verify-${method}`}
                            checked={isVerified}
                            onCheckedChange={(checked) => {
                              setVerifiedMethods((prev) => ({
                                ...prev,
                                [method]: !!checked,
                              }));
                            }}
                          />
                          <Label
                            htmlFor={`verify-${method}`}
                            className="text-sm"
                          >
                            Valor confere
                          </Label>
                        </div>

                        {!isVerified && (
                          <div className="flex-1">
                            <MoneyInput
                              value={reported}
                              onChange={(v) =>
                                setMethodAmounts((prev) => ({
                                  ...prev,
                                  [method]: v,
                                }))
                              }
                            />
                          </div>
                        )}

                        {isVerified && (
                          <Badge variant="default" className="bg-success">
                            OK
                          </Badge>
                        )}
                        {!isVerified && Math.abs(diff) > 0 && (
                          <Badge
                            variant={diff > 0 ? "secondary" : "destructive"}
                          >
                            {diff > 0 ? "+" : "-"}
                            {formatCents(Math.abs(diff))}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Notes + Submit */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label>Observacao (opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Justificativa em caso de diferenca..."
                  maxLength={500}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => setConfirmClose(true)}
                  disabled={closeMutation.isPending}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  {closeMutation.isPending
                    ? "Fechando..."
                    : "Fechar Caixa"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => router.push("/cashier")}
                  disabled={closeMutation.isPending}
                >
                  Cancelar
                </Button>
              </div>

              <ConfirmDialog
                open={confirmClose}
                onOpenChange={setConfirmClose}
                title="Fechar caixa?"
                description={closeConfirmDescription}
                confirmLabel="Fechar caixa"
                variant="destructive"
                isLoading={closeMutation.isPending}
                onConfirm={handleClose}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
