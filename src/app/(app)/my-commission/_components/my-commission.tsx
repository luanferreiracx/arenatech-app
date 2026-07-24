"use client";
import { formatReaisBRL as formatCurrency } from "@/lib/format";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Calendar, Undo2, UserX, FileDown, Sheet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/inputs/date-input";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { toast } from "@/lib/toast";
import {
  APURACAO_STATUS_LABELS,
  APURACAO_STATUS_VARIANT,
  REVERSAL_TYPE_LABELS,
  COMMISSION_CATEGORY_LABELS,
  COMMISSION_SOURCE_LABELS,
} from "@/lib/validators/provider-commission";


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

export function MyCommission() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [uncoveredDay, setUncoveredDay] = useState("");
  const [uncoveredReason, setUncoveredReason] = useState("");

  const monthOptions = getMonthOptions();

  const detailQuery = useQuery(
    trpc.providerCommission.getMyDetail.queryOptions({ month, year }),
  );

  const toggleUncoveredMutation = useMutation(
    trpc.providerCommission.toggleMyUncoveredDay.mutationOptions(),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.providerCommission.getMyDetail.queryKey({ month, year }),
    });
  };

  const handleMonthChange = (val: string) => {
    const [y, m] = val.split("-");
    setYear(Number(y));
    setMonth(Number(m));
  };

  const handleToggleUncovered = () => {
    if (!uncoveredDay) return;
    toggleUncoveredMutation.mutate(
      { day: uncoveredDay, reason: uncoveredReason || null },
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

  // getMyDetail retorna null quando o usuario logado nao e um prestador.
  if (!detailQuery.data) {
    return (
      <EmptyState
        title="Voce nao e um prestador"
        description="Esta area e para prestadores com comissao cadastrada. Fale com o administrador se acredita que deveria ter acesso."
        icon={UserX}
      />
    );
  }

  const { provider, apuracao, reversals, uncoveredDays } = detailQuery.data;
  const isClosed = apuracao && apuracao.status !== "OPEN";
  const currentMonthValue = `${year}-${String(month).padStart(2, "0")}`;
  const memoryLinhas =
    apuracao?.memoryJson && typeof apuracao.memoryJson === "object"
      ? ((apuracao.memoryJson as Record<string, unknown>).linhas as Array<Record<string, unknown>> | undefined)
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div />
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
          {apuracao && (
            <>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`/api/commissions/${provider.id}/apuracao/${year}/${month}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  PDF
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/commissions/${provider.id}/apuracao/${year}/${month}/csv`}>
                  <Sheet className="h-4 w-4 mr-1" />
                  CSV
                </a>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {apuracao ? (
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
            <p className="text-xs text-muted-foreground uppercase">Liquido a receber</p>
            <p className="text-2xl font-bold text-green-500 mt-1">{formatCurrency(apuracao.netAmount)}</p>
            <div className="text-xs mt-1">
              <StatusBadge variant={APURACAO_STATUS_VARIANT[apuracao.status] ?? "default"}>
                {APURACAO_STATUS_LABELS[apuracao.status] ?? apuracao.status}
              </StatusBadge>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            Nenhuma apuracao para {String(month).padStart(2, "0")}/{year}. O administrador ainda nao
            calculou este mes.
          </p>
        </Card>
      )}

      {/* Memory */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-primary mb-3">
          <FileText className="inline h-4 w-4 mr-1" />
          Memoria de calculo — {String(month).padStart(2, "0")}/{year}
        </h3>
        {memoryLinhas && memoryLinhas.length > 0 ? (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[36rem] text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left p-2">Data</th>
                  <th className="text-left p-2">Referencia</th>
                  <th className="text-left p-2">Categoria</th>
                  <th className="text-left p-2">Origem</th>
                  <th className="text-right p-2">Base</th>
                  <th className="text-right p-2">Comissao</th>
                </tr>
              </thead>
              <tbody>
                {memoryLinhas.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 text-muted-foreground">{formatDate(l.data as string)}</td>
                    <td className="p-2">{l.referencia_label as string}</td>
                    <td className="p-2">
                      {COMMISSION_CATEGORY_LABELS[l.categoria as string] ?? String(l.categoria)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {COMMISSION_SOURCE_LABELS[(l.origem as string) ?? "OWN"] ?? "Propria"}
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

      {/* Reversals (read-only) */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-primary mb-3">
          <Undo2 className="inline h-4 w-4 mr-1" />
          Estornos do periodo
        </h3>
        {reversals.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem estornos no periodo.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left p-2">Data</th>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Descricao</th>
                <th className="text-right p-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {reversals.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 text-muted-foreground">{formatDate(r.factDate)}</td>
                  <td className="p-2">{REVERSAL_TYPE_LABELS[r.type] ?? r.type}</td>
                  <td className="p-2 text-muted-foreground">{r.description ?? "—"}</td>
                  <td className="p-2 text-right font-medium text-red-400">{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* Uncovered days (self-service) */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-primary mb-3">
          <Calendar className="inline h-4 w-4 mr-1" />
          Dias nao cobertos — {String(month).padStart(2, "0")}/{year}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Registre aqui os dias em que voce nao atuou (a ajuda de custo e proporcional aos dias
          efetivos). So e possivel enquanto a apuracao do mes esta aberta.
        </p>

        {!isClosed && (
          <div className="flex flex-wrap gap-2 items-end mb-4">
            <div>
              <Label className="text-xs">Data</Label>
              <DateInput
                value={uncoveredDay}
                onChange={setUncoveredDay}
                className="h-8 text-xs"
                min={`${year}-${String(month).padStart(2, "0")}-01`}
                max={`${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`}
                aria-label="Dia nao coberto"
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
    </div>
  );
}
