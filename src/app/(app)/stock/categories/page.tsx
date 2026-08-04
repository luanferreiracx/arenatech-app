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

/** Máximo que o schema aceita — mantém a lista inteira visível na prática. */
const CATEGORIES_PAGE_SIZE = 100;

export default function CategoriesPage() {
  const trpc = useTRPC();
  const isAdmin = useIsTenantAdmin();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // O servidor pagina em 50 por padrão e a tela não tinha controle de página:
  // a categoria 51 existia no banco e era INALCANÇÁVEL pela UI. Pede o máximo
  // permitido e avisa quando ainda houver mais — silenciar seria repetir o bug.
  // Auditoria de frontend 2026-08-04, P1-11.
  const [page, setPage] = useState(0);
  const listQuery = useQuery(
    trpc.stock.listCategories.queryOptions({ page, pageSize: CATEGORIES_PAGE_SIZE }),
  );

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
        setDeleteTarget(null);
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
                              onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}
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

          {/* Paginação só aparece quando existe mais de uma página. Sem isto,
              a categoria além da 100ª ficava invisível E inalcançável. */}
          {(listQuery.data?.pageCount ?? 0) > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">
                Pagina {page + 1} de {listQuery.data?.pageCount}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= (listQuery.data?.pageCount ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Proxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir categoria?"
        // Antes era anônima ("Esta acao nao pode ser desfeita") e ainda
        // MENTIA: o servidor faz soft delete, então é recuperável. Confirmação
        // que não diz o QUE vai sumir não é proteção — o operador clica no
        // automático. Auditoria de frontend 2026-08-04.
        description={
          deleteTarget
            ? `A categoria "${deleteTarget.name}" sai das listas e dos filtros. Os produtos que a usam nao sao excluidos — ficam sem categoria.`
            : ""
        }
        variant="destructive"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
