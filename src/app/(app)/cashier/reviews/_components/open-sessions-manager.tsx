"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/inputs/money-input";
import { Lock, SlidersHorizontal } from "lucide-react";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";

function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Ferramentas de gerência sobre caixas ABERTOS (auditoria financeira 2026-07-11):
 * forçar fechamento de uma sessão presa e lançar ajuste manual de gaveta. Ambas
 * as procedures são admin-only no servidor; o componente só renderiza para admin.
 */
export function OpenSessionsManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isAdmin = useIsTenantAdmin();

  const [forceTarget, setForceTarget] = useState<{ id: string; userName: string } | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; userName: string } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustNature, setAdjustNature] = useState<"INCOME" | "OUTCOME">("INCOME");
  const [adjustDescription, setAdjustDescription] = useState("");

  const openQuery = useQuery({
    ...trpc.cashier.openCashiers.queryOptions(),
    enabled: isAdmin,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.cashier.openCashiers.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.cashier.pendingReviews.queryKey() });
  };

  const forceCloseMut = useMutation(
    trpc.cashier.forceClose.mutationOptions({
      onSuccess: () => {
        toast.success("Caixa fechado. Fica pendente de conferência.");
        setForceTarget(null); setForceReason("");
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const adjustMut = useMutation(
    trpc.cashier.manualAdjustment.mutationOptions({
      onSuccess: () => {
        toast.success("Ajuste registrado.");
        setAdjustTarget(null); setAdjustAmount(0); setAdjustDescription("");
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (!isAdmin) return null;

  const sessions = openQuery.data ?? [];
  if (openQuery.isLoading || sessions.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Caixas abertos (gerência)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operador</TableHead>
              <TableHead>Aberto em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.userName ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateTime(s.openedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAdjustTarget({ id: s.id, userName: s.userName ?? "—" })}>
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Ajuste
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => setForceTarget({ id: s.id, userName: s.userName ?? "—" })}>
                      <Lock className="mr-2 h-4 w-4" />
                      Forçar fechamento
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Forçar fechamento */}
      <Dialog open={!!forceTarget} onOpenChange={(o) => { if (!o) setForceTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forçar fechamento</DialogTitle>
            <DialogDescription>
              Fecha o caixa de {forceTarget?.userName} sem conferência física. O caixa fica
              pendente de conferência (o saldo contado será informado na conferência real).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Input value={forceReason} onChange={(e) => setForceReason(e.target.value)} placeholder="Ex: operador ausente" maxLength={200} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={forceReason.trim().length < 3 || forceCloseMut.isPending}
              onClick={() => forceTarget && forceCloseMut.mutate({ sessionId: forceTarget.id, reason: forceReason.trim() })}
            >
              {forceCloseMut.isPending ? "Fechando..." : "Forçar fechamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ajuste manual de gaveta */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste de gaveta</DialogTitle>
            <DialogDescription>
              Lança um ajuste manual (entrada ou saída) na gaveta de {adjustTarget?.userName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={adjustNature} onValueChange={(v) => setAdjustNature(v as "INCOME" | "OUTCOME")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Entrada (+)</SelectItem>
                  <SelectItem value="OUTCOME">Saída (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Valor *</Label>
              <MoneyInput value={adjustAmount} onChange={setAdjustAmount} autoFocus />
            </div>
            <div className="space-y-1">
              <Label>Descrição *</Label>
              <Input value={adjustDescription} onChange={(e) => setAdjustDescription(e.target.value)} placeholder="Ex: correção de troco" maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancelar</Button>
            <Button
              disabled={adjustAmount <= 0 || adjustDescription.trim().length < 3 || adjustMut.isPending}
              onClick={() => adjustTarget && adjustMut.mutate({ sessionId: adjustTarget.id, amount: adjustAmount, nature: adjustNature, reason: adjustDescription.trim() })}
            >
              {adjustMut.isPending ? "Registrando..." : "Registrar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
