"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/domain/data-table";
import { DateRangePicker } from "@/components/inputs/date-range-picker";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { DateRange } from "react-day-picker";

interface CashRow {
  id: string;
  openedAt: Date | string;
  closedAt: Date | string | null;
  openingBalance: unknown;
  closingBalance: unknown;
  expectedBalance: unknown;
  difference: unknown;
  salesCount: number;
  salesTotal: number;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CashHistoryTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });

  const { data } = useQuery(
    trpc.cashier.history.queryOptions({
      page,
      pageSize: 20,
      from: dateRange.from,
      to: dateRange.to,
    }),
  );

  const columns: ColumnDef<CashRow>[] = [
    {
      accessorKey: "openedAt",
      header: "Data Abertura",
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
      accessorKey: "salesCount",
      header: "Vendas",
      cell: ({ row }) => (
        <span className="text-center block">{row.getValue("salesCount") as number}</span>
      ),
    },
    {
      accessorKey: "salesTotal",
      header: "Total Vendas",
      cell: ({ row }) => formatMoney(row.getValue("salesTotal")),
    },
    {
      accessorKey: "difference",
      header: "Diferença",
      cell: ({ row }) => {
        const val = row.original.difference;
        if (val == null) return "—";
        const num = Number(val);
        return (
          <span className={num < 0 ? "text-destructive font-medium" : num > 0 ? "text-success font-medium" : ""}>
            {formatMoney(num)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/cashier/${row.original.id}`)}
        >
          <Eye className="h-4 w-4 mr-1" />
          Relatório
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          value={dateRange}
          onChange={(range) => {
            setDateRange(range ?? { from: undefined, to: undefined });
            setPage(0);
          }}
        />
        {(dateRange.from || dateRange.to) && (
          <Button variant="outline" size="sm" onClick={() => { setDateRange({ from: undefined, to: undefined }); setPage(0); }}>
            Limpar
          </Button>
        )}
      </div>
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as CashRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
      />
    </div>
  );
}
