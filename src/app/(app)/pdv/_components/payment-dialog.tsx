"use client";

import { useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Plus, ChevronLeft, Check } from "lucide-react";
import { DepixQrDialog } from "./depix-qr-dialog";
import { InfinitepayCheckoutDialog } from "./infinitepay-checkout-dialog";
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
  /** Quando method=depix e operador marcou "ja recebi manualmente", nao
   * gera QR Code — finaliza venda direto. Sem depixTransactionId. */
  depixManual?: boolean;
  /** walletTransactionId canonico quando o leg DePix foi confirmado via QR. */
  walletTransactionId?: string;
  /** transactionId da PixPay espelhado para compatibilidade temporaria. */
  depixTransactionId?: string;
  /** Recebível de cartão: adquirente/bandeira/tipo (quando informados). */
  acquirerId?: string | null;
  cardBrandId?: string | null;
  cardKind?: "CREDIT" | "DEBIT" | null;
}

/** Opcao de forma de pagamento exibida no seletor do PDV. */
type MethodOption = {
  id: string | null;
  key: string;
  label: string;
  type: string;
  acceptsInstallments: boolean;
  installmentsMax: number;
};

/** Tipo da forma de pagamento (PaymentMethodType) a partir do code de fallback. */
function fallbackType(key: string): string {
  if (key === "cartao_credito") return "CREDIT_CARD";
  if (key === "cartao_debito") return "DEBIT_CARD";
  if (key === "pix") return "PIX";
  if (key === "dinheiro") return "CASH";
  return "OTHER";
}

