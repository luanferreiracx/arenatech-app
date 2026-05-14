"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { X, Plus, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/lib/toast";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/sale";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface PaymentEntry {
  method: string;
  amount: number; // centavos
  installments: number;
}

const PAYMENT_METHODS = [
  { key: "dinheiro", label: "Dinheiro" },
  { key: "pix", label: "PIX" },
  { key: "cartao_credito", label: "Cartao Credito" },
  { key: "cartao_debito", label: "Cartao Debito" },
  { key: "crediario", label: "Crediario" },
];

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  totalAmount: number; // centavos
  customerId: string | null;
  onSuccess: (saleId: string) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  saleId,
  totalAmount,
  customerId,
  onSuccess,
}: PaymentDialogProps) {
  const trpc = useTRPC();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [step, setStep] = useState<"select" | "form">("select");
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formInstallments, setFormInstallments] = useState("1");
  const [observations, setObservations] = useState("");

  const finalizeMutation = useMutation(trpc.sale.finalize.mutationOptions());

  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalAmount - paidTotal);
  const progress = totalAmount > 0 ? Math.min(100, (paidTotal / totalAmount) * 100) : 0;
  const isComplete = paidTotal >= totalAmount;

  const changeCents = paidTotal > totalAmount ? paidTotal - totalAmount : 0;

  const handleSelectMethod = (method: string) => {
    setSelectedMethod(method);
    setFormAmount((remaining / 100).toFixed(2));
    setFormInstallments("1");
    setStep("form");
  };

  const handleAddPayment = () => {
    if (!selectedMethod) return;
    const amountReais = parseFloat(formAmount) || 0;
    if (amountReais <= 0) {
      toast.error("Informe o valor do pagamento");
      return;
    }

    let amountCents = Math.round(amountReais * 100);

    // For cash, allow overpayment (change)
    if (selectedMethod !== "dinheiro" && amountCents > remaining + 1) {
      toast.error(`O valor nao pode exceder ${formatCurrency(remaining)}`);
      return;
    }

    // For non-cash, cap at remaining; for cash, send the real amount paid
    if (selectedMethod !== "dinheiro") {
      amountCents = Math.min(amountCents, remaining);
    }
    // For cash (dinheiro), keep the full amountCents so the backend can calculate change

    const installments = parseInt(formInstallments, 10) || 1;

    setPayments((prev) => [
      ...prev,
      { method: selectedMethod, amount: amountCents, installments },
    ]);

    setSelectedMethod(null);
    setStep("select");
  };

  const handleRemovePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
    if (step === "form") setStep("select");
  };

  const handleFinalize = () => {
    if (payments.length === 0) {
      toast.error("Adicione pelo menos uma forma de pagamento");
      return;
    }

    finalizeMutation.mutate(
      {
        saleId,
        customerId,
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          installments: p.installments,
        })),
        observations: observations || null,
      },
      {
        onSuccess: (data) => {
          toast.success("Venda finalizada com sucesso!");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onSuccess((data as any).id as string);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  };

  const showInstallments = selectedMethod === "cartao_credito" || selectedMethod === "crediario";
  const showChange = selectedMethod === "dinheiro";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Finalizar Venda</DialogTitle>
          <DialogDescription>Selecione as formas de pagamento</DialogDescription>
        </DialogHeader>

        {/* Total */}
        <div className="text-center py-3 bg-muted/50 rounded-lg mb-2">
          <div className="text-sm text-muted-foreground">Total a Pagar</div>
          <div className="text-2xl font-bold text-primary">{formatCurrency(totalAmount)}</div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Valor coberto</span>
            <span>
              {formatCurrency(paidTotal)} de {formatCurrency(totalAmount)}
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Added payments list */}
        {payments.length > 0 && (
          <div className="space-y-1.5 mb-3">
            <div className="text-sm font-semibold">Formas de Pagamento</div>
            {payments.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-muted/50 rounded-md p-2.5 border-l-2 border-primary"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                  </div>
                  {p.installments > 1 && (
                    <div className="text-xs text-muted-foreground">
                      {p.installments}x de {formatCurrency(Math.round(p.amount / p.installments))}
                    </div>
                  )}
                </div>
                <div className="text-sm font-bold">{formatCurrency(p.amount)}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={() => handleRemovePayment(i)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Step: Select payment method */}
        {step === "select" && !isComplete && (
          <div>
            <div className="text-sm font-semibold mb-2">
              {payments.length > 0 ? "Adicionar outra forma" : "Selecione a forma de pagamento"}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <Button
                  key={m.key}
                  variant="outline"
                  className="h-auto py-3 text-sm"
                  onClick={() => handleSelectMethod(m.key)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Payment form */}
        {step === "form" && selectedMethod && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setStep("select")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold">
                {PAYMENT_METHOD_LABELS[selectedMethod] ?? selectedMethod}
              </span>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddPayment();
                    }
                  }}
                />
              </div>
              {showInstallments && (
                <div className="flex-1">
                  <Label>Parcelas</Label>
                  <Select value={formInstallments} onValueChange={setFormInstallments}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}x de{" "}
                          {formatCurrency(
                            Math.round(
                              (parseFloat(formAmount) * 100 || 0) / n,
                            ),
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {showChange && (
              <div>
                <Label>Troco</Label>
                <div className="text-lg font-bold text-green-500 bg-muted/50 rounded-md p-2 text-center">
                  {(() => {
                    const inputCents = Math.round((parseFloat(formAmount) || 0) * 100);
                    const troco = inputCents - remaining;
                    return troco > 0 ? formatCurrency(troco) : "R$ 0,00";
                  })()}
                </div>
              </div>
            )}

            <Button className="w-full gap-2" onClick={handleAddPayment}>
              <Plus className="h-4 w-4" />
              Adicionar Pagamento
            </Button>
          </div>
        )}

        {/* Observations */}
        <div>
          <Label>Observacoes</Label>
          <Textarea
            rows={2}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Observacoes da venda"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!isComplete || payments.length === 0 || finalizeMutation.isPending}
            onClick={handleFinalize}
          >
            {finalizeMutation.isPending ? "Processando..." : "Confirmar Pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
