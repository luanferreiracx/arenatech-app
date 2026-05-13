"use client";

import { useState } from "react";
import { Plus, Edit, Trash2, CreditCard } from "lucide-react";
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
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import { createPlanSchema, type CreatePlanInput } from "@/lib/validators/admin";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PlansList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const plansQuery = useQuery(trpc.admin.listPlans.queryOptions({}));
  const createMutation = useMutation(trpc.admin.createPlan.mutationOptions());
  const updateMutation = useMutation(trpc.admin.updatePlan.mutationOptions());
  const deleteMutation = useMutation(trpc.admin.deletePlan.mutationOptions());

  const form = useForm<CreatePlanInput>({
    resolver: zodResolver(createPlanSchema),
    defaultValues: { name: "", slug: "", monthlyPrice: 0, maxUsers: 5, maxImeiQueries: 50 },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.admin.listPlans.queryKey() });
  const close = () => { setShowForm(false); setEditingId(null); form.reset(); };

  const handleSubmit = (data: CreatePlanInput) => {
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, ...data, status: "ACTIVE" },
        { onSuccess: () => { toast.success("Plano atualizado"); close(); invalidate(); }, onError: (e) => toast.error(e.message) },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => { toast.success("Plano criado"); close(); invalidate(); }, onError: (e) => toast.error(e.message),
      });
    }
  };

  const handleEdit = (plan: { id: string; name: string; slug: string; monthlyPrice: number; yearlyPrice: number | null; maxUsers: number; maxImeiQueries: number; description: string | null }) => {
    setEditingId(plan.id);
    form.reset({
      name: plan.name,
      slug: plan.slug,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      maxUsers: plan.maxUsers,
      maxImeiQueries: plan.maxImeiQueries,
      description: plan.description,
    });
    setShowForm(true);
  };

  const plans = plansQuery.data ?? [];

  return (
    <div className="space-y-4 max-w-2xl">
      <Button onClick={() => { setEditingId(null); form.reset(); setShowForm(true); }}>
        <Plus className="mr-2 h-4 w-4" /> Novo Plano
      </Button>

      {plans.length === 0 ? (
        <EmptyState icon={CreditCard} title="Nenhum plano" description="Crie o primeiro plano da plataforma" />
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(plan.monthlyPrice)}/mes | {plan.maxUsers} usuarios | {plan.maxImeiQueries} consultas IMEI
                  </p>
                  {plan.description && <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(plan.id)}>
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
            <DialogTitle>{editingId ? "Editar" : "Novo"} Plano</DialogTitle>
            <DialogDescription>Configure os parametros do plano</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div><Label>Nome</Label><Input {...form.register("name")} /></div>
            {!editingId && <div><Label>Slug</Label><Input {...form.register("slug")} placeholder="basico, profissional..." /></div>}
            <div>
              <Label>Preco Mensal</Label>
              <MoneyInput value={form.watch("monthlyPrice")} onChange={(v) => form.setValue("monthlyPrice", v)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Max Usuarios</Label><Input type="number" {...form.register("maxUsers", { valueAsNumber: true })} min={1} /></div>
              <div><Label>Max Consultas IMEI</Label><Input type="number" {...form.register("maxImeiQueries", { valueAsNumber: true })} min={0} /></div>
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
        title="Excluir Plano"
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