/** Deriva o tipo de cartão (CREDIT/DEBIT) do PaymentMethodType, ou null. */
function cardKindFromType(type: string | undefined): "CREDIT" | "DEBIT" | null {
  if (type === "CREDIT_CARD") return "CREDIT";
  if (type === "DEBIT_CARD") return "DEBIT";
  return null;
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
  // Quando DePix: operador pode marcar "ja recebi manualmente" pra finalizar
  // sem gerar QR. Util quando cliente pagou via outro app antes da finalizacao.
  const [depixManualMode, setDepixManualMode] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [formAmount, setFormAmount] = useState("");
  const [formInstallments, setFormInstallments] = useState("1");
  const [observations, setObservations] = useState("");
  const [refundDueMethod, setRefundDueMethod] = useState<"cash" | "pix">("cash");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [selectedAcquirerId, setSelectedAcquirerId] = useState<string | null>(null);
  const [selectedCardBrandId, setSelectedCardBrandId] = useState<string | null>(null);
  const [showDepixQr, setShowDepixQr] = useState(false);
  const [showInfinitepay, setShowInfinitepay] = useState(false);
  const [isAutoFinalizing, setIsAutoFinalizing] = useState(false);
  const autoFinalizeAttemptedRef = useRef(false);
  // Leg DePix aguardando confirmacao do QR. So entra em `payments` quando o
  // pagamento e confirmado (onPaid). Paridade Laravel: QR ao adicionar o leg,
  // conclusao manual depois.
  const [pendingDepix, setPendingDepix] = useState<PaymentEntry | null>(null);
  // Leg InfinitePay aguardando confirmacao do checkout. Mesmo padrao do DePix:
  // so entra em `payments` quando o pagamento e confirmado (onPaid).
  const [pendingInfinitepay, setPendingInfinitepay] = useState<PaymentEntry | null>(null);
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

  // InfinitePay: disponivel quando a integracao esta ativa E tem handle.
  const integrationsQuery = useQuery(
    trpc.settings.listIntegrations.queryOptions(undefined, { enabled: open }),
  );
  const infinitepayEnabled = (integrationsQuery.data ?? []).some(
    (i) =>
      i.provider === "INFINITEPAY" &&
      i.enabled &&
      !!(
        i.config &&
        typeof i.config === "object" &&
        "handle" in i.config &&
        typeof (i.config as { handle?: unknown }).handle === "string" &&
        (i.config as { handle: string }).handle.trim().length > 0
      ),
  );

  const baseOptions: MethodOption[] = dbMethods.length > 0
    ? dbMethods.map((m) => ({ id: m.id, key: m.code ?? m.id, label: m.name, type: m.type, acceptsInstallments: m.acceptsInstallments, installmentsMax: m.installmentsMax }))
    : FALLBACK_METHODS.map((m) => ({ id: null, key: m.key, label: m.label, type: fallbackType(m.key), acceptsInstallments: m.key === "cartao_credito" || m.key === "crediario", installmentsMax: MAX_INSTALLMENTS }));

  // Garante DePix disponivel no tenant arena-tech, mesmo se nao cadastrado
  // como PaymentMethod (fluxo PIX gera transacao via PixPay direto).
  // InfinitePay entra como forma extra quando a integracao esta configurada
  // (checkout hospedado PIX/cartao com confirmacao automatica).
  const extraMethods: MethodOption[] = [];
  if (depixEnabled && !baseOptions.some((m) => m.key === "depix")) {
    extraMethods.push({ id: null, key: "depix", label: "DePix", type: "PIX", acceptsInstallments: false, installmentsMax: 1 });
  }
  if (infinitepayEnabled && !baseOptions.some((m) => m.key === "infinitepay")) {
    extraMethods.push({ id: null, key: "infinitepay", label: "InfinitePay", type: "PIX", acceptsInstallments: false, installmentsMax: 1 });
  }
  const methodOptions = extraMethods.length > 0 ? [...baseOptions, ...extraMethods] : baseOptions;

  // Recebíveis de cartão: tipo da forma selecionada (CREDIT_CARD/DEBIT_CARD)
  // habilita a captura de adquirente+bandeira p/ gerar CardReceivable.
  const selectedMethodType = methodOptions.find((m) => m.key === selectedMethod)?.type;
  const selectedCardKind = cardKindFromType(selectedMethodType);
  const isCardPayment = selectedCardKind !== null;

  // Adquirentes/bandeiras ativas (só carrega quando o dialog está aberto).
  const acquirersQuery = useQuery(
    trpc.receiving.acquirers.list.queryOptions(undefined, { enabled: open }),
  );
  const brandsQuery = useQuery(
    trpc.receiving.brands.list.queryOptions(undefined, { enabled: open }),
  );
  const activeAcquirers = (acquirersQuery.data ?? []).filter((a) => a.active);
  const activeBrands = (brandsQuery.data ?? []).filter((b) => b.active);

  // Preview de liquidacao do cartao: taxa do adquirente + liquido que a loja
  // recebe + data de liquidacao (D+N), pela AcquirerRate configurada. So roda
  // quando adquirente+bandeira+parcelas+valor estao definidos; se nao houver
  // taxa cadastrada pra combinacao, `found=false` e nao mostramos nada.
  const previewInstallments = parseInt(formInstallments, 10) || 1;
  const previewGrossCents = Math.round((parseFloat(formAmount) || 0) * 100);
  const cardPreviewQuery = useQuery(
    trpc.receiving.previewCardSettlement.queryOptions(
      {
        acquirerId: selectedAcquirerId ?? "",
        cardBrandId: selectedCardBrandId ?? "",
        kind: selectedCardKind ?? "CREDIT",
        installments: previewInstallments,
        grossCents: previewGrossCents,
      },
      {
        enabled:
          open &&
          isCardPayment &&
          !!selectedAcquirerId &&
          !!selectedCardBrandId &&
          previewGrossCents > 0,
      },
    ),
  );
  const cardPreview = cardPreviewQuery.data;

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
    setSelectedAcquirerId(null);
    setSelectedCardBrandId(null);
    setFormAmount((remaining / 100).toFixed(2));
    setFormInstallments("1");
    setDepixManualMode(false);
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

    // DePix deve ser o ULTIMO pagamento: cobre todo o valor restante
    // (paridade Laravel modal-pagamento — depois dele restante=0 e nao ha
    // mais formas a adicionar). Vale para QR e para "ja recebido".
    if (selectedMethod === "depix" && Math.abs(valorPagoCents - remaining) > 1) {
      toast.error(
        `O DePix deve cobrir o valor restante completo (${formatCurrency(remaining)}). Adicione as outras formas primeiro e use o DePix por ultimo.`,
      );
      return;
    }

    // InfinitePay tambem deve ser o ULTIMO pagamento (gera um checkout para o
    // valor restante completo). Mesma regra do DePix.
    if (selectedMethod === "infinitepay" && Math.abs(valorPagoCents - remaining) > 1) {
      toast.error(
        `O InfinitePay deve cobrir o valor restante completo (${formatCurrency(remaining)}). Adicione as outras formas primeiro e use o InfinitePay por ultimo.`,
      );
      return;
    }

    const amountMercadoria = Math.min(valorPagoCents, remaining);
    const totalPaidByCustomer = valorPagoCents;
    const installments = parseInt(formInstallments, 10) || 1;

    // Recebível de cartão: só anexa adquirente/bandeira quando AMBOS escolhidos.
    // Sem isso, a venda no cartão segue sem recebível (fallback do backend).
    const cardFields =
      isCardPayment && selectedAcquirerId && selectedCardBrandId && selectedCardKind
        ? {
            acquirerId: selectedAcquirerId,
            cardBrandId: selectedCardBrandId,
            cardKind: selectedCardKind,
          }
        : {};

    const leg: PaymentEntry = {
      method: selectedMethod,
      paymentMethodId: selectedPaymentMethodId,
      label: selectedLabel,
      amount: amountMercadoria,
      installments,
      totalPaidByCustomer,
      ...cardFields,
      ...(selectedMethod === "depix" && depixManualMode ? { depixManual: true } : {}),
    };

    setSelectedMethod(null);
    setSelectedPaymentMethodId(null);
    setSelectedAcquirerId(null);
    setSelectedCardBrandId(null);
    setDepixManualMode(false);
    setStep("select");

    // DePix com QR: gera o QR AGORA (paridade Laravel — QR ao adicionar o
    // leg, nao no Confirmar). O leg entra em `payments` quando confirmado e
    // dispara finalizacao automatica da venda.
    if (leg.method === "depix" && !leg.depixManual) {
      autoFinalizeAttemptedRef.current = false;
      setPendingDepix(leg);
      setShowDepixQr(true);
      return;
    }

    // InfinitePay: abre o checkout AGORA. O leg entra em `payments` quando o
    // pagamento e confirmado (webhook -> SSE) e dispara finalizacao automatica.
    if (leg.method === "infinitepay") {
      autoFinalizeAttemptedRef.current = false;
      setPendingInfinitepay(leg);
      setShowInfinitepay(true);
      return;
    }

    // Demais formas (e DePix "ja recebido manualmente"): entram direto.
    setPayments((prev) => [...prev, leg]);
  };

  const handleRemovePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
    if (step === "form") setStep("select");
  };

  const handleFinalize = () => {
    // Guarda contra duplo-clique/Enter antes do botao desabilitar (o servidor
    // ja barra via guard de status DRAFT, mas evita 2 chamadas + toast confuso).
    if (finalizeMutation.isPending) return;
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
            onSuccess(data.id);
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

    // DePix ja foi confirmado via QR ANTES (o leg so entra em `payments`
    // depois do pagamento). A conclusao aqui e manual e roda o finalize com
    // todas as formas ja montadas. Paridade Laravel: finalizarVenda manual.
    runFinalize();
  };

  const runFinalize = (paymentsToFinalize = payments, options?: { auto?: boolean; label?: string }) => {
    if (finalizeMutation.isPending || isAutoFinalizing) return;
    if (options?.auto) setIsAutoFinalizing(true);
    const autoLabel = options?.label ?? "Pagamento";
    finalizeMutation.mutate(
      {
        saleId,
        customerId,
        payments: paymentsToFinalize.map((p) => ({
          method: p.method,
          paymentMethodId: p.paymentMethodId,
          amount: p.amount,
          installments: p.installments,
          totalPaidByCustomer: p.totalPaidByCustomer,
          // Vincula os ids DePix no leg — gravado em paymentDetails para
          // rastreabilidade e validacao server-side wallet-first.
          ...(p.depixManual ? { depixManual: true } : {}),
          ...(p.walletTransactionId ? { walletTransactionId: p.walletTransactionId } : {}),
          ...(p.depixTransactionId ? { depixTransactionId: p.depixTransactionId } : {}),
          ...(p.acquirerId ? { acquirerId: p.acquirerId } : {}),
          ...(p.cardBrandId ? { cardBrandId: p.cardBrandId } : {}),
          ...(p.cardKind ? { cardKind: p.cardKind } : {}),
        })),
        observations: observations || null,
      },
      {
        onSuccess: (data) => {
          toast.success(options?.auto ? `${autoLabel} confirmado. Venda finalizada!` : "Venda finalizada com sucesso!");
          onSuccess((data as unknown as { id: string }).id);
        },
        onError: (err) => {
          toast.error(
            options?.auto
              ? `${autoLabel} confirmado, mas a finalizacao falhou: ${err.message}. Tente confirmar novamente.`
              : err.message,
          );
        },
        onSettled: () => {
          if (options?.auto) setIsAutoFinalizing(false);
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
    <>
    {/* Oculta o payment-dialog enquanto o QR DePix / checkout InfinitePay esta
        aberto (sem desmontar, pra preservar o state). Evita Radix Dialogs
        aninhados. */}
    <Dialog open={open && !showDepixQr && !showInfinitepay} onOpenChange={onOpenChange}>
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
                  <div className="text-sm font-medium flex items-center gap-2">
                    {p.label}
                    {p.depixManual && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 uppercase font-semibold tracking-wide">
                        Manual
                      </span>
                    )}
                  </div>
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
                  aria-label="Remover forma de pagamento"
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
                aria-label="Voltar para selecao de forma de pagamento"
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

            {/* Cartao: mostra a captura sempre que ha BANDEIRAS (o catalogo padrao
                ja vem semeado). O adquirente (maquininha) e opcional — so aparece
                se o tenant tiver adquirentes cadastrados. Antes o bloco inteiro
                exigia adquirente E bandeira, entao sumia quando nao havia adquirente
                (caso comum: seed cria bandeiras mas nao adquirentes) — o operador
                nao conseguia nem registrar a bandeira. */}
            {isCardPayment && activeBrands.length > 0 && (
              <div className="flex gap-3">
                {activeAcquirers.length > 0 && (
                  <div className="flex-1">
                    <Label>Adquirente</Label>
                    <Select
                      value={selectedAcquirerId ?? ""}
                      onValueChange={(v) => setSelectedAcquirerId(v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Maquininha (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAcquirers.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex-1">
                  <Label>Bandeira</Label>
                  <Select
                    value={selectedCardBrandId ?? ""}
                    onValueChange={(v) => setSelectedCardBrandId(v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Bandeira" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeBrands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Previa da liquidacao do cartao (taxa do adquirente + liquido +
                D+N). So aparece quando ha taxa cadastrada pra combinacao. */}
            {cardPreview?.found && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxa do adquirente</span>
                  <span className="font-medium text-destructive">
                    − {formatCurrency(cardPreview.feeCents)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liquido que a loja recebe</span>
                  <span className="font-semibold text-green-500">
                    {formatCurrency(cardPreview.netCents)}
                  </span>
                </div>
                {cardPreview.settlementDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Liquidacao prevista</span>
                    <span className="font-medium">
                      {new Date(cardPreview.settlementDate).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}
              </div>
            )}

            {showChange && (
              <div>
                <Label>Troco</Label>
                <div className="text-lg font-bold text-green-500 bg-muted/50 rounded-md p-2 text-center">
                  {trocoDisplay > 0 ? formatCurrency(trocoDisplay) : "R$ 0,00"}
                </div>
              </div>
            )}

            {selectedMethod === "depix" && (
              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={depixManualMode}
                  onChange={(e) => setDepixManualMode(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div className="text-xs">
                  <div className="font-semibold">Ja recebi via DePix (sem gerar QR)</div>
                  <div className="text-muted-foreground">
                    Use quando o cliente ja pagou em outro app/dispositivo.
                    A venda finaliza sem aguardar confirmacao do provedor.
                  </div>
                </div>
              </label>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAutoFinalizing}>
            Cancelar
          </Button>
          <Button
            disabled={
              !isComplete ||
              payments.length === 0 ||
              finalizeMutation.isPending ||
              isAutoFinalizing
            }
            onClick={handleFinalize}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            {isAutoFinalizing
              ? "Finalizando venda..."
              : finalizeMutation.isPending
                ? "Processando..."
                : "Confirmar Pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* QR DePix — fora do Dialog do payment (evita aninhar Radix Dialogs).
        O payment-dialog ja foi fechado quando este abre. */}
    {showDepixQr && (
      <DepixQrDialog
        open={showDepixQr}
        saleId={saleId}
        totalCents={pendingDepix?.amount ?? remaining}
        customerTaxId={customerTaxId ?? null}
        onClose={() => {
          // Cancelou o QR (cliente nao pagou) — descarta o leg DePix pendente.
          setShowDepixQr(false);
          setPendingDepix(null);
        }}
        onPaid={({ walletTransactionId, transactionId }) => {
          if (!pendingDepix || autoFinalizeAttemptedRef.current) return;
          autoFinalizeAttemptedRef.current = true;
          const confirmedDepix: PaymentEntry = {
            ...pendingDepix,
            walletTransactionId,
            ...(transactionId ? { depixTransactionId: transactionId } : {}),
          };
          const nextPayments = [...payments, confirmedDepix];

          // DePix confirmado: fecha o QR e finaliza automaticamente pelo
          // mesmo sale.finalize transacional. Em falha, o leg fica na tela para retry.
          setPayments(nextPayments);
          setPendingDepix(null);
          setShowDepixQr(false);
          runFinalize(nextPayments, { auto: true, label: "DePix" });
        }}
      />
    )}

    {/* Checkout InfinitePay — fora do Dialog do payment (evita aninhar Radix
        Dialogs). O payment-dialog ja foi ocultado quando este abre. */}
    {showInfinitepay && (
      <InfinitepayCheckoutDialog
        open={showInfinitepay}
        saleId={saleId}
        totalCents={pendingInfinitepay?.amount ?? remaining}
        onClose={() => {
          // Cancelou o checkout (cliente nao pagou) — descarta o leg pendente.
          setShowInfinitepay(false);
          setPendingInfinitepay(null);
        }}
        onPaid={() => {
          if (!pendingInfinitepay || autoFinalizeAttemptedRef.current) return;
          autoFinalizeAttemptedRef.current = true;
          const nextPayments = [...payments, pendingInfinitepay];
          setPayments(nextPayments);
          setPendingInfinitepay(null);
          setShowInfinitepay(false);
          runFinalize(nextPayments, { auto: true, label: "InfinitePay" });
        }}
      />
    )}
    </>
  );
}
