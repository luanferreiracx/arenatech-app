"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import {
  preRegistrationStatusValues,
  preRegistrationStatusLabels,
} from "@/lib/validators/admin";

interface PreRegRow {
  id: string;
  tradeName: string;
  ownerName: string;
  ownerCpf: string;
  ownerEmail: string;
  ownerPhone: string;
  status: string;
  createdAt: Date;
}

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "destructive",
  };
  return map[status] ?? "default";
}

export function PreRegistrationsTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data } = useQuery(
    trpc.admin.listPreRegistrations.queryOptions({
      page,
      pageSize: 50,
      status: (statusFilter as typeof preRegistrationStatusValues[number]) || undefined,
    }),
  );

  const columns: ColumnDef<PreRegRow>[] = [
    { accessorKey: "tradeName", header: "Nome Fantasia" },
    { accessorKey: "ownerName", header: "Responsavel" },
    { accessorKey: "ownerEmail", header: "Email" },
    { accessorKey: "ownerPhone", header: "Telefone" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge variant={getStatusVariant(row.original.status)}>
          {preRegistrationStatusLabels[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
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
          onClick={() => router.push(`/admin/pre-registrations/${row.original.id}`)}
        >
          <Eye className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="flex items-center gap-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v === "ALL" ? "" : v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {preRegistrationStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                {preRegistrationStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={(data?.items as PreRegRow[]) ?? []}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={50}
        onPageChange={setPage}
      />
    </>
  );
}
