"use client";

import { useState } from "react";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/domain/empty-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import { createTemplateSchema, type CreateTemplateInput, MESSAGE_CHANNEL_LABELS } from "@/lib/validators/communication";

export function TemplatesList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const listQuery = useQuery(trpc.communication.listTemplates.queryOptions());
  const createMutation = useMutation(trpc.communication.createTemplate.mutationOptions());
  const updateMutation = useMutation(trpc.communication.updateTemplate.mutationOptions());
  const deleteMutation = useMutation(trpc.communication.deleteTemplate.mutationOptions());

  const form = useForm<CreateTemplateInput>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: { channel: "WHATSAPP", name: "", slug: "", body: "" },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.communication.listTemplates.queryKey() });
  const close = () => { setShowForm(false); setEditingId(null); form.reset(); };

  const handleSubmit = (data: CreateTemplateInput) => {
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, name: data.name, body: data.body },
        { onSuccess: () => { toast.success("Template atualizado"); close(); invalidate(); }, onError: (e) => toast.error(e.message) },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => { toast.success("Template criado"); close(); invalidate(); }, onError: (e) => toast.error(e.message),
      });
    }
  };

  const handleEdit = (item: { id: string; name: string; channel: string; slug: string; body: string }) => {
    setEditingId(item.id);
    form.reset({ channel: item.channel as "WHATSAPP" | "EMAIL", name: item.name, slug: item.slug, body: item.body });
    setShowForm(true);
  };

  const templates = listQuery.data ?? [];

  return (
    <div className="space-y-4 max-w-2xl">
      <Button onClick={() => { setEditingId(null); form.reset(); setShowForm(true); }}>
        <Plus className="mr-2 h-4 w-4" /> Novo Template
      </Button>

      {templates.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum template" description="Crie seu primeiro template de mensagem" />
      ) : (
        <div className="space-y-3">
          {templates.map((tmpl) => (
            <Card key={tmpl.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{tmpl.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {MESSAGE_CHANNEL_LABELS[tmpl.channel] ?? tmpl.channel} | {tmpl.slug}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">{tmpl.body.slice(0, 80)}...</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar template ${tmpl.name}`}
                    onClick={() => handleEdit(tmpl)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`Excluir template ${tmpl.name}`}
                    onClick={() => setDeleteId(tmpl.id)}
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
            <DialogTitle>{editingId ? "Editar" : "Novo"} Template</DialogTitle>
            <DialogDescription>Configure o modelo de mensagem</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div>
              <Label>Canal</Label>
              <Select value={form.watch("channel")} onValueChange={(v) => form.setValue("channel", v as "WHATSAPP" | "EMAIL")} disabled={!!editingId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="EMAIL">E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Nome</Label><Input {...form.register("name")} /></div>
            {!editingId && <div><Label>Slug</Label><Input {...form.register("slug")} placeholder="ex: os-concluida" /></div>}
            <div>
              <Label>Corpo</Label>
              <Textarea {...form.register("body")} rows={4} placeholder="Ola {{nome}}, sua OS {{numero}} foi concluida..." />
            </div>
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
        title="Excluir Template"
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
