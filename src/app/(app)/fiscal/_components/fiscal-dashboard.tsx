"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, CheckCircle, XCircle, Clock, Eye } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/domain/data-table";
import {
  INVOICE_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
} from "@/lib/validators/fiscal";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FiscalDashboard() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const statsQuery = useQuery(trpc.fiscal.stats.queryOptions());

  const listQuery = useQuery(
    trpc.fiscal.list.queryOptions({
      page,
      pageSize: 20,
      search: search || undefined,
      type: typeFilter ? (typeFilter as "NFE" | "NFCE" | "NFSE") : undefined,
      status: statusFilter ? (statusFilter as "DRAFT" | "PENDING" | "AUTHORIZED" | "CANCELLED" | "REJECTED" | "CORRECTION_LETTER") : undefined,
    }),
  );

  const stats = statsQuery.data;

  const columns = [
    {
      accessorKey: "number",
      header: "Numero",
      cell: ({ row }: { row: { original: { number: number | null; id: string } } }) =>
        row.original.number ?? row.original.id.slice(0, 8),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }: { row: { original: { type: string } } }) =>
        INVOICE_TYPE_LABELS[row.original.type] ?? row.original.type,
    },
    {
      accessorKey: "recipientName",
      header: "Destinatario",
    },
    {
      accessorKey: "totalAmount",
      header: "Valor",
      cell: ({ row }: { row: { original: { totalAmount: number } } }) =>
        formatCurrency(row.original.totalAmount),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: { status: string } } }) => (
        <StatusBadge variant={INVOICE_STATUS_VARIANT[row.original.status] ?? "default"}>
          {INVOICE_STATUS_LABELS[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }: { row: { original: { createdAt: string | Date } } }) =>
        new Date(row.original.createdAt).toLocaleDateString("pt-BR"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }: { row: { original: { id: string } } }) => (
        <Button size="sm" variant="ghost" onClick={() => router.push(`/fiscal/${row.original.id}`)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats ? (
          <>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalAuthorized}</p>
                  <p className="text-xs text-muted-foreground">Autorizadas</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalDraft}</p>
                  <p className="text-xs text-muted-foreground">Rascunhos</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <XCircle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalCancelled}</p>
                  <p className="text-xs text-muted-foreground">Canceladas</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{formatCurrency(stats.monthTotal)}</p>
                  <p className="text-xs text-muted-foreground">Total Mes ({stats.monthCount})</p>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por nome, CPF/CNPJ, chave..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="max-w-sm"
        />
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="NFE">NF-e</SelectItem>
            <SelectItem value="NFCE">NFC-e</SelectItem>
            <SelectItem value="NFSE">NFS-e</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="DRAFT">Rascunho</SelectItem>
            <SelectItem value="AUTHORIZED">Autorizada</SelectItem>
            <SelectItem value="CANCELLED">Cancelada</SelectItem>
            <SelectItem value="REJECTED">Rejeitada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {listQuery.data ? (
        listQuery.data.data.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhuma nota fiscal"
            description="Emita sua primeira nota fiscal"
          />
        ) : (
          <DataTable
            columns={columns}
            data={listQuery.data.data}
            pageCount={listQuery.data.pageCount}
            pageIndex={page}
            onPageChange={setPage}
          />
        )
      ) : (
        <Skeleton className="h-96" />
      )}
    </div>
  );
}
