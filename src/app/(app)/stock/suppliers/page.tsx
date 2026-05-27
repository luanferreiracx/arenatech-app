"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";

export default function SuppliersPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const listQuery = useQuery(
    trpc.stock.listSuppliers.queryOptions({
      search: search || undefined,
      active: status === "all" ? undefined : status === "active",
      page,
      pageSize: 20,
    }),
  );

  const deleteMutation = useMutation(
    trpc.stock.deleteSupplier.mutationOptions({
      onSuccess: () => {
        toast.success("Fornecedor excluido");
        queryClient.invalidateQueries({ queryKey: trpc.stock.listSuppliers.queryKey() });
        setDeleteId(null);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        subtitle="Gerencie seus fornecedores"
        actions={
          <Button asChild>
            <Link href="/stock/suppliers/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Fornecedor
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar fornecedor..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : !listQuery.data?.data.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum fornecedor encontrado</p>
              <Button asChild className="mt-3">
                <Link href="/stock/suppliers/new">Cadastrar primeiro fornecedor</Link>
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.data.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{supplier.tradeName || supplier.name}</span>
                          {supplier.tradeName && supplier.name !== supplier.tradeName && (
                            <span className="text-xs text-muted-foreground block">{supplier.name}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{supplier.cpf || supplier.cnpj || "-"}</TableCell>
                      <TableCell>{supplier.phone || "-"}</TableCell>
                      <TableCell>{supplier.email || "-"}</TableCell>
                      <TableCell>
                        <StatusBadge variant={supplier.active ? "success" : "default"}>
                          {supplier.active ? "Ativo" : "Inativo"}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ver detalhes de ${supplier.name}`}
                            onClick={() => router.push(`/stock/suppliers/${supplier.id}`)}
                            title="Detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${supplier.name}`}
                            onClick={() => router.push(`/stock/suppliers/${supplier.id}/edit`)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Excluir ${supplier.name}`}
                            onClick={() => setDeleteId(supplier.id)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {(listQuery.data.pageCount ?? 0) > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    {listQuery.data.total} fornecedor(es)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= (listQuery.data.pageCount ?? 1) - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Proximo
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir fornecedor?"
        description="Esta acao nao pode ser desfeita."
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
