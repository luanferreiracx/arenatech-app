"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/domain/page-header";
import { DataTable } from "@/components/domain/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { Search } from "lucide-react";
import {
  COMMISSION_TYPE_LABELS,
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_VARIANT,
} from "@/lib/validators/commission";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MyCommissionsPage() {
  const { data: session } = useSession();
  const trpc = useTRPC();

  const userId = session?.user?.id;

  const summaryQuery = useQuery(
    trpc.commission.userSummary.queryOptions(
      { userId: userId! },
      { enabled: !!userId },
    ),
  );

  const listQuery = useQuery(
    trpc.commission.list.queryOptions(
      { userId: userId!, pageSize: 50 },
      { enabled: !!userId },
    ),
  );

  return (
    <div>
      <PageHeader
        title="Minha Comissao"
        subtitle="Acompanhe suas comissoes do mes atual"
      />

      {/* Summary Cards */}
      {summaryQuery.isLoading ? (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : summaryQuery.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{formatCurrency(summaryQuery.data.monthPending)}</p>
            <p className="text-xs text-muted-foreground">Pendente</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{formatCurrency(summaryQuery.data.monthPaid)}</p>
            <p className="text-xs text-muted-foreground">Pago</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{formatCurrency(summaryQuery.data.monthTotal)}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{summaryQuery.data.count}</p>
            <p className="text-xs text-muted-foreground">Registros</p>
          </Card>
        </div>
      ) : null}

      {/* Commissions List */}
      {listQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : listQuery.data && listQuery.data.data.length > 0 ? (
        <DataTable
          data={listQuery.data.data}
          columns={[
            {
              header: "Tipo",
              accessorKey: "type",
              cell: ({ row }) => COMMISSION_TYPE_LABELS[row.original.type] ?? row.original.type,
            },
            { header: "Referencia", accessorKey: "referenceNumber" },
            {
              header: "Base",
              accessorKey: "baseAmount",
              cell: ({ row }) => formatCurrency(row.original.baseAmount),
            },
            {
              header: "Taxa",
              accessorKey: "ratePercent",
              cell: ({ row }) => `${row.original.ratePercent}%`,
            },
            {
              header: "Comissao",
              accessorKey: "commissionAmount",
              cell: ({ row }) => (
                <span className="font-medium text-primary">
                  {formatCurrency(row.original.commissionAmount)}
                </span>
              ),
            },
            {
              header: "Status",
              accessorKey: "status",
              cell: ({ row }) => (
                <StatusBadge variant={COMMISSION_STATUS_VARIANT[row.original.status] ?? "default"}>
                  {COMMISSION_STATUS_LABELS[row.original.status] ?? row.original.status}
                </StatusBadge>
              ),
            },
          ]}
        />
      ) : (
        <EmptyState
          title="Nenhuma comissao encontrada"
          description="Suas comissoes aparecerao aqui quando forem calculadas"
          icon={Search}
        />
      )}
    </div>
  );
}
