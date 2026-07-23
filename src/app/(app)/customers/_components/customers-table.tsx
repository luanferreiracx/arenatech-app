"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, RotateCcw } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";

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

function buildColumns(
  isAdmin: boolean,
  onRestore: (id: string) => void,
  isRestorePending: boolean,
): ColumnDef<CustomerRow>[] {
  return [
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
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          asChild
          aria-label={`Ver detalhes de ${row.original.name}`}
        >
          <Link href={`/customers/${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          asChild
          aria-label={`Editar ${row.original.name}`}
        >
          <Link href={`/customers/${row.original.id}/edit`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
        {isAdmin && row.original.deletedAt && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-success"
            disabled={isRestorePending}
            onClick={() => onRestore(row.original.id)}
            title="Restaurar cliente"
            aria-label={`Restaurar ${row.original.name}`}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
    ),
  },
  ];
}

export function CustomersTable() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PF" | "PJ">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Flag admin para mostrar toggle inativos + botao Restaurar
  const viewerQuery = useQuery(trpc.customer.viewerInfo.queryOptions());
  const isAdmin = viewerQuery.data?.isAdmin === true;

  // Debounce search — o cleanup do setTimeout precisa rodar num useEffect, senão
  // o timer nunca é cancelado e cada tecla dispara um update (não debounça). (C3)
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const handleSearchChange = useCallback((value: string) => setSearch(value), []);
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [search]);

  const onlyDeleted = isAdmin && statusFilter === "INACTIVE";

  const { data, isLoading } = useQuery(
    trpc.customer.list.queryOptions({
      search: debouncedSearch || undefined,
      type: typeFilter,
      page,
      pageSize,
      onlyDeleted,
    }),
  );

  const restoreMutation = useMutation(
    trpc.customer.restore.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente restaurado.");
        void queryClient.invalidateQueries({ queryKey: trpc.customer.list.queryKey() });
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  // Paginação já filtra server-side (onlyDeleted) — sem filtro client-side.
  const rows = (data?.data ?? []) as CustomerRow[];

  const columns = buildColumns(
    isAdmin,
    (id) => restoreMutation.mutate({ id }),
    restoreMutation.isPending,
  );

  // CTA de cadastro só quando a lista está vazia SEM filtros — com busca/filtro
  // ativo, "nenhum encontrado" é o resultado esperado, não um convite a cadastrar.
  const hasActiveFilters =
    debouncedSearch.trim().length > 0 ||
    typeFilter !== "ALL" ||
    statusFilter !== "ACTIVE";
  const emptyState = hasActiveFilters ? undefined : (
    <EmptyState
      icon={Users}
      title="Nenhum cliente cadastrado"
      description="Cadastre o primeiro cliente para começar a registrar vendas e ordens de serviço."
      action={
        <Button asChild>
          <Link href="/customers/new">Cadastrar cliente</Link>
        </Button>
      }
    />
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
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
      emptyState={emptyState}
      toolbar={
        <DataTableToolbar
          searchValue={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por nome, CPF, CNPJ, telefone, email..."
          actions={
            <div className="flex flex-wrap gap-2">
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
              {isAdmin && (
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v as "ACTIVE" | "INACTIVE");
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Ativos</SelectItem>
                    <SelectItem value="INACTIVE">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          }
        />
      }
    />
  );
}
