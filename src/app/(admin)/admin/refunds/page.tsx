"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { REFUND_STATUS_LABELS } from "@/lib/validators/addon";


function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  PROCESSED: "bg-green-500/10 text-green-500 border-green-500/20",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default function RefundsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [processId, setProcessId] = useState<string | null>(null);
  const [processNotes, setProcessNotes] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const refundsQuery = useQuery(
    trpc.admin.listRefunds.queryOptions({
      status: (statusFilter || undefined) as "PENDING" | "PROCESSED" | "CANCELLED" | undefined,
    })
  );
  const statsQuery = useQuery(trpc.admin.refundStats.queryOptions());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [["admin"]] });
  };

  const processMutation = useMutation(
    trpc.admin.processRefund.mutationOptions({
      onSuccess: () => {
        toast.success("Estorno processado!");
        setProcessId(null);
        setProcessNotes("");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const cancelMutation = useMutation(
    trpc.admin.cancelRefund.mutationOptions({
      onSuccess: () => {
        toast.success("Estorno cancelado!");
        setCancelId(null);
        setCancelReason("");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (refundsQuery.isLoading) return <LoadingState />;

  const refunds = refundsQuery.data?.data ?? [];
  const stats = statsQuery.data;

  return (
    <div>
      <PageHeader
        title="Estornos de Downgrades"
        subtitle="Gerencie os estornos pendentes de mudanca de plano"
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-yellow-500">
              {stats?.pending ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-500">
              {stats?.processed ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Processados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-muted-foreground">
              {stats?.cancelled ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Cancelados</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="PENDING">Pendentes</SelectItem>
            <SelectItem value="PROCESSED">Processados</SelectItem>
            <SelectItem value="CANCELLED">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {refunds.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              title="Nenhum estorno encontrado"
              description="Estornos serao gerados automaticamente quando tenants fizerem downgrade de plano."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.tenantId.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(r.refundAmount)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[r.status] ?? ""}
                      >
                        {r.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(r.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {r.notes ?? r.cancelReason ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "PENDING" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-500"
                            aria-label="Processar estorno"
                            onClick={() => setProcessId(r.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label="Cancelar estorno"
                            onClick={() => setCancelId(r.id)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Process Dialog */}
      <Dialog
        open={processId !== null}
        onOpenChange={() => setProcessId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Processar Estorno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Observacoes (opcional)</Label>
              <Textarea
                value={processNotes}
                onChange={(e) => setProcessNotes(e.target.value)}
                rows={3}
                placeholder="Adicione observacoes sobre o processamento..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setProcessId(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() =>
                  processId &&
                  processMutation.mutate({
                    id: processId,
                    notes: processNotes || null,
                  })
                }
                disabled={processMutation.isPending}
              >
                {processMutation.isPending
                  ? "Processando..."
                  : "Confirmar Processamento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelId !== null} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Estorno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Motivo do cancelamento</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Informe o motivo do cancelamento..."
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelId(null)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  cancelId &&
                  cancelReason.trim() &&
                  cancelMutation.mutate({
                    id: cancelId,
                    reason: cancelReason,
                  })
                }
                disabled={cancelMutation.isPending || !cancelReason.trim()}
              >
                {cancelMutation.isPending
                  ? "Cancelando..."
                  : "Confirmar Cancelamento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
