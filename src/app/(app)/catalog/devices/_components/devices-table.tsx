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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";

interface DeviceRow {
  id: string;
  brand: string;
  model: string;
  active: boolean;
  category: { id: string; name: string } | null;
}

export function DevicesTable() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
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
    trpc.catalog.listDevices.queryOptions({
      search: debouncedSearch || undefined,
      categoryId: categoryFilter !== "ALL" ? categoryFilter : undefined,
      page,
      pageSize,
    }),
  );

  const { data: categories } = useQuery(
    trpc.catalog.listDeviceCategories.queryOptions(),
  );

  const deleteMutation = useMutation(
    trpc.catalog.deleteDevice.mutationOptions({
      onSuccess: () => {
        toast.success("Aparelho excluido com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const columns: ColumnDef<DeviceRow>[] = [
    {
      accessorKey: "brand",
      header: "Marca",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.brand}</span>
      ),
    },
    {
      accessorKey: "model",
      header: "Modelo",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.model}</span>
      ),
    },
    {
      id: "category",
      header: "Categoria",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.category?.name ?? "-"}
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
            <Link href={`/catalog/devices/${row.original.id}/edit`}>
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
        data={(data?.data ?? []) as DeviceRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
        isLoading={isLoading}
        emptyMessage="Nenhum aparelho encontrado."
        toolbar={
          <DataTableToolbar
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Buscar por marca ou modelo..."
            actions={
              <Select
                value={categoryFilter}
                onValueChange={(v) => {
                  setCategoryFilter(v);
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas categorias</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        }
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir Aparelho"
        description="Tem certeza que deseja excluir este aparelho?"
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
