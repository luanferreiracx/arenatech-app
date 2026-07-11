"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Unlock,
  ArrowUpFromLine,
  ArrowDownToLine,
  Clock,
  Receipt,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  MOVEMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/validators/cashier";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CashierDashboard() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showWithdrawalDialog, setShowWithdrawalDialog] = useState(false);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

  // Form state
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingNotes, setOpeningNotes] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState(0);
  const [withdrawalDescription, setWithdrawalDescription] = useState("");
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositDescription, setDepositDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expenseMethod, setExpenseMethod] = useState("dinheiro");
  const [expenseDescription, setExpenseDescription] = useState("");

  const currentQuery = useQuery(trpc.cashier.current.queryOptions());

  const openMutation = useMutation(
    trpc.cashier.open.mutationOptions({
      onSuccess: () => {
        toast.success("Caixa aberto com sucesso!");
        setShowOpenDialog(false);
        setOpeningBalance(0);
        setOpeningNotes("");
        queryClient.invalidateQueries({ queryKey: trpc.cashier.current.queryKey() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const withdrawalMutation = useMutation(
    trpc.cashier.withdrawal.mutationOptions({
      onSuccess: () => {
        toast.success("Sangria registrada com sucesso!");
        setShowWithdrawalDialog(false);
        setWithdrawalAmount(0);
        setWithdrawalDescription("");
        queryClient.invalidateQueries({ queryKey: trpc.cashier.current.queryKey() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const depositMutation = useMutation(
    trpc.cashier.deposit.mutationOptions({
      onSuccess: () => {
        toast.success("Suprimento registrado com sucesso!");
        setShowDepositDialog(false);
        setDepositAmount(0);
        setDepositDescription("");
        queryClient.invalidateQueries({ queryKey: trpc.cashier.current.queryKey() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const expenseMutation = useMutation(
    trpc.cashier.expense.mutationOptions({
      onSuccess: () => {
        toast.success("Despesa registrada com sucesso!");
        setShowExpenseDialog(false);
        setExpenseAmount(0);
        setExpenseMethod("dinheiro");
        setExpenseDescription("");
        queryClient.invalidateQueries({ queryKey: trpc.cashier.current.queryKey() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  if (currentQuery.isLoading) {
    return <CashierSkeleton />;
  }

  if (currentQuery.isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Erro ao carregar dados do caixa. Tente novamente.
        </CardContent>
      </Card>
    );
  }

  const data = currentQuery.data;

  // ── Closed state: show open button + recent history ──
  if (!data?.isOpen) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Caixa Fechado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Seu caixa esta fechado. Abra o caixa para iniciar as operacoes.
            </p>
            <Button onClick={() => setShowOpenDialog(true)}>
              <Unlock className="mr-2 h-4 w-4" />
              Abrir Caixa
            </Button>
          </CardContent>
        </Card>

        {data && "recentRegisters" in data && data.recentRegisters && data.recentRegisters.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Ultimas Aberturas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Saldo Inicial</TableHead>
                    <TableHead className="text-right">Diferenca</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentRegisters.map((reg) => (
                    <TableRow
                      key={reg.id}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => router.push(`/cashier/${reg.id}`)}
                    >
                      <TableCell>{formatDateTime(reg.openedAt)}</TableCell>
                      <TableCell>
                        <Badge variant={reg.status === "OPEN" ? "default" : "secondary"}>
                          {reg.status === "OPEN" ? "Aberto" : "Fechado"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCents(reg.openingBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {reg.difference != null ? (
                          <span
                            className={
                              reg.difference < 0
                                ? "text-destructive"
                                : reg.difference > 0
                                  ? "text-green-600"
                                  : ""
                            }
                          >
                            {formatCents(reg.difference)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <OpenCashierDialog
          open={showOpenDialog}
          onOpenChange={setShowOpenDialog}
          openingBalance={openingBalance}
          setOpeningBalance={setOpeningBalance}
          openingNotes={openingNotes}
          setOpeningNotes={setOpeningNotes}
          isPending={openMutation.isPending}
          onSubmit={() => {
            openMutation.mutate({
              initialBalance: openingBalance,
              openingNote: openingNotes || undefined,
            });
          }}
        />
      </>
    );
  }

  // ── Open state: show dashboard ──
  const summary = data.summary!;
  const movements = data.movements;

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="pt-6">
            <div className="text-sm opacity-80">Saldo Dinheiro (Esperado)</div>
            <div className="text-2xl font-bold">
              {formatCents(summary.expectedCashBalance)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-600 text-white">
          <CardContent className="pt-6">
            <div className="text-sm opacity-80">Total Vendas</div>
            <div className="text-2xl font-bold">
              {formatCents(summary.totalSales)}
            </div>
            <div className="text-sm opacity-80">
              {summary.salesCount} venda(s)
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500 text-white">
          <CardContent className="pt-6">
            <div className="text-sm opacity-80">Sangrias</div>
            <div className="text-2xl font-bold">
              {formatCents(summary.totalWithdrawals)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-600 text-white">
          <CardContent className="pt-6">
            <div className="text-sm opacity-80">Suprimentos</div>
            <div className="text-2xl font-bold">
              {formatCents(summary.totalDeposits)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button
          variant="outline"
          className="text-green-600 border-green-600 hover:bg-green-50"
          onClick={() => setShowDepositDialog(true)}
        >
          <ArrowDownToLine className="mr-2 h-4 w-4" />
          Suprimento
        </Button>
        <Button
          variant="outline"
          className="text-amber-600 border-amber-600 hover:bg-amber-50"
          onClick={() => setShowWithdrawalDialog(true)}
        >
          <ArrowUpFromLine className="mr-2 h-4 w-4" />
          Sangria
        </Button>
        <Button
          variant="outline"
          className="text-red-600 border-red-600 hover:bg-red-50"
          onClick={() => setShowExpenseDialog(true)}
        >
          <Receipt className="mr-2 h-4 w-4" />
          Despesa
        </Button>
        <Button
          variant="destructive"
          onClick={() => router.push("/cashier/close")}
        >
          <Lock className="mr-2 h-4 w-4" />
          Fechar Caixa
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Movements table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Movimentacoes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Obs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      Nenhuma movimentacao registrada ainda
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">
                        {formatTime(m.createdAt)}
                      </TableCell>
                      <TableCell>
                        <MovementTypeBadge type={m.type} />
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {m.description ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {m.paymentMethod
                          ? (PAYMENT_METHOD_LABELS[m.paymentMethod] ??
                            m.paymentMethod)
                          : "-"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          m.nature === "INCOME"
                            ? "text-green-600"
                            : "text-destructive"
                        }`}
                      >
                        {m.nature === "INCOME" ? "+" : "-"}{" "}
                        {formatCents(m.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {m.description ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Payment method summary */}
        <PaymentMethodSummaryCard movements={movements} totalSales={summary.totalSales} />
      </div>

      {/* Dialogs */}
      <WithdrawalDialog
        open={showWithdrawalDialog}
        onOpenChange={setShowWithdrawalDialog}
        amount={withdrawalAmount}
        setAmount={setWithdrawalAmount}
        description={withdrawalDescription}
        setDescription={setWithdrawalDescription}
        availableBalance={summary.expectedCashBalance}
        isPending={withdrawalMutation.isPending}
        onSubmit={() => {
          withdrawalMutation.mutate({
            amount: withdrawalAmount,
            description: withdrawalDescription,
          });
        }}
      />

      <DepositDialog
        open={showDepositDialog}
        onOpenChange={setShowDepositDialog}
        amount={depositAmount}
        setAmount={setDepositAmount}
        description={depositDescription}
        setDescription={setDepositDescription}
        isPending={depositMutation.isPending}
        onSubmit={() => {
          depositMutation.mutate({
            amount: depositAmount,
            description: depositDescription,
          });
        }}
      />

      {/* Despesa avulsa (sai da gaveta se em dinheiro) */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Despesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Despesa avulsa paga pelo caixa (ex.: material de limpeza, lanche).
              Em dinheiro, sai da gaveta e não pode exceder o saldo disponível.
            </p>
            <p className="text-sm font-medium">
              Saldo disponível em dinheiro:{" "}
              <span className="font-mono">{formatCents(summary.expectedCashBalance)}</span>
            </p>
            <div>
              <Label>Valor *</Label>
              <MoneyInput value={expenseAmount} onChange={setExpenseAmount} autoFocus />
            </div>
            <div>
              <Label>Forma de pagamento *</Label>
              <Select value={expenseMethod} onValueChange={setExpenseMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro (sai da gaveta)</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de débito</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                placeholder="Ex: Material de limpeza"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpenseDialog(false)} disabled={expenseMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => expenseMutation.mutate({ amount: expenseAmount, paymentMethod: expenseMethod, description: expenseDescription.trim() })}
              disabled={expenseMutation.isPending || expenseAmount <= 0 || expenseDescription.trim().length < 3}
            >
              {expenseMutation.isPending ? "Registrando..." : "Registrar Despesa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Sub-components ──

function MovementTypeBadge({ type }: { type: string }) {
  const variant =
    type === "SALE"
      ? "default"
      : type === "WITHDRAWAL"
        ? "secondary"
        : type === "DEPOSIT"
          ? "outline"
          : "destructive";

  return <Badge variant={variant}>{MOVEMENT_TYPE_LABELS[type] ?? type}</Badge>;
}

function PaymentMethodSummaryCard({
  movements,
  totalSales,
}: {
  movements: Array<{ type: string; amount: number; paymentMethod: string | null }>;
  totalSales: number;
}) {
  const summary: Record<string, { count: number; total: number }> = {};
  for (const m of movements) {
    if (m.type !== "SALE") continue;
    const method = m.paymentMethod ?? "outros";
    if (!summary[method]) summary[method] = { count: 0, total: 0 };
    summary[method]!.count++;
    summary[method]!.total += m.amount;
  }

  const entries = Object.entries(summary);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vendas por Forma de Pagamento</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  Nenhuma venda ainda
                </TableCell>
              </TableRow>
            ) : (
              entries.map(([method, data]) => (
                <TableRow key={method}>
                  <TableCell className="text-sm">
                    {PAYMENT_METHOD_LABELS[method] ?? method}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {data.count}x
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCents(data.total)}
                  </TableCell>
                </TableRow>
              ))
            )}
            {entries.length > 0 && (
              <TableRow className="bg-muted/50 font-medium">
                <TableCell colSpan={2}>TOTAL</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCents(totalSales)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OpenCashierDialog({
  open,
  onOpenChange,
  openingBalance,
  setOpeningBalance,
  openingNotes,
  setOpeningNotes,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openingBalance: number;
  setOpeningBalance: (v: number) => void;
  openingNotes: string;
  setOpeningNotes: (v: string) => void;
  isPending: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir Caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Saldo Inicial *</Label>
            <MoneyInput
              value={openingBalance}
              onChange={setOpeningBalance}
              autoFocus
            />
          </div>
          <div>
            <Label>Observacao</Label>
            <Textarea
              value={openingNotes}
              onChange={(e) => setOpeningNotes(e.target.value)}
              placeholder="Observacao (opcional)"
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Abrindo..." : "Abrir Caixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawalDialog({
  open,
  onOpenChange,
  amount,
  setAmount,
  description,
  setDescription,
  availableBalance,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  setAmount: (v: number) => void;
  description: string;
  setDescription: (v: string) => void;
  availableBalance: number;
  isPending: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Sangria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Sangria e a retirada de dinheiro do caixa. Use para transferir
            valores para o cofre ou banco.
          </p>
          <p className="text-sm font-medium">
            Saldo disponivel em dinheiro:{" "}
            <span className="font-mono">
              {formatCents(availableBalance)}
            </span>
          </p>
          <div>
            <Label>Valor *</Label>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </div>
          <div>
            <Label>Motivo *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Transferencia para cofre"
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="default"
            className="bg-amber-600 hover:bg-amber-700"
            onClick={onSubmit}
            disabled={isPending || amount <= 0 || !description.trim()}
          >
            {isPending ? "Registrando..." : "Registrar Sangria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DepositDialog({
  open,
  onOpenChange,
  amount,
  setAmount,
  description,
  setDescription,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  setAmount: (v: number) => void;
  description: string;
  setDescription: (v: string) => void;
  isPending: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Suprimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Suprimento e a entrada de dinheiro no caixa. Use para adicionar
            troco ou repor valores.
          </p>
          <div>
            <Label>Valor *</Label>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </div>
          <div>
            <Label>Motivo *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Reposicao de troco"
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || amount <= 0 || !description.trim()}
          >
            {isPending ? "Registrando..." : "Registrar Suprimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashierSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
