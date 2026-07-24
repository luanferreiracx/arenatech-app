"use client";

import { useState, useMemo } from "react";
import { Money } from "@/components/domain/money";
import {
  Plus,
  Copy,
  TrendingUp,
  Trash2,
  Pencil,
  Smartphone,
  MessageCircle,
  DollarSign,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import { STORAGE_OPTIONS, BATTERY_HEALTH_OPTIONS } from "@/lib/validators/valuation";
import { cn } from "@/lib/utils";


type ValuationRow = {
  id: string;
  modelo: string;
  armazenamento: string;
  saudeBateria: string;
  valor: number;
  validadeDias: number;
};

type ModelGroup = {
  modelo: string;
  count: number;
  storageOptions: string[];
  priceMap: Record<string, Record<string, ValuationRow>>;
};

function buildGroups(rows: ValuationRow[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();

  for (const row of rows) {
    if (!map.has(row.modelo)) {
      map.set(row.modelo, { modelo: row.modelo, count: 0, storageOptions: [], priceMap: {} });
    }
    const g = map.get(row.modelo)!;
    g.count++;
    if (!g.priceMap[row.armazenamento]) {
      g.priceMap[row.armazenamento] = {};
      g.storageOptions.push(row.armazenamento);
    }
    g.priceMap[row.armazenamento]![row.saudeBateria] = row;
  }

  for (const g of map.values()) {
    g.storageOptions.sort((a, b) => STORAGE_OPTIONS.indexOf(a) - STORAGE_OPTIONS.indexOf(b));
  }

  return Array.from(map.values()).sort((a, b) => a.modelo.localeCompare(b.modelo));
}

// ── Cell ──────────────────────────────────────────────────────────────────────

function PriceCell({
  row,
  modelo,
  armazenamento,
  saudeBateria,
  onEdit,
}: {
  row: ValuationRow | undefined;
  modelo: string;
  armazenamento: string;
  saudeBateria: string;
  onEdit: (cell: { id: string | null; modelo: string; armazenamento: string; saudeBateria: string; valor: number; validadeDias: number | undefined }) => void;
}) {
  if (row) {
    return (
      <button
        className="group relative w-full rounded-md px-2 py-2 text-center font-mono text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
        onClick={() => onEdit({ id: row.id, modelo, armazenamento, saudeBateria, valor: row.valor, validadeDias: row.validadeDias })}
      >
        <Money cents={row.valor} />
        <Pencil className="absolute right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-50" />
      </button>
    );
  }

  return (
    <button
      className="flex w-full items-center justify-center rounded-md py-2 text-muted-foreground/30 transition-colors hover:bg-muted hover:text-muted-foreground"
      onClick={() => onEdit({ id: null, modelo, armazenamento, saudeBateria, valor: 0, validadeDias: undefined })}
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Model Section ─────────────────────────────────────────────────────────────

function ModelSection({
  group,
  onEditCell,
  onAdjust,
  onAdjustFixed,
  onDuplicate,
  onWhatsApp,
  onDeleteModel,
  onAddVariant,
}: {
  group: ModelGroup;
  onEditCell: (cell: { id: string | null; modelo: string; armazenamento: string; saudeBateria: string; valor: number; validadeDias: number | undefined }) => void;
  onAdjust: (modelo: string) => void;
  onAdjustFixed: (modelo: string) => void;
  onDuplicate: (modelo: string) => void;
  onWhatsApp: (modelo: string) => void;
  onDeleteModel: (modelo: string) => void;
  onAddVariant: (modelo: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
        <button
          className="flex items-center gap-2.5 text-left"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">{group.modelo}</span>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {group.count} {group.count === 1 ? "preço" : "preços"}
          </Badge>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acoes">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onAddVariant(group.modelo)}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar variante
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAdjust(group.modelo)}>
              <TrendingUp className="mr-2 h-4 w-4" /> Ajuste por %
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAdjustFixed(group.modelo)}>
              <DollarSign className="mr-2 h-4 w-4" /> Ajuste por R$
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(group.modelo)}>
              <Copy className="mr-2 h-4 w-4" /> Duplicar modelo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onWhatsApp(group.modelo)}>
              <MessageCircle className="mr-2 h-4 w-4" /> Enviar WhatsApp
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDeleteModel(group.modelo)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Excluir modelo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Price Matrix */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Bateria
                </th>
                {group.storageOptions.map((s) => (
                  <th
                    key={s}
                    className="min-w-[110px] px-2 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BATTERY_HEALTH_OPTIONS.map((battery, i) => (
                <tr
                  key={battery}
                  className={cn("border-b border-border last:border-0", i % 2 !== 0 && "bg-mexpected/10")}
                >
                  <td className="sticky left-0 z-10 bg-card px-4 py-1 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {battery}
                  </td>
                  {group.storageOptions.map((storage) => (
                    <td key={storage} className="px-1 py-1">
                      <PriceCell
                        row={group.priceMap[storage]?.[battery]}
                        modelo={group.modelo}
                        armazenamento={storage}
                        saudeBateria={battery}
                        onEdit={onEditCell}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ValuationsList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");

  // Create/Edit dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formModelo, setFormModelo] = useState("");
  const [formArmazenamento, setFormArmazenamento] = useState("");
  const [formSaudeBateria, setFormSaudeBateria] = useState("");
  const [formValor, setFormValor] = useState(0);
  const [formValidadeDias, setFormValidadeDias] = useState<number | undefined>(undefined);

  // Adjust % dialog
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustModelo, setAdjustModelo] = useState("");
  const [adjustPercentRaw, setAdjustPercentRaw] = useState("");

  // Adjust R$ dialog
  const [showAdjustFixedDialog, setShowAdjustFixedDialog] = useState(false);
  const [adjustFixedModelo, setAdjustFixedModelo] = useState("");
  const [adjustFixedRaw, setAdjustFixedRaw] = useState("");

  // Duplicate dialog
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [dupSource, setDupSource] = useState("");
  const [dupTarget, setDupTarget] = useState("");

  // WhatsApp dialog
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsAppModelo, setWhatsAppModelo] = useState("");
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [whatsAppName, setWhatsAppName] = useState("");

  // Confirms
  const [deleteEntryConfirm, setDeleteEntryConfirm] = useState<string | null>(null);
  const [deleteModelConfirm, setDeleteModelConfirm] = useState<string | null>(null);

  // Data
  // Matriz completa por modelo: precisa de TODAS as linhas (o agrupamento e no
  // cliente). Paginar aqui escondia modelos inteiros depois da 100a linha.
  const listQuery = useQuery(trpc.valuation.list.queryOptions({ all: true }));
  const modelsQuery = useQuery(trpc.valuation.listModels.queryOptions());

  // Mutations
  const createMutation = useMutation(trpc.valuation.create.mutationOptions());
  const updateMutation = useMutation(trpc.valuation.update.mutationOptions());
  const deleteMutation = useMutation(trpc.valuation.delete.mutationOptions());
  const adjustMutation = useMutation(trpc.valuation.bulkAdjust.mutationOptions());
  const adjustFixedMutation = useMutation(trpc.valuation.bulkAdjustFixed.mutationOptions());
  const duplicateMutation = useMutation(trpc.valuation.duplicateModel.mutationOptions());
  const whatsAppMutation = useMutation(trpc.valuation.sendWhatsApp.mutationOptions());
  const deleteModeModelMutation = useMutation(trpc.valuation.deleteModel.mutationOptions());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.valuation.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.valuation.listModels.queryKey() });
  };

  // Grouped data
  const groups = useMemo(() => {
    const rows = (listQuery.data?.data ?? []) as ValuationRow[];
    const all = buildGroups(rows);
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((g) => g.modelo.toLowerCase().includes(q));
  }, [listQuery.data, search]);

  // ── Handlers ──

  const openCreate = (prefill?: { modelo?: string; armazenamento?: string; saudeBateria?: string }) => {
    setEditId(null);
    setFormModelo(prefill?.modelo ?? "");
    setFormArmazenamento(prefill?.armazenamento ?? "");
    setFormSaudeBateria(prefill?.saudeBateria ?? "");
    setFormValor(0);
    setFormValidadeDias(undefined);
    setShowCreateDialog(true);
  };

  const openEdit = (cell: { id: string | null; modelo: string; armazenamento: string; saudeBateria: string; valor: number; validadeDias: number | undefined }) => {
    setEditId(cell.id);
    setFormModelo(cell.modelo);
    setFormArmazenamento(cell.armazenamento);
    setFormSaudeBateria(cell.saudeBateria);
    setFormValor(cell.valor);
    setFormValidadeDias(cell.validadeDias);
    setShowCreateDialog(true);
  };

  const handleSave = () => {
    if (!formModelo || !formArmazenamento || !formSaudeBateria) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const payload = { modelo: formModelo, armazenamento: formArmazenamento, saudeBateria: formSaudeBateria, valor: formValor, validadeDias: formValidadeDias };

    if (editId) {
      updateMutation.mutate(
        { id: editId, ...payload },
        {
          onSuccess: () => { toast.success("Avaliação atualizada"); setShowCreateDialog(false); invalidate(); },
          onError: (err) => toast.error(err.message),
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => { toast.success("Avaliação criada"); setShowCreateDialog(false); invalidate(); },
        onError: (err) => toast.error(err.message),
      });
    }
  };

  const handleDeleteEntry = () => {
    if (!deleteEntryConfirm) return;
    deleteMutation.mutate(
      { id: deleteEntryConfirm },
      {
        onSuccess: () => { toast.success("Avaliação removida"); setDeleteEntryConfirm(null); setShowCreateDialog(false); invalidate(); },
        onError: (err) => { toast.error(err.message); setDeleteEntryConfirm(null); },
      },
    );
  };

  const handleBulkAdjust = () => {
    if (!adjustModelo) { toast.error("Selecione um modelo"); return; }
    const adjustPercent = parseFloat(adjustPercentRaw.replace(",", "."));
    if (isNaN(adjustPercent)) { toast.error("Informe um percentual válido"); return; }
    adjustMutation.mutate(
      { modelo: adjustModelo, adjustPercent },
      {
        onSuccess: (d) => { toast.success(`${d.updated} preços ajustados`); setShowAdjustDialog(false); setAdjustPercentRaw(""); invalidate(); },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleAdjustFixed = () => {
    if (!adjustFixedModelo) { toast.error("Selecione um modelo"); return; }
    const reais = parseFloat(adjustFixedRaw.replace(",", "."));
    if (isNaN(reais) || reais === 0) { toast.error("Informe o valor do ajuste"); return; }
    adjustFixedMutation.mutate(
      { modelo: adjustFixedModelo, adjustAmount: Math.round(reais * 100) },
      {
        onSuccess: (d) => { toast.success(`${d.updated} preços ajustados`); setShowAdjustFixedDialog(false); setAdjustFixedRaw(""); invalidate(); },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleDuplicate = () => {
    if (!dupSource || !dupTarget) { toast.error("Preencha origem e destino"); return; }
    duplicateMutation.mutate(
      { sourceModelo: dupSource, targetModelo: dupTarget },
      {
        onSuccess: (d) => { toast.success(`${d.created} avaliações duplicadas`); setShowDuplicateDialog(false); setDupSource(""); setDupTarget(""); invalidate(); },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleSendWhatsApp = () => {
    if (!whatsAppModelo || !whatsAppPhone) { toast.error("Preencha modelo e telefone"); return; }
    const cleaned = whatsAppPhone.replace(/\D/g, "");
    if (cleaned.length < 10) { toast.error("Informe um telefone válido com DDD"); return; }
    whatsAppMutation.mutate(
      { modelo: whatsAppModelo, phone: cleaned, customerName: whatsAppName || undefined },
      {
        onSuccess: () => { toast.success("Avaliação enviada via WhatsApp!"); setShowWhatsAppDialog(false); setWhatsAppPhone(""); setWhatsAppName(""); },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleDeleteModel = () => {
    if (!deleteModelConfirm) return;
    deleteModeModelMutation.mutate(
      { modelo: deleteModelConfirm },
      {
        onSuccess: (d) => { toast.success(`${d.deleted} avaliações removidas`); setDeleteModelConfirm(null); invalidate(); },
        onError: (err) => { toast.error(err.message); setDeleteModelConfirm(null); },
      },
    );
  };

  // ── Shortcuts para abrir dialogs com modelo pré-preenchido ──

  const openAdjust = (modelo: string) => { setAdjustModelo(modelo); setAdjustPercentRaw(""); setShowAdjustDialog(true); };
  const openAdjustFixed = (modelo: string) => { setAdjustFixedModelo(modelo); setAdjustFixedRaw(""); setShowAdjustFixedDialog(true); };
  const openDuplicate = (modelo: string) => { setDupSource(modelo); setDupTarget(""); setShowDuplicateDialog(true); };
  const openWhatsApp = (modelo: string) => { setWhatsAppModelo(modelo); setWhatsAppPhone(""); setWhatsAppName(""); setShowWhatsAppDialog(true); };

  // ── Render ──

  if (listQuery.isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="m-4 h-40 w-auto" />
          </div>
        ))}
      </div>
    );
  }

  const totalPrices = listQuery.data?.total ?? 0;
  const totalModels = modelsQuery.data?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filtrar por modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono">{totalModels}</span> modelos ·
          <span className="font-mono">{totalPrices}</span> preços
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="mr-2 h-4 w-4" />
          Nova avaliação
        </Button>
      </div>

      {/* Model Groups */}
      {groups.length === 0 ? (
        <EmptyState
          title={search ? "Nenhum modelo encontrado" : "Nenhuma avaliação cadastrada"}
          description={search ? `Nenhum modelo corresponde a "${search}"` : "Cadastre preços de compra de aparelhos usados"}
          icon={Smartphone}
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <ModelSection
              key={group.modelo}
              group={group}
              onEditCell={openEdit}
              onAdjust={openAdjust}
              onAdjustFixed={openAdjustFixed}
              onDuplicate={openDuplicate}
              onWhatsApp={openWhatsApp}
              onDeleteModel={setDeleteModelConfirm}
              onAddVariant={(modelo) => openCreate({ modelo })}
            />
          ))}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Editar avaliação" : "Nova avaliação"}</DialogTitle>
            {(formArmazenamento || formSaudeBateria) && (
              <DialogDescription className="font-mono text-xs">
                {[formModelo, formArmazenamento, formSaudeBateria].filter(Boolean).join(" · ")}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Modelo</Label>
              <Input
                value={formModelo}
                onChange={(e) => setFormModelo(e.target.value)}
                placeholder="Ex: iPhone 13 Pro"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Armazenamento</Label>
                <Select value={formArmazenamento} onValueChange={setFormArmazenamento}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {STORAGE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Saúde da Bateria</Label>
                <Select value={formSaudeBateria} onValueChange={setFormSaudeBateria}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {BATTERY_HEALTH_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Valor de Compra</Label>
              <MoneyInput value={formValor} onChange={setFormValor} />
            </div>
            <div>
              <Label>Validade (dias)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={formValidadeDias ?? ""}
                onChange={(e) => setFormValidadeDias(e.target.value === "" ? undefined : Number(e.target.value))}
                placeholder="Padrão das configurações"
              />
            </div>
          </div>

          <DialogFooter className="flex-row items-center">
            {editId && (
              <Button
                variant="destructive"
                size="sm"
                className="mr-auto"
                onClick={() => setDeleteEntryConfirm(editId)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ajuste % Dialog ── */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste por percentual</DialogTitle>
            <DialogDescription>Aplica o percentual a todos os preços do modelo selecionado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modelo</Label>
              <Select value={adjustModelo} onValueChange={setAdjustModelo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(modelsQuery.data ?? []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Percentual (%)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={adjustPercentRaw}
                onChange={(e) => setAdjustPercentRaw(e.target.value)}
                placeholder="-5 reduz 5% · 10 aumenta 10%"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkAdjust} disabled={adjustMutation.isPending}>
              <TrendingUp className="mr-2 h-4 w-4" /> Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ajuste R$ Dialog ── */}
      <Dialog open={showAdjustFixedDialog} onOpenChange={setShowAdjustFixedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste por valor fixo</DialogTitle>
            <DialogDescription>Soma ou subtrai um valor fixo de todos os preços do modelo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modelo</Label>
              <Select value={adjustFixedModelo} onValueChange={setAdjustFixedModelo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(modelsQuery.data ?? []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={adjustFixedRaw}
                onChange={(e) => setAdjustFixedRaw(e.target.value)}
                placeholder="-100 reduz R$100 · 50 aumenta R$50"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustFixedDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdjustFixed} disabled={adjustFixedMutation.isPending}>
              <DollarSign className="mr-2 h-4 w-4" /> Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Duplicate Dialog ── */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar modelo</DialogTitle>
            <DialogDescription>Copia toda a tabela de preços de um modelo para outro nome.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modelo de origem</Label>
              <Select value={dupSource} onValueChange={setDupSource}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(modelsQuery.data ?? []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo de destino</Label>
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
              <Copy className="mr-2 h-4 w-4" /> Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── WhatsApp Dialog ── */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar tabela via WhatsApp</DialogTitle>
            <DialogDescription>A tabela de avaliação do modelo será enviada ao cliente pelo número da loja.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modelo</Label>
              <Select value={whatsAppModelo} onValueChange={setWhatsAppModelo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(modelsQuery.data ?? []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Telefone do cliente</Label>
              <Input
                value={whatsAppPhone}
                onChange={(e) => setWhatsAppPhone(e.target.value)}
                placeholder="86999999999"
                inputMode="tel"
              />
            </div>
            <div>
              <Label>Nome do cliente <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                value={whatsAppName}
                onChange={(e) => setWhatsAppName(e.target.value)}
                placeholder="Ex: João"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWhatsAppDialog(false)}>Cancelar</Button>
            <Button onClick={handleSendWhatsApp} disabled={whatsAppMutation.isPending}>
              <MessageCircle className="mr-2 h-4 w-4" /> Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirms ── */}
      <ConfirmDialog
        open={deleteEntryConfirm !== null}
        onOpenChange={(open) => { if (!open) setDeleteEntryConfirm(null); }}
        title="Excluir avaliação?"
        description="Esta ação remove a avaliação desta combinação e não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDeleteEntry}
        isLoading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={deleteModelConfirm !== null}
        onOpenChange={(open) => { if (!open) setDeleteModelConfirm(null); }}
        title={`Excluir todas as avaliações de "${deleteModelConfirm ?? ""}"?`}
        description="Esta ação remove TODAS as avaliações do modelo e não pode ser desfeita."
        confirmLabel="Excluir tudo"
        variant="destructive"
        onConfirm={handleDeleteModel}
        isLoading={deleteModeModelMutation.isPending}
      />
    </div>
  );
}
