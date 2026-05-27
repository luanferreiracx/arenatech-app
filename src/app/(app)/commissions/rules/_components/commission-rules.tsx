"use client";

import { useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/domain/empty-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import { createRuleSchema, type CreateRuleInput, COMMISSION_TYPE_LABELS } from "@/lib/validators/commission";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CommissionRules() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const rulesQuery = useQuery(trpc.commission.listRules.queryOptions({}));
  const createMutation = useMutation(trpc.commission.createRule.mutationOptions());
  const updateMutation = useMutation(trpc.commission.updateRule.mutationOptions());
  const deleteMutation = useMutation(trpc.commission.deleteRule.mutationOptions());

  const form = useForm<CreateRuleInput>({
    resolver: zodResolver(createRuleSchema),
    defaultValues: { name: "", type: "SALE", role: "seller", ratePercent: 0 },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.commission.listRules.queryKey() });
  };

  const handleSubmit = (data: CreateRuleInput) => {
    if (editingRule) {
      updateMutation.mutate(
        { id: editingRule, ...data },
        {
          onSuccess: () => { toast.success("Regra atualizada"); setShowForm(false); setEditingRule(null); form.reset(); invalidate(); },
          onError: (err) => toast.error(err.message),
        },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => { toast.success("Regra criada"); setShowForm(false); form.reset(); invalidate(); },
        onError: (err) => toast.error(err.message),
      });
    }
  };

  const handleEdit = (rule: { id: string; name: string; type: string; role: string; ratePercent: number; fixedAmount: number | null }) => {
    setEditingRule(rule.id);
    form.reset({
      name: rule.name,
      type: rule.type as "SALE" | "SERVICE_ORDER",
      role: rule.role,
      ratePercent: rule.ratePercent,
      fixedAmount: rule.fixedAmount,
    });
    setShowForm(true);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => { toast.success("Regra excluida"); setDeleteId(null); invalidate(); },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const rules = rulesQuery.data ?? [];

  return (
    <div className="space-y-6 max-w-2xl">
      <Button onClick={() => { setEditingRule(null); form.reset(); setShowForm(true); }}>
        <Plus className="mr-2 h-4 w-4" /> Nova Regra
      </Button>

      {rules.length === 0 ? (
        <EmptyState title="Nenhuma regra" description="Crie sua primeira regra de comissao" />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {COMMISSION_TYPE_LABELS[rule.type]} | {rule.role} | {rule.ratePercent}%
                    {rule.fixedAmount ? ` + ${formatCurrency(rule.fixedAmount)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${rule.active ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}>
                    {rule.active ? "Ativa" : "Inativa"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Editar regra de comissao"
                    onClick={() => handleEdit(rule)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label="Excluir regra de comissao"
                    onClick={() => setDeleteId(rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar Regra" : "Nova Regra"}</DialogTitle>
            <DialogDescription>Configure os parametros da regra de comissao</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input {...form.register("name")} placeholder="Nome da regra" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as "SALE" | "SERVICE_ORDER")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SALE">Venda</SelectItem>
                    <SelectItem value="SERVICE_ORDER">Ordem de Servico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Papel</Label>
                <Select value={form.watch("role")} onValueChange={(v) => form.setValue("role", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">Vendedor</SelectItem>
                    <SelectItem value="technician">Tecnico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Taxa (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" {...form.register("ratePercent", { valueAsNumber: true })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Excluir Regra"
        description="Tem certeza que deseja excluir esta regra de comissao?"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}
