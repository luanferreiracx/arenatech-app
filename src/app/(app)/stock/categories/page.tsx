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

export default function CategoriesPage() {
  const trpc = useTRPC();
  const isAdmin = useIsTenantAdmin();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const listQuery = useQuery(trpc.stock.listCategories.queryOptions({}));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.stock.listCategories.queryKey() });

  const createMutation = useMutation(
    trpc.stock.createCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria criada");
        setNewName("");
        setIsAdding(false);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.stock.updateCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria atualizada");
        setEditId(null);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.stock.deleteCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria excluida");
        setDeleteId(null);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div>
      <PageHeader
        title="Categorias de Produtos"
        subtitle="Organize seus produtos por categoria"
        actions={
          isAdmin && !isAdding && (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Categoria
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
                        placeholder="Nome da categoria"
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
                          aria-label="Confirmar criacao da categoria"
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

                {!listQuery.data?.data.length && !isAdding ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                      Nenhuma categoria cadastrada
                    </TableCell>
                  </TableRow>
                ) : (
                  listQuery.data?.data.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell>
                        {editId === cat.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editName.trim()) {
                                updateMutation.mutate({ id: cat.id, name: editName.trim() });
                              }
                              if (e.key === "Escape") setEditId(null);
                            }}
                          />
                        ) : (
                          <span className="font-medium">{cat.name}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {cat._count.products}
                      </TableCell>
                      <TableCell>
                        {editId === cat.id ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Salvar categoria ${cat.name}`}
                              onClick={() => editName.trim() && updateMutation.mutate({ id: cat.id, name: editName.trim() })}
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
                              aria-label={`Editar categoria ${cat.name}`}
                              onClick={() => { setEditId(cat.id); setEditName(cat.name); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Excluir categoria ${cat.name}`}
                              onClick={() => setDeleteId(cat.id)}
                              disabled={cat._count.products > 0}
                              title={cat._count.products > 0 ? "Categoria com produtos vinculados" : "Excluir"}
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
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir categoria?"
        description="Esta acao nao pode ser desfeita."
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
