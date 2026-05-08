"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/domain/data-table";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

interface PurchaseRow {
  id: string;
  brand: string | null;
  model: string | null;
  imei: string | null;
  condition: string;
  purchasePrice: unknown;
  createdAt: Date | string;
}

const conditionLabels: Record<string, string> = {
  NEW: "Novo",
  USED: "Usado",
  REFURBISHED: "Recondicionado",
  DEFECTIVE: "Defeituoso",
};

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DevicePurchasesTable() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data } = useQuery(
    trpc.stock.listDevicePurchases.queryOptions({
      search: search || undefined,
      page,
      pageSize: 20,
    }),
  );

  const columns: ColumnDef<PurchaseRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) => new Date(row.getValue("createdAt") as string).toLocaleDateString("pt-BR"),
    },
    {
      id: "device",
      header: "Aparelho",
      cell: ({ row }) => (
        <span>{[row.original.brand, row.original.model].filter(Boolean).join(" ") || "—"}</span>
      ),
    },
    {
      accessorKey: "imei",
      header: "IMEI",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.getValue("imei") ?? "—"}</span>
      ),
    },
    {
      accessorKey: "condition",
      header: "Condição",
      cell: ({ row }) => (
        <Badge variant="outline">
          {conditionLabels[row.getValue("condition") as string] ?? row.getValue("condition")}
        </Badge>
      ),
    },
    {
      accessorKey: "purchasePrice",
      header: "Preço",
      cell: ({ row }) => formatMoney(row.getValue("purchasePrice")),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={(data?.items ?? []) as PurchaseRow[]}
      pageCount={data?.pageCount}
      pageIndex={page}
      pageSize={20}
      onPageChange={setPage}
      toolbar={
        <Input
          placeholder="Buscar por marca, modelo ou IMEI..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="max-w-sm"
        />
      }
    />
  );
}
