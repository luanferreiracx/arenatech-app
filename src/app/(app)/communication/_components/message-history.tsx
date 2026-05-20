"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { DataTable } from "@/components/domain/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_STATUS_LABELS,
  MESSAGE_STATUS_VARIANT,
} from "@/lib/validators/communication";

export function MessageHistory() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const listQuery = useQuery(
    trpc.communication.list.queryOptions({
      page,
      pageSize: 20,
      search: search || undefined,
      channel: channelFilter ? (channelFilter as "WHATSAPP" | "EMAIL") : undefined,
      status: statusFilter ? (statusFilter as "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED") : undefined,
    }),
  );

  const columns = [
    {
      accessorKey: "channel",
      header: "Canal",
      cell: ({ row }: { row: { original: { channel: string } } }) =>
        MESSAGE_CHANNEL_LABELS[row.original.channel] ?? row.original.channel,
    },
    {
      accessorKey: "recipientName",
      header: "Destinatario",
      cell: ({ row }: { row: { original: { recipientName: string | null; recipientPhone: string | null; recipientEmail: string | null } } }) =>
        row.original.recipientName ?? row.original.recipientPhone ?? row.original.recipientEmail ?? "-",
    },
    {
      accessorKey: "body",
      header: "Mensagem",
      cell: ({ row }: { row: { original: { body: string } } }) => (
        <span className="truncate max-w-xs block">{row.original.body.slice(0, 60)}...</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: { status: string } } }) => (
        <StatusBadge variant={MESSAGE_STATUS_VARIANT[row.original.status] ?? "default"}>
          {MESSAGE_STATUS_LABELS[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }: { row: { original: { createdAt: string | Date } } }) =>
        new Date(row.original.createdAt).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="max-w-sm"
        />
        <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Canal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            <SelectItem value="EMAIL">E-mail</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="SENT">Enviada</SelectItem>
            <SelectItem value="DELIVERED">Entregue</SelectItem>
            <SelectItem value="FAILED">Falhou</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listQuery.data ? (
        listQuery.data.data.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Nenhuma mensagem" description="Envie sua primeira mensagem" />
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
    </div>
  );
}
