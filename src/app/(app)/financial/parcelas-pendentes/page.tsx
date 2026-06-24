"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Clock, Calendar } from "lucide-react";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

function daysDiff(dueDate: string | Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function PendingInstallmentsPage() {
  const trpc = useTRPC();
  const [periodFilter, setPeriodFilter] = useState<string>("all");

  const { data } = useQuery(
    trpc.financial.pending.queryOptions({})
  );

  // `pending` retorna TRANSACOES com as parcelas aninhadas. A pagina mostra
  // parcela a parcela, entao achatamos para linhas de parcela ainda em aberto
  // (PENDING/OVERDUE) — cada uma carrega a transacao p/ descricao/total.
  const installments = (data?.data ?? []).flatMap((t) => {
    const all = t.installments ?? [];
    return all
      .filter((i) => i.status === "PENDING" || i.status === "OVERDUE")
      .map((i) => ({ ...i, transaction: t, installmentsTotal: all.length }));
  });

  // Computed stats
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const overdue = installments.filter((i) => new Date(i.dueDate) < now);
  const thisWeek = installments.filter((i) => {
    const d = new Date(i.dueDate);
    return d >= now && d <= endOfWeek;
  });

  const overdueTotal = overdue.reduce((s, i) => s + Number(i.amount) * 100, 0);
  const weekTotal = thisWeek.reduce((s, i) => s + Number(i.amount) * 100, 0);
  const allTotal = installments.reduce((s, i) => s + Number(i.amount) * 100, 0);

  // Filter
  let filtered = installments;
  if (periodFilter === "overdue") {
    filtered = overdue;
  } else if (periodFilter === "week") {
    filtered = thisWeek;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Parcelas Pendentes" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vencidas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{overdue.length}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(overdueTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vencendo esta semana</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{thisWeek.length}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(weekTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total pendente</CardTitle>
            <Calendar className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{installments.length}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(allTotal)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas pendentes</SelectItem>
            <SelectItem value="overdue">Vencidas</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((inst) => {
              const days = daysDiff(inst.dueDate);
              const isOverdue = days < 0;
              return (
                <TableRow key={inst.id}>
                  <TableCell>{inst.transaction?.description ?? "—"}</TableCell>
                  <TableCell>{inst.number}/{inst.installmentsTotal}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(Number(inst.amount) * 100)}
                  </TableCell>
                  <TableCell>{formatDate(inst.dueDate)}</TableCell>
                  <TableCell>
                    {isOverdue ? (
                      <Badge variant="destructive">{Math.abs(days)} dias em atraso</Badge>
                    ) : days === 0 ? (
                      <Badge variant="default">Vence hoje</Badge>
                    ) : (
                      <Badge variant="secondary">{days} dias restantes</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhuma parcela pendente encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
