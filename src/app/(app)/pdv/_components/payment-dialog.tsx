"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Plus, ChevronLeft, Check } from "lucide-react";
import { DepixQrDialog } from "./depix-qr-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/lib/toast";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface PaymentEntry {
  method: string;            // code curto (dinheiro/pix/...) para back-compat
  paymentMethodId: string | null; // id do PaymentMethod (quando cadastrado)
  label: string;
  amount: number; // centavos (valor da mercadoria coberto)
  installments: number;
  /** Valor que o cliente paga DE FATO (com acrescimo da maquininha). */
  totalPaidByCustomer: number;
}

/** Fallback quando o tenant nao tem PaymentMethod cadastrado ainda. */
const FALLBACK_METHODS = [
  { key: "dinheiro", label: "Dinheiro" },
  { key: "pix", label: "PIX" },
  { key: "cartao_credito", label: "Cartao Credito" },
  { key: "cartao_debito", label: "Cartao Debito" },
  { key: "crediario", label: "Crediario" },
] as const;

const MAX_INSTALLMENTS = 12;

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  totalAmount: number; // centavos
  /**
   * Valor que a loja DEVOLVE ao cliente quando o upgrade (trade-in) excede
   * o valor da venda. Se > 0, o dialog mostra apenas escolha cash|pix.
   */
  refundDueAmount?: number;
  customerId: string | null;
  /** CPF/CNPJ do cliente cadastrado (cru, so digitos). Usado pelo DePix. */
  customerTaxId?: string | null;
  onSuccess: (saleId: string) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  saleId,
  totalAmount,
  refundDueAmount = 0,
  customerId,
  customerTaxId,
  onSuccess,
}: PaymentDialogProps) {
  const trpc = useTRPC();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [step, setStep] = useState<"select" | "form">("select");
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [formAmount, setFormAmount] = useState("");
  const [formInstallments, setFormInstallments] = useState("1");
  const [observations, setObservations] = useState("");
  const [refundDueMethod, setRefundDueMethod] = useState<"cash" | "pix">("cash");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [showDepixQr, setShowDepixQr] = useState(false);
  const isDowngrade = refundDueAmount > 0;

  // Carrega formas cadastradas (com taxas+politica). Se nao houver,
  // cai no fallback estatico (compatibilidade com tenants sem setup).
  const methodsQuery = useQuery(
    trpc.settings.listPaymentMethods.queryOptions(undefined, { enabled: open }),
  );
  const dbMethods = (methodsQuery.data ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    type: string;
    acceptsInstallments: boolean;
    installmentsMax: number;
  }>;

  // DePix esta restrito a Intranet Central (tenant arena-tech) por enquanto.
  // Pega o slug via auth.me — query leve, ja cacheada.
  const meQuery = useQuery(
    trpc.auth.me.queryOptions(undefined, { enabled: open, staleTime: 5 * 60_000 }),
  );
  const activeTenantId = meQuery.data?.activeTenantId;
  const tenantSlug = activeTenantId
    ? meQuery.data?.availableTenants.find((t) => t.id === activeTenantId)?.slug
    : undefined;
  const depixEnabled = tenantSlug === "arena-tech";

  const baseOptions = dbMethods.length > 0
    ? dbMethods.map((m) => ({ id: m.id, key: m.code ?? m.id, label: m.name, acceptsInstallments: m.acceptsInstallments, installmentsMax: m.installmentsMax }))
    : FALLBACK_METHODS.map((m) => ({ id: null as string | null, key: m.key, label: m.label, acceptsInstallments: m.key === "cartao_credito" || m.key === "crediario", installmentsMax: MAX_INSTALLMENTS }));

  // Garante DePix disponivel no tenant arena-tech, mesmo se nao cadastrado
  // como PaymentMethod (fluxo PIX gera transacao via PixPay direto).
  const hasDepix = baseOptions.some((m) => m.key === "depix");
  const methodOptions = depixEnabled && !hasDepix
    ? [...baseOptions, { id: null as string | null, key: "depix", label: "DePix", acceptsInstallments: false, installmentsMax: 1 }]
    : baseOptions;

  const finalizeMutation = useMutation(trpc.sale.finalize.mutationOptions());

  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalAmount - paidTotal);
  const progress =
    totalAmount > 0 ? Math.min(100, (paidTotal / totalAmount) * 100) : 0;
  const isComplete = paidTotal >= totalAmount;

  const handleSelectMethod = (method: string, label: string, paymentMethodId: string | null) => {
    setSelectedMethod(method);
    setSelectedLabel(label);
    setSelectedPaymentMethodId(paymentMethodId);
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

    const valorPagoCents = Math.round(amountReais * 100);
    const amountMercadoria = Math.min(valorPagoCents, remaining);
    const totalPaidByCustomer = valorPagoCents;
    const installments = parseInt(formInstallments, 10) || 1;

    setPayments((prev) => [
      ...prev,
      {
        method: selectedMethod,
        paymentMethodId: selectedPaymentMethodId,
        label: selectedLabel,
        amount: amountMercadoria,
        installments,
        totalPaidByCustomer,
      },
    ]);

    setSelectedMethod(null);
    setSelectedPaymentMethodId(null);
    setStep("select");
  };

  const handleRemovePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
    if (step === "form") setStep("select");
  };

  const handleFinalize = () => {
    if (isDowngrade) {
      // Downgrade: cliente nao paga; loja devolve refundDueAmount.
      finalizeMutation.mutate(
        {
          saleId,
          customerId,
          payments: [],
          refundDueMethod,
          observations: observations || null,
        },
        {
          onSuccess: (data) => {
            toast.success("Venda finalizada — devolucao registrada.");
            onSuccess((data as unknown as { id: string }).id);
          },
          onError: (err) => toast.error(err.message),
        },
      );
      return;
    }

    if (payments.length === 0) {
      toast.error("Adicione pelo menos uma forma de pagamento");
      return;
    }

    // Se algum pagamento e via DePix, abre QR Code antes de finalizar.
    // Suporta split: parte da venda em DePix + parte em outra forma
    // (paridade Laravel iniciarDepix). Apenas 1 pagamento DePix por venda.
    const depixPayments = payments.filter((p) => p.method === "depix");
    if (depixPayments.length > 1) {
      toast.error("Use apenas 1 pagamento DePix por venda.");
      return;
    }
    if (depixPayments.length === 1) {
      setShowDepixQr(true);
      return;
    }

    runFinalize();
  };

  const runFinalize = (depixTransactionId?: string) => {
    finalizeMutation.mutate(
      {
        saleId,
        customerId,
        payments: payments.map((p) => ({
          method: p.method,
          paymentMethodId: p.paymentMethodId,
          amount: p.amount,
          installments: p.installments,
          totalPaidByCustomer: p.totalPaidByCustomer,
          // Vincula o transactionId DePix no payment correspondente — assim o
          // webhook PixPay consegue achar a venda quando confirmar o pagamento.
          ...(p.method === "depix" && depixTransactionId
            ? { depixTransactionId }
            : {}),
        })),
        observations: observations || null,
      },
      {
        onSuccess: (data) => {
          toast.success("Venda finalizada com sucesso!");
          onSuccess((data as unknown as { id: string }).id);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  };

  const showInstallments =
    selectedMethod === "cartao_credito" || selectedMethod === "crediario";
  const showChange = selectedMethod === "dinheiro";

  // Calculate change for display
  const trocoDisplay = (() => {
    if (!showChange) return 0;
    const inputCents = Math.round((parseFloat(formAmount) || 0) * 100);
    const troco = inputCents - remaining;
    return troco > 0 ? troco : 0;
  })();

  // Downgrade: tela alternativa simples (devolucao em vez de pagamento)
  if (isDowngrade) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finalizar — Devolução ao cliente</DialogTitle>
            <DialogDescription>
              O aparelho de entrada excede o valor da venda. A loja devolve ao cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="text-center py-4 bg-amber-500/10 rounded-lg my-2 border border-amber-500/40">
            <div className="text-sm text-muted-foreground">A devolver ao cliente</div>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(refundDueAmount)}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Forma de devolução</Label>
            <div className="space-y-2">
              {(["cash", "pix"] as const).map((m) => (
                <label
                  key={m}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer ${
                    refundDueMethod === m ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="refundDueMethod"
                    checked={refundDueMethod === m}
                    onChange={() => setRefundDueMethod(m)}
                    className="accent-primary"
                  />
                  <span>{m === "cash" ? "Dinheiro (saída do caixa)" : "PIX"}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {refundDueMethod === "cash"
                ? "Caixa deve estar aberto. Sera registrada uma saída."
                : "Realize o PIX manualmente após finalizar."}
            </p>
          </div>

          <div className="mt-4">
            <Label>Observações</Label>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Opcional"
              rows={2}
            />
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleFinalize} disabled={finalizeMutation.isPending} className="flex-1">
              <Check className="mr-1 h-4 w-4" />
              Finalizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finalizar Venda</DialogTitle>
          <DialogDescription>
            Selecione as formas de pagamento
          </DialogDescription>
        </DialogHeader>

        {/* Total */}
        <div className="text-center py-4 bg-muted/50 rounded-lg mb-2">
          <div className="text-sm text-muted-foreground">Total a Pagar</div>
          <div className="text-2xl font-bold text-primary">
            {formatCurrency(totalAmount)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Valor coberto</span>
            <span>
              {formatCurrency(Math.min(paidTotal, totalAmount))} de{" "}
              {formatCurrency(totalAmount)}
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
                  <div className="text-sm font-medium">{p.label}</div>
                  {p.installments > 1 && (
                    <div className="text-xs text-muted-foreground">
                      {p.installments}x de{" "}
                      {formatCurrency(Math.round(p.amount / p.installments))}
                    </div>
                  )}
                </div>
                <div className="text-sm font-bold">
                  {formatCurrency(p.amount)}
                </div>
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
              {payments.length > 0
                ? "Adicionar outra forma"
                : "Selecione a forma de pagamento"}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {methodOptions.map((m) => (
                <Button
                  key={m.key}
                  variant="outline"
                  className="h-auto py-3 text-sm"
                  onClick={() => handleSelectMethod(m.key, m.label, m.id)}
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
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setStep("select")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold">{selectedLabel}</span>
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
                  <Select
                    value={formInstallments}
                    onValueChange={setFormInstallments}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        { length: methodOptions.find((m) => m.key === selectedMethod)?.installmentsMax ?? MAX_INSTALLMENTS },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}x de{" "}
                          {formatCurrency(
                            Math.round(
                              ((parseFloat(formAmount) * 100) || 0) / n,
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
                  {trocoDisplay > 0 ? formatCurrency(trocoDisplay) : "R$ 0,00"}
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
            disabled={
              !isComplete ||
              payments.length === 0 ||
              finalizeMutation.isPending
            }
            onClick={handleFinalize}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            {finalizeMutation.isPending
              ? "Processando..."
              : "Confirmar Pagamento"}
          </Button>
        </div>

        {/* DePix QR Code dialog (opens when payment includes DePix).
            Em split, gera QR apenas para a parte DePix do carrinho. */}
        {showDepixQr && (
          <DepixQrDialog
            open={showDepixQr}
            saleId={saleId}
            totalCents={payments.find((p) => p.method === "depix")?.amount ?? totalAmount}
            customerTaxId={customerTaxId ?? null}
            onClose={() => setShowDepixQr(false)}
            onPaid={(transactionId) => {
              setShowDepixQr(false);
              runFinalize(transactionId);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
