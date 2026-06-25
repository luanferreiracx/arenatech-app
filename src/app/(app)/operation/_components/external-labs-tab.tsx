"use client";

import { useState } from "react";
import { Plus, Edit, Trash2, Building2 } from "lucide-react";
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
import { createExternalLabSchema, type CreateExternalLabInput } from "@/lib/validators/operation";

export function ExternalLabsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const listQuery = useQuery(trpc.operation.listExternalLabs.queryOptions({}));
  const createMutation = useMutation(trpc.operation.createExternalLab.mutationOptions());
  const updateMutation = useMutation(trpc.operation.updateExternalLab.mutationOptions());
  const deleteMutation = useMutation(trpc.operation.deleteExternalLab.mutationOptions());

  const form = useForm<CreateExternalLabInput>({
    resolver: zodResolver(createExternalLabSchema),
    defaultValues: { name: "", contact: "", phone: "" },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.operation.listExternalLabs.queryKey() });
  const close = () => { setShowForm(false); setEditingId(null); form.reset(); };

  const handleSubmit = (data: CreateExternalLabInput) => {
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, ...data, active: true },
        { onSuccess: () => { toast.success("Laboratorio atualizado"); close(); invalidate(); }, onError: (e) => toast.error(e.message) },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => { toast.success("Laboratorio criado"); close(); invalidate(); }, onError: (e) => toast.error(e.message),
      });
    }
  };

  const handleEdit = (item: { id: string; name: string; contact: string | null; phone: string | null }) => {
    setEditingId(item.id);
    form.reset({ name: item.name, contact: item.contact ?? "", phone: item.phone ?? "" });
    setShowForm(true);
  };

  const items = listQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Button onClick={() => { setEditingId(null); form.reset(); setShowForm(true); }}>
        <Plus className="mr-2 h-4 w-4" /> Novo Laboratorio
      </Button>

      {items.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhum laboratorio" description="Cadastre o primeiro laboratorio externo" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.contact ?? ""} {item.phone ? `| ${item.phone}` : ""}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar laboratorio ${item.name}`}
                    onClick={() => handleEdit(item)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`Excluir laboratorio ${item.name}`}
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
            <DialogTitle>{editingId ? "Editar" : "Novo"} Laboratorio</DialogTitle>
            <DialogDescription>Dados do laboratorio externo</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div><Label>Local</Label><Input {...form.register("name")} placeholder="Nome do laboratorio" /></div>
            <div><Label>Responsavel</Label><Input {...form.register("contact")} placeholder="Pessoa de contato" /></div>
            <div><Label>WhatsApp</Label><Input {...form.register("phone")} placeholder="(00) 00000-0000" inputMode="tel" /></div>
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
        title="Excluir Laboratorio"
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
