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
  deviceBrand: string | null;
  deviceModel: string | null;
  totalAmount: unknown;
  entryDate: Date | string;
  customer: { id: string; name: string; cpf: string | null } | null;
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
  const [page, setPage] = useState(0);

  const { data: stats } = useQuery(trpc.serviceOrders.stats.queryOptions());

  const { data } = useQuery(
    trpc.serviceOrders.list.queryOptions({
      search: search || undefined,
      status: status === "all" ? undefined : (status as ServiceOrderStatusValue),
      page,
      pageSize: 20,
    }),
  );

  const columns: ColumnDef<OrderRow>[] = [
    {
      accessorKey: "number",
      header: "N. OS",
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
      id: "customer",
      header: "Cliente",
      cell: ({ row }) => row.original.customer?.name ?? "—",
    },
    {
      id: "device",
      header: "Equipamento",
      cell: ({ row }) => {
        const brand = row.original.deviceBrand;
        const model = row.original.deviceModel;
        if (!brand && !model) return "—";
        return [brand, model].filter(Boolean).join(" ");
      },
    },
    {
      id: "technician",
      header: "Técnico",
      cell: ({ row }) => row.original.technician?.name ?? "—",
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
              placeholder="Buscar por número, cliente, IMEI, modelo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-sm"
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-48">
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
            <Button size="sm" asChild>
              <Link href="/service-orders/new">Nova OS</Link>
            </Button>
          </div>
        }
      />
    </>
  );
}
