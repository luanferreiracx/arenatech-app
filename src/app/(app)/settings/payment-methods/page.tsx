"use client";

import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createPaymentMethodSchema,
  type CreatePaymentMethodInput,
} from "@/lib/validators/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/domain/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, CreditCard, Trash2, Settings2, Loader2 } from "lucide-react";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  CREDIT_CARD: "Cartao de Credito",
  DEBIT_CARD: "Cartao de Debito",
  BANK_TRANSFER: "Transferencia",
  STORE_CREDIT: "Credito Loja",
  OTHER: "Outro",
};

// Codigos legados que NAO tem taxa por design (paridade Laravel).
const NO_FEE_CODES = new Set(["dinheiro", "transferencia"]);

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Policy = "LOJA_ABSORVE" | "CLIENTE_PAGA";

// A taxa, na cabeca do lojista, e so "parcela -> quanto a maquininha cobra".
// A aplicabilidade (aparelho/nao-aparelho) nao muda a taxa dele (quem muda e a
// maquina/bandeira, que vive em Meios de Recebimento), entao toda taxa salva
// vai como AMBOS. A politica (quem paga a taxa) e definida UMA vez por forma de
// pagamento, nao por parcela. Por isso a linha de taxa so guarda parcela+valores.
const RATE_APPLIES_TO = "AMBOS" as const;

interface RateRow {
  installments: number;
  feePercent: number;
  feeFixed: number; // reais
  active: boolean;
}

const POLICY_OPTIONS: { value: Policy; label: string; help: string }[] = [
  {
    value: "LOJA_ABSORVE",
    label: "Loja absorve a taxa",
    help: "O cliente paga o preco normal e a loja recebe o valor menos a taxa.",
  },
  {
    value: "CLIENTE_PAGA",
    label: "Cliente paga a taxa",
    help: "O acrescimo da maquininha e repassado ao cliente; a loja recebe o preco cheio.",
  },
];

