"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/domain/data-table/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { tenantStatusValues, tenantStatusLabels } from "@/lib/validators/admin";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  status: string;
  plan: string | null;
  createdAt: Date;
  _count: { users: number };
}

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    PENDING: "warning",
    ACTIVE: "success",
    SUSPENDED: "destructive",
    CANCELLED: "default",
  };
  return map[status] ?? "default";
}

export function TenantsTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data } = useQuery(
    trpc.admin.listTenants.queryOptions({
      page,
      pageSize: 50,
      search: search || undefined,
      status: (statusFilter as typeof tenantStatusValues[number]) || undefined,
    }),
  );

  const columns: ColumnDef<TenantRow>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "slug", header: "Slug" },
    { accessorKey: "cnpj", header: "CNPJ", cell: ({ row }) => row.original.cnpj ?? "—" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge variant={getStatusVariant(row.original.status)}>
          {tenantStatusLabels[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "_count.users",
      header: "Usuarios",
      cell: ({ row }) => row.original._count.users,
    },
    { accessorKey: "plan", header: "Plano", cell: ({ row }) => row.original.plan ?? "—" },
    {
      accessorKey: "createdAt",
      header: "Criado em",
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString("pt-BR"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => router.push(`/admin/tenants/${row.original.id}`)}
        >
          <Eye className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="flex items-center gap-4">
        <Input
          placeholder="Buscar tenant..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v === "ALL" ? "" : v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {tenantStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                {tenantStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={(data?.items as TenantRow[]) ?? []}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={50}
        onPageChange={setPage}
      />
    </>
  );
}
