"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, FolderOpen } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

export function DeviceCategoriesList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: categories, isLoading } = useQuery(
    trpc.catalog.listDeviceCategories.queryOptions(),
  );

  const createMutation = useMutation(
    trpc.catalog.createDeviceCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria criada com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        setNewName("");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.catalog.updateDeviceCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria atualizada com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        setEditingId(null);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.catalog.deleteDeviceCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria excluida com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["catalog"]] });
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createMutation.mutate({ name: trimmed });
  }

  function handleUpdate(id: string) {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    updateMutation.mutate({ id, name: trimmed });
  }

  function startEditing(id: string, name: string) {
    setEditingId(id);
    setEditingName(name);
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add new category */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome da nova categoria..."
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <Button
          onClick={handleCreate}
          disabled={createMutation.isPending || !newName.trim()}
        >
          Adicionar
        </Button>
      </div>

      {/* Categories list */}
      {!categories || categories.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Nenhuma categoria cadastrada"
          description="Adicione uma categoria acima para comecar."
        />
      ) : (
        <div className="rounded-md border border-border divide-y divide-border">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
              {editingId === cat.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(cat.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleUpdate(cat.id)}
                    disabled={updateMutation.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">{cat.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {cat._count.devices} aparelho(s)
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => startEditing(cat.id, cat.name)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteTarget(cat.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir Categoria"
        description="Tem certeza que deseja excluir esta categoria? Ela nao pode ter aparelhos vinculados."
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget });
        }}
      />
    </div>
  );
}