export default function PaymentMethodsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Estado do dialog de edicao avancada (rates + config base).
  const [methodBase, setMethodBase] = useState<{
    name: string;
    acceptsInstallments: boolean;
    installmentsMin: number;
    installmentsMax: number;
    settlementDays: number;
    acceptsChange: boolean;
    policy: Policy;
  } | null>(null);
  const [rates, setRates] = useState<RateRow[]>([]);

  const { data: methods, isLoading } = useQuery(
    trpc.settings.listPaymentMethods.queryOptions(),
  );

  const createForm = useForm<CreatePaymentMethodInput>({
    resolver: zodResolver(createPaymentMethodSchema),
    defaultValues: {
      name: "",
      type: "OTHER",
      feePercent: 0,
      active: true,
      acceptsChange: false,
    },
  });

  const toggleMutation = useMutation(
    trpc.settings.updatePaymentMethod.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const createMutation = useMutation(
    trpc.settings.createPaymentMethod.mutationOptions({
      onSuccess: () => {
        toast.success("Forma de pagamento criada!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
        setShowCreateDialog(false);
        createForm.reset();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.settings.deletePaymentMethod.mutationOptions({
      onSuccess: () => {
        toast.success("Forma de pagamento removida!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const updateFullMutation = useMutation(
    trpc.settings.updatePaymentMethodFull.mutationOptions(),
  );
  const upsertRatesMutation = useMutation(
    trpc.settings.upsertPaymentRates.mutationOptions(),
  );

  // Carrega dados ao abrir o dialog de edicao.
  const editingMethod = useMemo(
    () => methods?.find((m) => m.id === editingMethodId) ?? null,
    [methods, editingMethodId],
  );

  // Inicializa estado quando muda o id (sem useEffect — derivado no render).
  // Usamos useState lazy + key remount via openEditDialog().
  const openEditDialog = (id: string) => {
    const m = methods?.find((x) => x.id === id);
    if (!m) return;
    // Politica e por FORMA agora: deriva da primeira taxa existente (todas
    // costumam compartilhar a mesma); default loja absorve.
    const policy = ((m.rates ?? [])[0]?.policy as Policy | undefined) ?? "LOJA_ABSORVE";
    setMethodBase({
      name: m.name,
      acceptsInstallments: m.acceptsInstallments,
      installmentsMin: m.installmentsMin,
      installmentsMax: m.installmentsMax,
      settlementDays: m.settlementDays ?? 0,
      acceptsChange: m.acceptsChange,
      policy,
    });
    setRates(
      (m.rates ?? [])
        .map((r) => ({
          installments: r.installments,
          feePercent: Number(r.feePercent),
          feeFixed: Number(r.feeFixed),
          active: r.active,
        }))
        .sort((a, b) => a.installments - b.installments),
    );
    setEditingMethodId(id);
  };

  const handleToggle = (id: string, active: boolean) => {
    toggleMutation.mutate({ id, active });
  };

  const addRateRow = () => {
    const lastInstall =
      rates.length > 0 ? Math.max(...rates.map((r) => r.installments)) : 0;
    setRates((prev) => [
      ...prev,
      {
        installments: lastInstall + 1,
        feePercent: 0,
        feeFixed: 0,
        active: true,
      },
    ]);
  };

  const updateRate = <K extends keyof RateRow>(idx: number, field: K, value: RateRow[K]) => {
    setRates((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeRate = (idx: number) => {
    setRates((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    if (!editingMethodId || !methodBase) return;
    try {
      await updateFullMutation.mutateAsync({
        id: editingMethodId,
        name: methodBase.name,
        acceptsInstallments: methodBase.acceptsInstallments,
        installmentsMin: methodBase.installmentsMin,
        installmentsMax: methodBase.installmentsMax,
        settlementDays: methodBase.settlementDays,
        acceptsChange: methodBase.acceptsChange,
      });
      await upsertRatesMutation.mutateAsync({
        paymentMethodId: editingMethodId,
        // Politica unica da forma + aplicabilidade AMBOS pra toda taxa (a tela
        // nao expoe mais esses dois por linha — ver RateRow/RATE_APPLIES_TO).
        rates: rates.map((r) => ({
          installments: r.installments,
          appliesTo: RATE_APPLIES_TO,
          policy: methodBase.policy,
          feePercent: r.feePercent,
          feeFixed: r.feeFixed,
          settlementDays: methodBase.settlementDays,
          active: r.active,
        })),
      });
      toast.success("Forma de pagamento atualizada!");
      queryClient.invalidateQueries({ queryKey: [["settings"]] });
      setEditingMethodId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Formas de Pagamento" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isSaving = updateFullMutation.isPending || upsertRatesMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formas de Pagamento"
        subtitle="Quais formas aparecem no PDV — parcelas, prazo, troco e quem paga a taxa. A taxa do cartão é definida em Cartões e Recebimento."
        actions={
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Forma
          </Button>
        }
      />

      {!methods || methods.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhuma forma de pagamento"
          description="Adicione formas de pagamento para habilitar vendas no PDV."
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {methods.map((method) => {
            const hasFee = !NO_FEE_CODES.has(method.code ?? "");
            const ratesCount = method.rates?.length ?? 0;
            return (
              <Card key={method.id} className={!method.active ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{method.name}</CardTitle>
                    <Switch
                      checked={method.active}
                      onCheckedChange={(checked) => handleToggle(method.id, checked)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {PAYMENT_TYPE_LABELS[method.type] ?? method.type}
                    </Badge>
                    {method.acceptsInstallments && (
                      <Badge variant="secondary">
                        ate {method.installmentsMax}x
                      </Badge>
                    )}
                    {hasFee && Number(method.feePercent) > 0 && (
                      <Badge variant="secondary">
                        Base: {Number(method.feePercent).toFixed(2)}%
                      </Badge>
                    )}
                    {hasFee && Number(method.feeFixed) > 0 && (
                      <Badge variant="secondary">
                        + R$ {Number(method.feeFixed).toFixed(2)}
                      </Badge>
                    )}
                    {!hasFee && <Badge variant="outline">Sem taxa</Badge>}
                  </div>

                  {hasFee && (
                    <p className="text-xs text-muted-foreground">
                      {ratesCount === 0
                        ? "Nenhuma taxa configurada"
                        : `${ratesCount} ${ratesCount === 1 ? "taxa" : "taxas"} por parcela`}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    {hasFee && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(method.id)}
                      >
                        <Settings2 className="w-3.5 h-3.5 mr-1" />
                        Configurar
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(method.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Forma de Pagamento</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: PIX, Cartao Visa" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(PAYMENT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog avancado (rates + base config) */}
      <Dialog
        open={editingMethodId !== null}
        onOpenChange={(open) => !open && setEditingMethodId(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Configurar {editingMethod?.name ?? "forma de pagamento"}
            </DialogTitle>
            <DialogDescription>
              Defina como esta forma cobra a taxa da maquininha por parcela. A taxa
              vale para qualquer item — o que muda a taxa de verdade (maquina e
              bandeira) fica em Meios de Recebimento.
            </DialogDescription>
          </DialogHeader>

          {methodBase && (
            <div className="space-y-5">
              {/* Configuracao base — campos numericos em cima, toggles separados
                  embaixo (em vez de misturar Input e Switch no mesmo grid, que
                  desalinhava). */}
              <section className="rounded-lg border bg-muted/30 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Configuracao geral
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cfg-name">Nome</Label>
                    <Input
                      id="cfg-name"
                      value={methodBase.name}
                      onChange={(e) =>
                        setMethodBase({ ...methodBase, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cfg-settlement">Prazo de recebimento (dias)</Label>
                    <Input
                      id="cfg-settlement"
                      type="number"
                      min={0}
                      max={365}
                      value={methodBase.settlementDays}
                      onChange={(e) =>
                        setMethodBase({
                          ...methodBase,
                          settlementDays: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Dias ate o valor cair na conta (0 = a vista).
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cfg-inst-min">Parcelas min</Label>
                      <Input
                        id="cfg-inst-min"
                        type="number"
                        min={1}
                        max={36}
                        value={methodBase.installmentsMin}
                        disabled={!methodBase.acceptsInstallments}
                        onChange={(e) =>
                          setMethodBase({
                            ...methodBase,
                            installmentsMin: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cfg-inst-max">Parcelas max</Label>
                      <Input
                        id="cfg-inst-max"
                        type="number"
                        min={1}
                        max={36}
                        value={methodBase.installmentsMax}
                        disabled={!methodBase.acceptsInstallments}
                        onChange={(e) =>
                          setMethodBase({
                            ...methodBase,
                            installmentsMax: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2.5">
                    <span className="space-y-0.5">
                      <span className="block text-sm font-medium">Aceita parcelamento</span>
                      <span className="block text-xs text-muted-foreground">
                        Permite dividir a venda em parcelas.
                      </span>
                    </span>
                    <Switch
                      checked={methodBase.acceptsInstallments}
                      onCheckedChange={(checked) =>
                        setMethodBase({
                          ...methodBase,
                          acceptsInstallments: checked,
                          installmentsMax: checked
                            ? Math.max(methodBase.installmentsMax, 2)
                            : 1,
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2.5">
                    <span className="space-y-0.5">
                      <span className="block text-sm font-medium">Aceita troco</span>
                      <span className="block text-xs text-muted-foreground">
                        Permite informar valor recebido e calcular troco.
                      </span>
                    </span>
                    <Switch
                      checked={methodBase.acceptsChange}
                      onCheckedChange={(checked) =>
                        setMethodBase({ ...methodBase, acceptsChange: checked })
                      }
                    />
                  </label>
                </div>
              </section>

              {/* Quem paga a taxa — UMA escolha por forma (nao por parcela). */}
              <section className="rounded-lg border bg-muted/30 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quem paga a taxa
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {POLICY_OPTIONS.map((opt) => {
                    const selected = methodBase.policy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMethodBase({ ...methodBase, policy: opt.value })}
                        aria-pressed={selected}
                        className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "bg-background hover:border-muted-foreground/40"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                              selected ? "border-primary" : "border-muted-foreground/40"
                            }`}
                          >
                            {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                          </span>
                          {opt.label}
                        </span>
                        <span className="pl-6 text-xs text-muted-foreground">{opt.help}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Taxas por parcela — agora cada linha so tem parcela + % + R$
                  (aplicabilidade=AMBOS e politica vivem no nivel da forma). */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Taxa por parcela</h3>
                    <p className="text-xs text-muted-foreground">
                      Quanto a maquininha cobra em cada nº de parcelas.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addRateRow}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Adicionar parcela
                  </Button>
                </div>

                {rates.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
                    <CreditCard className="h-8 w-8 text-muted-foreground/40" />
                    <div>
                      <p className="text-sm font-medium">Nenhuma taxa configurada</p>
                      <p className="text-xs text-muted-foreground">
                        Adicione uma linha por nº de parcelas (1×, 2×, 3×…).
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addRateRow}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Adicionar primeira parcela
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Cabecalho so no desktop — no mobile cada campo tem seu label. */}
                    <div className="hidden grid-cols-[64px_1fr_1fr_88px] items-center gap-3 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                      <span>Parcelas</span>
                      <span>Taxa %</span>
                      <span>Taxa fixa (R$)</span>
                      <span className="text-right">Ativa</span>
                    </div>

                    <div className="max-h-[340px] space-y-2 overflow-y-auto pr-0.5">
                      {rates.map((rate, idx) => {
                        // Preview do efeito em R$100 — concreto pro lojista.
                        const feeOn100 = 100 * (rate.feePercent / 100) + rate.feeFixed;
                        const netReceiverPays =
                          methodBase.policy === "LOJA_ABSORVE"
                            ? `loja recebe ${formatBRL(100 - feeOn100)}`
                            : `cliente paga ${formatBRL(100 + feeOn100)}`;
                        return (
                          <div
                            key={idx}
                            className={`rounded-lg border bg-card p-3 transition-opacity ${
                              rate.active ? "" : "opacity-55"
                            }`}
                          >
                            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[64px_1fr_1fr_88px]">
                              {/* Parcela — ancora da linha (chip nx) */}
                              <div className="space-y-1.5">
                                <Label
                                  htmlFor={`rate-inst-${idx}`}
                                  className="text-[11px] text-muted-foreground sm:hidden"
                                >
                                  Parcelas
                                </Label>
                                <div className="relative">
                                  <Input
                                    id={`rate-inst-${idx}`}
                                    type="number"
                                    min={1}
                                    max={36}
                                    value={rate.installments}
                                    className="h-10 pr-6 text-center font-semibold tabular-nums"
                                    onChange={(e) =>
                                      updateRate(idx, "installments", parseInt(e.target.value) || 1)
                                    }
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                    ×
                                  </span>
                                </div>
                              </div>

                              {/* Taxa % */}
                              <div className="space-y-1.5">
                                <Label
                                  htmlFor={`rate-pct-${idx}`}
                                  className="text-[11px] text-muted-foreground sm:hidden"
                                >
                                  Taxa %
                                </Label>
                                <div className="relative">
                                  <Input
                                    id={`rate-pct-${idx}`}
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    max={99.99}
                                    value={rate.feePercent}
                                    className="h-10 pr-7 tabular-nums"
                                    onChange={(e) =>
                                      updateRate(idx, "feePercent", parseFloat(e.target.value) || 0)
                                    }
                                  />
                                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                    %
                                  </span>
                                </div>
                              </div>

                              {/* Taxa fixa R$ */}
                              <div className="space-y-1.5">
                                <Label
                                  htmlFor={`rate-fix-${idx}`}
                                  className="text-[11px] text-muted-foreground sm:hidden"
                                >
                                  Taxa fixa (R$)
                                </Label>
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                    R$
                                  </span>
                                  <Input
                                    id={`rate-fix-${idx}`}
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={rate.feeFixed}
                                    className="h-10 pl-9 tabular-nums"
                                    onChange={(e) =>
                                      updateRate(idx, "feeFixed", parseFloat(e.target.value) || 0)
                                    }
                                  />
                                </div>
                              </div>

                              {/* Acoes: ativar / remover */}
                              <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
                                <label className="flex items-center gap-2 text-xs text-muted-foreground sm:flex-col sm:gap-1">
                                  <span className="sm:hidden">Ativa</span>
                                  <Switch
                                    checked={rate.active}
                                    onCheckedChange={(c) => updateRate(idx, "active", c)}
                                    aria-label={`Taxa de ${rate.installments}x ativa`}
                                  />
                                </label>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeRate(idx)}
                                  aria-label={`Remover taxa de ${rate.installments}x`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Efeito em R$100 — torna a taxa concreta */}
                            <p className="mt-2 text-xs text-muted-foreground">
                              Em {formatBRL(100)}: {netReceiverPays}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMethodId(null)}>
              Cancelar
            </Button>
            <Button onClick={saveAll} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar alteracoes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remover forma de pagamento?"
        description="Esta acao nao pode ser desfeita. Vendas anteriores que usaram esta forma permanecerao no historico."
        confirmLabel="Remover"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget });
        }}
      />
    </div>
  );
}
