"use client";

import { useState } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/domain/data-table/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createExternalLabSchema,
  type CreateExternalLabInput,
} from "@/lib/validators/operation";

interface LabRow {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  notes: string | null;
}

export function LabsTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<LabRow | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data, refetch } = useQuery(
    trpc.operation.listExternalLabs.queryOptions({
      page,
      pageSize: 50,
      search: search || undefined,
    }),
  );

  const form = useForm<CreateExternalLabInput>({
    resolver: zodResolver(createExternalLabSchema),
    defaultValues: { name: "", contact: "", phone: "", email: "", active: true, notes: "" },
  });

  const createMutation = useMutation(
    trpc.operation.createExternalLab.mutationOptions({
      onSuccess: () => {
        toast.success("Laboratório criado!");
        setIsDialogOpen(false);
        form.reset();
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.operation.updateExternalLab.mutationOptions({
      onSuccess: () => {
        toast.success("Laboratório atualizado!");
        setIsDialogOpen(false);
        setEditingItem(null);
        form.reset();
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.operation.deleteExternalLab.mutationOptions({
      onSuccess: () => {
        toast.success("Laboratório removido!");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function openCreate() {
    setEditingItem(null);
    form.reset({ name: "", contact: "", phone: "", email: "", active: true, notes: "" });
    setIsDialogOpen(true);
  }

  function openEdit(row: LabRow) {
    setEditingItem(row);
    form.reset({
      name: row.name,
      contact: row.contact ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      active: row.active,
      notes: row.notes ?? "",
    });
    setIsDialogOpen(true);
  }

  function onSubmit(values: CreateExternalLabInput) {
    const cleaned = {
      ...values,
      contact: values.contact || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      notes: values.notes || undefined,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, ...cleaned });
    } else {
      createMutation.mutate(cleaned);
    }
  }

  const columns: ColumnDef<LabRow>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "contact", header: "Contato", cell: ({ row }) => row.original.contact ?? "—" },
    { accessorKey: "phone", header: "Telefone", cell: ({ row }) => row.original.phone ?? "—" },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "default" : "secondary"}>
          {row.original.active ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <Button size="icon" variant="ghost" onClick={() => openEdit(row.original)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setDeleteId(row.original.id)}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar laboratório..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Novo Laboratório
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={(data?.items as LabRow[]) ?? []}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={50}
        onPageChange={setPage}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar Laboratório" : "Novo Laboratório"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="contact">Pessoa de contato</Label>
              <Input id="contact" {...form.register("contact")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" {...form.register("phone")} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" {...form.register("notes")} />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={form.watch("active")}
                onCheckedChange={(v) => form.setValue("active", v)}
              />
              <Label htmlFor="active">Ativo</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Remover laboratório?"
        description="O laboratório será desativado e não aparecerá mais nas listagens."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </>
  );
}
