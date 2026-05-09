"use client";

import { useState } from "react";
import { Plus, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/domain/data-table/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";
import {
  labOrderStatusValues,
  labOrderStatusLabels,
} from "@/lib/validators/operation";

interface LabOrderRow {
  id: string;
  status: string;
  deviceDescription: string | null;
  problem: string | null;
  estimatedCost: unknown;
  finalCost: unknown;
  sentAt: Date;
  notes: string | null;
  lab: { id: string; name: string };
}

function formatMoney(value: unknown): string {
  const num = Number(value);
  if (!num) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    SENT: "info",
    RECEIVED: "warning",
    IN_PROGRESS: "warning",
    COMPLETED: "success",
    RETURNED: "success",
    CANCELLED: "destructive",
  };
  return map[status] ?? "default";
}

export function LabOrdersTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [statusDialogOrder, setStatusDialogOrder] = useState<LabOrderRow | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [finalCost, setFinalCost] = useState<string>("");
  const [statusNotes, setStatusNotes] = useState<string>("");

  const { data, refetch } = useQuery(
    trpc.operation.listLabOrders.queryOptions({
      page,
      pageSize: 50,
      status: (statusFilter as typeof labOrderStatusValues[number]) || undefined,
    }),
  );

  const updateStatusMutation = useMutation(
    trpc.operation.updateLabOrderStatus.mutationOptions({
      onSuccess: () => {
        toast.success("Status atualizado!");
        setStatusDialogOrder(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function openStatusDialog(row: LabOrderRow) {
    setStatusDialogOrder(row);
    setNewStatus(row.status);
    setFinalCost("");
    setStatusNotes("");
  }

  function handleUpdateStatus() {
    if (!statusDialogOrder || !newStatus) return;
    updateStatusMutation.mutate({
      id: statusDialogOrder.id,
      status: newStatus as typeof labOrderStatusValues[number],
      finalCost: finalCost ? Number(finalCost) : undefined,
      notes: statusNotes || undefined,
    });
  }

  const columns: ColumnDef<LabOrderRow>[] = [
    {
      accessorKey: "lab.name",
      header: "Laboratório",
      cell: ({ row }) => row.original.lab.name,
    },
    {
      accessorKey: "deviceDescription",
      header: "Equipamento",
      cell: ({ row }) => row.original.deviceDescription ?? "—",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge variant={getStatusVariant(row.original.status)}>
          {labOrderStatusLabels[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "estimatedCost",
      header: "Custo Est.",
      cell: ({ row }) => formatMoney(row.original.estimatedCost),
    },
    {
      accessorKey: "finalCost",
      header: "Custo Final",
      cell: ({ row }) => formatMoney(row.original.finalCost),
    },
    {
      accessorKey: "sentAt",
      header: "Enviado em",
      cell: ({ row }) => new Date(row.original.sentAt).toLocaleDateString("pt-BR"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <Button size="icon" variant="ghost" onClick={() => openStatusDialog(row.original)}>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "ALL" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            {labOrderStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                {labOrderStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => router.push("/operation/lab-orders/new")}>
          <Plus className="w-4 h-4 mr-1" /> Novo Envio
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={(data?.items as LabOrderRow[]) ?? []}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={50}
        onPageChange={setPage}
      />

      <Dialog open={!!statusDialogOrder} onOpenChange={() => setStatusDialogOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Novo Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {labOrderStatusValues.map((s) => (
                    <SelectItem key={s} value={s}>
                      {labOrderStatusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(newStatus === "COMPLETED" || newStatus === "RETURNED") && (
              <div>
                <Label htmlFor="finalCost">Custo Final (R$)</Label>
                <Input
                  id="finalCost"
                  type="number"
                  step="0.01"
                  value={finalCost}
                  onChange={(e) => setFinalCost(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label htmlFor="statusNotes">Observações</Label>
              <Textarea
                id="statusNotes"
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStatusDialogOrder(null)}>Cancelar</Button>
              <Button onClick={handleUpdateStatus} disabled={updateStatusMutation.isPending}>
                {updateStatusMutation.isPending ? "Salvando..." : "Atualizar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
