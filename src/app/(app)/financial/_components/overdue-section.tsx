"use client";

import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";

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

function daysOverdue(dueDate: Date | string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const diff = now.getTime() - due.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

interface OverdueSectionProps {
  type: "RECEIVABLE" | "PAYABLE";
}

export function OverdueSection({ type }: OverdueSectionProps) {
  const trpc = useTRPC();
  const router = useRouter();

  const overdueQuery = useQuery(
    trpc.financial.overdue.queryOptions({ type, pageSize: 10 }),
  );

  if (overdueQuery.isLoading || !overdueQuery.data || overdueQuery.data.data.length === 0) {
    return null;
  }

  const items = overdueQuery.data.data;
  const isReceivable = type === "RECEIVABLE";

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Parcelas Vencidas ({overdueQuery.data.total})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descricao</TableHead>
              <TableHead>{isReceivable ? "Cliente" : "Fornecedor"}</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Dias Atraso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => router.push(`/financial/${item.transactionId}`)}
              >
                <TableCell className="max-w-[200px] truncate">
                  {item.transactionDescription}
                </TableCell>
                <TableCell className="text-sm">
                  {isReceivable ? (item.customerName ?? "-") : (item.supplier ?? "-")}
                </TableCell>
                <TableCell className="text-sm">#{item.number}</TableCell>
                <TableCell className="text-right font-mono text-sm text-destructive">
                  {formatCents(item.amount - item.paidAmount)}
                </TableCell>
                <TableCell className="text-sm">{formatDate(item.dueDate)}</TableCell>
                <TableCell className="text-sm font-medium text-destructive">
                  {daysOverdue(item.dueDate)} dia(s)
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
