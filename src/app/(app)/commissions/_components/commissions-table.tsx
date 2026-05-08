"use client";

import { useState } from "react";
import { Check, X, DollarSign, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/domain/data-table/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";
import {
  commissionTypeLabels,
  commissionStatusLabels,
  commissionStatusValues,
  commissionTypeValues,
} from "@/lib/validators/commission";

interface CommissionRow {
  id: string;
  userId: string;
  userName: string;
  type: string;
  status: string;
  referenceNumber: string;
  referenceType: string;
  baseAmount: unknown;
  ratePercent: unknown;
  commissionAmount: unknown;
  periodMonth: number;
  periodYear: number;
  paidAt: Date | null;
  createdAt: Date;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    PENDING: "warning",
    APPROVED: "info",
    PAID: "success",
    CANCELLED: "destructive",
  };
  return map[status] ?? "default";
}

export function CommissionsTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<number>(new Date().getMonth() + 1);
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.commissions.list.queryOptions({
      status: statusFilter ? (statusFilter as (typeof commissionStatusValues)[number]) : undefined,
      type: typeFilter ? (typeFilter as (typeof commissionTypeValues)[number]) : undefined,
      periodMonth: monthFilter,
      periodYear: yearFilter,
      page,
      pageSize: 20,
    }),
  );

  const approveMutation = useMutation(
    trpc.commissions.approve.mutationOptions({
      onSuccess: (result) => {
        toast.success(`${result.updated} comissão(ões) aprovada(s).`);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const payMutation = useMutation(
    trpc.commissions.pay.mutationOptions({
      onSuccess: (result) => {
        toast.success(`${result.updated} comissão(ões) paga(s).`);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const cancelMutation = useMutation(
    trpc.commissions.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Comissão cancelada.");
        setCancelId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const columns: ColumnDef<CommissionRow>[] = [
    { accessorKey: "userName", header: "Colaborador" },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => commissionTypeLabels[row.getValue("type") as string] ?? row.getValue("type"),
    },
    { accessorKey: "referenceNumber", header: "Referência" },
    {
      accessorKey: "baseAmount",
      header: "Base",
      cell: ({ row }) => formatMoney(row.getValue("baseAmount")),
    },
    {
      accessorKey: "ratePercent",
      header: "%",
      cell: ({ row }) => `${Number(row.getValue("ratePercent"))}%`,
    },
    {
      accessorKey: "commissionAmount",
      header: "Valor",
      cell: ({ row }) => (
        <span className="font-medium text-primary">{formatMoney(row.getValue("commissionAmount"))}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return (
          <StatusBadge variant={getStatusVariant(status)}>
            {commissionStatusLabels[status] ?? status}
          </StatusBadge>
        );
      },
    },
    {
      id: "period",
      header: "Período",
      cell: ({ row }) => `${String(row.original.periodMonth).padStart(2, "0")}/${row.original.periodYear}`,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {status === "PENDING" && (
                <DropdownMenuItem
                  onClick={() => approveMutation.mutate({ ids: [row.original.id] })}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Aprovar
                </DropdownMenuItem>
              )}
              {status === "APPROVED" && (
                <DropdownMenuItem
                  onClick={() => payMutation.mutate({ ids: [row.original.id] })}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Marcar como Paga
                </DropdownMenuItem>
              )}
              {status !== "PAID" && status !== "CANCELLED" && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setCancelId(row.original.id)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2024, i, 1).toLocaleString("pt-BR", { month: "long" }),
  }));

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(monthFilter)} onValueChange={(v) => { setMonthFilter(Number(v)); setPage(0); }}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m.value} value={String(m.value)}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="number"
        className="w-[100px]"
        value={yearFilter}
        onChange={(e) => { setYearFilter(Number(e.target.value)); setPage(0); }}
        min={2020}
        max={2100}
      />

      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {commissionStatusValues.map((s) => (
            <SelectItem key={s} value={s}>
              {commissionStatusLabels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(0); }}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {commissionTypeValues.map((t) => (
            <SelectItem key={t} value={t}>
              {commissionTypeLabels[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={(data?.items as CommissionRow[]) ?? []}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        toolbar={toolbar}
        emptyMessage="Nenhuma comissão encontrada para este período."
      />

      <ConfirmDialog
        open={cancelId !== null}
        onOpenChange={(open) => !open && setCancelId(null)}
        title="Cancelar comissão"
        description="Tem certeza que deseja cancelar esta comissão? Esta ação não pode ser desfeita."
        variant="destructive"
        confirmLabel="Cancelar comissão"
        onConfirm={() => { if (cancelId) cancelMutation.mutate({ id: cancelId }); }}
        isLoading={cancelMutation.isPending}
      />
    </>
  );
}
