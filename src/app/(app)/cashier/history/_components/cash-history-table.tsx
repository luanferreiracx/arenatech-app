"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/domain/data-table";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

interface CashRow {
  id: string;
  openedAt: Date | string;
  closedAt: Date | string | null;
  openingBalance: unknown;
  closingBalance: unknown;
  expectedBalance: unknown;
  difference: unknown;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CashHistoryTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);

  const { data } = useQuery(
    trpc.cashier.history.queryOptions({ page, pageSize: 20 }),
  );

  const columns: ColumnDef<CashRow>[] = [
    {
      accessorKey: "openedAt",
      header: "Abertura",
      cell: ({ row }) => new Date(row.getValue("openedAt") as string).toLocaleString("pt-BR"),
    },
    {
      accessorKey: "closedAt",
      header: "Fechamento",
      cell: ({ row }) => {
        const val = row.getValue("closedAt");
        return val ? new Date(val as string).toLocaleString("pt-BR") : "—";
      },
    },
    {
      accessorKey: "openingBalance",
      header: "Saldo Abertura",
      cell: ({ row }) => formatMoney(row.getValue("openingBalance")),
    },
    {
      accessorKey: "closingBalance",
      header: "Saldo Fechamento",
      cell: ({ row }) => {
        const val = row.getValue("closingBalance");
        return val != null ? formatMoney(val as number) : "—";
      },
    },
    {
      accessorKey: "difference",
      header: "Diferença",
      cell: ({ row }) => {
        const val = row.original.difference;
        if (val == null) return "—";
        const num = Number(val);
        return (
          <Badge variant={num === 0 ? "default" : "destructive"}>
            {formatMoney(num)}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/cashier/${row.original.id}`)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={(data?.items ?? []) as CashRow[]}
      pageCount={data?.pageCount}
      pageIndex={page}
      pageSize={20}
      onPageChange={setPage}
    />
  );
}
