"use client";

import { useState } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DataTable } from "@/components/domain/data-table/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createCommissionRuleSchema,
  type CreateCommissionRuleInput,
  commissionTypeLabels,
  commissionTypeValues,
  commissionRoleLabels,
  commissionRoleValues,
} from "@/lib/validators/commission";

interface RuleRow {
  id: string;
  name: string;
  type: string;
  role: string;
  ratePercent: unknown;
  fixedAmount: unknown;
  active: boolean;
}

function formatMoney(value: unknown): string {
  const num = Number(value);
  if (!num) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RulesTable() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data, refetch } = useQuery(
    trpc.commissions.listRules.queryOptions({ page, pageSize: 50 }),
  );

  const form = useForm<CreateCommissionRuleInput>({
    resolver: zodResolver(createCommissionRuleSchema),
    defaultValues: {
      name: "",
      type: "SALE",
      role: "seller",
      ratePercent: 0,
      active: true,
    },
  });

  const createMutation = useMutation(
    trpc.commissions.createRule.mutationOptions({
      onSuccess: () => {
        toast.success("Regra criada.");
        setIsDialogOpen(false);
        form.reset();
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.commissions.updateRule.mutationOptions({
      onSuccess: () => {
        toast.success("Regra atualizada.");
        setIsDialogOpen(false);
        setEditingRule(null);
        form.reset();
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.commissions.deleteRule.mutationOptions({
      onSuccess: () => {
        toast.success("Regra removida.");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function openCreate() {
    setEditingRule(null);
    form.reset({ name: "", type: "SALE", role: "seller", ratePercent: 0, active: true });
    setIsDialogOpen(true);
  }

  function openEdit(rule: RuleRow) {
    setEditingRule(rule);
    form.reset({
      name: rule.name,
      type: rule.type as CreateCommissionRuleInput["type"],
      role: rule.role as CreateCommissionRuleInput["role"],
      ratePercent: Number(rule.ratePercent),
      fixedAmount: rule.fixedAmount ? Number(rule.fixedAmount) : undefined,
      active: rule.active,
    });
    setIsDialogOpen(true);
  }

  function onSubmit(values: CreateCommissionRuleInput) {
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...values });
    } else {
      createMutation.mutate(values);
    }
  }

  const columns: ColumnDef<RuleRow>[] = [
    { accessorKey: "name", header: "Nome" },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => commissionTypeLabels[row.getValue("type") as string] ?? row.getValue("type"),
    },
    {
      accessorKey: "role",
      header: "Função",
      cell: ({ row }) => commissionRoleLabels[row.getValue("role") as string] ?? row.getValue("role"),
    },
    {
      accessorKey: "ratePercent",
      header: "Percentual",
      cell: ({ row }) => `${Number(row.getValue("ratePercent"))}%`,
    },
    {
      accessorKey: "fixedAmount",
      header: "Valor Fixo",
      cell: ({ row }) => formatMoney(row.getValue("fixedAmount")),
    },
    {
      accessorKey: "active",
      header: "Ativo",
      cell: ({ row }) => (
        <Badge variant={row.getValue("active") ? "default" : "secondary"}>
          {row.getValue("active") ? "Sim" : "Não"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => setDeleteId(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <DataTable
        columns={columns}
        data={(data?.items as RuleRow[]) ?? []}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={50}
        onPageChange={setPage}
        toolbar={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Regra
          </Button>
        }
        emptyMessage="Nenhuma regra de comissão cadastrada."
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar Regra" : "Nova Regra de Comissão"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select
                  value={form.watch("type")}
                  onValueChange={(v) => form.setValue("type", v as CreateCommissionRuleInput["type"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {commissionTypeValues.map((t) => (
                      <SelectItem key={t} value={t}>
                        {commissionTypeLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Função</Label>
                <Select
                  value={form.watch("role")}
                  onValueChange={(v) => form.setValue("role", v as CreateCommissionRuleInput["role"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {commissionRoleValues.map((r) => (
                      <SelectItem key={r} value={r}>
                        {commissionRoleLabels[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ratePercent">Percentual (%)</Label>
                <Input
                  id="ratePercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  {...form.register("ratePercent", { valueAsNumber: true })}
                />
                {form.formState.errors.ratePercent && (
                  <p className="text-sm text-destructive">{form.formState.errors.ratePercent.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fixedAmount">Valor Fixo (R$)</Label>
                <Input
                  id="fixedAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("fixedAmount", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={form.watch("active")}
                onCheckedChange={(v) => form.setValue("active", v)}
              />
              <Label htmlFor="active">Ativo</Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : editingRule ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remover regra"
        description="Tem certeza que deseja remover esta regra? As comissões já calculadas não serão afetadas."
        variant="destructive"
        confirmLabel="Remover"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
