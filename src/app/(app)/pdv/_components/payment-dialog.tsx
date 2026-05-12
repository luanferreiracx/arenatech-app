"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  discountReason?: string;
  observations: string;
  onObservationsChange: (v: string) => void;
  onFinalize: (payments: PaymentDetail[]) => void;
  isPending: boolean;
}

interface PaymentEntry {
  id: string;
  method: string;
  label: string;
  amount: number; // centavos
  installments: number;
}

type PaymentStep = "select" | "form";

export function PaymentDialog({
  open,
  onOpenChange,
  totalAmount,
  observations,
  onObservationsChange,
  onFinalize,
  isPending,
}: PaymentDialogProps) {
  const trpc = useTRPC();

  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [step, setStep] = useState<PaymentStep>("select");
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [installments, setInstallments] = useState(1);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPayments([]);
      setStep("select");
      setSelectedMethod("");
      setSelectedLabel("");
      setPaymentAmount(0);
      setInstallments(1);
    }
  }, [open]);

  // Fetch payment methods
  const { data: paymentMethods } = useQuery(
    trpc.settings.listPaymentMethods.queryOptions(),
  );

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalAmount - totalPaid);
  const change = Math.max(0, totalPaid - totalAmount);
  const progressPercent = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0;
  const canConfirm = totalPaid >= totalAmount && payments.length > 0;
  const isFullyCovered = totalPaid >= totalAmount - 1 && payments.length > 0;

  // When a payment method is selected from the grid
  const handleSelectMethod = useCallback(
    (method: string, label: string) => {
      setSelectedMethod(method);
      setSelectedLabel(label);
      setPaymentAmount(remaining);
      setInstallments(1);
      setStep("form");
    },
    [remaining],
  );

  const handleAddPayment = useCallback(() => {
    if (!selectedMethod || paymentAmount <= 0) return;

    // For cash, allow exceeding (troco). For others, cap at remaining.
    const isCash = selectedMethod === "CASH" || selectedLabel === "Dinheiro";
    const maxAmount = isCash ? paymentAmount : Math.min(paymentAmount, remaining);
    const registeredAmount = isCash ? Math.min(paymentAmount, remaining) : maxAmount;

    const newPayment: PaymentEntry = {
      id: crypto.randomUUID(),
      method: selectedMethod,
      label: selectedLabel,
      amount: registeredAmount,
      installments,
    };

    setPayments((prev) => [...prev, newPayment]);
    setStep("select");
    setSelectedMethod("");
    setSelectedLabel("");
    setPaymentAmount(0);
    setInstallments(1);
  }, [selectedMethod, selectedLabel, paymentAmount, installments, remaining]);

  const handleRemovePayment = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleConfirm = useCallback(() => {
    const paymentDetails: PaymentDetail[] = payments.map((p) => ({
      method: p.label || p.method,
      amount: p.amount / 100, // Convert to reais for the router
      installments: p.installments > 1 ? p.installments : undefined,
    }));
    onFinalize(paymentDetails);
  }, [payments, onFinalize]);

  // Troco calculation for cash
  const isCashSelected = selectedMethod === "CASH" || selectedLabel === "Dinheiro";
  const trocoForCurrent =
    isCashSelected && paymentAmount > remaining
      ? paymentAmount - remaining
      : 0;

  // Check if selected method supports installments
  const selectedPaymentMethod = paymentMethods?.find(
    (m) => m.name === selectedMethod || m.type === selectedMethod,
  );
  const supportsInstallments =
    selectedPaymentMethod?.type === "CREDIT_CARD" || selectedMethod === "CREDIT_CARD";

  const activeMethods = paymentMethods?.filter((m) => m.active) ?? [];

  // Fallback methods if no configured payment methods
  const fallbackMethods = [
    { id: "cash", name: "Dinheiro", type: "CASH" },
    { id: "pix", name: "PIX", type: "PIX" },
    { id: "credit", name: "Cartao Credito", type: "CREDIT_CARD" },
    { id: "debit", name: "Cartao Debito", type: "DEBIT_CARD" },
  ];
  const methodsToShow = activeMethods.length > 0 ? activeMethods : fallbackMethods;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Finalizar Venda</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Total display */}
          <div className="rounded-lg bg-muted p-4 text-center">
            <span className="block text-sm text-muted-foreground">Total a Pagar</span>
            <span className="font-mono text-2xl font-bold text-primary">
              {formatMoney(totalAmount)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Valor coberto</span>
              <span>
                {formatMoney(totalPaid)} de {formatMoney(totalAmount)}
              </span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>

          {/* Existing payments list */}
          {payments.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-sm font-semibold">Formas de Pagamento</span>
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center rounded-md border-l-[3px] border-l-primary bg-muted px-3 py-2"
                >
                  <div className="flex-1">
                    <span className="text-sm font-semibold">{payment.label || payment.method}</span>
                    {payment.installments > 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({payment.installments}x de{" "}
                        {formatMoney(Math.round(payment.amount / payment.installments))})
                      </span>
                    )}
                  </div>
                  <span className="mx-3 font-mono text-sm font-bold">
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
              ))}
            </div>
          )}

          {/* Payment method selection / form */}
          {!isFullyCovered && (
            <>
              {step === "select" && (
                <div className="space-y-2">
                  <span className="text-sm font-semibold">
                    {payments.length > 0 ? "Adicionar outra forma" : "Selecione a forma de pagamento"}
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {methodsToShow.map((method) => (
                      <Button
                        key={method.id}
                        variant="outline"
                        className="h-auto py-3 text-sm"
                        onClick={() => handleSelectMethod(method.name, method.name)}
                      >
                        {method.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {step === "form" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setStep("select")}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold">{selectedLabel}</span>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label className="mb-1 block text-xs">Valor</Label>
                      <MoneyInput
                        value={paymentAmount}
                        onChange={setPaymentAmount}
                        className="text-lg"
                      />
                    </div>
                    {supportsInstallments && (
                      <div className="w-24">
                        <Label className="mb-1 block text-xs">Parcelas</Label>
                        <Select
                          value={String(installments)}
                          onValueChange={(v) => setInstallments(Number(v))}
                        >
                          <SelectTrigger>
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
                      </div>
                    )}
                  </div>

                  {/* Troco (cash only) */}
                  {isCashSelected && trocoForCurrent > 0 && (
                    <div>
                      <Label className="mb-1 block text-xs">Troco</Label>
                      <div className="rounded-md bg-muted p-2 text-center font-mono text-lg font-bold text-green-500">
                        {formatMoney(trocoForCurrent)}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="default"
                    className="w-full"
                    onClick={handleAddPayment}
                    disabled={!selectedMethod || paymentAmount <= 0}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Adicionar Pagamento
                  </Button>
                </div>
              )}
            </>
          )}

          <Separator />

          {/* Summary */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total da venda</span>
              <span className="font-mono font-bold">{formatMoney(totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Soma dos pagamentos</span>
              <span className="font-mono font-bold">{formatMoney(totalPaid)}</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Restante</span>
                <span className="font-mono font-bold">{formatMoney(remaining)}</span>
              </div>
            )}
            {change > 0 && (
              <div className="flex justify-between font-bold text-green-500">
                <span>Troco</span>
                <span className="font-mono">{formatMoney(change)}</span>
              </div>
            )}
          </div>

          {/* Observations */}
          <div>
            <Label className="mb-1 block text-sm">Observacoes</Label>
            <Textarea
              value={observations}
              onChange={(e) => onObservationsChange(e.target.value)}
              placeholder="Observacoes da venda"
              rows={2}
            />
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
