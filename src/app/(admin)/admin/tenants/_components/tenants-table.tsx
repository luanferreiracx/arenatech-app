"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import { DataTable } from "@/components/domain/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Eye } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  PENDING: "warning",
  SUSPENDED: "destructive",
  CANCELLED: "destructive",
};

export function TenantsTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const listQuery = useQuery(
    trpc.admin.listTenants.queryOptions({ page, pageSize: 20, search: search || undefined }),
  );

  const columns = [
    { accessorKey: "name", header: "Nome" },
    {
      id: "owner",
      header: "Responsável",
      cell: ({ row }: { row: { original: { owner: { name: string; email: string | null } | null } } }) => {
        const owner = row.original.owner;
        if (!owner) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="min-w-0">
            <p className="truncate">{owner.name}</p>
            {owner.email && <p className="truncate text-xs text-muted-foreground">{owner.email}</p>}
          </div>
        );
      },
    },
    { accessorKey: "slug", header: "Slug" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: { status: string } } }) => (
        <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? "default"}>{row.original.status}</StatusBadge>
      ),
    },
    { accessorKey: "plan", header: "Plano", cell: ({ row }: { row: { original: { plan: string | null } } }) => row.original.plan ?? "-" },
    {
      accessorKey: "createdAt",
      header: "Criado em",
      cell: ({ row }: { row: { original: { createdAt: string | Date } } }) =>
        new Date(row.original.createdAt).toLocaleDateString("pt-BR"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }: { row: { original: { id: string } } }) => (
        <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/tenants/${row.original.id}`)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar tenant..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        className="max-w-sm"
      />

      {listQuery.data ? (
        listQuery.data.data.length === 0 ? (
          <EmptyState icon={Building2} title="Nenhum tenant" description="Nenhum tenant cadastrado" />
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
