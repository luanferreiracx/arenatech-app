"use client";

import { useState } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Eye, Trash2, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
  INTEREST_STATUS_LABELS,
  INTEREST_TYPE_LABELS,
  type InterestStatusValue,
  type InterestTypeValue,
} from "@/lib/validators/customer";

export default function InterestsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InterestStatusValue | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<InterestTypeValue | "ALL">("ALL");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const { data, isLoading } = useQuery(
    trpc.interest.list.queryOptions({
      search: search || undefined,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      type: typeFilter !== "ALL" ? typeFilter : undefined,
      page,
      pageSize: 20,
    }),
  );

  // B2: taxa de conversão do funil (independe dos filtros da listagem).
  const { data: conversion } = useQuery(trpc.interest.conversionStats.queryOptions({}));

  const deleteMutation = useMutation(
    trpc.interest.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Interesse excluído");
        void queryClient.invalidateQueries({ queryKey: trpc.interest.list.queryKey() });
        setDeleteId(null);
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }),
  );

  const interests = data?.data ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Interesses"
        actions={
          <Button asChild>
            <Link href="/interests/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo interesse
            </Link>
          </Button>
        }
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-6">
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{stats.total}</div><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-yellow-600">{stats.waiting}</div><p className="text-xs text-muted-foreground">Em espera</p></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-blue-600">{stats.contacted}</div><p className="text-xs text-muted-foreground">Contatados</p></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-green-600">{stats.completed}</div><p className="text-xs text-muted-foreground">Finalizados</p></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-600">{stats.cancelled}</div><p className="text-xs text-muted-foreground">Cancelados</p></CardContent></Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-emerald-600">
                {conversion ? `${conversion.conversionRate}%` : "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                Conversão{conversion ? ` (${conversion.converted}/${conversion.total})` : ""}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por nome, telefone, modelo..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="w-64"
        />
        <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v as InterestStatusValue | "ALL"); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {Object.entries(INTEREST_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v: string) => { setTypeFilter(v as InterestTypeValue | "ALL"); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {Object.entries(INTEREST_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {interests.length === 0 && !isLoading ? (
        <EmptyState
          title="Nenhum interesse encontrado"
          description="Cadastre um novo interesse para começar."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interests.map((interest) => (
                <TableRow key={interest.id}>
                  <TableCell className="font-medium">{interest.customerName}</TableCell>
                  <TableCell>{interest.phone ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge variant="default">{INTEREST_TYPE_LABELS[interest.type] ?? interest.type}</StatusBadge>
                  </TableCell>
                  <TableCell>{interest.desiredModel ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge variant="default">{INTEREST_STATUS_LABELS[interest.status] ?? interest.status}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(interest.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" asChild aria-label="Ver detalhes do interesse">
                        <Link href={`/interests/${interest.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir interesse"
                        onClick={() => setDeleteId(interest.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Excluir interesse"
        description="Isso excluirá permanentemente o interesse e todas as interações."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        variant="destructive"
      />

      {/* Pagination */}
      {data && data.pageCount > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            Página {page + 1} de {data.pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.pageCount - 1} onClick={() => setPage(page + 1)}>
            Próximo
          </Button>
        </div>
      )}
    </div>
  );
}
