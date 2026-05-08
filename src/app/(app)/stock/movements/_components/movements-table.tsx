"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/domain/data-table";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

interface MovementRow {
  id: string;
  type: string;
  quantity: number;
  unitCost: number | string | null;
  reason: string | null;
  createdAt: Date | string;
  product: { name: string; sku: string | null };
}

const movementTypeLabels: Record<string, string> = {
  ENTRY: "Entrada",
  EXIT: "Saída",
  ADJUSTMENT: "Ajuste",
  SALE: "Venda",
  RETURN: "Devolução",
  TRANSFER: "Transferência",
};

const movementTypeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ENTRY: "default",
  EXIT: "destructive",
  ADJUSTMENT: "secondary",
  SALE: "destructive",
  RETURN: "default",
  TRANSFER: "outline",
};

function formatMoney(value: number | string): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MovementsTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data } = useQuery(
    trpc.stock.listMovements.queryOptions({
      type: typeFilter === "all" ? undefined : typeFilter as "ENTRY" | "EXIT" | "ADJUSTMENT" | "SALE" | "RETURN" | "TRANSFER",
      page,
      pageSize: 20,
    }),
  );

  const columns: ColumnDef<MovementRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) => new Date(row.getValue("createdAt") as string).toLocaleString("pt-BR"),
    },
    {
      id: "product",
      header: "Produto",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.product.name}</p>
          {row.original.product.sku && (
            <p className="text-xs text-muted-foreground font-mono">{row.original.product.sku}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <Badge variant={movementTypeVariants[type] ?? "outline"}>
            {movementTypeLabels[type] ?? type}
          </Badge>
        );
      },
    },
    { accessorKey: "quantity", header: "Qtd" },
    {
      accessorKey: "unitCost",
      header: "Custo Unit.",
      cell: ({ row }) => {
        const val = row.getValue("unitCost");
        return val ? formatMoney(val as number) : "—";
      },
    },
    {
      accessorKey: "reason",
      header: "Motivo",
      cell: ({ row }) => row.getValue("reason") ?? "—",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={(data?.items ?? []) as MovementRow[]}
      pageCount={data?.pageCount}
      pageIndex={page}
      pageSize={20}
      onPageChange={setPage}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ENTRY">Entrada</SelectItem>
              <SelectItem value="EXIT">Saída</SelectItem>
              <SelectItem value="ADJUSTMENT">Ajuste</SelectItem>
              <SelectItem value="SALE">Venda</SelectItem>
              <SelectItem value="RETURN">Devolução</SelectItem>
              <SelectItem value="TRANSFER">Transferência</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}
