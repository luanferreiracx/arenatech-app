"use client";

import { useState } from "react";
import { Plus, Edit, Trash2, Users } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/domain/empty-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import { createServiceProviderSchema, type CreateServiceProviderInput } from "@/lib/validators/operation";

export function ServiceProvidersTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const listQuery = useQuery(trpc.operation.listServiceProviders.queryOptions({}));
  const createMutation = useMutation(trpc.operation.createServiceProvider.mutationOptions());
  const updateMutation = useMutation(trpc.operation.updateServiceProvider.mutationOptions());
  const deleteMutation = useMutation(trpc.operation.deleteServiceProvider.mutationOptions());

  const form = useForm<CreateServiceProviderInput>({
    resolver: zodResolver(createServiceProviderSchema),
    defaultValues: { name: "", type: "", phone: "", email: "", isTechnician: false },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.operation.listServiceProviders.queryKey() });
  const close = () => { setShowForm(false); setEditingId(null); form.reset(); };

  const handleSubmit = (data: CreateServiceProviderInput) => {
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, ...data, active: true },
        { onSuccess: () => { toast.success("Prestador atualizado"); close(); invalidate(); }, onError: (e) => toast.error(e.message) },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => { toast.success("Prestador criado"); close(); invalidate(); }, onError: (e) => toast.error(e.message),
      });
    }
  };

  const handleEdit = (item: { id: string; name: string; type: string; phone: string | null; email: string | null; isTechnician?: boolean }) => {
    setEditingId(item.id);
    form.reset({ name: item.name, type: item.type, phone: item.phone ?? "", email: item.email ?? "", isTechnician: item.isTechnician ?? false });
    setShowForm(true);
  };

  const items = listQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Button onClick={() => { setEditingId(null); form.reset(); setShowForm(true); }}>
        <Plus className="mr-2 h-4 w-4" /> Novo Prestador
      </Button>

      {items.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum prestador" description="Cadastre prestadores de servico" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {item.name}
                    {item.isTechnician && (
                      <span className="ml-2 rounded bg-cyan-500/10 px-1.5 py-0.5 text-xs text-cyan-600 border border-cyan-500/20">Técnico</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.type} {item.phone ? `| ${item.phone}` : ""}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar prestador ${item.name}`}
                    onClick={() => handleEdit(item)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`Excluir prestador ${item.name}`}
                    onClick={() => setDeleteId(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Novo"} Prestador</DialogTitle>
            <DialogDescription>Dados do prestador de servico</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div><Label>Nome</Label><Input {...form.register("name")} /></div>
            <div><Label>Tipo</Label><Input {...form.register("type")} placeholder="Ex: Tecnico, Eletricista..." /></div>
            <div><Label>Telefone</Label><Input {...form.register("phone")} /></div>
            <div><Label>Email</Label><Input {...form.register("email")} /></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...form.register("isTechnician")} className="accent-primary" />
              É técnico (aparece no seletor de técnico responsável da OS)
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Excluir Prestador"
        description="Tem certeza?"
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate({ id: deleteId }, {
            onSuccess: () => { setDeleteId(null); invalidate(); toast.success("Excluido"); },
            onError: (e) => toast.error(e.message),
          });
        }}
        variant="destructive"
      />
    </div>
  );
}
