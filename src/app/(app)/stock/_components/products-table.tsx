"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/domain/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  costPrice: unknown;
  salePrice: unknown;
  currentStock: number;
  minStock: number;
  unit: string;
  active: boolean;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductsTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.stock.listProducts.queryOptions({
      search: search || undefined,
      page,
      pageSize: 20,
    }),
  );

  const deleteMutation = useMutation(
    trpc.stock.deleteProduct.mutationOptions({
      onSuccess: () => {
        toast.success("Produto removido.");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const columns: ColumnDef<ProductRow>[] = [
    { accessorKey: "name", header: "Nome" },
    {
      accessorKey: "sku",
      header: "SKU",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.getValue("sku") ?? "—"}</span>
      ),
    },
    {
      accessorKey: "barcode",
      header: "Código de Barras",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.getValue("barcode") ?? "—"}</span>
      ),
    },
    {
      accessorKey: "costPrice",
      header: "Custo",
      cell: ({ row }) => formatMoney(row.getValue("costPrice")),
    },
    {
      accessorKey: "salePrice",
      header: "Venda",
      cell: ({ row }) => formatMoney(row.getValue("salePrice")),
    },
    {
      id: "stock",
      header: "Estoque",
      cell: ({ row }) => {
        const current = row.original.currentStock;
        const min = row.original.minStock;
        const isLow = current <= min;
        return (
          <div className="flex items-center gap-2">
            <span>{current} {row.original.unit}</span>
            {isLow && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Baixo</Badge>}
          </div>
        );
      },
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.getValue("active") ? "default" : "secondary"}>
          {row.getValue("active") ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/stock/${row.original.id}`)}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhe
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/stock/${row.original.id}/edit`)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteId(row.original.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as ProductRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por nome, SKU ou código de barras..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-sm"
            />
            <Button size="sm" asChild>
              <Link href="/stock/new">Novo Produto</Link>
            </Button>
          </div>
        }
      />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remover produto?"
        description="O produto será desativado mas pode ser restaurado posteriormente."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
