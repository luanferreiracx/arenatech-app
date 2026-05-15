"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Power } from "lucide-react";
import { toast } from "@/lib/toast";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface AddonForm {
  name: string;
  description: string;
  queryCount: number;
  price: number; // centavos
  validityDays: number;
  sortOrder: number;
  featured: boolean;
  active: boolean;
}

const EMPTY_FORM: AddonForm = {
  name: "",
  description: "",
  queryCount: 50,
  price: 0,
  validityDays: 30,
  sortOrder: 0,
  featured: false,
  active: true,
};

export default function AddonsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AddonForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const addonsQuery = useQuery(
    trpc.admin.listAddons.queryOptions({ activeOnly: false })
  );
  const statsQuery = useQuery(trpc.admin.addonStats.queryOptions());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [["admin"]] });
  };

  const createMutation = useMutation(
    trpc.admin.createAddon.mutationOptions({
      onSuccess: () => {
        toast.success("Addon criado!");
        setDialogOpen(false);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const updateMutation = useMutation(
    trpc.admin.updateAddon.mutationOptions({
      onSuccess: () => {
        toast.success("Addon atualizado!");
        setDialogOpen(false);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const toggleMutation = useMutation(
    trpc.admin.toggleAddon.mutationOptions({
      onSuccess: (data) => {
        toast.success(data.active ? "Addon ativado" : "Addon desativado");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const deleteMutation = useMutation(
    trpc.admin.deleteAddon.mutationOptions({
      onSuccess: () => {
        toast.success("Addon excluido!");
        setDeleteId(null);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(addon: {
    id: string;
    name: string;
    description: string | null;
    queryCount: number;
    price: number;
    validityDays: number;
    sortOrder: number;
    featured: boolean;
    active: boolean;
  }) {
    setEditId(addon.id);
    setForm({
      name: addon.name,
      description: addon.description ?? "",
      queryCount: addon.queryCount,
      price: addon.price,
      validityDays: addon.validityDays,
      sortOrder: addon.sortOrder,
      featured: addon.featured,
      active: addon.active,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      description: form.description || null,
      queryCount: form.queryCount,
      price: form.price,
      validityDays: form.validityDays,
      sortOrder: form.sortOrder,
      featured: form.featured,
      active: form.active,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (addonsQuery.isLoading) return <LoadingState />;

  const addons = addonsQuery.data ?? [];
  const stats = statsQuery.data;

  return (
    <div>
      <PageHeader
        title="Gestao de Addons"
        subtitle="Pacotes de consultas IMEI extras para tenants"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Addon
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats?.totalSold ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Total Vendidos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-500">
              {stats?.activeCount ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Ativos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-blue-500">
              {formatCurrency(stats?.totalRevenue ?? 0)}
            </div>
            <div className="text-sm text-muted-foreground">Receita Total</div>
          </CardContent>
        </Card>
      </div>

      {addons.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              title="Nenhum addon cadastrado"
              description='Clique em "Novo Addon" para criar o primeiro pacote de consultas IMEI.'
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Ordem</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center">Consultas</TableHead>
                  <TableHead className="text-right">Preco</TableHead>
                  <TableHead className="text-center">Validade</TableHead>
                  <TableHead className="text-center">Vendas</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addons.map((addon) => (
                  <TableRow key={addon.id}>
                    <TableCell className="text-center">
                      {addon.sortOrder}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {addon.name}
                        {addon.featured && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Destaque
                          </Badge>
                        )}
                      </div>
                      {addon.description && (
                        <div className="text-xs text-muted-foreground">
                          {addon.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {addon.queryCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(addon.price)}
                    </TableCell>
                    <TableCell className="text-center">
                      {addon.validityDays} dias
                    </TableCell>
                    <TableCell className="text-center">
                      {addon.purchaseCount}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={addon.active ? "default" : "secondary"}
                      >
                        {addon.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(addon)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleMutation.mutate({ id: addon.id })}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteId(addon.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editId ? "Editar Addon" : "Novo Addon"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Descricao</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Qtd. Consultas</Label>
                <Input
                  type="number"
                  value={form.queryCount}
                  onChange={(e) =>
                    setForm({ ...form, queryCount: parseInt(e.target.value) || 0 })
                  }
                  min={1}
                  required
                />
              </div>
              <div>
                <Label>Preco (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(form.price / 100).toFixed(2)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      price: Math.round(parseFloat(e.target.value || "0") * 100),
                    })
                  }
                  min={0}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Validade (dias)</Label>
                <Input
                  type="number"
                  value={form.validityDays}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      validityDays: parseInt(e.target.value) || 0,
                    })
                  }
                  min={1}
                  max={730}
                  required
                />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sortOrder: parseInt(e.target.value) || 0,
                    })
                  }
                  min={0}
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.featured}
                  onCheckedChange={(v) => setForm({ ...form, featured: v })}
                />
                <Label>Destaque</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
                <Label>Ativo</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : editId ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Excluir addon?"
        description="Apenas addons sem vendas podem ser excluidos. Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
      />
    </div>
  );
}
