"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
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
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";

/**
 * Gestão de marcas do catálogo — espelha Estoque › Categorias.
 *
 * A marca virou entidade em 2026-07-13 (ProductBrand), mas nasceu sem tela: dava
 * para criar uma marca de raspão no cadastro de produto e nunca mais renomeá-la
 * ou apagá-la. Aqui o dono lista, renomeia e exclui — exclusão só de marca sem
 * produto vinculado, igual às categorias.
 */
export default function BrandsPage() {
  const trpc = useTRPC();
  const isAdmin = useIsTenantAdmin();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const listQuery = useQuery(trpc.stock.listBrands.queryOptions({}));

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.stock.listBrands.queryKey() });

  const createMutation = useMutation(
    trpc.stock.createBrand.mutationOptions({
      onSuccess: () => {
        toast.success("Marca criada");
        setNewName("");
        setIsAdding(false);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.stock.updateBrand.mutationOptions({
      onSuccess: () => {
        toast.success("Marca atualizada");
        setEditId(null);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.stock.deleteBrand.mutationOptions({
      onSuccess: () => {
        toast.success("Marca excluida");
        setDeleteTarget(null);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const brands = listQuery.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Marcas de Produtos"
        subtitle="Fabricantes usados no catalogo (Apple, Samsung, Xiaomi...)"
        actions={
          isAdmin && !isAdding && (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Marca
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center w-[100px]">Produtos</TableHead>
                  <TableHead className="w-[100px]">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAdding && (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nome da marca"
                        maxLength={100}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newName.trim()) {
                            createMutation.mutate({ name: newName.trim() });
                          }
                          if (e.key === "Escape") setIsAdding(false);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Confirmar criacao da marca"
                          onClick={() => newName.trim() && createMutation.mutate({ name: newName.trim() })}
                          disabled={!newName.trim() || createMutation.isPending}
                        >
                          <Check className="h-4 w-4 text-green-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cancelar criacao"
                          onClick={() => setIsAdding(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!brands.length && !isAdding ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                      Nenhuma marca cadastrada
                    </TableCell>
                  </TableRow>
                ) : (
                  brands.map((brand) => (
                    <TableRow key={brand.id}>
                      <TableCell className="max-w-0">
                        {editId === brand.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={100}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editName.trim()) {
                                updateMutation.mutate({ id: brand.id, name: editName.trim() });
                              }
                              if (e.key === "Escape") setEditId(null);
                            }}
                          />
                        ) : (
                          <span className="block truncate font-medium">{brand.name}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{brand.productCount}</TableCell>
                      <TableCell>
                        {editId === brand.id ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Salvar marca ${brand.name}`}
                              onClick={() =>
                                editName.trim() && updateMutation.mutate({ id: brand.id, name: editName.trim() })
                              }
                              disabled={!editName.trim() || updateMutation.isPending}
                            >
                              <Check className="h-4 w-4 text-green-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Cancelar edicao"
                              onClick={() => setEditId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : isAdmin ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Editar marca ${brand.name}`}
                              onClick={() => { setEditId(brand.id); setEditName(brand.name); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Excluir marca ${brand.name}`}
                              onClick={() => setDeleteTarget({ id: brand.id, name: brand.name })}
                              disabled={brand.productCount > 0}
                              title={brand.productCount > 0 ? "Marca com produtos vinculados" : "Excluir"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir marca?"
        // Antes era anônima e ainda MENTIA: o servidor faz soft delete, então
        // é recuperável. Confirmação que não diz O QUE vai sumir não é
        // proteção. Auditoria de frontend 2026-08-04.
        description={
          deleteTarget
            ? `A marca "${deleteTarget.name}" sai das listas e dos filtros. Os produtos que a usam nao sao excluidos — ficam sem marca.`
            : ""
        }
        variant="destructive"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
