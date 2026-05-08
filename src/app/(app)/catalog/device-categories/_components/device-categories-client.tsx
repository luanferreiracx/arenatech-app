"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/domain/empty-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

export function DeviceCategoriesClient() {
  const trpc = useTRPC();
  const [newName, setNewName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: categories = [], refetch } = useQuery(
    trpc.catalog.listDeviceCategories.queryOptions(),
  );

  const createMutation = useMutation(
    trpc.catalog.createDeviceCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria criada!");
        setNewName("");
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.catalog.deleteDeviceCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria removida.");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim() });
  };

  return (
    <div className="space-y-4 max-w-lg">
      {/* Add form */}
      <div className="flex gap-2">
        <Input
          placeholder="Nome da categoria..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
        />
        <Button
          onClick={handleCreate}
          disabled={!newName.trim() || createMutation.isPending}
          size="sm"
        >
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria"
          description="Adicione categorias para organizar os aparelhos."
        />
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between p-3 rounded-md border border-border"
            >
              <span className="text-sm font-medium">{cat.name}</span>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive h-7 w-7"
                onClick={() => setDeleteId(cat.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remover categoria?"
        description="Os aparelhos desta categoria ficarão sem categoria. Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
