"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { format } from "date-fns";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "info";

/**
 * As `action` do audit log são verbos livres em lowercase (updated, removed,
 * added, cancel, approve, paid, force_close, card_receivable_unsettle…). O mapa
 * antigo (CREATE/UPDATE/DELETE/LOGIN) nunca casava — todo badge caía em cinza.
 * Aqui classificamos por palavra-chave, com ordem importando (unsettle antes de
 * settle; delete antes de duplicate).
 */
function actionVariant(action: string): BadgeVariant {
  const a = action.toLowerCase();
  if (/(delet|remov|cancel|unsettle)/.test(a)) return "destructive";
  if (/(reset|force_close|manual)/.test(a)) return "warning";
  if (/(add|creat|approv|paid|settle|link|duplicate|restore)/.test(a)) return "success";
  if (/(updat|chang|adjust|edit)/.test(a)) return "info";
  return "default";
}

/** Rótulos legíveis (pt-BR) para as ações mais comuns; fallback = a própria ação. */
const ACTION_LABELS: Record<string, string> = {
  created: "Criado",
  updated: "Atualizado",
  deleted: "Excluído",
  removed: "Removido",
  added: "Adicionado",
  restored: "Restaurado",
  approve: "Aprovado",
  approved: "Aprovado",
  cancel: "Cancelado",
  canceled: "Cancelado",
  paid: "Pago",
  reset_password: "Senha redefinida",
  reset_two_factor: "2FA redefinido",
  force_close: "Fechamento forçado",
  seller_changed: "Vendedor alterado",
  date_changed: "Data alterada",
  customer_linked: "Cliente vinculado",
  duplicate_model: "Modelo duplicado",
  delete_model: "Modelo excluído",
  card_receivable_settle: "Recebível liquidado",
  card_receivable_unsettle: "Liquidação revertida",
  cash_manual_adjustment: "Ajuste manual de caixa",
  sale_depix_manual: "DePix manual",
  bulk_adjust_percent: "Ajuste em massa (%)",
  bulk_adjust_fixed: "Ajuste em massa (R$)",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action.toLowerCase()] ?? action;
}

export default function AuditLogsPage() {
  const trpc = useTRPC();
  const [filters, setFilters] = useState({
    action: "",
    entity: "",
    dateFrom: "",
    dateTo: "",
    page: 0,
  });

  const { data, isLoading } = useQuery(
    trpc.settings.listAuditLogs.queryOptions({
      action: filters.action || undefined,
      entity: filters.entity || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page: filters.page,
      pageSize: 50,
    })
  );

  return (
    <div>
      <PageHeader title="Logs de Atividade" subtitle="Historico de acoes realizadas no sistema" />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Acao</Label>
              <Select value={filters.action} onValueChange={(v) => setFilters((f) => ({ ...f, action: v === "__all__" ? "" : v, page: 0 }))}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {data?.actions?.map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Tabela</Label>
              <Select value={filters.entity} onValueChange={(v) => setFilters((f) => ({ ...f, entity: v === "__all__" ? "" : v, page: 0 }))}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {data?.entities?.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Data Inicio</Label>
              <DateInput value={filters.dateFrom} onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v, page: 0 }))} aria-label="Data de inicio" />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Data Fim</Label>
              <DateInput value={filters.dateTo} onChange={(v) => setFilters((f) => ({ ...f, dateTo: v, page: 0 }))} aria-label="Data de fim" />
            </div>
            <div>
              {(filters.action || filters.entity || filters.dateFrom || filters.dateTo) && (
                <Button variant="outline" size="sm" onClick={() => setFilters({ action: "", entity: "", dateFrom: "", dateTo: "", page: 0 })}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}

      {!isLoading && data && (
        <Card>
          <CardContent className="p-0">
            {data.data.length === 0 ? (
              <EmptyState title="Nenhum log encontrado" description="Ajuste os filtros ou aguarde atividades no sistema." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Data/Hora</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Acao</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Tabela</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">ID Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((log) => (
                      <tr key={log.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-muted-foreground">
                          {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss")}
                        </td>
                        <td className="p-3">
                          <StatusBadge variant={actionVariant(log.action)}>
                            {actionLabel(log.action)}
                          </StatusBadge>
                        </td>
                        <td className="p-3">{log.entity || "-"}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{log.entityId || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {data && data.pageCount > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={filters.page === 0} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            Pagina {filters.page + 1} de {data.pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={filters.page >= data.pageCount - 1} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
            Proxima
          </Button>
        </div>
      )}
    </div>
  );
}
