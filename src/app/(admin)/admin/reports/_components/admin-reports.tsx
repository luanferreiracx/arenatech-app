"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/domain/data-table/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import type { ColumnDef } from "@tanstack/react-table";
import { tenantStatusLabels } from "@/lib/validators/admin";

interface ReportRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string | null;
  usersCount: number;
  osCount: number;
  salesCount: number;
  salesTotal: number;
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    ACTIVE: "success",
    SUSPENDED: "destructive",
    PENDING: "warning",
    CANCELLED: "default",
  };
  return map[status] ?? "default";
}

export function AdminReports() {
  const trpc = useTRPC();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data } = useQuery(
    trpc.admin.reports.queryOptions({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  );

  const columns: ColumnDef<ReportRow>[] = [
    { accessorKey: "name", header: "Tenant" },
    { accessorKey: "slug", header: "Slug" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge variant={getStatusVariant(row.original.status)}>
          {tenantStatusLabels[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    { accessorKey: "plan", header: "Plano", cell: ({ row }) => row.original.plan ?? "—" },
    { accessorKey: "usersCount", header: "Usuarios" },
    { accessorKey: "osCount", header: "OS" },
    { accessorKey: "salesCount", header: "Vendas" },
    {
      accessorKey: "salesTotal",
      header: "Receita Vendas",
      cell: ({ row }) => formatMoney(row.original.salesTotal),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div>
          <Label htmlFor="dateFrom">De</Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="dateTo">Ate</Label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={(data as ReportRow[]) ?? []}
        pageCount={1}
        pageIndex={0}
        pageSize={100}
        onPageChange={() => {}}
      />
    </div>
  );
}
