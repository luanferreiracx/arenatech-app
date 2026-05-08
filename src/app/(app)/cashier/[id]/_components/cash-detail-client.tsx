"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";

interface Props {
  id: string;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const movementTypeLabels: Record<string, string> = {
  SALE: "Venda",
  SERVICE_ORDER: "Ordem de Serviço",
  WITHDRAWAL: "Sangria",
  DEPOSIT: "Suprimento",
  ADJUSTMENT: "Ajuste",
};

export function CashDetailClient({ id }: Props) {
  const trpc = useTRPC();
  const { data: register, isLoading } = useQuery(
    trpc.cashier.getById.queryOptions({ id }),
  );

  if (isLoading) return <LoadingState variant="card" />;
  if (!register) return <p className="text-muted-foreground">Caixa não encontrado.</p>;

  const difference = register.difference ? Number(register.difference) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detalhe do Caixa"
        subtitle={`Aberto em ${new Date(register.openedAt).toLocaleString("pt-BR")}${register.closedAt ? ` — Fechado em ${new Date(register.closedAt).toLocaleString("pt-BR")}` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saldo Abertura</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(register.openingBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saldo Esperado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {register.expectedBalance != null ? formatMoney(register.expectedBalance) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saldo Fechamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {register.closingBalance != null ? formatMoney(register.closingBalance) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Diferença</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${difference === 0 ? "text-success" : "text-destructive"}`}>
              {formatMoney(difference)}
            </p>
          </CardContent>
        </Card>
      </div>

      {register.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{register.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          {register.movements.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma movimentação.</p>
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
    </div>
  );
}
