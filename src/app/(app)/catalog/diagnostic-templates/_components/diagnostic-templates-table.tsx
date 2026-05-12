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

interface TemplateRow {
  id: string;
  title: string;
  content: string;
  category: string | null;
  active: boolean;
}

export function DiagnosticTemplatesTable() {
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
    trpc.catalog.listDiagnosticTemplates.queryOptions({
      search: debouncedSearch || undefined,
      page,
      pageSize,
    }),
  );

  const deleteMutation = useMutation(
    trpc.catalog.deleteDiagnosticTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template excluido com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const columns: ColumnDef<TemplateRow>[] = [
    {
      accessorKey: "title",
      header: "Titulo",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "category",
      header: "Categoria",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.category || "-"}
        </span>
      ),
    },
    {
      accessorKey: "content",
      header: "Conteudo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground line-clamp-2 max-w-md">
          {row.original.content}
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
            <Link href={`/catalog/diagnostic-templates/${row.original.id}/edit`}>
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
        data={(data?.data ?? []) as TemplateRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
        isLoading={isLoading}
        emptyMessage="Nenhum template encontrado."
        toolbar={
          <DataTableToolbar
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Buscar por titulo, conteudo ou categoria..."
          />
        }
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir Template"
        description="Tem certeza que deseja excluir este template de diagnostico?"
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
