"use client";

import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { CARD_KIND_LABELS, type CardKind } from "@/lib/validators/receiving";
import { PageHeader } from "@/components/domain/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreditCard, Loader2, Undo2 } from "lucide-react";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatSignedCents(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${formatCents(Math.abs(cents))}`;
}
function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

const ALL_ACQUIRERS = "__all__";
const ADMIN_ROLES = new Set(["owner", "manager", "admin"]);

type View = "PENDING" | "SETTLED" | "DIVERGENT";

const VIEW_LABELS: Record<View, string> = {
  PENDING: "A receber",
  SETTLED: "Conciliados",
  DIVERGENT: "Divergências",
};

type Row = {
  id: string;
  acquirerName: string;
  cardBrandName: string;
  kind: string;
  installmentNumber: number;
  installmentsTotal: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
  expectedSettlementDate: Date | string;
  settledAt: Date | string | null;
  settledNetCents: number | null;
  settledDifferenceCents: number | null;
};

export function CardReceivablesClient() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>("PENDING");
  const [acquirerId, setAcquirerId] = useState<string>(ALL_ACQUIRERS);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [settleOpen, setSettleOpen] = useState(false);
  // Mapa id -> líquido real (centavos) editável no dialog de conciliação.
  const [settledInputs, setSettledInputs] = useState<Record<string, number>>({});
  const [settleDate, setSettleDate] = useState("");
  const [settleNote, setSettleNote] = useState("");

  const { data: me } = useQuery(trpc.auth.me.queryOptions());
  const isAdmin = useMemo(() => {
    const t = me?.availableTenants.find((x) => x.id === me.activeTenantId);
    return t ? ADMIN_ROLES.has(t.role) : false;
  }, [me]);

  const { data: acquirers } = useQuery(trpc.receiving.acquirers.list.queryOptions());

  const status = view === "DIVERGENT" ? "SETTLED" : view;
  const { data, isLoading } = useQuery(
    trpc.receiving.cardReceivables.list.queryOptions({
      status,
      onlyDivergent: view === "DIVERGENT" ? true : undefined,
      acquirerId: acquirerId === ALL_ACQUIRERS ? undefined : acquirerId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page: 0,
      pageSize: 200,
    }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["receiving", "cardReceivables"]] });

  const settleMutation = useMutation(
    trpc.receiving.cardReceivables.settle.mutationOptions({
      onSuccess: (r) => {
        toast.success(
          r.divergentCount > 0
            ? `${r.settledCount} conciliado(s), ${r.divergentCount} com divergência.`
            : `${r.settledCount} recebível(is) conciliado(s).`,
        );
        invalidate();
        setSettleOpen(false);
        setSelectedIds(new Set());
        setSettledInputs({});
        setSettleNote("");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const unsettleMutation = useMutation(
    trpc.receiving.cardReceivables.unsettle.mutationOptions({
      onSuccess: () => {
        toast.success("Conciliação desfeita.");
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const rows: Row[] = data?.data ?? [];
  const isPendingView = view === "PENDING";
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openSettleDialog = () => {
    // Default do líquido real = o esperado de cada selecionado.
    const inputs: Record<string, number> = {};
    for (const r of rows) {
      if (selectedIds.has(r.id)) inputs[r.id] = r.netCents;
    }
    setSettledInputs(inputs);
    setSettleDate("");
    setSettleNote("");
    setSettleOpen(true);
  };

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));
  const dialogTotals = selectedRows.reduce(
    (acc, r) => {
      const real = settledInputs[r.id] ?? r.netCents;
      acc.expected += r.netCents;
      acc.real += real;
      acc.diff += real - r.netCents;
      return acc;
    },
    { expected: 0, real: 0, diff: 0 },
  );

  const confirmSettle = () => {
    const items = selectedRows.map((r) => ({
      id: r.id,
      settledNetCents: settledInputs[r.id] ?? r.netCents,
    }));
    settleMutation.mutate({
      items,
      settledDate: settleDate || undefined,
      note: settleNote || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recebíveis de Cartão"
        subtitle="Concilie os valores recebidos das adquirentes contra o extrato da maquininha"
      />

      {/* Seletor de visão */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v);
              setSelectedIds(new Set());
            }}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (view === v
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Adquirente</Label>
          <Select value={acquirerId} onValueChange={setAcquirerId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACQUIRERS}>Todas</SelectItem>
              {(acquirers ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Liquidação de</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Liquidação até</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.total === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum recebível"
          description="Não há recebíveis de cartão para o filtro selecionado."
        />
      ) : (
        <>
          {/* Totais */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="Líquido esperado" value={formatCents(data.summary.netCents)} />
            {view === "PENDING" ? (
              <>
                <SummaryCard label="Bruto" value={formatCents(data.summary.grossCents)} />
                <SummaryCard
                  label="Taxa"
                  value={`−${formatCents(data.summary.feeCents)}`}
                  tone="destructive"
                />
              </>
            ) : (
              <>
                <SummaryCard
                  label="Líquido recebido"
                  value={formatCents(data.summary.settledNetCents)}
                  tone="primary"
                />
                <SummaryCard
                  label="Divergência"
                  value={formatSignedCents(data.summary.settledDifferenceCents)}
                  tone={data.summary.settledDifferenceCents === 0 ? "default" : "destructive"}
                />
              </>
            )}
          </div>

          {/* Ação em lote (só na visão A receber) */}
          {isPendingView && selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-4 py-2">
              <span className="text-sm">{selectedIds.size} selecionado(s)</span>
              <Button size="sm" onClick={openSettleDialog}>
                Conciliar selecionados
              </Button>
            </div>
          )}

          {/* Tabela */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {isPendingView && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                  )}
                  <TableHead>Liquidação</TableHead>
                  <TableHead>Adquirente</TableHead>
                  <TableHead>Bandeira</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead className="text-right">Líquido esperado</TableHead>
                  {!isPendingView && <TableHead className="text-right">Recebido</TableHead>}
                  {!isPendingView && <TableHead className="text-right">Diferença</TableHead>}
                  {!isPendingView && isAdmin && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const diff = r.settledDifferenceCents ?? 0;
                  return (
                    <TableRow
                      key={r.id}
                      data-state={selectedIds.has(r.id) ? "selected" : undefined}
                    >
                      {isPendingView && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => toggleOne(r.id)}
                            aria-label="Selecionar"
                          />
                        </TableCell>
                      )}
                      <TableCell>{formatDate(r.expectedSettlementDate)}</TableCell>
                      <TableCell>{r.acquirerName}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.cardBrandName}{" "}
                        <span className="text-xs text-muted-foreground">
                          {CARD_KIND_LABELS[r.kind as CardKind] ?? r.kind}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.installmentNumber}/{r.installmentsTotal}
                      </TableCell>
                      <TableCell className="text-right">{formatCents(r.netCents)}</TableCell>
                      {!isPendingView && (
                        <TableCell className="text-right font-medium">
                          {r.settledNetCents != null ? formatCents(r.settledNetCents) : "—"}
                        </TableCell>
                      )}
                      {!isPendingView && (
                        <TableCell
                          className={
                            "text-right " +
                            (diff < 0
                              ? "text-destructive"
                              : diff > 0
                                ? "text-primary"
                                : "text-muted-foreground")
                          }
                        >
                          {formatSignedCents(diff)}
                        </TableCell>
                      )}
                      {!isPendingView && isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Desfazer conciliação"
                            onClick={() => unsettleMutation.mutate({ ids: [r.id] })}
                            disabled={unsettleMutation.isPending}
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {data.total > rows.length && (
            <p className="text-xs text-muted-foreground text-center">
              Mostrando {rows.length} de {data.total}. Refine o filtro para ver mais.
            </p>
          )}
        </>
      )}

      {/* Dialog de conciliação */}
      <Dialog open={settleOpen} onOpenChange={(o) => !o && setSettleOpen(false)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conciliar recebíveis</DialogTitle>
            <DialogDescription>
              Informe o líquido que realmente caiu na conta (do extrato da adquirente). A
              diferença vs. o esperado é destacada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {selectedRows.map((r) => {
              const real = settledInputs[r.id] ?? r.netCents;
              const diff = real - r.netCents;
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-12 items-end gap-2 rounded-md border border-border p-2"
                >
                  <div className="col-span-5 text-sm">
                    <div className="font-medium">
                      {r.acquirerName} · {r.cardBrandName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(r.expectedSettlementDate)} · parcela {r.installmentNumber}/
                      {r.installmentsTotal}
                    </div>
                  </div>
                  <div className="col-span-3 text-right text-sm">
                    <div className="text-[10px] uppercase text-muted-foreground">Esperado</div>
                    {formatCents(r.netCents)}
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] uppercase text-muted-foreground">Recebido</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(real / 100).toFixed(2)}
                      onChange={(e) =>
                        setSettledInputs((prev) => ({
                          ...prev,
                          [r.id]: Math.round((parseFloat(e.target.value) || 0) * 100),
                        }))
                      }
                    />
                  </div>
                  <div
                    className={
                      "col-span-2 text-right text-sm font-medium " +
                      (diff < 0 ? "text-destructive" : diff > 0 ? "text-primary" : "text-muted-foreground")
                    }
                  >
                    {formatSignedCents(diff)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data de liquidação</Label>
              <Input type="date" value={settleDate} onChange={(e) => setSettleDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Input value={settleNote} onChange={(e) => setSettleNote(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
            <span>Esperado: {formatCents(dialogTotals.expected)}</span>
            <span>Recebido: {formatCents(dialogTotals.real)}</span>
            <span
              className={
                dialogTotals.diff < 0
                  ? "text-destructive"
                  : dialogTotals.diff > 0
                    ? "text-primary"
                    : "text-muted-foreground"
              }
            >
              Diferença: {formatSignedCents(dialogTotals.diff)}
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmSettle} disabled={settleMutation.isPending}>
              {settleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Conciliar {selectedRows.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "destructive";
}) {
  const toneClass =
    tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={"text-2xl font-semibold " + toneClass}>{value}</p>
      </CardContent>
    </Card>
  );
}
