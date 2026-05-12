"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { DataTable } from "@/components/domain/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  SERVICE_ORDER_STATUSES,
  type ServiceOrderStatusValue,
} from "@/lib/validators/service-order";

interface OrderRow {
  id: string;
  number: string;
  status: string;
  deviceType: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  totalAmount: unknown;
  entryDate: Date | string;
  isWarranty: boolean;
  customer: { id: string; name: string; cpf: string | null; phone: string | null } | null;
  technician: { id: string; name: string } | null;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ServiceOrdersTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [technicianId, setTechnicianId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  const { data: stats } = useQuery(trpc.serviceOrders.stats.queryOptions());
  const { data: technicians } = useQuery(trpc.serviceOrders.listTechnicians.queryOptions());

  const { data } = useQuery(
    trpc.serviceOrders.list.queryOptions({
      search: search || undefined,
      status: status === "all" ? undefined : (status as ServiceOrderStatusValue),
      technicianId: technicianId === "all" ? undefined : technicianId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize: 20,
    }),
  );

  const columns: ColumnDef<OrderRow>[] = [
    {
      accessorKey: "number",
      header: "N. OS",
      cell: ({ row }) => (
        <div>
          <Link
            href={`/service-orders/${row.original.id}`}
            className="font-mono font-medium text-primary hover:underline"
          >
            {row.original.number}
          </Link>
          {row.original.isWarranty && (
            <div className="text-xs text-warning flex items-center gap-1 mt-0.5">
              🛡 Garantia
            </div>
          )}
        </div>
      ),
    },
    {
      id: "customer",
      header: "Cliente",
      cell: ({ row }) => {
        const c = row.original.customer;
        if (!c) return "—";
        return (
          <div>
            <div className="font-medium">{c.name}</div>
            {c.cpf && <div className="text-xs text-muted-foreground">{c.cpf}</div>}
          </div>
        );
      },
    },
    {
      id: "phone",
      header: "Telefone",
      cell: ({ row }) => row.original.customer?.phone ?? "—",
    },
    {
      id: "device",
      header: "Equipamento",
      cell: ({ row }) => {
        const type = row.original.deviceType;
        const model = row.original.deviceModel;
        if (!type && !model) return "—";
        return (
          <div>
            {type && <div className="text-sm">{type}</div>}
            {model && <div className="text-xs text-muted-foreground">{model}</div>}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status as ServiceOrderStatusValue;
        return (
          <StatusBadge variant={STATUS_VARIANTS[s]}>
            {STATUS_LABELS[s]}
          </StatusBadge>
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
      header: "Entrada",
      cell: ({ row }) =>
        new Date(row.original.entryDate as string).toLocaleDateString("pt-BR"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => router.push(`/service-orders/${row.original.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhe
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/service-orders/${row.original.id}/edit`)
                }
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Abertas</p>
            <p className="text-2xl font-bold">{stats?.totalOpen ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Em andamento</p>
            <p className="text-2xl font-bold">{stats?.totalInProgress ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Concluídas (mês)</p>
            <p className="text-2xl font-bold">{stats?.completedThisMonth ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Receita (mês)</p>
            <p className="text-2xl font-bold">
              {formatMoney(stats?.revenueThisMonth ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as OrderRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por OS, cliente, CPF, IMEI, modelo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {SERVICE_ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={technicianId}
              onValueChange={(v) => {
                setTechnicianId(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Técnico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os técnicos</SelectItem>
                {(technicians ?? []).map((t: { id: string; name: string }) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className="w-36"
              placeholder="Data início"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className="w-36"
              placeholder="Data fim"
            />
            <Button size="sm" asChild>
              <Link href="/service-orders/new">Nova OS</Link>
            </Button>
          </div>
        }
      />
    </>
  );
}
