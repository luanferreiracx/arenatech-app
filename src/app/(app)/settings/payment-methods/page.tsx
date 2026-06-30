"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

type Policy = "LOJA_ABSORVE" | "CLIENTE_PAGA";

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

  // Estado do dialog de edicao (config base + politica da forma).
  const [methodBase, setMethodBase] = useState<{
    name: string;
    acceptsInstallments: boolean;
    installmentsMin: number;
    installmentsMax: number;
    settlementDays: number;
    acceptsChange: boolean;
    policy: Policy;
  } | null>(null);

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
      // Politica de taxa por FORMA (coluna PaymentMethod.feePolicy).
      policy: (m.feePolicy as Policy | undefined) ?? "LOJA_ABSORVE",
    });
    setEditingMethodId(id);
  };

  const handleToggle = (id: string, active: boolean) => {
    toggleMutation.mutate({ id, active });
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
        feePolicy: methodBase.policy,
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

  const isSaving = updateFullMutation.isPending;

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
            const isCard = method.type === "CREDIT_CARD" || method.type === "DEBIT_CARD";
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
                    {/* Cartao: a taxa vive em Cartoes e Recebimento, nao aqui. */}
                    {!isCard && hasFee && Number(method.feePercent) > 0 && (
                      <Badge variant="secondary">
                        Taxa: {Number(method.feePercent).toFixed(2)}%
                      </Badge>
                    )}
                    {!isCard && hasFee && Number(method.feeFixed) > 0 && (
                      <Badge variant="secondary">
                        + R$ {Number(method.feeFixed).toFixed(2)}
                      </Badge>
                    )}
                    {!hasFee && <Badge variant="outline">Sem taxa</Badge>}
                  </div>

                  {isCard && (
                    <p className="text-xs text-muted-foreground">
                      Taxa por adquirente/bandeira em{" "}
                      <Link href="/settings/card-acquirers" className="underline hover:text-foreground">
                        Cartões e Recebimento
                      </Link>
                      .
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

      {/* Dialog de edicao: config base + quem paga a taxa */}
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
              Defina parcelas, prazo, troco e quem paga a taxa. A taxa do cartão
              em si é configurada em Cartões e Recebimento (por adquirente e
              bandeira).
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

              {/* A taxa do cartao NAO e mais configurada aqui — vive em Cartoes
                  e Recebimento (por adquirente x bandeira x parcela), que e a
                  taxa real da maquininha e a fonte unica do recebivel/DRE. */}
              {(editingMethod?.type === "CREDIT_CARD" ||
                editingMethod?.type === "DEBIT_CARD") && (
                <section className="rounded-lg border border-info/40 bg-info/5 p-4">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-info" />
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-semibold">A taxa do cartão fica em Cartões e Recebimento</h3>
                      <p className="text-sm text-muted-foreground">
                        A taxa real da maquininha varia por adquirente, bandeira e
                        parcela — configure lá. É a mesma taxa usada no recebível e
                        no financeiro, sem duplicar valores.
                      </p>
                      <Button variant="outline" size="sm" asChild className="mt-1">
                        <Link href="/settings/card-acquirers">
                          Abrir Cartões e Recebimento
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>
              )}
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
