"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { stockMovementTypeLabels } from "@/lib/validators/stock";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";

interface MovementRow {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  createdAt: string | Date;
  product: { id: string; name: string; sku: string | null };
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MovementsTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [type, setType] = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading } = useQuery(
    trpc.stock.listMovements.queryOptions({
      type: type as "ENTRY" | "EXIT" | "ADJUSTMENT" | "RESERVE" | "RELEASE" | undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize,
    }),
  );

  const columns: ColumnDef<MovementRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) => (
        <span className="text-sm">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: "product",
      header: "Produto",
      cell: ({ row }) => (
        <div>
          <span className="font-medium">{row.original.product.name}</span>
          {row.original.product.sku && (
            <span className="block text-xs text-muted-foreground">
              SKU: {row.original.product.sku}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => (
        <StatusBadge
          variant={
            row.original.type === "ENTRY" || row.original.type === "RELEASE"
              ? "success"
              : row.original.type === "EXIT"
                ? "destructive"
                : "warning"
          }
        >
          {stockMovementTypeLabels[row.original.type] ?? row.original.type}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Quantidade",
      cell: ({ row }) => (
        <span className="font-mono">
          {row.original.type === "EXIT" || row.original.type === "RESERVE" ? "-" : "+"}
          {row.original.quantity}
        </span>
      ),
    },
    {
      accessorKey: "reason",
      header: "Motivo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground max-w-[300px] truncate block">
          {row.original.reason || "-"}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-4 mb-4 items-end">
        <div>
          <Label className="text-xs mb-1 block">Tipo</Label>
          <Select value={type ?? "all"} onValueChange={(v) => { setType(v === "all" ? undefined : v); setPage(0); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(stockMovementTypeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Data Inicio</Label>
          <DateInput
            value={dateFrom}
            onChange={(v) => { setDateFrom(v); setPage(0); }}
            className="w-[160px]"
            aria-label="Data de inicio"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Data Fim</Label>
          <DateInput
            value={dateTo}
            onChange={(v) => { setDateTo(v); setPage(0); }}
            className="w-[160px]"
            aria-label="Data de fim"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={(data?.data ?? []) as MovementRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
        isLoading={isLoading}
        emptyMessage="Nenhuma movimentacao encontrada."
      />
    </>
  );
}
