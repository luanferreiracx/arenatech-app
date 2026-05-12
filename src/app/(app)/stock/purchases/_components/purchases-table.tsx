"use client";

import { useState, useCallback } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { StatusBadge } from "@/components/domain/status-badge";
import { deviceConditionLabels } from "@/lib/validators/stock";

interface PurchaseRow {
  id: string;
  imei: string | null;
  serial: string | null;
  brand: string | null;
  model: string | null;
  condition: string;
  batteryHealth: number | null;
  purchasePrice: { toNumber?: () => number } | number | string;
  salePrice: { toNumber?: () => number } | number | string | null;
  createdAt: string | Date;
  product: { id: string; name: string } | null;
}

function formatCurrency(value: PurchaseRow["purchasePrice"] | null): string {
  if (value == null) return "-";
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

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PurchasesTable() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, []);

  const { data, isLoading } = useQuery(
    trpc.stock.listPurchases.queryOptions({
      search: debouncedSearch || undefined,
      page,
      pageSize,
    }),
  );

  const columns: ColumnDef<PurchaseRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) => (
        <span className="text-sm">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: "device",
      header: "Aparelho",
      cell: ({ row }) => (
        <div>
          {row.original.brand && row.original.model ? (
            <span className="font-medium">{row.original.brand} {row.original.model}</span>
          ) : row.original.product ? (
            <span className="font-medium">{row.original.product.name}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
          {row.original.imei && (
            <span className="block text-xs text-muted-foreground">
              IMEI: {row.original.imei}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "condition",
      header: "Condicao",
      cell: ({ row }) => (
        <StatusBadge
          variant={
            row.original.condition === "NEW"
              ? "success"
              : row.original.condition === "DEFECTIVE"
                ? "destructive"
                : "warning"
          }
        >
          {deviceConditionLabels[row.original.condition] ?? row.original.condition}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "batteryHealth",
      header: "Bateria",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.batteryHealth != null ? `${row.original.batteryHealth}%` : "-"}
        </span>
      ),
    },
    {
      accessorKey: "purchasePrice",
      header: "Preco Compra",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{formatCurrency(row.original.purchasePrice)}</span>
      ),
    },
    {
      accessorKey: "salePrice",
      header: "Preco Venda",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{formatCurrency(row.original.salePrice)}</span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={(data?.data ?? []) as PurchaseRow[]}
      pageCount={data?.pageCount ?? 0}
      pageIndex={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(0);
      }}
      isLoading={isLoading}
      emptyMessage="Nenhuma compra registrada."
      toolbar={
        <DataTableToolbar
          searchValue={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por IMEI, marca ou modelo..."
        />
      }
    />
  );
}
