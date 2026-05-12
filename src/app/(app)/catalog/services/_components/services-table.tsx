"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  basePrice: { toNumber?: () => number } | number | string;
  estimatedTime: string | null;
  active: boolean;
}

function formatCurrency(value: ServiceRow["basePrice"]): string {
  let num: number;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    num = (value as { toNumber: () => number }).toNumber();
  } else {
    num = Number(value);
  }
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function ServicesTable() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, []);

  const { data, isLoading } = useQuery(
    trpc.catalog.listServices.queryOptions({
      search: debouncedSearch || undefined,
      page,
      pageSize,
    }),
  );

  const deleteMutation = useMutation(
    trpc.catalog.deleteService.mutationOptions({
      onSuccess: () => {
        toast.success("Servico excluido com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const columns: ColumnDef<ServiceRow>[] = [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "basePrice",
      header: "Preco",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{formatCurrency(row.original.basePrice)}</span>
      ),
    },
    {
      accessorKey: "estimatedTime",
      header: "Tempo Estimado",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.estimatedTime || "-"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge variant={row.original.active ? "success" : "destructive"}>
          {row.original.active ? "Ativo" : "Inativo"}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/catalog/services/${row.original.id}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => setDeleteTarget(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={(data?.data ?? []) as ServiceRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
        isLoading={isLoading}
        emptyMessage="Nenhum servico encontrado."
        toolbar={
          <DataTableToolbar
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Buscar por nome ou descricao..."
          />
        }
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir Servico"
        description="Tem certeza que deseja excluir este servico? Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget });
        }}
      />
    </>
  );
}
