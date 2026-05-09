"use client";

import { useState } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/domain/data-table/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createPlanSchema,
  type CreatePlanInput,
  planStatusValues,
  planStatusLabels,
} from "@/lib/validators/admin";

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPrice: unknown;
  yearlyPrice: unknown;
  maxUsers: number;
  maxImeiQueries: number;
  status: string;
}

function formatMoney(value: unknown): string {
  const num = Number(value);
  if (!num) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PlansTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<PlanRow | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data, refetch } = useQuery(
    trpc.admin.listPlans.queryOptions({ page, pageSize: 50 }),
  );

  const form = useForm<CreatePlanInput>({
    resolver: zodResolver(createPlanSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      monthlyPrice: 0,
      maxUsers: 5,
      maxImeiQueries: 50,
      status: "ACTIVE",
    },
  });

  const createMutation = useMutation(
    trpc.admin.createPlan.mutationOptions({
      onSuccess: () => {
        toast.success("Plano criado!");
        setIsDialogOpen(false);
        form.reset();
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.admin.updatePlan.mutationOptions({
      onSuccess: () => {
        toast.success("Plano atualizado!");
        setIsDialogOpen(false);
        setEditingItem(null);
        form.reset();
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.admin.deletePlan.mutationOptions({
      onSuccess: () => {
        toast.success("Plano desativado!");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function openCreate() {
    setEditingItem(null);
    form.reset({
      name: "",
      slug: "",
      description: "",
      monthlyPrice: 0,
      maxUsers: 5,
      maxImeiQueries: 50,
      status: "ACTIVE",
    });
    setIsDialogOpen(true);
  }

  function openEdit(row: PlanRow) {
    setEditingItem(row);
    form.reset({
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      monthlyPrice: Number(row.monthlyPrice),
      yearlyPrice: row.yearlyPrice ? Number(row.yearlyPrice) : undefined,
      maxUsers: row.maxUsers,
      maxImeiQueries: row.maxImeiQueries,
      status: row.status as typeof planStatusValues[number],
    });
    setIsDialogOpen(true);
  }

  function onSubmit(values: CreatePlanInput) {
    const cleaned = {
      ...values,
      description: values.description || undefined,
      yearlyPrice: values.yearlyPrice ?? undefined,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, ...cleaned });
    } else {
      createMutation.mutate(cleaned);
    }
  }

  const columns: ColumnDef<PlanRow>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "slug", header: "Slug" },
    {
      accessorKey: "monthlyPrice",
      header: "Mensal",
      cell: ({ row }) => formatMoney(row.original.monthlyPrice),
    },
    {
      accessorKey: "yearlyPrice",
      header: "Anual",
      cell: ({ row }) => formatMoney(row.original.yearlyPrice),
    },
    { accessorKey: "maxUsers", header: "Max Users" },
    { accessorKey: "maxImeiQueries", header: "Max IMEI" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "ACTIVE" ? "default" : "secondary"}>
          {planStatusLabels[row.original.status] ?? row.original.status}
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
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Novo Plano
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={(data?.items as PlanRow[]) ?? []}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={50}
        onPageChange={setPage}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar Plano" : "Novo Plano"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="slug">Slug *</Label>
                <Input id="slug" {...form.register("slug")} />
                {form.formState.errors.slug && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.slug.message}</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="description">Descricao</Label>
              <Textarea id="description" {...form.register("description")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="monthlyPrice">Preco Mensal (R$) *</Label>
                <Input
                  id="monthlyPrice"
                  type="number"
                  step="0.01"
                  {...form.register("monthlyPrice", { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label htmlFor="yearlyPrice">Preco Anual (R$)</Label>
                <Input
                  id="yearlyPrice"
                  type="number"
                  step="0.01"
                  {...form.register("yearlyPrice", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxUsers">Max Usuarios</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  {...form.register("maxUsers", { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label htmlFor="maxImeiQueries">Max Consultas IMEI</Label>
                <Input
                  id="maxImeiQueries"
                  type="number"
                  {...form.register("maxImeiQueries", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v as typeof planStatusValues[number])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {planStatusValues.map((s) => (
                    <SelectItem key={s} value={s}>
                      {planStatusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        title="Desativar plano?"
        description="O plano sera marcado como INATIVO. Nenhum dado sera perdido."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </>
  );
}
