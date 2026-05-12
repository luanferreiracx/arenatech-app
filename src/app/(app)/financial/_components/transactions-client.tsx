"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/domain/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DateRangePicker } from "@/components/inputs/date-range-picker";
import {
  transactionStatusLabels,
  paymentMethodLabels as pmLabels,
} from "@/lib/validators/financial";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";
import type { DateRange } from "react-day-picker";

interface TransactionRow {
  id: string;
  type: string;
  status: string;
  description: string;
  category: string | null;
  supplier: string | null;
  customerName: string | null;
  totalAmount: unknown;
  paidAmount: unknown;
  dueDate: Date | string;
  paymentMethod: string | null;
  referenceType: string | null;
  installments: Array<{ id: string; status: string }>;
}

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

function StatsCards({ type }: { type: "PAYABLE" | "RECEIVABLE" }) {
  const trpc = useTRPC();
  const { data: stats } = useQuery(
    trpc.financial.stats.queryOptions({ type }),
  );

  if (!stats) return null;

  const isPayable = type === "PAYABLE";

  return (
    <div className="grid gap-4 sm:grid-cols-3 mb-4">
      <Card className="border-l-4 border-l-warning">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total Pendente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold text-warning">{formatMoney(stats.totalPending)}</p>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-destructive">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total Vencido</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold text-destructive">{formatMoney(stats.totalOverdue)}</p>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-success">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
            {isPayable ? "Pago no Mês" : "Recebido no Mês"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold text-success">{formatMoney(stats.totalPaidThisMonth)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionTable({
  type,
}: {
  type: "PAYABLE" | "RECEIVABLE";
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [supplier, setSupplier] = useState("");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.financial.listTransactions.queryOptions({
      type,
      status: status === "all" ? undefined : status as "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "PARTIALLY_PAID",
      search: search || undefined,
      supplier: supplier || undefined,
      from: dateRange.from,
      to: dateRange.to,
      page,
      pageSize: 20,
    }),
  );

  const deleteMutation = useMutation(
    trpc.financial.deleteTransaction.mutationOptions({
      onSuccess: () => {
        toast.success("Transação removida.");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const cancelMutation = useMutation(
    trpc.financial.cancelTransaction.mutationOptions({
      onSuccess: () => {
        toast.success("Transação cancelada.");
        setCancelId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const isPayable = type === "PAYABLE";

  const columns: ColumnDef<TransactionRow>[] = [
    {
      accessorKey: "description",
      header: "Descrição",
      cell: ({ row }) => (
        <div>
          <button
            type="button"
            className="text-primary hover:underline font-medium text-left"
            onClick={() => router.push(`/financial/${row.original.id}`)}
          >
            {row.getValue("description") as string}
          </button>
          {row.original.referenceType && (
            <p className="text-xs text-muted-foreground">
              {row.original.referenceType === "sale" ? "Venda PDV"
                : row.original.referenceType === "service_order" ? "OS"
                  : "Manual"}
            </p>
          )}
        </div>
      ),
    },
    ...(isPayable
      ? [{
          accessorKey: "supplier" as const,
          header: "Fornecedor",
          cell: ({ row }: { row: { getValue: (key: string) => unknown } }) =>
            (row.getValue("supplier") as string | null) ?? "—",
        }]
      : [{
          accessorKey: "customerName" as const,
          header: "Cliente",
          cell: ({ row }: { row: { getValue: (key: string) => unknown } }) =>
            (row.getValue("customerName") as string | null) ?? "—",
        }]),
    {
      accessorKey: "totalAmount",
      header: "Valor Total",
      cell: ({ row }) => formatMoney(row.getValue("totalAmount")),
    },
    {
      id: "paidAmount",
      header: "Pago",
      cell: ({ row }) => (
        <span className="text-success">{formatMoney(row.original.paidAmount)}</span>
      ),
    },
    {
      id: "remaining",
      header: "Restante",
      cell: ({ row }) => {
        const remaining = Number(row.original.totalAmount) - Number(row.original.paidAmount);
        return (
          <span className={remaining > 0 ? (isPayable ? "text-destructive" : "text-warning") : "text-success"}>
            {formatMoney(remaining)}
          </span>
        );
      },
    },
    {
      id: "parcelas",
      header: "Parcelas",
      cell: ({ row }) => {
        const paid = row.original.installments.filter((i) => i.status === "PAID").length;
        const total = row.original.installments.length;
        return `${paid}/${total}`;
      },
    },
    {
      accessorKey: "dueDate",
      header: "Vencimento",
      cell: ({ row }) => {
        const date = new Date(row.getValue("dueDate") as string);
        const isOverdue = date < new Date() && row.original.status !== "PAID" && row.original.status !== "CANCELLED";
        return (
          <div>
            <span className={isOverdue ? "text-destructive font-medium" : ""}>
              {date.toLocaleDateString("pt-BR")}
            </span>
            {isOverdue && <p className="text-xs text-destructive">Vencida</p>}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.getValue("status") as string;
        return <Badge variant={statusVariants[s] ?? "outline"}>{transactionStatusLabels[s] ?? s}</Badge>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/financial/${row.original.id}`)}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhe
              </DropdownMenuItem>
              {row.original.status !== "CANCELLED" && row.original.status !== "PAID" && (
                <DropdownMenuItem
                  className="text-warning focus:text-warning"
                  onClick={() => setCancelId(row.original.id)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteId(row.original.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <StatsCards type={type} />
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as TransactionRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar descrição, cliente..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="max-w-xs"
            />
            {isPayable && (
              <Input
                placeholder="Fornecedor..."
                value={supplier}
                onChange={(e) => { setSupplier(e.target.value); setPage(0); }}
                className="max-w-[180px]"
              />
            )}
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PENDING">Pendente</SelectItem>
                <SelectItem value="PAID">Pago</SelectItem>
                <SelectItem value="OVERDUE">Vencido</SelectItem>
                <SelectItem value="PARTIALLY_PAID">Parcial</SelectItem>
                <SelectItem value="CANCELLED">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker
              value={dateRange}
              onChange={(range) => { setDateRange(range ?? { from: undefined, to: undefined }); setPage(0); }}
            />
            {(dateRange.from || dateRange.to || supplier) && (
              <Button variant="outline" size="sm" onClick={() => { setDateRange({ from: undefined, to: undefined }); setSupplier(""); setPage(0); }}>
                Limpar
              </Button>
            )}
          </div>
        }
      />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remover transação?"
        description="A transação será marcada como removida."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
      <ConfirmDialog
        open={!!cancelId}
        onOpenChange={(open) => !open && setCancelId(null)}
        title="Cancelar transação?"
        description="Todas as parcelas pendentes serão canceladas."
        confirmLabel="Cancelar"
        variant="destructive"
        onConfirm={() => { if (cancelId) cancelMutation.mutate({ id: cancelId }); }}
        isLoading={cancelMutation.isPending}
      />
    </>
  );
}

export function TransactionsClient() {
  return (
    <Tabs defaultValue="RECEIVABLE">
      <TabsList>
        <TabsTrigger value="RECEIVABLE">A Receber</TabsTrigger>
        <TabsTrigger value="PAYABLE">A Pagar</TabsTrigger>
      </TabsList>
      <TabsContent value="RECEIVABLE" className="mt-4">
        <TransactionTable type="RECEIVABLE" />
      </TabsContent>
      <TabsContent value="PAYABLE" className="mt-4">
        <TransactionTable type="PAYABLE" />
      </TabsContent>
    </Tabs>
  );
}
