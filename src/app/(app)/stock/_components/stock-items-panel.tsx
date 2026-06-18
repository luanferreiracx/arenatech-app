"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  stockItemStatusLabels,
  stockItemConditionLabels,
} from "@/lib/validators/stock-item";
import { useCan } from "@/lib/auth/use-capabilities";

type StockItemRow = {
  id: string;
  imei: string | null;
  serialNumber: string | null;
  status: string;
  condition: string;
};

const statusVariant: Record<string, "success" | "destructive" | "warning" | "default"> = {
  AVAILABLE: "success",
  SOLD: "default",
  DEFECTIVE: "destructive",
  BLOCKED: "warning",
  RESERVED: "warning",
  RETURNED: "warning",
};

export function StockItemsPanel({ productId }: { productId: string }) {
  const trpc = useTRPC();
  // ADR 0053: marcar defeito/reativar é movimento do operador; dar baixa (perda) é admin.
  const canMoveStock = useCan("moveStock");
  const canDispose = useCan("disposeStock");
  const queryClient = useQueryClient();
  const [disposeTarget, setDisposeTarget] = useState<StockItemRow | null>(null);
  const [disposeReason, setDisposeReason] = useState("");

  const { data, isLoading } = useQuery(
    trpc.stock.listStockItems.queryOptions({ productId, pageSize: 100 }),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.stock.listStockItems.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.stock.getById.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.stock.list.queryKey() });
  };

  const statusMutation = useMutation(
    trpc.stock.changeItemStatus.mutationOptions({
      onSuccess: () => {
        toast.success("Status do item atualizado");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const disposeMutation = useMutation(
    trpc.stock.disposeStockItem.mutationOptions({
      onSuccess: () => {
        toast.success("Baixa registrada");
        setDisposeTarget(null);
        setDisposeReason("");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const items = (data?.data ?? []) as StockItemRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Unidades em Estoque</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando unidades...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma unidade cadastrada. Use Compra de Aparelhos para dar entrada.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IMEI / Serie</TableHead>
                <TableHead>Condicao</TableHead>
                <TableHead>Status</TableHead>
                {canMoveStock && <TableHead className="text-right">Acoes</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isPending =
                  (statusMutation.isPending && statusMutation.variables?.stockItemId === item.id) ||
                  (disposeMutation.isPending && disposeMutation.variables?.stockItemId === item.id);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">
                      {item.imei ?? item.serialNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {stockItemConditionLabels[item.condition] ?? item.condition}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={statusVariant[item.status] ?? "default"}>
                        {stockItemStatusLabels[item.status] ?? item.status}
                      </StatusBadge>
                    </TableCell>
                    {canMoveStock && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {item.status === "AVAILABLE" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              statusMutation.mutate({
                                stockItemId: item.id,
                                newStatus: "DEFECTIVE",
                                reason: "Marcado como defeituoso no estoque",
                              })
                            }
                          >
                            Marcar defeito
                          </Button>
                        )}
                        {item.status === "DEFECTIVE" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              statusMutation.mutate({
                                stockItemId: item.id,
                                newStatus: "AVAILABLE",
                                reason: "Reativado para venda",
                              })
                            }
                          >
                            Reativar
                          </Button>
                        )}
                        {/* Baixa/descarte (perda de patrimônio): admin (ADR 0053). */}
                        {canDispose && ["AVAILABLE", "DEFECTIVE", "BLOCKED", "RETURNED"].includes(item.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={isPending}
                            onClick={() => {
                              setDisposeTarget(item);
                              setDisposeReason("");
                            }}
                          >
                            Dar baixa
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!disposeTarget} onOpenChange={(o) => !o && setDisposeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar baixa na unidade</DialogTitle>
            <DialogDescription>
              {disposeTarget?.imei ?? disposeTarget?.serialNumber ?? "Unidade"} sera retirada do
              estoque. Use para perda/descarte — para vender mesmo com defeito, use o PDV.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da baixa *</Label>
            <Textarea
              value={disposeReason}
              onChange={(e) => setDisposeReason(e.target.value)}
              placeholder="Ex.: Perda total por queda, roubo, inutilizado."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={disposeReason.trim().length < 3 || disposeMutation.isPending}
              onClick={() => {
                if (!disposeTarget) return;
                disposeMutation.mutate({
                  stockItemId: disposeTarget.id,
                  reason: disposeReason.trim(),
                });
              }}
            >
              {disposeMutation.isPending ? "Registrando..." : "Confirmar baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
