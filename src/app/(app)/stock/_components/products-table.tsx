"use client";

import { useState, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import Link from "next/link";
import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Pencil, Trash2, Eye, AlertTriangle, Package, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { useCan } from "@/lib/auth/use-capabilities";
import { StockStatsCards } from "./stock-stats-cards";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { LabelsDialog } from "./labels-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  isSerialized: boolean;
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
  const router = useRouter();
  const queryClient = useQueryClient();
  // ADR 0053: ajustar saldo é do operador; editar/duplicar/excluir produto (catálogo) é admin.
  const canMoveStock = useCan("moveStock");
  const canManageCatalog = useCan("manageCatalog");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [lowStock, setLowStock] = useState(false);
  const [sort, setSort] = useState<"name-asc" | "salePrice-asc" | "salePrice-desc" | "createdAt-desc">("name-asc");
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; name: string; currentStock: number; hasVariations: boolean } | null>(null);
  // Seleção keyed por id do produto (getRowId) — persiste ao trocar de página.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );

  // Volta pra primeira pagina ao editar a busca (no evento, nao num effect —
  // setState sincrono em effect dispara render em cascata).
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const { data: categoriesData } = useQuery(
    trpc.stock.listCategories.queryOptions({}),
  );
  const categories = categoriesData?.data ?? [];

  const [sortBy, sortOrder] = sort.split("-") as [
    "name" | "salePrice" | "createdAt",
    "asc" | "desc",
  ];

  const { data, isLoading } = useQuery(
    trpc.stock.list.queryOptions({
      search: debouncedSearch || undefined,
      active: statusFilter === "all" ? undefined : statusFilter === "active",
      categoryId: categoryId === "all" ? undefined : categoryId,
      lowStock: lowStock || undefined,
      sortBy,
      sortOrder,
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

  const duplicateMutation = useMutation(
    trpc.stock.duplicateProduct.mutationOptions({
      onSuccess: (created) => {
        toast.success("Produto duplicado — edite a copia.");
        queryClient.invalidateQueries({ queryKey: [["stock"]] });
        // Leva direto para editar a copia (ajustar SKU/preco/etc).
        router.push(`/stock/${(created as { id: string }).id}/edit`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const columns: ColumnDef<ProductRow>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Selecionar todos nesta pagina"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Selecionar ${row.original.name}`}
        />
      ),
      enableSorting: false,
    },
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
          {/* Ajustar saldo: operador (ADR 0053) — não se aplica a serializado,
              cujo saldo deriva dos StockItems. Editar/Duplicar/Excluir produto
              mexem no catálogo e seguem admin-only. */}
          {canMoveStock && !row.original.isSerialized && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Ajustar estoque de ${row.original.name}`}
              onClick={() => setAdjustTarget({
                id: row.original.id,
                name: row.original.name,
                currentStock: row.original.currentStock,
                hasVariations: row.original.hasVariations,
              })}
            >
              <span className="text-xs font-medium">+/-</span>
            </Button>
          )}
          {canManageCatalog && (
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
          )}
          {canManageCatalog && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Duplicar ${row.original.name}`}
              disabled={duplicateMutation.isPending}
              onClick={() => duplicateMutation.mutate({ productId: row.original.id })}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {canManageCatalog && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            aria-label={`Excluir ${row.original.name}`}
            onClick={() => setDeleteTarget(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          )}
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
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row.id}
        toolbar={
          <DataTableToolbar
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Buscar por nome, SKU ou codigo de barras..."
            filters={
              <>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v as "all" | "active" | "inactive");
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-9 w-[130px]" aria-label="Filtrar por status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Status: todos</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={categoryId}
                  onValueChange={(v) => {
                    setCategoryId(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-9 w-[160px]" aria-label="Filtrar por categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Categoria: todas</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sort}
                  onValueChange={(v) => {
                    setSort(v as "name-asc" | "salePrice-asc" | "salePrice-desc" | "createdAt-desc");
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-9 w-[150px]" aria-label="Ordenar">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name-asc">Nome (A-Z)</SelectItem>
                    <SelectItem value="salePrice-asc">Menor preco</SelectItem>
                    <SelectItem value="salePrice-desc">Maior preco</SelectItem>
                    <SelectItem value="createdAt-desc">Mais recentes</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={lowStock ? "default" : "outline"}
                  size="sm"
                  className="h-9"
                  aria-pressed={lowStock}
                  onClick={() => {
                    setLowStock((v) => !v);
                    setPage(0);
                  }}
                >
                  Estoque baixo
                </Button>
              </>
            }
            actions={
              selectedIds.length > 0 ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
                    Limpar selecao
                  </Button>
                  <LabelsDialog
                    initialIds={selectedIds}
                    buttonLabel={`Etiquetas (${selectedIds.length})`}
                    size="sm"
                  />
                </>
              ) : undefined
            }
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
          hasVariations={adjustTarget.hasVariations}
        />
      )}
    </>
  );
}
