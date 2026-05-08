"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";

interface TransactionRow {
  id: string;
  type: string;
  status: string;
  description: string;
  category: string | null;
  totalAmount: unknown;
  paidAmount: unknown;
  dueDate: Date | string;
  installments: Array<{ id: string }>;
}

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
  PARTIALLY_PAID: "Parcial",
};

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

function TransactionTable({
  type,
}: {
  type: "PAYABLE" | "RECEIVABLE";
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.financial.listTransactions.queryOptions({
      type,
      status: status === "all" ? undefined : status as "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "PARTIALLY_PAID",
      search: search || undefined,
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

  const columns: ColumnDef<TransactionRow>[] = [
    { accessorKey: "description", header: "Descrição" },
    {
      accessorKey: "category",
      header: "Categoria",
      cell: ({ row }) => row.getValue("category") ?? "—",
    },
    {
      accessorKey: "totalAmount",
      header: "Valor Total",
      cell: ({ row }) => formatMoney(row.getValue("totalAmount")),
    },
    {
      accessorKey: "paidAmount",
      header: "Pago",
      cell: ({ row }) => formatMoney(row.getValue("paidAmount")),
    },
    {
      accessorKey: "dueDate",
      header: "Vencimento",
      cell: ({ row }) => {
        const date = new Date(row.getValue("dueDate") as string);
        const isOverdue = date < new Date() && row.original.status !== "PAID" && row.original.status !== "CANCELLED";
        return (
          <span className={isOverdue ? "text-destructive font-medium" : ""}>
            {date.toLocaleDateString("pt-BR")}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.getValue("status") as string;
        return <Badge variant={statusVariants[s] ?? "outline"}>{statusLabels[s] ?? s}</Badge>;
      },
    },
    {
      id: "parcelas",
      header: "Parcelas",
      cell: ({ row }) => row.original.installments.length,
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
              {row.original.status !== "CANCELLED" && (
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
              placeholder="Buscar..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="max-w-sm"
            />
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
    <Tabs defaultValue="PAYABLE">
      <TabsList>
        <TabsTrigger value="PAYABLE">A Pagar</TabsTrigger>
        <TabsTrigger value="RECEIVABLE">A Receber</TabsTrigger>
      </TabsList>
      <TabsContent value="PAYABLE" className="mt-4">
        <TransactionTable type="PAYABLE" />
      </TabsContent>
      <TabsContent value="RECEIVABLE" className="mt-4">
        <TransactionTable type="RECEIVABLE" />
      </TabsContent>
    </Tabs>
  );
}
