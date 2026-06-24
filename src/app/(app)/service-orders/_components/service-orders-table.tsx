"use client";

import { useState } from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil } from "lucide-react";
import { format } from "date-fns";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SERVICE_ORDER_STATUS_LABELS,
  SERVICE_ORDER_STATUS_VARIANT,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";
import { type RouterOutputs } from "@/trpc/types";

// Derivado da saida do procedure — UI e servidor nunca divergem.
type OrderRow = RouterOutputs["serviceOrder"]["list"]["items"][number];

function formatMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

const columns: ColumnDef<OrderRow>[] = [
  {
    accessorKey: "number",
    header: "Nro",
    cell: ({ row }) => (
      <Link
        href={`/service-orders/${row.original.id}`}
        className="font-mono font-medium text-primary hover:underline"
      >
        {row.original.number}
      </Link>
    ),
  },
  {
    accessorKey: "customerName",
    header: "Cliente",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.customerName}</p>
        {row.original.customerCpf && (
          <p className="text-xs text-muted-foreground">{row.original.customerCpf}</p>
        )}
        {row.original.customerPhone && (
          <p className="text-xs text-muted-foreground">{formatPhone(row.original.customerPhone)}</p>
        )}
        {row.original.customerPhoneSecondary && (
          <p className="text-xs text-muted-foreground">{formatPhone(row.original.customerPhoneSecondary)} (alt)</p>
        )}
      </div>
    ),
  },
  {
    id: "device",
    header: "Equipamento",
    cell: ({ row }) => (
      <div>
        <p className="text-sm">
          {row.original.deviceType ?? ""}{" "}
          {row.original.deviceModel ?? ""}
        </p>
        {row.original.imei && (
          <p className="text-xs text-muted-foreground font-mono">{row.original.imei}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "technicianName",
    header: "Tecnico",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.technicianName ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      return (
        <div className="flex items-center gap-2">
          <StatusBadge variant={SERVICE_ORDER_STATUS_VARIANT[status]}>
            {SERVICE_ORDER_STATUS_LABELS[status]}
          </StatusBadge>
          {row.original.isWarranty && (
            <StatusBadge variant="info">Garantia</StatusBadge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "totalAmount",
    header: "Valor",
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {formatMoney(row.original.totalAmount)}
      </span>
    ),
  },
  {
    accessorKey: "entryDate",
    header: "Data",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {format(new Date(row.original.entryDate), "dd/MM/yyyy")}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label={`Ver detalhes da OS ${row.original.number}`}
        >
          <Link href={`/service-orders/${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label={`Editar OS ${row.original.number}`}
        >
          <Link href={`/service-orders/${row.original.id}/edit`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    ),
  },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "Todos os Status" },
  { value: "OPEN", label: "Iniciada" },
  { value: "IN_DIAGNOSIS", label: "Em Diagnostico" },
  { value: "WAITING_APPROVAL", label: "Aguard. Aprovacao" },
  { value: "APPROVED", label: "Aprovada" },
  { value: "WAITING_PARTS", label: "Aguard. Pecas" },
  { value: "IN_PROGRESS", label: "Em Execucao" },
  { value: "COMPLETED", label: "Concluida" },
  { value: "PAID", label: "Paga" },
  { value: "READY_FOR_PICKUP", label: "Aguard. Retirada" },
  { value: "DELIVERED", label: "Entregue" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "REFUNDED", label: "Estornada" },
];

export function ServiceOrdersTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [techFilter, setTechFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const techQuery = useQuery(
    trpc.serviceOrder.listTechnicians.queryOptions()
  );
  const technicians = techQuery.data;

  const listQuery = useQuery(
    trpc.serviceOrder.list.queryOptions({
      page,
      pageSize: 10,
      search: search || undefined,
      status: statusFilter !== "ALL" ? (statusFilter as ServiceOrderStatus) : undefined,
      technicianId: techFilter !== "ALL" ? techFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
  );
  const isLoading = listQuery.isLoading;
  const data = listQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por numero, cliente, CPF, IMEI, modelo..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-md"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={techFilter}
          onValueChange={(v) => {
            setTechFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tecnico" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os Tecnicos</SelectItem>
            {technicians?.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <DateInput
            value={dateFrom}
            onChange={(v) => { setDateFrom(v); setPage(0); }}
            className="w-[150px]"
            placeholder="De"
            aria-label="Data de inicio"
          />
          <span className="text-muted-foreground text-xs">ate</span>
          <DateInput
            value={dateTo}
            onChange={(v) => { setDateTo(v); setPage(0); }}
            className="w-[150px]"
            placeholder="Ate"
            aria-label="Data de fim"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        pageCount={data?.totalPages ?? 0}
        pageIndex={page}
        pageSize={10}
        onPageChange={setPage}
        isLoading={isLoading}
      />
    </div>
  );
}
