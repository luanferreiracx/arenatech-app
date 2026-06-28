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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type AppliesTo = "APARELHO" | "NAO_APARELHO" | "AMBOS";
type Policy = "LOJA_ABSORVE" | "CLIENTE_PAGA";

interface RateRow {
  installments: number;
  appliesTo: AppliesTo;
  policy: Policy;
  feePercent: number;
  feeFixed: number; // reais
  settlementDays: number;
  active: boolean;
}

const APPLIES_TO_LABELS: Record<AppliesTo, string> = {
  APARELHO: "Aparelho",
  NAO_APARELHO: "Nao aparelho",
  AMBOS: "Ambos",
};

const POLICY_LABELS: Record<Policy, string> = {
  LOJA_ABSORVE: "Loja absorve",
  CLIENTE_PAGA: "Cliente paga acrescimo",
};

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
    setMethodBase({
      name: m.name,
      acceptsInstallments: m.acceptsInstallments,
      installmentsMin: m.installmentsMin,
      installmentsMax: m.installmentsMax,
      settlementDays: m.settlementDays ?? 0,
      acceptsChange: m.acceptsChange,
    });
    setRates(
      (m.rates ?? []).map((r) => ({
        installments: r.installments,
        appliesTo: r.appliesTo as AppliesTo,
        policy: r.policy as Policy,
        feePercent: Number(r.feePercent),
        feeFixed: Number(r.feeFixed),
        settlementDays: r.settlementDays ?? 0,
        active: r.active,
      })),
    );
    setEditingMethodId(id);
  };

  const handleToggle = (id: string, active: boolean) => {
    toggleMutation.mutate({ id, active });
  };

  const addRateRow = () => {
    const lastInstall =
      rates.length > 0 ? Math.max(...rates.map((r) => r.installments)) : 1;
    setRates((prev) => [
      ...prev,
      {
        installments: lastInstall + 1,
        appliesTo: "AMBOS",
        policy: "LOJA_ABSORVE",
        feePercent: 0,
        feeFixed: 0,
        settlementDays: 0,
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
        rates: rates.map((r) => ({
          installments: r.installments,
          appliesTo: r.appliesTo,
          policy: r.policy,
          feePercent: r.feePercent,
          feeFixed: r.feeFixed,
          settlementDays: r.settlementDays,
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
        subtitle="Configure quais formas estarao disponiveis no PDV e como cada uma cobra taxa"
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
                        : `${ratesCount} taxa(s) por parcela / aplicabilidade`}
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
              Defina parcelamento, prazo de recebimento e tabela de taxas por parcela.
              Cada taxa pode ter politica diferente (loja absorve vs cliente paga
              acrescimo) e separacao por tipo de produto (aparelho vs nao aparelho).
            </DialogDescription>
          </DialogHeader>

          {methodBase && (
            <div className="space-y-6">
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

              {/* Taxas por parcela / aplicabilidade */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Taxas por parcela</h3>
                    <p className="text-xs text-muted-foreground">
                      Uma linha por nº de parcelas. A politica define quem paga o
                      acrescimo; a aplicabilidade separa aparelho de outros itens.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addRateRow}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Adicionar
                  </Button>
                </div>

                {rates.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8 text-center">
                    <CreditCard className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      Nenhuma taxa configurada ainda.
                    </p>
                    <Button variant="outline" size="sm" onClick={addRateRow}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Adicionar primeira taxa
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Desktop: tabela com cabecalho unico (labels uma vez so). */}
                    <div className="hidden max-h-[360px] overflow-y-auto rounded-lg border md:block">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                          <TableRow>
                            <TableHead className="w-20">Parcelas</TableHead>
                            <TableHead>Aplica em</TableHead>
                            <TableHead>Politica</TableHead>
                            <TableHead className="w-28">Taxa %</TableHead>
                            <TableHead className="w-28">Taxa R$</TableHead>
                            <TableHead className="w-16 text-center">Ativa</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rates.map((rate, idx) => (
                            <TableRow key={idx} className={rate.active ? "" : "opacity-55"}>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={1}
                                  max={36}
                                  value={rate.installments}
                                  className="h-9"
                                  onChange={(e) =>
                                    updateRate(idx, "installments", parseInt(e.target.value) || 1)
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={rate.appliesTo}
                                  onValueChange={(v) => updateRate(idx, "appliesTo", v as AppliesTo)}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(Object.entries(APPLIES_TO_LABELS) as [AppliesTo, string][]).map(
                                      ([v, lab]) => (
                                        <SelectItem key={v} value={v}>
                                          {lab}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={rate.policy}
                                  onValueChange={(v) => updateRate(idx, "policy", v as Policy)}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(Object.entries(POLICY_LABELS) as [Policy, string][]).map(
                                      ([v, lab]) => (
                                        <SelectItem key={v} value={v}>
                                          {lab}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    max={99.99}
                                    value={rate.feePercent}
                                    className="h-9 pr-6"
                                    onChange={(e) =>
                                      updateRate(idx, "feePercent", parseFloat(e.target.value) || 0)
                                    }
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    %
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    R$
                                  </span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={rate.feeFixed}
                                    className="h-9 pl-7"
                                    onChange={(e) =>
                                      updateRate(idx, "feeFixed", parseFloat(e.target.value) || 0)
                                    }
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch
                                  checked={rate.active}
                                  onCheckedChange={(c) => updateRate(idx, "active", c)}
                                  aria-label="Taxa ativa"
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeRate(idx)}
                                  aria-label="Remover taxa"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile: cada taxa vira um card (a tabela nao cabe). */}
                    <div className="space-y-3 md:hidden">
                      {rates.map((rate, idx) => (
                        <div
                          key={idx}
                          className={`space-y-3 rounded-lg border p-3 ${rate.active ? "" : "opacity-60"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{rate.installments}x</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Ativa</span>
                              <Switch
                                checked={rate.active}
                                onCheckedChange={(c) => updateRate(idx, "active", c)}
                                aria-label="Taxa ativa"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeRate(idx)}
                                aria-label="Remover taxa"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Parcelas</Label>
                              <Input
                                type="number"
                                min={1}
                                max={36}
                                value={rate.installments}
                                className="h-9"
                                onChange={(e) =>
                                  updateRate(idx, "installments", parseInt(e.target.value) || 1)
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Aplica em</Label>
                              <Select
                                value={rate.appliesTo}
                                onValueChange={(v) => updateRate(idx, "appliesTo", v as AppliesTo)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(Object.entries(APPLIES_TO_LABELS) as [AppliesTo, string][]).map(
                                    ([v, lab]) => (
                                      <SelectItem key={v} value={v}>
                                        {lab}
                                      </SelectItem>
                                    ),
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-2 space-y-1.5">
                              <Label className="text-xs">Politica</Label>
                              <Select
                                value={rate.policy}
                                onValueChange={(v) => updateRate(idx, "policy", v as Policy)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(Object.entries(POLICY_LABELS) as [Policy, string][]).map(
                                    ([v, lab]) => (
                                      <SelectItem key={v} value={v}>
                                        {lab}
                                      </SelectItem>
                                    ),
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Taxa %</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                max={99.99}
                                value={rate.feePercent}
                                className="h-9"
                                onChange={(e) =>
                                  updateRate(idx, "feePercent", parseFloat(e.target.value) || 0)
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Taxa R$</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                value={rate.feeFixed}
                                className="h-9"
                                onChange={(e) =>
                                  updateRate(idx, "feeFixed", parseFloat(e.target.value) || 0)
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
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
              Salvar tudo
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
