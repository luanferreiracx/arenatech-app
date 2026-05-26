"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";

interface ServiceObservation {
  id: string;
  title: string;
  observation: string;
  active: boolean;
}

/**
 * Gerenciador de observacoes que sao concatenadas no orcamento de servico
 * enviado via WhatsApp. Paridade Laravel ServicoController:498-616.
 */
export function ServiceObservationsManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceObservation | null>(null);
  const [title, setTitle] = useState("");
  const [observation, setObservation] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const listQuery = useQuery(trpc.catalog.listServiceObservations.queryOptions({}));
  const list = (listQuery.data ?? []) as ServiceObservation[];

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.catalog.listServiceObservations.queryKey(),
    });

  const createMut = useMutation(
    trpc.catalog.createServiceObservation.mutationOptions({
      onSuccess: () => {
        toast.success("Observacao criada.");
        setDialogOpen(false);
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const updateMut = useMutation(
    trpc.catalog.updateServiceObservation.mutationOptions({
      onSuccess: () => {
        toast.success("Observacao atualizada.");
        setDialogOpen(false);
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const toggleMut = useMutation(
    trpc.catalog.toggleServiceObservation.mutationOptions({
      onSuccess: () => {
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const deleteMut = useMutation(
    trpc.catalog.deleteServiceObservation.mutationOptions({
      onSuccess: () => {
        toast.success("Observacao excluida.");
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  function openCreate() {
    setEditing(null);
    setTitle("");
    setObservation("");
    setDialogOpen(true);
  }

  function openEdit(obs: ServiceObservation) {
    setEditing(obs);
    setTitle(obs.title);
    setObservation(obs.observation);
    setDialogOpen(true);
  }

  function save() {
    if (!title.trim() || !observation.trim()) {
      toast.error("Preencha titulo e observacao.");
      return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, title, observation });
    } else {
      createMut.mutate({ title, observation });
    }
  }

  return (
    <div className="rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Observacoes do Orcamento</h3>
          <p className="text-sm text-muted-foreground">
            Textos incluidos automaticamente nos orcamentos de servico enviados via WhatsApp.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Nova Observacao
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">
          Nenhuma observacao cadastrada.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-4">Titulo</th>
                <th className="py-2 pr-4">Texto</th>
                <th className="py-2 pr-4 w-24 text-center">Ativa</th>
                <th className="py-2 pr-4 w-24 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((obs) => (
                <tr key={obs.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-4 font-medium">{obs.title}</td>
                  <td className="py-2 pr-4 text-muted-foreground max-w-md truncate">
                    {obs.observation}
                  </td>
                  <td className="py-2 pr-4 text-center">
                    <Switch
                      checked={obs.active}
                      onCheckedChange={() => toggleMut.mutate({ id: obs.id })}
                    />
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(obs)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={`Excluir observacao ${obs.title}`}
                      onClick={() => setConfirmDelete({ id: obs.id, title: obs.title })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar observacao" : "Nova observacao"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titulo *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Garantia de 90 dias"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto da observacao *</Label>
              <Textarea
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Texto que aparece no orcamento WhatsApp."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={confirmDelete ? `Excluir observacao "${confirmDelete.title}"?` : ""}
        description="A observacao sera removida e nao podera ser usada em novas OS."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) {
            deleteMut.mutate({ id: confirmDelete.id });
            setConfirmDelete(null);
          }
        }}
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
