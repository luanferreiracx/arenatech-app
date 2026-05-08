"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MoneyInput } from "@/components/inputs/money-input";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { PaymentDetail } from "@/lib/validators/sale";

function formatMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalAmount: number; // centavos
  saleId: string;
  customerId?: string;
  discountType?: "fixed" | "percent";
  discountValue?: number;
  onFinalize: (payments: PaymentDetail[]) => void;
  isPending: boolean;
}

interface PaymentEntry {
  id: string;
  method: string;
  amount: number; // centavos
  installments: number;
}

export function PaymentDialog({
  open,
  onOpenChange,
  totalAmount,
  onFinalize,
  isPending,
}: PaymentDialogProps) {
  const trpc = useTRPC();

  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [installments, setInstallments] = useState(1);

  // Fetch payment methods
  const { data: paymentMethods } = useQuery(
    trpc.settings.listPaymentMethods.queryOptions(),
  );

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalAmount - totalPaid);
  const change = Math.max(0, totalPaid - totalAmount);
  const canConfirm = totalPaid >= totalAmount && payments.length > 0;

  const handleAddPayment = useCallback(() => {
    if (!selectedMethod || paymentAmount <= 0) return;

    const newPayment: PaymentEntry = {
      id: crypto.randomUUID(),
      method: selectedMethod,
      amount: paymentAmount,
      installments,
    };

    setPayments((prev) => [...prev, newPayment]);
    setSelectedMethod("");
    setPaymentAmount(0);
    setInstallments(1);
  }, [selectedMethod, paymentAmount, installments]);

  const handleRemovePayment = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleConfirm = useCallback(() => {
    const paymentDetails: PaymentDetail[] = payments.map((p) => ({
      method: p.method,
      amount: p.amount / 100, // Convert to reais for the router
      installments: p.installments > 1 ? p.installments : undefined,
    }));
    onFinalize(paymentDetails);
  }, [payments, onFinalize]);

  // Auto-fill remaining amount when dialog opens
  const handleSetRemainingAmount = useCallback(() => {
    setPaymentAmount(remaining);
  }, [remaining]);

  // Check if selected method supports installments
  const selectedPaymentMethod = paymentMethods?.find(
    (m) => m.name === selectedMethod || m.type === selectedMethod,
  );
  const supportsInstallments = selectedPaymentMethod?.type === "CREDIT_CARD" || selectedMethod === "CREDIT_CARD";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing payments */}
          {payments.length > 0 && (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div>
                    <span className="text-sm font-medium">{payment.method}</span>
                    {payment.installments > 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({payment.installments}x)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold">
                      {formatMoney(payment.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleRemovePayment(payment.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add payment form */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-2">
              <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.filter((m) => m.active).map((method) => (
                    <SelectItem key={method.id} value={method.name}>
                      {method.name}
                    </SelectItem>
                  )) ?? (
                    <>
                      <SelectItem value="CASH">Dinheiro</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="CREDIT_CARD">Cartao Credito</SelectItem>
                      <SelectItem value="DEBIT_CARD">Cartao Debito</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <div className="flex-1">
                  <MoneyInput
                    value={paymentAmount}
                    onChange={setPaymentAmount}
                    placeholder="Valor"
                    onFocus={handleSetRemainingAmount}
                  />
                </div>
                {supportsInstallments && (
                  <Select
                    value={String(installments)}
                    onValueChange={(v) => setInstallments(Number(v))}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}x
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleAddPayment}
                disabled={!selectedMethod || paymentAmount <= 0}
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar forma de pagamento
              </Button>
            </div>
          </div>

          <Separator />

          {/* Summary */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total da venda</span>
              <span className="font-mono font-bold">{formatMoney(totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Soma dos pagamentos</span>
              <span className="font-mono font-bold">{formatMoney(totalPaid)}</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Restante</span>
                <span className="font-mono font-bold">{formatMoney(remaining)}</span>
              </div>
            )}
            {change > 0 && (
              <div className="flex justify-between text-success">
                <span>Troco</span>
                <span className="font-mono font-bold">{formatMoney(change)}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              "Confirmar Pagamento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
