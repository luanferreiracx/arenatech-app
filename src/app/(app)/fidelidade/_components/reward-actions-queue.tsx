"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Money } from "@/components/domain/money";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Check, X, Inbox } from "lucide-react";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";

type ActionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED" | "USED";
type RewardType = "DISCOUNT_PERCENTAGE" | "DISCOUNT_FIXED" | "CASHBACK" | "GIFT";

const STATUS_LABELS: Record<ActionStatus, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
  USED: "Utilizada",
};

const STATUS_VARIANTS: Record<ActionStatus, "warning" | "success" | "destructive" | "default" | "info"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "default",
  EXPIRED: "default",
  USED: "info",
};

const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  DISCOUNT_PERCENTAGE: "Desconto %",
  DISCOUNT_FIXED: "Desconto R$",
  CASHBACK: "Cashback",
  GIFT: "Brinde",
};

type ActionRow = {
  id: string;
  status: ActionStatus;
  rewardType: RewardType;
  value: number; // centavos
  percentage: number;
  customerName: string | null;
  customerPhone: string | null;
  campaign: { name: string } | null;
  createdAt: string | Date;
  rejectionReason: string | null;
};

/**
 * Fila de aprovação das submissões de fidelidade. O cliente publica (story/reel/
 * post) e a submissão entra PENDENTE; aqui o admin aprova (credita cashback/libera
 * o benefício) ou rejeita com motivo. O backend já tinha CAS PENDING→APPROVED e o
 * crédito do cashback — faltava a UI.
 */
export function RewardActionsQueue() {
  // Aprovar/rejeitar submissão é decisão de gestão (admin no servidor).
  const isAdmin = useIsTenantAdmin();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ActionStatus>("PENDING");
  const [rejectTarget, setRejectTarget] = useState<ActionRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveTarget, setApproveTarget] = useState<ActionRow | null>(null);

  const listQuery = useQuery(
    trpc.reward.listActions.queryOptions({ status: statusFilter, pageSize: 50 }),
  );
  const rows = (listQuery.data?.data ?? []) as unknown as ActionRow[];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["reward"]] });

  const approveMut = useMutation(
    trpc.reward.approveAction.mutationOptions({
      onSuccess: () => {
        toast.success("Recompensa aprovada");
        setApproveTarget(null);
        void invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const rejectMut = useMutation(
    trpc.reward.rejectAction.mutationOptions({
      onSuccess: () => {
        toast.success("Recompensa rejeitada");
        setRejectTarget(null);
        setRejectReason("");
        void invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (listQuery.isLoading) return <LoadingState variant="table" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ActionStatus)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as ActionStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {statusFilter === "PENDING" && rows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {rows.length} submissão(ões) aguardando aprovação
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={statusFilter === "PENDING" ? "Nenhuma submissão pendente" : "Nenhuma submissão"}
          description={
            statusFilter === "PENDING"
              ? "Quando um cliente publicar sobre a loja, a submissão aparece aqui para aprovação."
              : "Nenhuma submissão neste status."
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead>Recompensa</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="min-w-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.customerName ?? "—"}</p>
                      {a.customerPhone && (
                        <p className="truncate text-xs text-muted-foreground">{a.customerPhone}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {a.campaign?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge variant="info">{REWARD_TYPE_LABELS[a.rewardType]}</StatusBadge>
                      <span className="text-sm tabular-nums">
                        {a.rewardType === "DISCOUNT_PERCENTAGE"
                          ? `${a.percentage}%`
                          : <Money cents={a.value} />}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge variant={STATUS_VARIANTS[a.status]}>
                      {STATUS_LABELS[a.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    {a.status === "PENDING" ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isAdmin}
                          className="h-8 text-success hover:text-success"
                          onClick={() => setApproveTarget(a)}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Aprovar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isAdmin}
                          className="h-8 text-destructive hover:text-destructive"
                          onClick={() => { setRejectTarget(a); setRejectReason(""); }}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Rejeitar
                        </Button>
                      </div>
                    ) : a.rejectionReason ? (
                      <span className="text-xs text-muted-foreground line-clamp-2">
                        {a.rejectionReason}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Aprovação: confirma porque credita cashback / libera benefício */}
      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(o) => !o && setApproveTarget(null)}
        title="Aprovar recompensa?"
        description={
          approveTarget?.rewardType === "CASHBACK"
            ? "O cashback será creditado no saldo do cliente."
            : "O benefício ficará disponível para uso pelo cliente."
        }
        confirmLabel="Aprovar"
        isLoading={approveMut.isPending}
        onConfirm={() => {
          if (approveTarget) approveMut.mutate({ actionId: approveTarget.id });
        }}
      />

      {/* Rejeição: exige motivo (o backend valida min 1 char) */}
      <Dialog open={rejectTarget !== null} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar recompensa</DialogTitle>
            <DialogDescription>
              {rejectTarget?.customerName
                ? `Submissão de ${rejectTarget.customerName}.`
                : "Informe o motivo da rejeição."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Motivo *</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex.: publicação não marca a loja"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 1 || rejectMut.isPending}
              onClick={() => {
                if (rejectTarget) {
                  rejectMut.mutate({ actionId: rejectTarget.id, reason: rejectReason.trim() });
                }
              }}
            >
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
