"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CustomerRow {
  id: string;
  type: "PF" | "PJ";
  name: string;
  cpf: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  deletedAt: Date | null;
}

function formatCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function formatPhone(phone: string): string {
  if (phone.length === 11) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  }
  if (phone.length === 10) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

const columns: ColumnDef<CustomerRow>[] = [
  {
    accessorKey: "name",
    header: "Nome",
    cell: ({ row }) => (
      <Link
        href={`/customers/${row.original.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "type",
    header: "Tipo",
    cell: ({ row }) => (
      <StatusBadge variant={row.original.type === "PF" ? "info" : "warning"}>
        {row.original.type}
      </StatusBadge>
    ),
  },
  {
    id: "document",
    header: "CPF/CNPJ",
    cell: ({ row }) => {
      const { type, cpf, cnpj } = row.original;
      if (type === "PF" && cpf) return <span className="text-sm text-muted-foreground">{formatCpf(cpf)}</span>;
      if (type === "PJ" && cnpj) return <span className="text-sm text-muted-foreground">{formatCnpj(cnpj)}</span>;
      return <span className="text-muted-foreground">-</span>;
    },
  },
  {
    accessorKey: "phone",
    header: "Telefone",
    cell: ({ row }) => {
      const phone = row.original.phone;
      if (!phone) return <span className="text-muted-foreground">-</span>;
      return <span className="text-sm">{formatPhone(phone)}</span>;
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.email || "-"}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge variant={row.original.deletedAt ? "destructive" : "success"}>
        {row.original.deletedAt ? "Excluido" : "Ativo"}
      </StatusBadge>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href={`/customers/${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href={`/customers/${row.original.id}/edit`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    ),
  },
];

export function CustomersTable() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PF" | "PJ">("ALL");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    // Simple debounce using setTimeout
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, []);

  const { data, isLoading } = useQuery(
    trpc.customer.list.queryOptions({
      search: debouncedSearch || undefined,
      type: typeFilter,
      page,
      pageSize,
    }),
  );

  return (
    <DataTable
      columns={columns}
      data={(data?.data ?? []) as CustomerRow[]}
      pageCount={data?.pageCount ?? 0}
      pageIndex={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(0);
      }}
      isLoading={isLoading}
      emptyMessage="Nenhum cliente encontrado."
      toolbar={
        <DataTableToolbar
          searchValue={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por nome, CPF, CNPJ, telefone, email..."
          actions={
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as "ALL" | "PF" | "PJ");
                setPage(0);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="PF">Pessoa Fisica</SelectItem>
                <SelectItem value="PJ">Pessoa Juridica</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      }
    />
  );
}
