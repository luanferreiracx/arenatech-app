"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/domain/data-table/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createTemplateSchema,
  messageChannelValues,
  messageChannelLabels,
  type CreateTemplateInput,
} from "@/lib/validators/communication";

interface TemplateRow {
  id: string;
  channel: string;
  name: string;
  slug: string;
  body: string;
  active: boolean;
  createdAt: Date;
}

export function TemplatesManager() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.communication.listTemplates.queryOptions({
      page,
      pageSize: 20,
    }),
  );

  const form = useForm<CreateTemplateInput>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: {
      channel: "WHATSAPP",
      name: "",
      slug: "",
      body: "",
      active: true,
    },
  });

  const createMutation = useMutation(
    trpc.communication.createTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template criado");
        void refetch();
        closeForm();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.communication.updateTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template atualizado");
        void refetch();
        closeForm();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.communication.deleteTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template excluído");
        void refetch();
        setDeleteId(null);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    form.reset({
      channel: "WHATSAPP",
      name: "",
      slug: "",
      body: "",
      active: true,
    });
  }

  function openEdit(template: TemplateRow) {
    setEditId(template.id);
    form.reset({
      channel: template.channel as CreateTemplateInput["channel"],
      name: template.name,
      slug: template.slug,
      body: template.body,
      active: template.active,
    });
    setShowForm(true);
  }

  function handleSubmit(data: CreateTemplateInput) {
    if (editId) {
      updateMutation.mutate({
        id: editId,
        name: data.name,
        body: data.body,
        active: data.active,
      });
    } else {
      createMutation.mutate(data);
    }
  }

  const columns: ColumnDef<TemplateRow>[] = [
    {
      accessorKey: "name",
      header: "Nome",
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <code className="text-xs bg-muted px-1 py-0.5 rounded">
          {row.original.slug}
        </code>
      ),
    },
    {
      accessorKey: "channel",
      header: "Canal",
      cell: ({ row }) => (
        <StatusBadge variant={row.original.channel === "WHATSAPP" ? "success" : "info"}>
          {messageChannelLabels[row.original.channel] ?? row.original.channel}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "body",
      header: "Prévia",
      cell: ({ row }) => (
        <div className="max-w-[250px] truncate text-sm text-muted-foreground">
          {row.original.body}
        </div>
      ),
    },
    {
      accessorKey: "active",
      header: "Ativo",
      cell: ({ row }) => (
        <StatusBadge variant={row.original.active ? "success" : "default"}>
          {row.original.active ? "Ativo" : "Inativo"}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(row.original)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setDeleteId(row.original.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Template
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={(data?.items ?? []) as TemplateRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Template" : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input {...form.register("name")} placeholder="Ex: OS Concluída" />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input
                  {...form.register("slug")}
                  placeholder="ex: os_concluida"
                  disabled={!!editId}
                />
                {form.formState.errors.slug && (
                  <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Canal</Label>
              <Select
                value={form.watch("channel")}
                onValueChange={(v) => form.setValue("channel", v as CreateTemplateInput["channel"])}
                disabled={!!editId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {messageChannelValues
                    .filter((c) => c !== "SMS")
                    .map((c) => (
                      <SelectItem key={c} value={c}>
                        {messageChannelLabels[c]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Corpo da Mensagem *</Label>
              <Textarea
                {...form.register("body")}
                placeholder={"Olá {{nome}}, sua OS {{numero_os}} foi concluída..."}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{variavel}}"} para placeholders. Ex: {"{{nome}}"}, {"{{numero_os}}"}, {"{{status}}"}, {"{{valor}}"}
              </p>
              {form.formState.errors.body && (
                <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.watch("active")}
                onCheckedChange={(v) => form.setValue("active", v)}
              />
              <Label>Ativo</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir Template"
        description="Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita."
        variant="destructive"
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate({ id: deleteId });
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
