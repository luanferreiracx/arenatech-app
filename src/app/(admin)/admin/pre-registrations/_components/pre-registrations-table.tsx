"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Eye } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { DataTable } from "@/components/domain/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { PRE_REGISTRATION_STATUS_LABELS, PRE_REGISTRATION_STATUS_VARIANT } from "@/lib/validators/admin";

export function PreRegistrationsTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const listQuery = useQuery(
    trpc.admin.listPreRegistrations.queryOptions({
      page,
      pageSize: 20,
      search: search || undefined,
      status: statusFilter ? (statusFilter as "PENDING" | "APPROVED" | "REJECTED") : undefined,
    }),
  );

  const columns = [
    { accessorKey: "tradeName", header: "Nome Fantasia" },
    { accessorKey: "ownerName", header: "Responsavel" },
    { accessorKey: "ownerEmail", header: "Email" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: { status: string } } }) => (
        <StatusBadge variant={PRE_REGISTRATION_STATUS_VARIANT[row.original.status] ?? "default"}>
          {PRE_REGISTRATION_STATUS_LABELS[row.original.status] ?? row.original.status}
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
        <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/pre-registrations/${row.original.id}`)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="APPROVED">Aprovado</SelectItem>
            <SelectItem value="REJECTED">Rejeitado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listQuery.data ? (
        listQuery.data.data.length === 0 ? (
          <EmptyState icon={UserPlus} title="Nenhum pre-cadastro" description="Nenhuma solicitacao" />
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
