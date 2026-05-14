"use client";

import { useState } from "react";
import { Plus, Copy, TrendingUp, Trash2, Pencil, Search } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/domain/empty-state";
import { DataTable } from "@/components/domain/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import { STORAGE_OPTIONS, BATTERY_HEALTH_OPTIONS } from "@/lib/validators/valuation";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ValuationsList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [modeloFilter, setModeloFilter] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [modelo, setModelo] = useState("");
  const [armazenamento, setArmazenamento] = useState("");
  const [saudeBateria, setSaudeBateria] = useState("");
  const [valor, setValor] = useState(0);
  const [adjustPercent, setAdjustPercent] = useState(0);
  const [adjustModelo, setAdjustModelo] = useState("");
  const [dupSource, setDupSource] = useState("");
  const [dupTarget, setDupTarget] = useState("");

  const modelsQuery = useQuery(trpc.valuation.listModels.queryOptions());
  const listQuery = useQuery(
    trpc.valuation.list.queryOptions({
      modelo: modeloFilter && modeloFilter !== "all" ? modeloFilter : undefined,
      pageSize: 100,
    }),
  );

  const createMutation = useMutation(trpc.valuation.create.mutationOptions());
  const updateMutation = useMutation(trpc.valuation.update.mutationOptions());
  const deleteMutation = useMutation(trpc.valuation.delete.mutationOptions());
  const adjustMutation = useMutation(trpc.valuation.bulkAdjust.mutationOptions());
  const duplicateMutation = useMutation(trpc.valuation.duplicateModel.mutationOptions());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.valuation.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.valuation.listModels.queryKey() });
  };

  const resetForm = () => {
    setModelo("");
    setArmazenamento("");
    setSaudeBateria("");
    setValor(0);
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!modelo || !armazenamento || !saudeBateria) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, modelo, armazenamento, saudeBateria, valor },
        {
          onSuccess: () => {
            toast.success("Avaliacao atualizada");
            setShowCreateDialog(false);
            resetForm();
            invalidate();
          },
          onError: (err) => toast.error(err.message),
        },
      );
    } else {
      createMutation.mutate(
        { modelo, armazenamento, saudeBateria, valor },
        {
          onSuccess: () => {
            toast.success("Avaliacao criada");
            setShowCreateDialog(false);
            resetForm();
            invalidate();
          },
          onError: (err) => toast.error(err.message),
        },
      );
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Avaliacao removida");
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleBulkAdjust = () => {
    if (!adjustModelo) {
      toast.error("Selecione um modelo");
      return;
    }
    adjustMutation.mutate(
      { modelo: adjustModelo, adjustPercent },
      {
        onSuccess: (data) => {
          toast.success(`${data.updated} precos ajustados`);
          setShowAdjustDialog(false);
          setAdjustPercent(0);
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleDuplicate = () => {
    if (!dupSource || !dupTarget) {
      toast.error("Preencha origem e destino");
      return;
    }
    duplicateMutation.mutate(
      { sourceModelo: dupSource, targetModelo: dupTarget },
      {
        onSuccess: (data) => {
          toast.success(`${data.created} avaliacoes duplicadas`);
          setShowDuplicateDialog(false);
          setDupSource("");
          setDupTarget("");
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const openEdit = (row: { id: string; modelo: string; armazenamento: string; saudeBateria: string; valor: number }) => {
    setEditingId(row.id);
    setModelo(row.modelo);
    setArmazenamento(row.armazenamento);
    setSaudeBateria(row.saudeBateria);
    setValor(row.valor);
    setShowCreateDialog(true);
  };

  if (listQuery.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Filtrar por Modelo</Label>
            <Select value={modeloFilter} onValueChange={setModeloFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os modelos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(modelsQuery.data ?? []).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Avaliacao
          </Button>
          <Button variant="outline" onClick={() => setShowAdjustDialog(true)}>
            <TrendingUp className="mr-2 h-4 w-4" />
            Ajuste em Massa
          </Button>
          <Button variant="outline" onClick={() => setShowDuplicateDialog(true)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicar Modelo
          </Button>
        </div>
      </Card>

      {/* Table */}
      {listQuery.data && listQuery.data.data.length > 0 ? (
        <DataTable
          data={listQuery.data.data}
          columns={[
            { header: "Modelo", accessorKey: "modelo" },
            { header: "Armazenamento", accessorKey: "armazenamento" },
            { header: "Saude Bateria", accessorKey: "saudeBateria" },
            {
              header: "Valor",
              accessorKey: "valor",
              cell: ({ row }) => (
                <span className="font-mono font-medium text-primary">
                  {formatCurrency(row.original.valor)}
                </span>
              ),
            },
            {
              header: "Acoes",
              id: "actions",
              cell: ({ row }) => (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(row.original)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(row.original.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      ) : (
        <EmptyState
          title="Nenhuma avaliacao cadastrada"
          description="Cadastre precos de compra de aparelhos usados"
          icon={Search}
        />
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Avaliacao" : "Nova Avaliacao"}</DialogTitle>
            <DialogDescription>Preencha os dados da avaliacao de aparelho</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modelo</Label>
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex: iPhone 13 Pro" />
            </div>
            <div>
              <Label>Armazenamento</Label>
              <Select value={armazenamento} onValueChange={setArmazenamento}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {STORAGE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Saude da Bateria</Label>
              <Select value={saudeBateria} onValueChange={setSaudeBateria}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {BATTERY_HEALTH_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor de Compra</Label>
              <MoneyInput value={valor} onChange={setValor} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Adjust Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste em Massa</DialogTitle>
            <DialogDescription>Ajuste todos os precos de um modelo por percentual</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modelo</Label>
              <Select value={adjustModelo} onValueChange={setAdjustModelo}>
                <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                <SelectContent>
                  {(modelsQuery.data ?? []).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Percentual de Ajuste (%)</Label>
              <Input
                type="number"
                value={adjustPercent}
                onChange={(e) => setAdjustPercent(Number(e.target.value))}
                placeholder="Ex: 10 para +10%, -5 para -5%"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Positivo = aumento, negativo = reducao
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkAdjust} disabled={adjustMutation.isPending}>
              Aplicar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Model Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar Modelo</DialogTitle>
            <DialogDescription>Copie toda a tabela de precos de um modelo para outro</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modelo de Origem</Label>
              <Select value={dupSource} onValueChange={setDupSource}>
                <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                <SelectContent>
                  {(modelsQuery.data ?? []).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo de Destino</Label>
              <Input
                value={dupTarget}
                onChange={(e) => setDupTarget(e.target.value)}
                placeholder="Ex: iPhone 15 Pro Max"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>Cancelar</Button>
            <Button onClick={handleDuplicate} disabled={duplicateMutation.isPending}>
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
