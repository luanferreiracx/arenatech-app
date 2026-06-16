"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import {
  CARD_RECEIVABLE_STATUS_LABELS,
  CARD_KIND_LABELS,
  type CardReceivableStatus,
  type CardKind,
} from "@/lib/validators/receiving";
import { PageHeader } from "@/components/domain/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { CreditCard } from "lucide-react";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

const STATUSES: CardReceivableStatus[] = ["PENDING", "SETTLED", "CANCELLED"];
const ALL_ACQUIRERS = "__all__";

export function CardReceivablesClient() {
  const trpc = useTRPC();
  const [status, setStatus] = useState<CardReceivableStatus>("PENDING");
  const [acquirerId, setAcquirerId] = useState<string>(ALL_ACQUIRERS);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: acquirers } = useQuery(trpc.receiving.acquirers.list.queryOptions());

  const { data, isLoading } = useQuery(
    trpc.receiving.cardReceivables.list.queryOptions({
      status,
      acquirerId: acquirerId === ALL_ACQUIRERS ? undefined : acquirerId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page: 0,
      pageSize: 200,
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recebíveis de Cartão"
        subtitle="Valores a receber das adquirentes (líquido após taxa, por data de liquidação)"
      />

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as CardReceivableStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {CARD_RECEIVABLE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Bruto</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCents(data.summary.grossCents)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Taxa</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-destructive">
                  −{formatCents(data.summary.feeCents)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Líquido</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-primary">
                  {formatCents(data.summary.netCents)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Por adquirente */}
          {data.byAcquirer.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {data.byAcquirer.map((g) => (
                <Badge key={g.acquirerId} variant="outline" className="text-xs">
                  {g.acquirerName}: {formatCents(g.netCents)} ({g.count})
                </Badge>
              ))}
            </div>
          )}

          {/* Tabela */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Liquidação</TableHead>
                  <TableHead>Adquirente</TableHead>
                  <TableHead>Bandeira</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.expectedSettlementDate)}</TableCell>
                    <TableCell>{r.acquirerName}</TableCell>
                    <TableCell>{r.cardBrandName}</TableCell>
                    <TableCell>{CARD_KIND_LABELS[r.kind as CardKind] ?? r.kind}</TableCell>
                    <TableCell>
                      {r.installmentNumber}/{r.installmentsTotal}
                    </TableCell>
                    <TableCell className="text-right">{formatCents(r.grossCents)}</TableCell>
                    <TableCell className="text-right text-destructive">
                      −{formatCents(r.feeCents)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(r.netCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data.total > data.data.length && (
            <p className="text-xs text-muted-foreground text-center">
              Mostrando {data.data.length} de {data.total}. Refine o filtro para ver mais.
            </p>
          )}
        </>
      )}
    </div>
  );
}
