"use client";

import { useState } from "react";
import { RefreshCw, MoreHorizontal, Eye } from "lucide-react";
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
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";
import {
  messageChannelLabels,
  messageStatusLabels,
  messageChannelValues,
  messageStatusValues,
} from "@/lib/validators/communication";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MessageRow {
  id: string;
  channel: string;
  direction: string;
  status: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  subject: string | null;
  body: string;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    PENDING: "warning",
    SENT: "info",
    DELIVERED: "success",
    READ: "success",
    FAILED: "destructive",
  };
  return map[status] ?? "default";
}

function getChannelVariant(channel: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    WHATSAPP: "success",
    EMAIL: "info",
    SMS: "warning",
  };
  return map[channel] ?? "default";
}

export function MessagesTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedMessage, setSelectedMessage] = useState<MessageRow | null>(null);

  const { data, refetch } = useQuery(
    trpc.communication.list.queryOptions({
      search: search || undefined,
      channel: channelFilter ? (channelFilter as (typeof messageChannelValues)[number]) : undefined,
      status: statusFilter ? (statusFilter as (typeof messageStatusValues)[number]) : undefined,
      page,
      pageSize: 20,
    }),
  );

  const resendMutation = useMutation(
    trpc.communication.resend.mutationOptions({
      onSuccess: () => {
        toast.success("Mensagem reenviada");
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const columns: ColumnDef<MessageRow>[] = [
    {
      accessorKey: "channel",
      header: "Canal",
      cell: ({ row }) => (
        <StatusBadge variant={getChannelVariant(row.original.channel)}>
          {messageChannelLabels[row.original.channel] ?? row.original.channel}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "recipientName",
      header: "Destinatário",
      cell: ({ row }) => (
        <div className="max-w-[180px]">
          <div className="truncate font-medium">
            {row.original.recipientName ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {row.original.recipientPhone ?? row.original.recipientEmail ?? ""}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "body",
      header: "Mensagem",
      cell: ({ row }) => (
        <div className="max-w-[250px] truncate text-sm text-muted-foreground">
          {row.original.subject ? `${row.original.subject}: ` : ""}
          {row.original.body}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge variant={getStatusVariant(row.original.status)}>
          {messageStatusLabels[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) =>
        new Date(row.original.createdAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSelectedMessage(row.original)}>
              <Eye className="h-4 w-4 mr-2" />
              Ver Detalhes
            </DropdownMenuItem>
            {row.original.status === "FAILED" && (
              <DropdownMenuItem onClick={() => resendMutation.mutate({ id: row.original.id })}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reenviar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          placeholder="Buscar por nome, telefone, email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <Select
          value={channelFilter}
          onValueChange={(v) => {
            setChannelFilter(v === "all" ? "" : v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {messageChannelValues.map((c) => (
              <SelectItem key={c} value={c}>
                {messageChannelLabels[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v === "all" ? "" : v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {messageStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                {messageStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as MessageRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
      />

      {/* Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da Mensagem</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Canal</span>
                <StatusBadge variant={getChannelVariant(selectedMessage.channel)}>
                  {messageChannelLabels[selectedMessage.channel] ?? selectedMessage.channel}
                </StatusBadge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge variant={getStatusVariant(selectedMessage.status)}>
                  {messageStatusLabels[selectedMessage.status] ?? selectedMessage.status}
                </StatusBadge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destinatário</span>
                <span>{selectedMessage.recipientName ?? "—"}</span>
              </div>
              {selectedMessage.recipientPhone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefone</span>
                  <span>{selectedMessage.recipientPhone}</span>
                </div>
              )}
              {selectedMessage.recipientEmail && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{selectedMessage.recipientEmail}</span>
                </div>
              )}
              {selectedMessage.subject && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assunto</span>
                  <span>{selectedMessage.subject}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Mensagem</span>
                <div className="mt-1 p-3 bg-muted rounded-md whitespace-pre-wrap text-sm">
                  {selectedMessage.body}
                </div>
              </div>
              {selectedMessage.errorMessage && (
                <div>
                  <span className="text-destructive">Erro</span>
                  <div className="mt-1 p-3 bg-destructive/10 rounded-md text-destructive text-sm">
                    {selectedMessage.errorMessage}
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Criado em</span>
                <span>{new Date(selectedMessage.createdAt).toLocaleString("pt-BR")}</span>
              </div>
              {selectedMessage.sentAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enviado em</span>
                  <span>{new Date(selectedMessage.sentAt).toLocaleString("pt-BR")}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
