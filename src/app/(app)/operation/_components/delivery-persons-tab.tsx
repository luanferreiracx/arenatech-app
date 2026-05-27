"use client";

import { useState } from "react";
import { Plus, Edit, Trash2, Truck } from "lucide-react";
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
import { createDeliveryPersonSchema, type CreateDeliveryPersonInput } from "@/lib/validators/operation";

export function DeliveryPersonsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const listQuery = useQuery(trpc.operation.listDeliveryPersons.queryOptions({}));
  const createMutation = useMutation(trpc.operation.createDeliveryPerson.mutationOptions());
  const updateMutation = useMutation(trpc.operation.updateDeliveryPerson.mutationOptions());
  const deleteMutation = useMutation(trpc.operation.deleteDeliveryPerson.mutationOptions());

  const form = useForm<CreateDeliveryPersonInput>({
    resolver: zodResolver(createDeliveryPersonSchema),
    defaultValues: { name: "", phone: "", email: "" },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.operation.listDeliveryPersons.queryKey() });

  const handleSubmit = (data: CreateDeliveryPersonInput) => {
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, ...data, active: true },
        { onSuccess: () => { toast.success("Entregador atualizado"); close(); invalidate(); }, onError: (e) => toast.error(e.message) },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => { toast.success("Entregador criado"); close(); invalidate(); }, onError: (e) => toast.error(e.message),
      });
    }
  };

  const close = () => { setShowForm(false); setEditingId(null); form.reset(); };

  const handleEdit = (item: { id: string; name: string; phone: string | null; email: string | null }) => {
    setEditingId(item.id);
    form.reset({ name: item.name, phone: item.phone ?? "", email: item.email ?? "" });
    setShowForm(true);
  };

  const items = listQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Button onClick={() => { setEditingId(null); form.reset(); setShowForm(true); }}>
        <Plus className="mr-2 h-4 w-4" /> Novo Entregador
      </Button>

      {items.length === 0 ? (
        <EmptyState icon={Truck} title="Nenhum entregador" description="Cadastre seu primeiro entregador" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.phone ?? ""} {item.email ? `| ${item.email}` : ""}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar entregador ${item.name}`}
                    onClick={() => handleEdit(item)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`Excluir entregador ${item.name}`}
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
            <DialogTitle>{editingId ? "Editar" : "Novo"} Entregador</DialogTitle>
            <DialogDescription>Preencha os dados do entregador</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div><Label>Nome</Label><Input {...form.register("name")} /></div>
            <div><Label>Telefone</Label><Input {...form.register("phone")} /></div>
            <div><Label>Email</Label><Input {...form.register("email")} /></div>
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
        title="Excluir Entregador"
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
