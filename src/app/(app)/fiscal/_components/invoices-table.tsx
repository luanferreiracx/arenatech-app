"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Download,
  MoreHorizontal,
  Ban,
  FileCheck,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DataTable } from "@/components/domain/data-table/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";
import {
  invoiceTypeLabels,
  invoiceStatusLabels,
  invoiceTypeValues,
  invoiceStatusValues,
} from "@/lib/validators/fiscal";
import { Card, CardContent } from "@/components/ui/card";

interface InvoiceRow {
  id: string;
  type: string;
  status: string;
  number: number | null;
  series: number | null;
  accessKey: string | null;
  recipientName: string | null;
  recipientCpfCnpj: string | null;
  totalAmount: unknown;
  referenceType: string | null;
  createdAt: Date;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    DRAFT: "default",
    PENDING: "warning",
    AUTHORIZED: "success",
    CANCELLED: "destructive",
    REJECTED: "destructive",
    CORRECTION_LETTER: "info",
  };
  return map[status] ?? "default";
}

function getTypeBadgeVariant(type: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    NFE: "info",
    NFCE: "warning",
    NFSE: "success",
  };
  return map[type] ?? "default";
}

export function InvoicesTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [authorizeId, setAuthorizeId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.fiscal.list.queryOptions({
      search: search || undefined,
      type: typeFilter ? (typeFilter as (typeof invoiceTypeValues)[number]) : undefined,
      status: statusFilter ? (statusFilter as (typeof invoiceStatusValues)[number]) : undefined,
      page,
      pageSize: 20,
    }),
  );

  const { data: stats } = useQuery(trpc.fiscal.stats.queryOptions({}));

  const authorizeMutation = useMutation(
    trpc.fiscal.authorize.mutationOptions({
      onSuccess: () => {
        toast.success("Nota fiscal autorizada com sucesso!");
        void refetch();
        setAuthorizeId(null);
      },
      onError: (err) => {
        toast.error(err.message);
        setAuthorizeId(null);
      },
    }),
  );

  const cancelMutation = useMutation(
    trpc.fiscal.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Nota fiscal cancelada");
        void refetch();
        setCancelId(null);
      },
      onError: (err) => {
        toast.error(err.message);
        setCancelId(null);
      },
    }),
  );

  const columns: ColumnDef<InvoiceRow>[] = [
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => (
        <StatusBadge variant={getTypeBadgeVariant(row.original.type)}>
          {invoiceTypeLabels[row.original.type] ?? row.original.type}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "number",
      header: "Número",
      cell: ({ row }) =>
        row.original.number
          ? `${row.original.number}/${row.original.series ?? 1}`
          : "—",
    },
    {
      accessorKey: "recipientName",
      header: "Destinatário",
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate">
          {row.original.recipientName ?? "Não informado"}
        </div>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: "Valor",
      cell: ({ row }) => formatMoney(row.original.totalAmount),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge variant={getStatusVariant(row.original.status)}>
          {invoiceStatusLabels[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) =>
        new Date(row.original.createdAt).toLocaleDateString("pt-BR"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/fiscal/${row.original.id}`} className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Detalhes
              </Link>
            </DropdownMenuItem>
            {row.original.status === "DRAFT" && (
              <DropdownMenuItem onClick={() => setAuthorizeId(row.original.id)}>
                <FileCheck className="h-4 w-4 mr-2" />
                Autorizar
              </DropdownMenuItem>
            )}
            {row.original.status === "AUTHORIZED" && (
              <DropdownMenuItem onClick={() => setCancelId(row.original.id)}>
                <Ban className="h-4 w-4 mr-2" />
                Cancelar
              </DropdownMenuItem>
            )}
            {row.original.status === "AUTHORIZED" && (
              <DropdownMenuItem asChild>
                <Link href={`/fiscal/${row.original.id}?action=pdf`} className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  DANFE (PDF)
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5 mb-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Rascunho</p>
              <p className="text-2xl font-bold text-muted-foreground">{stats.draft}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-success">Autorizadas</p>
              <p className="text-2xl font-bold text-success">{stats.authorized}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-destructive">Canceladas</p>
              <p className="text-2xl font-bold text-destructive">{stats.cancelled}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-destructive">Rejeitadas</p>
              <p className="text-2xl font-bold text-destructive">{stats.rejected}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          placeholder="Buscar por destinatário, chave..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v === "all" ? "" : v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {invoiceTypeValues.map((t) => (
              <SelectItem key={t} value={t}>
                {invoiceTypeLabels[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v === "all" ? "" : v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {invoiceStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                {invoiceStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as InvoiceRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
      />

      {/* Authorize Dialog */}
      <ConfirmDialog
        open={!!authorizeId}
        onOpenChange={(open) => !open && setAuthorizeId(null)}
        title="Autorizar Nota Fiscal"
        description="Deseja enviar esta nota fiscal para autorização na SEFAZ? Esta ação não pode ser desfeita."
        onConfirm={() => {
          if (authorizeId) {
            authorizeMutation.mutate({ id: authorizeId });
          }
        }}
        isLoading={authorizeMutation.isPending}
      />

      {/* Cancel Dialog */}
      <ConfirmDialog
        open={!!cancelId}
        onOpenChange={(open) => !open && setCancelId(null)}
        title="Cancelar Nota Fiscal"
        description="Deseja cancelar esta nota fiscal autorizada? Informe a justificativa (mín. 15 caracteres)."
        variant="destructive"
        onConfirm={() => {
          if (cancelId) {
            cancelMutation.mutate({
              id: cancelId,
              reason: "Cancelamento solicitado pelo operador da loja Arena Tech",
            });
          }
        }}
        isLoading={cancelMutation.isPending}
      />
    </>
  );
}
