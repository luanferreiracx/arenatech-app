"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/domain/loading-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "./report-helpers";
import { stockMovementTypeLabels } from "@/lib/validators/stock";

interface Props {
  dateFrom: string;
  dateTo: string;
}

export function MovimentacoesTab({ dateFrom, dateTo }: Props) {
  const [type, setType] = useState<string>("");
  const trpc = useTRPC();

  const { data, isLoading } = useQuery(
    trpc.stock.reportMovimentacoes.queryOptions({
      dateFrom,
      dateTo,
      type: (type || undefined) as "ENTRY" | "EXIT" | undefined,
    }),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo</label>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background min-w-[150px]"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="ENTRY">Entrada</option>
                <option value="EXIT">Saida</option>
                <option value="ADJUSTMENT">Ajuste</option>
                <option value="RESERVE">Reserva</option>
                <option value="RELEASE">Liberacao</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState variant="table" />}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <Card className="bg-emerald-600 text-white">
              <CardContent className="text-center py-4">
                <div className="text-2xl font-bold">{data.totals.entries}</div>
                <p className="text-sm opacity-80">Entradas</p>
              </CardContent>
            </Card>
            <Card className="bg-destructive text-destructive-foreground">
              <CardContent className="text-center py-4">
                <div className="text-2xl font-bold">{data.totals.exits}</div>
                <p className="text-sm opacity-80">Saidas</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{formatDateTime(m.createdAt)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          variant={
                            m.type === "ENTRY" || m.type === "RELEASE"
                              ? "success"
                              : m.type === "EXIT"
                                ? "destructive"
                                : "default"
                          }
                        >
                          {stockMovementTypeLabels[m.type] ?? m.type}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>{m.product?.name ?? "-"}</TableCell>
                      <TableCell className="text-center">{m.quantity}</TableCell>
                      <TableCell className="text-muted-foreground">{m.reason || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {data.movements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma movimentacao encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
