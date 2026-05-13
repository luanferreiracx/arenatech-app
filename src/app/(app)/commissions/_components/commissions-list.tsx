"use client";

import { useState } from "react";
import { Calculator, Award } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { DataTable } from "@/components/domain/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import {
  COMMISSION_TYPE_LABELS,
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_VARIANT,
} from "@/lib/validators/commission";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CommissionsList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showCalcDialog, setShowCalcDialog] = useState(false);
  const [calcMonth, setCalcMonth] = useState(new Date().getMonth() + 1);
  const [calcYear, setCalcYear] = useState(new Date().getFullYear());

  const listQuery = useQuery(
    trpc.commission.list.queryOptions({
      page,
      pageSize: 20,
      status: statusFilter ? (statusFilter as "PENDING" | "APPROVED" | "PAID" | "CANCELLED") : undefined,
      type: typeFilter ? (typeFilter as "SALE" | "SERVICE_ORDER") : undefined,
    }),
  );

  const calculateMutation = useMutation(trpc.commission.calculate.mutationOptions());
  const approveMutation = useMutation(trpc.commission.approve.mutationOptions());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.commission.list.queryKey() });
  };

  const handleCalculate = () => {
    calculateMutation.mutate(
      { month: calcMonth, year: calcYear },
      {
        onSuccess: (result) => {
          toast.success(`${result.created} comissoes calculadas`);
          setShowCalcDialog(false);
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleAction = (action: "approve" | "pay" | "cancel", id: string) => {
    const status = action === "approve" ? "APPROVED" as const : action === "pay" ? "PAID" as const : "CANCELLED" as const;
    approveMutation.mutate(
      { commissionId: id, status },
      {
        onSuccess: () => { toast.success("Status atualizado"); invalidate(); },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const columns = [
    { accessorKey: "userName", header: "Colaborador" },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }: { row: { original: { type: string } } }) =>
        COMMISSION_TYPE_LABELS[row.original.type] ?? row.original.type,
    },
    { accessorKey: "referenceNumber", header: "Referencia" },
    {
      accessorKey: "baseAmount",
      header: "Base",
      cell: ({ row }: { row: { original: { baseAmount: number } } }) =>
        formatCurrency(row.original.baseAmount),
    },
    {
      accessorKey: "ratePercent",
      header: "Taxa",
      cell: ({ row }: { row: { original: { ratePercent: number } } }) =>
        `${row.original.ratePercent}%`,
    },
    {
      accessorKey: "commissionAmount",
      header: "Comissao",
      cell: ({ row }: { row: { original: { commissionAmount: number } } }) =>
        formatCurrency(row.original.commissionAmount),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: { status: string } } }) => (
        <StatusBadge variant={COMMISSION_STATUS_VARIANT[row.original.status] ?? "default"}>
          {COMMISSION_STATUS_LABELS[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }: { row: { original: { id: string; status: string } } }) => {
        const { id, status } = row.original;
        return (
          <div className="flex gap-1">
            {status === "PENDING" && (
              <Button size="sm" variant="outline" onClick={() => handleAction("approve", id)}>Aprovar</Button>
            )}
            {status === "APPROVED" && (
              <Button size="sm" variant="outline" onClick={() => handleAction("pay", id)}>Pagar</Button>
            )}
            {status !== "PAID" && status !== "CANCELLED" && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleAction("cancel", id)}>
                Cancelar
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="APPROVED">Aprovada</SelectItem>
            <SelectItem value="PAID">Paga</SelectItem>
            <SelectItem value="CANCELLED">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="SALE">Venda</SelectItem>
            <SelectItem value="SERVICE_ORDER">OS</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setShowCalcDialog(true)}>
          <Calculator className="mr-2 h-4 w-4" />
          Calcular Comissoes
        </Button>
      </div>

      {/* Table */}
      {listQuery.data ? (
        listQuery.data.data.length === 0 ? (
          <EmptyState icon={Award} title="Nenhuma comissao" description="Calcule as comissoes do periodo" />
        ) : (
          <DataTable
            columns={columns}
            data={listQuery.data.data}
            pageCount={listQuery.data.pageCount}
            pageIndex={page}
            onPageChange={setPage}
          />
        )
      ) : (
        <Skeleton className="h-96" />
      )}

      {/* Calculate Dialog */}
      <Dialog open={showCalcDialog} onOpenChange={setShowCalcDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calcular Comissoes</DialogTitle>
            <DialogDescription>Selecione o periodo para calcular as comissoes</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Mes</Label>
              <Select value={String(calcMonth)} onValueChange={(v) => setCalcMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {new Date(2000, i).toLocaleDateString("pt-BR", { month: "long" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Input type="number" value={calcYear} onChange={(e) => setCalcYear(Number(e.target.value))} min={2020} max={2100} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCalcDialog(false)}>Cancelar</Button>
            <Button onClick={handleCalculate} disabled={calculateMutation.isPending}>
              {calculateMutation.isPending ? "Calculando..." : "Calcular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
