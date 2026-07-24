"use client";
import { formatReaisBRL as formatCurrency } from "@/lib/format";

import { useState } from "react";
import { FileText, CheckCircle, XCircle, DollarSign, ClipboardList, ShoppingCart } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState } from "@/components/domain/loading-state";
import { EmptyState } from "@/components/domain/empty-state";


function getDefaultDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    dateFrom: firstDay.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10),
  };
}

export function NfReportContent() {
  const trpc = useTRPC();
  const defaults = getDefaultDates();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [nfStatus, setNfStatus] = useState<"all" | "with_nf" | "without_nf">("all");

  const query = useQuery(
    trpc.report.nfReport.queryOptions({
      dateFrom,
      dateTo,
      nfStatus,
    }),
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs uppercase">De</Label>
            <DateInput value={dateFrom} onChange={setDateFrom} aria-label="Data de inicio" />
          </div>
          <div>
            <Label className="text-xs uppercase">Ate</Label>
            <DateInput value={dateTo} onChange={setDateTo} aria-label="Data de fim" />
          </div>
          <div>
            <Label className="text-xs uppercase">Status</Label>
            <Select value={nfStatus} onValueChange={(v) => setNfStatus(v as "all" | "with_nf" | "without_nf")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="with_nf">Com NF</SelectItem>
                <SelectItem value="without_nf">Sem NF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => query.refetch()}>Filtrar</Button>
        </div>
      </Card>

      {/* Totals */}
      {query.data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Vendas total</p>
            <p className="text-xl font-bold text-primary">{query.data.totals.salesTotal}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Vendas sem NF</p>
            <p className="text-xl font-bold text-destructive">{query.data.totals.salesWithoutNf}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">OS total</p>
            <p className="text-xl font-bold text-primary">{query.data.totals.osTotal}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">OS sem NFS-e</p>
            <p className="text-xl font-bold text-destructive">{query.data.totals.osWithoutNf}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Valor total</p>
            <p className="text-lg font-bold">{formatCurrency(query.data.totals.valueTotal)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Valor sem NF</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(query.data.totals.valueWithoutNf)}</p>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        {query.isLoading ? (
          <LoadingState variant="table" />
        ) : !query.data?.lines.length ? (
          <EmptyState
            icon={FileText}
            title="Nenhum registro no periodo"
            description="Ajuste o filtro de datas para ver resultados."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="text-left p-3 font-medium">Tipo</th>
                  <th className="text-left p-3 font-medium">Documento</th>
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Cliente</th>
                  <th className="text-right p-3 font-medium">Valor</th>
                  <th className="text-left p-3 font-medium">NF</th>
                </tr>
              </thead>
              <tbody>
                {query.data.lines.map((l, i) => (
                  <tr key={`${l.doc}-${i}`} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      {l.type === "SALE" ? (
                        <span className="text-xs font-semibold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">Venda</span>
                      ) : (
                        <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">OS</span>
                      )}
                    </td>
                    <td className="p-3 font-semibold">{l.doc}</td>
                    <td className="p-3 text-muted-foreground">{l.date}</td>
                    <td className="p-3">{l.customer}</td>
                    <td className="p-3 text-right">{formatCurrency(l.value)}</td>
                    <td className="p-3">
                      {l.hasNf ? (
                        <span className="text-success flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span className="text-xs">{l.nfType}{l.nfNumber ? ` n\u00ba ${l.nfNumber}` : ""}</span>
                        </span>
                      ) : (
                        <span className="text-destructive flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span className="text-xs">Sem NF</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
