"use client";

import { useState } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  Plus,
  Eye,
  Trash2,
  Clock,
  Phone,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import {
  INTEREST_STATUS_LABELS,
  INTEREST_TYPE_LABELS,
} from "@/lib/validators/customer";
import { toast } from "@/lib/toast";
import type { InterestStatus, InterestType } from "@/lib/validators/customer";

const STATUS_COLORS: Record<string, string> = {
  WAITING: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  CONTACTED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  FINISHED: "bg-green-500/10 text-green-500 border-green-500/20",
  CANCELLED: "bg-red-500/10 text-red-500 border-red-500/20",
};

const TYPE_COLORS: Record<string, string> = {
  PURCHASE: "text-blue-400",
  SALE: "text-green-400",
  TRADE: "text-purple-400",
  REPAIR: "text-orange-400",
};

export default function InterestsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: stats } = useQuery(trpc.interest.stats.queryOptions());
  const { data, isLoading } = useQuery(
    trpc.interest.list.queryOptions({
      search: search || undefined,
      status: (statusFilter || undefined) as InterestStatus | undefined,
      interestType: (typeFilter || undefined) as InterestType | undefined,
      pageSize: 50,
    })
  );

  const deleteMutation = useMutation(
    trpc.interest.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Interesse excluido");
        queryClient.invalidateQueries({ queryKey: [["interest"]] });
        setDeleteTarget(null);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const interests = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interesses de Clientes"
        subtitle="Gerencie interesses e acompanhamentos"
        actions={
          <Button asChild>
            <Link href="/interests/new">
              <Plus className="w-4 h-4 mr-2" />
              Novo Interesse
            </Link>
          </Button>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Heart className="h-8 w-8 text-blue-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Em Espera</p>
                <p className="text-2xl font-bold">{stats.waiting}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Phone className="h-8 w-8 text-blue-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Contatados</p>
                <p className="text-2xl font-bold">{stats.contacted}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Finalizados</p>
                <p className="text-2xl font-bold">{stats.finished}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Cancelados</p>
                <p className="text-2xl font-bold">{stats.cancelled}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          placeholder="Buscar por nome, produto, telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(INTEREST_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(INTEREST_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState />
      ) : interests.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nenhum interesse encontrado"
          description="Cadastre um novo interesse para acompanhar."
          action={
            <Button asChild>
              <Link href="/interests/new">
                <Plus className="w-4 h-4 mr-2" />
                Novo Interesse
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{data?.total ?? 0} interesses</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interests.map((interest: Record<string, unknown>) => {
                  const customer = interest.customer as { id: string; name: string; phone: string | null } | null;
                  const status = interest.status as string;
                  const type = interest.interestType as string;
                  return (
                    <TableRow key={interest.id as string}>
                      <TableCell className="font-medium">
                        {customer?.name ?? "-"}
                      </TableCell>
                      <TableCell className="text-green-400 text-sm">
                        {customer?.phone ?? "-"}
                      </TableCell>
                      <TableCell>
                        <span className={TYPE_COLORS[type] ?? ""}>
                          {INTEREST_TYPE_LABELS[type] ?? type}
                        </span>
                      </TableCell>
                      <TableCell>{(interest.product as string) ?? (interest.description as string)?.slice(0, 40)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>
                          {INTEREST_STATUS_LABELS[status] ?? status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(interest.createdAt as string).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/interests/${interest.id}`}>
                              <Eye className="w-4 h-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget({ id: interest.id as string, name: customer?.name ?? "" })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir interesse?"
        description={`O interesse de '${deleteTarget?.name ?? ""}' sera excluido.`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id });
        }}
      />
    </div>
  );
}
