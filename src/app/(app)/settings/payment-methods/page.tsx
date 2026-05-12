"use client";

import { useState } from "react";
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
import { PageHeader } from "@/components/domain/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import {
  Dialog,
  DialogContent,
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

interface InstallmentRuleFormData {
  installments: number;
  feePercent: number;
}

export default function PaymentMethodsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInstallmentDialog, setShowInstallmentDialog] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [installmentRules, setInstallmentRules] = useState<InstallmentRuleFormData[]>([]);

  const { data: methods, isLoading } = useQuery(
    trpc.settings.listPaymentMethods.queryOptions()
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
    })
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
    })
  );

  const deleteMutation = useMutation(
    trpc.settings.deletePaymentMethod.mutationOptions({
      onSuccess: () => {
        toast.success("Forma de pagamento removida!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const installmentMutation = useMutation(
    trpc.settings.upsertInstallmentRules.mutationOptions({
      onSuccess: () => {
        toast.success("Regras de parcelamento atualizadas!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
        setShowInstallmentDialog(null);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const handleToggle = (id: string, active: boolean) => {
    toggleMutation.mutate({ id, active });
  };

  const openInstallmentDialog = (methodId: string) => {
    const method = methods?.find((m) => m.id === methodId);
    if (method?.installmentRules) {
      setInstallmentRules(
        method.installmentRules.map((r) => ({
          installments: r.installments,
          feePercent: Number(r.feePercent),
        }))
      );
    } else {
      setInstallmentRules([]);
    }
    setShowInstallmentDialog(methodId);
  };

  const addInstallmentRow = () => {
    const next = installmentRules.length > 0
      ? Math.max(...installmentRules.map((r) => r.installments)) + 1
      : 2;
    setInstallmentRules((prev) => [...prev, { installments: next, feePercent: 0 }]);
  };

  const removeInstallmentRow = (index: number) => {
    setInstallmentRules((prev) => prev.filter((_, i) => i !== index));
  };

  const updateInstallmentRow = (index: number, field: keyof InstallmentRuleFormData, value: number) => {
    setInstallmentRules((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const saveInstallmentRules = () => {
    if (!showInstallmentDialog) return;
    installmentMutation.mutate({
      paymentMethodId: showInstallmentDialog,
      rules: installmentRules,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Formas de Pagamento" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formas de Pagamento"
        subtitle="Configure quais formas de pagamento estarao disponiveis no PDV"
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
          {methods.map((method) => (
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
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {PAYMENT_TYPE_LABELS[method.type] ?? method.type}
                  </Badge>
                  {Number(method.feePercent) > 0 && (
                    <Badge variant="secondary">
                      Taxa: {Number(method.feePercent).toFixed(2)}%
                    </Badge>
                  )}
                </div>

                {method.installmentRules.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Parcelamento ate {Math.max(...method.installmentRules.map((r) => r.installments))}x
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  {method.type === "CREDIT_CARD" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openInstallmentDialog(method.id)}
                    >
                      <Settings2 className="w-3.5 h-3.5 mr-1" />
                      Parcelas
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
          ))}
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

              <FormField
                control={createForm.control}
                name="feePercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taxa (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="99.99"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
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

      {/* Installment rules dialog */}
      <Dialog
        open={showInstallmentDialog !== null}
        onOpenChange={(open) => !open && setShowInstallmentDialog(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Regras de Parcelamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {installmentRules.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma regra de parcelamento. Clique em &quot;Adicionar&quot; para configurar.
              </p>
            )}

            {installmentRules.map((rule, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Parcelas</label>
                  <Input
                    type="number"
                    min={2}
                    max={36}
                    value={rule.installments}
                    onChange={(e) =>
                      updateInstallmentRow(index, "installments", parseInt(e.target.value) || 2)
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Taxa (%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={99.99}
                    value={rule.feePercent}
                    onChange={(e) =>
                      updateInstallmentRow(index, "feePercent", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-5 text-destructive"
                  onClick={() => removeInstallmentRow(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addInstallmentRow} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Parcela
          </Button>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInstallmentDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={saveInstallmentRules} disabled={installmentMutation.isPending}>
              {installmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
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
