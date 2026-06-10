"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2, Eye, AlertTriangle, Package } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { StockStatsCards } from "./stock-stats-cards";
import { AdjustStockDialog } from "./adjust-stock-dialog";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  currentStock: number;
  minStock: number;
  costPrice: { toNumber?: () => number } | number | string;
  salePrice: { toNumber?: () => number } | number | string;
  unit: string;
  active: boolean;
  hasVariations: boolean;
  thumbnailUrl: string | null;
}

function formatCurrency(value: ProductRow["salePrice"]): string {
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

export function ProductsTable() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; name: string; currentStock: number } | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, []);

  const { data, isLoading } = useQuery(
    trpc.stock.list.queryOptions({
      search: debouncedSearch || undefined,
      page,
      pageSize,
    }),
  );

  const deleteMutation = useMutation(
    trpc.stock.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Produto excluido com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["stock"]] });
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const columns: ColumnDef<ProductRow>[] = [
    {
      accessorKey: "name",
      header: "Produto",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {row.original.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.original.thumbnailUrl}
                alt={row.original.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Package className="h-5 w-5 text-muted-foreground/50" />
            )}
          </div>
          <div>
            <span className="font-medium">{row.original.name}</span>
            {row.original.sku && (
              <span className="block text-xs text-muted-foreground">
                SKU: {row.original.sku}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "currentStock",
      header: "Estoque",
      cell: ({ row }) => {
        const isLow = row.original.minStock > 0 && row.original.currentStock <= row.original.minStock;
        return (
          <div className="flex items-center gap-1">
            <span className={isLow ? "text-destructive font-medium" : ""}>
              {row.original.currentStock} {row.original.unit}
            </span>
            {isLow && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
          </div>
        );
      },
    },
    {
      accessorKey: "costPrice",
      header: "Custo",
      cell: ({ row }) =>
        row.original.hasVariations ? (
          // Pai com variations: o preco do pai eh media, nao reflete a realidade.
          // Operador ve preco real ao escolher a variation no PDV/detalhe.
          <span className="text-xs text-muted-foreground italic">por variacao</span>
        ) : (
          <span className="font-mono text-sm">{formatCurrency(row.original.costPrice)}</span>
        ),
    },
    {
      accessorKey: "salePrice",
      header: "Venda",
      cell: ({ row }) =>
        row.original.hasVariations ? (
          <span className="text-xs text-muted-foreground italic">por variacao</span>
        ) : (
          <span className="font-mono text-sm">{formatCurrency(row.original.salePrice)}</span>
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            asChild
            aria-label={`Ver detalhes de ${row.original.name}`}
          >
            <Link href={`/stock/${row.original.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Ajustar estoque de ${row.original.name}`}
            onClick={() => setAdjustTarget({
              id: row.original.id,
              name: row.original.name,
              currentStock: row.original.currentStock,
            })}
          >
            <span className="text-xs font-medium">+/-</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            asChild
            aria-label={`Editar ${row.original.name}`}
          >
            <Link href={`/stock/${row.original.id}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            aria-label={`Excluir ${row.original.name}`}
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
      <StockStatsCards />

      <DataTable
        columns={columns}
        data={(data?.data ?? []) as ProductRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
        isLoading={isLoading}
        emptyMessage="Nenhum produto encontrado."
        toolbar={
          <DataTableToolbar
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Buscar por nome, SKU ou codigo de barras..."
          />
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir Produto"
        description="Tem certeza que deseja excluir este produto? Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget });
        }}
      />

      {adjustTarget && (
        <AdjustStockDialog
          open={true}
          onOpenChange={(open) => !open && setAdjustTarget(null)}
          productId={adjustTarget.id}
          productName={adjustTarget.name}
          currentStock={adjustTarget.currentStock}
        />
      )}
    </>
  );
}
