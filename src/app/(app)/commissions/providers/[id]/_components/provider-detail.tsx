"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Lock, FileText, Calendar, Undo2, Plus, X, Calculator } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  PROVIDER_PROFILE_LABELS,
  PROVIDER_BOND_TYPE_LABELS,
  APURACAO_STATUS_LABELS,
  APURACAO_STATUS_VARIANT,
  REVERSAL_TYPE_LABELS,
  COMMISSION_CATEGORY_LABELS,
} from "@/lib/validators/provider-commission";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR");
}

function getMonthOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    options.push({ value: `${year}-${String(month).padStart(2, "0")}`, label });
  }
  return options;
}

export function ProviderDetail({ providerId }: { providerId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Reversal form state
  const [reversalDate, setReversalDate] = useState("");
  const [reversalType, setReversalType] = useState("MANUAL_ADJUSTMENT");
  const [reversalAmount, setReversalAmount] = useState("");
  const [reversalDescription, setReversalDescription] = useState("");

  // Uncovered day form state
  const [uncoveredDay, setUncoveredDay] = useState("");
  const [uncoveredReason, setUncoveredReason] = useState("");
  const [confirmDeleteReversalId, setConfirmDeleteReversalId] = useState<string | null>(null);

  const monthOptions = getMonthOptions();

  const detailQuery = useQuery(
    trpc.providerCommission.getDetail.queryOptions({
      providerId,
      month,
      year,
    }),
  );

  const calculateMutation = useMutation(
    trpc.providerCommission.calculate.mutationOptions(),
  );
  const closeApuracaoMutation = useMutation(
    trpc.providerCommission.closeApuracao.mutationOptions(),
  );
  const createReversalMutation = useMutation(
    trpc.providerCommission.createReversal.mutationOptions(),
  );
  const deleteReversalMutation = useMutation(
    trpc.providerCommission.deleteReversal.mutationOptions(),
  );
  const toggleUncoveredMutation = useMutation(
    trpc.providerCommission.toggleUncoveredDay.mutationOptions(),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.providerCommission.getDetail.queryKey({
        providerId,
        month,
        year,
      }),
    });
  };

  const handleMonthChange = (val: string) => {
    const [y, m] = val.split("-");
    setYear(Number(y));
    setMonth(Number(m));
  };

  const handleCalculate = () => {
    calculateMutation.mutate(
      { providerId, month, year },
      {
        onSuccess: (data) => {
          toast.success(`Apuracao calculada: ${formatCurrency(data.grossCommission)} bruto, ${formatCurrency(data.netAmount)} liquido`);
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleClose = () => {
    closeApuracaoMutation.mutate(
      { providerId, month, year },
      {
        onSuccess: (data) => {
          toast.success(data.message);
          invalidate();
          setShowCloseConfirm(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleAddReversal = () => {
    if (!reversalDate || !reversalAmount) return;
    createReversalMutation.mutate(
      {
        providerId,
        factDate: reversalDate,
        type: reversalType as "MANUAL_ADJUSTMENT",
        amount: parseFloat(reversalAmount),
        description: reversalDescription || null,
      },
      {
        onSuccess: () => {
          toast.success("Estorno registrado");
          setReversalDate("");
          setReversalAmount("");
          setReversalDescription("");
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleDeleteReversal = (reversalId: string) => {
    setConfirmDeleteReversalId(reversalId);
  };

  const performDeleteReversal = () => {
    if (!confirmDeleteReversalId) return;
    deleteReversalMutation.mutate(
      { id: confirmDeleteReversalId, providerId },
      {
        onSuccess: () => {
          toast.success("Estorno removido");
          setConfirmDeleteReversalId(null);
          invalidate();
        },
        onError: (err) => {
          toast.error(err.message);
          setConfirmDeleteReversalId(null);
        },
      },
    );
  };

  const handleToggleUncovered = () => {
    if (!uncoveredDay) return;
    toggleUncoveredMutation.mutate(
      {
        providerId,
        day: uncoveredDay,
        reason: uncoveredReason || null,
      },
      {
        onSuccess: (data) => {
          toast.success(data.action === "added" ? "Dia marcado como nao coberto" : "Dia removido da lista");
          setUncoveredDay("");
          setUncoveredReason("");
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!detailQuery.data) {
    return <EmptyState title="Prestador nao encontrado" icon={Search} />;
  }

  const { provider, currentContract, apuracao, reversals, uncoveredDays } = detailQuery.data;
  const isClosed = apuracao && apuracao.status !== "OPEN";
  const currentMonthValue = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Header with month selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{provider.userName}</h2>
          <div className="flex gap-2 mt-1">
            <StatusBadge variant={provider.profile === "TECHNICIAN" ? "warning" : "info"}>
              {PROVIDER_PROFILE_LABELS[provider.profile] ?? provider.profile}
            </StatusBadge>
            <StatusBadge variant={provider.bondType === "MEI" ? "success" : "info"}>
              {PROVIDER_BOND_TYPE_LABELS[provider.bondType] ?? provider.bondType}
            </StatusBadge>
          </div>
          {provider.razaoSocial && (
            <p className="text-sm text-muted-foreground mt-1">
              {provider.razaoSocial} {provider.cnpjMei ? `· CNPJ ${provider.cnpjMei}` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <Select value={currentMonthValue} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCalculate}
            disabled={calculateMutation.isPending}
          >
            <Calculator className="h-4 w-4 mr-1" />
            {calculateMutation.isPending ? "Calculando..." : "Calcular"}
          </Button>
        </div>
      </div>

      {/* No contract warning */}
      {!currentContract && (
        <Card className="p-4 border-yellow-500/30 bg-yellow-500/5">
          <p className="text-sm text-yellow-500">
            Prestador sem contrato vigente. Cadastre um contrato para habilitar o calculo de comissoes.
          </p>
        </Card>
      )}

      {/* Apuracao Summary Cards */}
      {apuracao && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4 border-primary/25 bg-primary/5">
              <p className="text-xs text-muted-foreground uppercase">Comissao bruta</p>
              <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(apuracao.grossCommission)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Estornos</p>
              <p className="text-2xl font-bold text-red-400 mt-1">-{formatCurrency(apuracao.totalReversals)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Ajuda de custo</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">+{formatCurrency(apuracao.totalAllowance)}</p>
            </Card>
            <Card className="p-4 border-green-500/25 bg-green-500/5">
              <p className="text-xs text-muted-foreground uppercase">Liquido a pagar</p>
              <p className="text-2xl font-bold text-green-500 mt-1">{formatCurrency(apuracao.netAmount)}</p>
              <div className="text-xs mt-1">
                <StatusBadge variant={APURACAO_STATUS_VARIANT[apuracao.status] ?? "default"}>
                  {APURACAO_STATUS_LABELS[apuracao.status] ?? apuracao.status}
                </StatusBadge>
              </div>
            </Card>
          </div>

          {/* Close button */}
          {!isClosed && currentContract && apuracao.grossCommission > 0 && (
            <Button onClick={() => setShowCloseConfirm(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Fechar apuracao e gerar conta a pagar
            </Button>
          )}
        </>
      )}

      {/* Rules + Memory grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Rules */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-primary mb-3">Aliquotas do contrato</h3>
          {currentContract && currentContract.rules.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left p-2">Categoria</th>
                    <th className="text-left p-2">Escopo</th>
                    <th className="text-right p-2">Min</th>
                    <th className="text-right p-2">Max</th>
                    <th className="text-right p-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {currentContract.rules.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{COMMISSION_CATEGORY_LABELS[r.category] ?? r.category}</td>
                      <td className="p-2 capitalize">{r.scope}</td>
                      <td className="p-2 text-right">{formatCurrency(r.rangeMin)}</td>
                      <td className="p-2 text-right">{r.rangeMax ? formatCurrency(r.rangeMax) : "---"}</td>
                      <td className="p-2 text-right font-medium">{r.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada.</p>
          )}
        </Card>

        {/* Memory */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-primary mb-3">
            <FileText className="inline h-4 w-4 mr-1" />
            Memoria de calculo — {String(month).padStart(2, "0")}/{year}
          </h3>
          {apuracao?.memoryJson && (apuracao.memoryJson as Record<string, unknown>).linhas ? (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Referencia</th>
                    <th className="text-left p-2">Cat/Escopo</th>
                    <th className="text-right p-2">Base</th>
                    <th className="text-right p-2">Comissao</th>
                  </tr>
                </thead>
                <tbody>
                  {((apuracao.memoryJson as Record<string, unknown>).linhas as Array<Record<string, unknown>>).map((l, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 text-muted-foreground">{formatDate(l.data as string)}</td>
                      <td className="p-2">{l.referencia_label as string}</td>
                      <td className="p-2">
                        {COMMISSION_CATEGORY_LABELS[l.categoria as string] ?? String(l.categoria)} / {l.escopo as string}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(l.base as number)}</td>
                      <td className="p-2 text-right font-medium text-primary">
                        {formatCurrency(l.comissao as number)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum lancamento no periodo.</p>
          )}
        </Card>
      </div>

      {/* Reversals */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-primary mb-3">
          <Undo2 className="inline h-4 w-4 mr-1" />
          Estornos do periodo
        </h3>

        {!isClosed && (
          <div className="grid grid-cols-[130px_1fr_120px_1fr_auto] gap-2 items-end mb-4">
            <div>
              <Label className="text-xs">Data</Label>
              <DateInput
                value={reversalDate}
                onChange={setReversalDate}
                className="h-8 text-xs"
                aria-label="Data do estorno"
              />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={reversalType} onValueChange={setReversalType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REVERSAL_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={reversalAmount}
                onChange={(e) => setReversalAmount(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Descricao</Label>
              <Input
                value={reversalDescription}
                onChange={(e) => setReversalDescription(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              onClick={handleAddReversal}
              disabled={createReversalMutation.isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              Adicionar
            </Button>
          </div>
        )}

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left p-2">Data</th>
              <th className="text-left p-2">Tipo</th>
              <th className="text-left p-2">Descricao</th>
              <th className="text-right p-2">Valor</th>
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {reversals.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  Sem estornos no periodo.
                </td>
              </tr>
            ) : (
              reversals.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 text-muted-foreground">{formatDate(r.factDate)}</td>
                  <td className="p-2">{REVERSAL_TYPE_LABELS[r.type] ?? r.type}</td>
                  <td className="p-2 text-muted-foreground">{r.description ?? "—"}</td>
                  <td className="p-2 text-right font-medium text-red-400">{formatCurrency(r.amount)}</td>
                  <td className="p-2">
                    {!r.apuracaoId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive h-6 w-6 p-0"
                        onClick={() => handleDeleteReversal(r.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">fixo</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Uncovered Days */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-primary mb-3">
          <Calendar className="inline h-4 w-4 mr-1" />
          Dias nao cobertos — {String(month).padStart(2, "0")}/{year}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Por padrao, todo dia e considerado coberto. Registre aqui dias em que o prestador nao atuou
          (ajuda de custo e proporcional).
        </p>

        {!isClosed && (
          <div className="flex gap-2 items-end mb-4">
            <div>
              <Label className="text-xs">Data</Label>
              <DateInput
                value={uncoveredDay}
                onChange={setUncoveredDay}
                className="h-8 text-xs"
                min={`${year}-${String(month).padStart(2, "0")}-01`}
                max={`${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`}
                aria-label="Dia de remoto"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Motivo</Label>
              <Input
                value={uncoveredReason}
                onChange={(e) => setUncoveredReason(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleUncovered}
              disabled={toggleUncoveredMutation.isPending}
            >
              Marcar/Desmarcar
            </Button>
          </div>
        )}

        {uncoveredDays.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum dia marcado (mes cheio).</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {uncoveredDays.map((d) => (
              <span
                key={d.id}
                className="px-3 py-1 text-xs rounded-full bg-yellow-500/10 border border-yellow-500/25 text-yellow-500"
                title={d.reason ?? undefined}
              >
                {formatDate(d.day)}
                {d.reason ? ` — ${d.reason}` : ""}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Close confirmation dialog */}
      <ConfirmDialog
        open={showCloseConfirm}
        onOpenChange={setShowCloseConfirm}
        title="Fechar apuracao?"
        description={`Fechar apuracao de ${String(month).padStart(2, "0")}/${year}? Isso gera uma conta a pagar e torna a memoria imutavel.`}
        onConfirm={handleClose}
        variant="destructive"
      />

      <ConfirmDialog
        open={confirmDeleteReversalId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteReversalId(null); }}
        title="Remover este estorno?"
        description="O lancamento de estorno sera removido e a apuracao sera recalculada."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={performDeleteReversal}
        isLoading={deleteReversalMutation.isPending}
      />
    </div>
  );
}
