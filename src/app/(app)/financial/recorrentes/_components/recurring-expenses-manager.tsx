"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Money } from "@/components/domain/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/inputs/money-input";
import { FinancialCategorySelect } from "@/components/domain/forms/financial-category-select";
import { SupplierSelect } from "@/components/domain/forms/supplier-select";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Clock, RefreshCw } from "lucide-react";

type RecurringRow = {
  id: string;
  type: "PAYABLE" | "RECEIVABLE";
  description: string;
  amountCents: number;
  dayOfMonth: number;
  category: string | null;
  supplierId: string | null;
  active: boolean;
};

const emptyForm = {
  id: null as string | null,
  type: "PAYABLE" as "PAYABLE" | "RECEIVABLE",
  description: "",
  amountCents: 0,
  dayOfMonth: 5,
  category: "",
  supplierId: null as string | null,
  notes: "",
};

export function RecurringExpensesManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const listQuery = useQuery(trpc.recurringExpense.list.queryOptions());
  const rows = (listQuery.data ?? []) as RecurringRow[];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.recurringExpense.list.queryKey() });

  const createMut = useMutation(
    trpc.recurringExpense.create.mutationOptions({
      onSuccess: () => { toast.success("Conta recorrente criada"); setDialogOpen(false); void invalidate(); },
      onError: (e) => toast.error(e.message),
    }),
  );
  const updateMut = useMutation(
    trpc.recurringExpense.update.mutationOptions({
      onSuccess: () => { toast.success("Conta recorrente atualizada"); setDialogOpen(false); void invalidate(); },
      onError: (e) => toast.error(e.message),
    }),
  );
  const toggleMut = useMutation(
    trpc.recurringExpense.toggle.mutationOptions({
      onSuccess: () => void invalidate(),
      onError: (e) => toast.error(e.message),
    }),
  );
  const deleteMut = useMutation(
    trpc.recurringExpense.delete.mutationOptions({
      onSuccess: () => { toast.success("Conta recorrente removida"); setDeleteId(null); void invalidate(); },
      onError: (e) => toast.error(e.message),
    }),
  );
  const generateMut = useMutation(
    trpc.recurringExpense.generateNow.mutationOptions({
      onSuccess: (r) => {
        toast.success(r.generated > 0 ? `${r.generated} conta(s) gerada(s)` : "Nenhuma conta a gerar agora");
        void queryClient.invalidateQueries({ queryKey: [["financial"]] });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const openCreate = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (r: RecurringRow) => {
    setForm({
      id: r.id, type: r.type, description: r.description, amountCents: r.amountCents,
      dayOfMonth: r.dayOfMonth, category: r.category ?? "", supplierId: r.supplierId, notes: "",
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (form.description.trim().length < 1) return toast.error("Informe a descrição");
    if (form.amountCents < 1) return toast.error("Informe o valor");
    const payload = {
      description: form.description.trim(),
      amountCents: form.amountCents,
      dayOfMonth: form.dayOfMonth,
      category: form.category.trim() || null,
      supplierId: form.supplierId,
      notes: form.notes.trim() || null,
    };
    if (form.id) updateMut.mutate({ id: form.id, ...payload });
    else createMut.mutate({ type: form.type, ...payload });
  };

  if (listQuery.isLoading) return <LoadingState variant="table" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => generateMut.mutate()}
          disabled={generateMut.isPending}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Gerar contas devidas
        </Button>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova recorrente
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Nenhuma conta recorrente"
          description="Cadastre contas fixas (aluguel, salário, internet) e o sistema gera a conta de cada mês automaticamente."
          action={<Button onClick={openCreate}>Cadastrar recorrente</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Dia</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Ativa</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{r.description}</TableCell>
                  <TableCell>
                    <StatusBadge variant={r.type === "RECEIVABLE" ? "success" : "warning"}>
                      {r.type === "RECEIVABLE" ? "Receber" : "Pagar"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right"><Money cents={r.amountCents} /></TableCell>
                  <TableCell className="text-center tabular-nums">dia {r.dayOfMonth}</TableCell>
                  <TableCell className="text-muted-foreground">{r.category ?? "-"}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={r.active}
                      onCheckedChange={(v) => toggleMut.mutate({ id: r.id, active: v })}
                      aria-label={`${r.active ? "Desativar" : "Ativar"} ${r.description}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)} aria-label="Remover">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar recorrente" : "Nova conta recorrente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!form.id && (
              <div className="space-y-1">
                <Label>Tipo</Label>
                <div className="flex gap-2">
                  {(["PAYABLE", "RECEIVABLE"] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={form.type === t ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                    >
                      {t === "PAYABLE" ? "A pagar" : "A receber"}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="descricao">Descrição *</Label>
              <Input id="descricao" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex.: Aluguel da loja" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="valor">Valor *</Label>
                <MoneyInput id="valor" value={form.amountCents} onChange={(v) => setForm((f) => ({ ...f, amountCents: v }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dia-do-vencimento">Dia do vencimento</Label>
                <Input id="dia-do-vencimento" type="number" min={1} max={28} value={form.dayOfMonth} onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <FinancialCategorySelect value={form.category} onChange={(c) => setForm((f) => ({ ...f, category: c }))} transactionType={form.type} />
            </div>
            {form.type === "PAYABLE" && !form.id && (
              <div className="space-y-1">
                <Label>Fornecedor</Label>
                <SupplierSelect value={form.supplierId} onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>
              {form.id ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Remover conta recorrente?"
        description="O template será removido. As contas já geradas nos meses anteriores permanecem no financeiro."
        confirmLabel="Remover"
        variant="destructive"
        isLoading={deleteMut.isPending}
        onConfirm={() => {
          if (deleteId) deleteMut.mutate({ id: deleteId });
        }}
      />
    </div>
  );
}
