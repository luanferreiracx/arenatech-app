"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useState } from "react";
import { Plus, Package } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { DataTable } from "@/components/domain/data-table";
import { MoneyInput } from "@/components/inputs/money-input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { createLabOrderSchema, type CreateLabOrderInput, LAB_ORDER_STATUS_LABELS, LAB_ORDER_STATUS_VARIANT } from "@/lib/validators/operation";


export function LabOrdersTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState("");

  const listQuery = useQuery(trpc.operation.listLabOrders.queryOptions({
    page,
    pageSize: 20,
    status: statusFilter ? (statusFilter as "SENT" | "RECEIVED" | "IN_PROGRESS" | "COMPLETED" | "RETURNED" | "CANCELLED") : undefined,
  }));
  const labsQuery = useQuery(trpc.operation.listExternalLabs.queryOptions({}));

  const createMutation = useMutation(trpc.operation.createLabOrder.mutationOptions());
  const updateStatusMutation = useMutation(trpc.operation.updateLabOrderStatus.mutationOptions());

  const form = useForm<CreateLabOrderInput>({
    resolver: zodResolver(createLabOrderSchema),
    defaultValues: { labId: "", deviceDescription: "", problem: "", estimatedCost: 0 },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.operation.listLabOrders.queryKey() });

  const handleSubmit = (data: CreateLabOrderInput) => {
    createMutation.mutate(data, {
      onSuccess: () => { toast.success("Envio criado"); setShowForm(false); form.reset(); invalidate(); },
      onError: (e) => toast.error(e.message),
    });
  };

  const handleUpdateStatus = () => {
    if (!selectedId || !newStatus) return;
    updateStatusMutation.mutate(
      { id: selectedId, status: newStatus as "SENT" | "RECEIVED" | "IN_PROGRESS" | "COMPLETED" | "RETURNED" | "CANCELLED" },
      {
        onSuccess: () => { toast.success("Status atualizado"); setShowStatusDialog(false); invalidate(); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const columns = [
    { accessorKey: "deviceDescription", header: "Equipamento" },
    {
      accessorKey: "labName",
      header: "Laboratorio",
      cell: ({ row }: { row: { original: { lab?: { name: string } } } }) => row.original.lab?.name ?? "-",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: { status: string } } }) => (
        <StatusBadge variant={LAB_ORDER_STATUS_VARIANT[row.original.status] ?? "default"}>
          {LAB_ORDER_STATUS_LABELS[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "estimatedCost",
      header: "Custo Est.",
      cell: ({ row }: { row: { original: { estimatedCost: number | null } } }) =>
        row.original.estimatedCost ? formatCurrency(row.original.estimatedCost) : "-",
    },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }: { row: { original: { createdAt: string | Date } } }) =>
        new Date(row.original.createdAt).toLocaleDateString("pt-BR"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }: { row: { original: { id: string; status: string } } }) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setSelectedId(row.original.id); setNewStatus(""); setShowStatusDialog(true); }}
          disabled={row.original.status === "RETURNED" || row.original.status === "CANCELLED"}
        >
          Alterar Status
        </Button>
      ),
    },
  ];

  const labs = labsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Button onClick={() => { form.reset(); setShowForm(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Novo Envio
        </Button>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(LAB_ORDER_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQuery.data ? (
        listQuery.data.data.length === 0 ? (
          <EmptyState icon={Package} title="Nenhum envio" description="Crie um novo envio para laboratorio" />
        ) : (
          <DataTable columns={columns} data={listQuery.data.data} pageCount={listQuery.data.pageCount} pageIndex={page} onPageChange={setPage} />
        )
      ) : (
        <Skeleton className="h-96" />
      )}

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Envio para Laboratorio</DialogTitle>
            <DialogDescription>Registre o envio de equipamento para reparo externo</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div>
              <Label>Laboratorio</Label>
              <Select value={form.watch("labId")} onValueChange={(v) => form.setValue("labId", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {labs.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>{lab.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Equipamento</Label><Input {...form.register("deviceDescription")} /></div>
            <div><Label>Problema</Label><Textarea {...form.register("problem")} rows={2} /></div>
            <div>
              <Label>Custo Estimado</Label>
              <MoneyInput value={form.watch("estimatedCost") ?? 0} onChange={(v) => form.setValue("estimatedCost", v)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>Criar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Status Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status</DialogTitle>
            <DialogDescription>Selecione o novo status do envio</DialogDescription>
          </DialogHeader>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger><SelectValue placeholder="Novo status" /></SelectTrigger>
            <SelectContent>
              {Object.entries(LAB_ORDER_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateStatus} disabled={!newStatus || updateStatusMutation.isPending}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
