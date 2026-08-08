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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/inputs/money-input";
import { LoadingState } from "@/components/domain/loading-state";
import { EmptyState } from "@/components/domain/empty-state";
import { QueryErrorState } from "@/components/domain/query-error-state";
import { Eye, CheckCircle } from "lucide-react";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PendingReviewsList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Conferência é ação de gestor (espelha o gate do servidor em cashier.review).
  const isAdmin = useIsTenantAdmin();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportedBalance, setReportedBalance] = useState(0);
  const [notes, setNotes] = useState("");

  const pendingQuery = useQuery(trpc.cashier.pendingReviews.queryOptions());
  const reviewMutation = useMutation(trpc.cashier.review.mutationOptions());

  const handleOpenReview = (register: { id: string; expectedBalance: number | null }) => {
    setSelectedId(register.id);
    setReportedBalance(register.expectedBalance ?? 0);
    setNotes("");
  };

  const handleSubmitReview = () => {
    if (!selectedId) return;
    reviewMutation.mutate(
      {
        cashSessionId: selectedId,
        reportedBalance,
        notes: notes || undefined,
      },
      {
        onSuccess: (result) => {
          const diff = result.difference;
          const label =
            diff === 0
              ? "Confere!"
              : diff > 0
                ? `Sobra de ${formatCents(diff)}`
                : `Falta de ${formatCents(Math.abs(diff))}`;
          toast.success(`Conferencia concluida. ${label}`);
          setSelectedId(null);
          queryClient.invalidateQueries({
            queryKey: trpc.cashier.pendingReviews.queryKey(),
          });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  if (pendingQuery.isLoading) return <LoadingState />;

  // Sem este ramo, o 403 caía no `data.length === 0` abaixo e o operador lia
  // "Nenhum caixa pendente de conferencia" — ou seja, o sistema afirmava que
  // estava tudo conferido para quem não podia ver nada.
  if (pendingQuery.isError) {
    return (
      <QueryErrorState
        error={pendingQuery.error}
        forbiddenDescription="A conferencia de caixa e da gerencia: ela existe justamente para que quem fechou o caixa nao confira o proprio."
      />
    );
  }

  const data = pendingQuery.data?.data ?? [];

  if (data.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Nenhum caixa pendente de conferencia"
        description="Todos os caixas fechados ja foram conferidos."
      />
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data.length} caixa(s) pendente(s) de conferencia
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {/* VAR-2: `Saldo Sistema` nascia fora de vista (tabela de 623px
                    em 270). É o valor que o gerente confere — a razão de a tela
                    existir. Duas colunas de data ocupavam as posições 2 e 3. */}
                <TableHead>Operador</TableHead>
                <TableHead className="text-right">Saldo Sistema</TableHead>
                <TableHead>Fechado em</TableHead>
                <TableHead>Aberto em</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.userName}</TableCell>
                  <TableCell className="text-right font-mono font-semibold whitespace-nowrap">
                    {r.expectedBalance != null
                      ? formatCents(r.expectedBalance)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-warning">
                    {r.closedAt ? formatDateTime(r.closedAt) : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(r.openedAt)}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Button
                        size="sm"
                        onClick={() => handleOpenReview(r)}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        Conferir
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Conferência: admin
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferir Caixa</DialogTitle>
            <DialogDescription>
              Informe o saldo real contado em dinheiro. Diferencas serao registradas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="saldo-conferido-contagem-em-dinheiro">Saldo conferido (contagem em dinheiro) *</Label>
              <MoneyInput id="saldo-conferido-contagem-em-dinheiro"
                value={reportedBalance}
                onChange={setReportedBalance}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="observacao-opcional">Observacao (opcional)</Label>
              <Textarea id="observacao-opcional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observacao sobre a conferencia..."
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedId(null)}
              disabled={reviewMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitReview}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? "Processando..." : "Confirmar Conferencia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
