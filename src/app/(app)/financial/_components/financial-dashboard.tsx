"use client";

import { onActivateKey } from "@/lib/utils/a11y";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clock,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionsTable } from "./transactions-table";
import { OverdueSection } from "./overdue-section";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function tabFromParam(value: string | null): "RECEIVABLE" | "PAYABLE" {
  return value === "PAYABLE" ? "PAYABLE" : "RECEIVABLE";
}

export function FinancialDashboard() {
  const searchParams = useSearchParams();
  // Respeita o ?type= da URL (menu "Contas a Pagar" → ?type=PAYABLE). Sincroniza
  // quando a URL muda sem desmontar o componente (key derivada do param).
  const urlTab = tabFromParam(searchParams.get("type"));
  const [overrideTab, setOverrideTab] = useState<"RECEIVABLE" | "PAYABLE" | null>(null);
  const [lastUrlTab, setLastUrlTab] = useState(urlTab);
  if (urlTab !== lastUrlTab) {
    // URL mudou (navegou pelo menu) → segue a URL e descarta o override manual.
    setLastUrlTab(urlTab);
    setOverrideTab(null);
  }
  const activeTab = overrideTab ?? urlTab;

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setOverrideTab(v as "RECEIVABLE" | "PAYABLE")}
      >
        <TabsList className="mb-4">
          <TabsTrigger value="RECEIVABLE">A Receber</TabsTrigger>
          <TabsTrigger value="PAYABLE">A Pagar</TabsTrigger>
        </TabsList>

        <TabsContent value="RECEIVABLE">
          <FinancialTabContent type="RECEIVABLE" />
        </TabsContent>
        <TabsContent value="PAYABLE">
          <FinancialTabContent type="PAYABLE" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FinancialTabContent({ type }: { type: "RECEIVABLE" | "PAYABLE" }) {
  const trpc = useTRPC();
  const router = useRouter();

  const statsQuery = useQuery(
    trpc.financial.stats.queryOptions({ type }),
  );

  const [filters, setFilters] = useState({
    status: undefined as string | undefined,
    search: "",
    dateFrom: "",
    dateTo: "",
    page: 0,
  });

  const listQuery = useQuery(
    trpc.financial.list.queryOptions({
      type,
      status: filters.status as "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "PARTIALLY_PAID" | undefined,
      search: filters.search || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page: filters.page,
      pageSize: 20,
    }),
  );

  const isReceivable = type === "RECEIVABLE";

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {statsQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : statsQuery.data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card
            role="button"
            tabIndex={0}
            aria-label="Filtrar por contas pendentes"
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setFilters((f) => ({ ...f, status: "PENDING", page: 0 }))}
            onKeyDown={onActivateKey(() => setFilters((f) => ({ ...f, status: "PENDING", page: 0 })))}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-warning" />
                <div>
                  <p className="text-sm text-muted-foreground">Pendente</p>
                  <p className="text-xl font-bold font-mono">
                    {formatCents(statsQuery.data.pendingAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {statsQuery.data.pendingCount} conta(s)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Filtrar por contas vencidas"
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setFilters((f) => ({ ...f, status: "OVERDUE", page: 0 }))}
            onKeyDown={onActivateKey(() => setFilters((f) => ({ ...f, status: "OVERDUE", page: 0 })))}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-sm text-muted-foreground">Vencido</p>
                  <p className="text-xl font-bold font-mono text-destructive">
                    {formatCents(statsQuery.data.overdueAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {statsQuery.data.overdueCount} conta(s)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-success" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isReceivable ? "Recebido no Mes" : "Pago no Mes"}
                  </p>
                  <p className="text-xl font-bold font-mono text-success">
                    {formatCents(statsQuery.data.paidMonthAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {statsQuery.data.paidMonthCount} conta(s)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Transactions Table with Filters */}
      <TransactionsTable
        type={type}
        data={listQuery.data?.data ?? []}
        total={listQuery.data?.total ?? 0}
        pageCount={listQuery.data?.pageCount ?? 0}
        isLoading={listQuery.isLoading}
        filters={filters}
        onFiltersChange={setFilters}
        onRowClick={(id) => router.push(`/financial/${id}`)}
      />

      {/* Overdue Section */}
      <OverdueSection type={type} />
    </div>
  );
}
