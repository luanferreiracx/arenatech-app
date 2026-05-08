"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type z } from "zod";
import { Plus, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { createPaymentMethodSchema } from "@/lib/validators/settings";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

type CreateFormValues = z.infer<typeof createPaymentMethodSchema>;

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  CREDIT_CARD: "Cartão de Crédito",
  DEBIT_CARD: "Cartão de Débito",
  BANK_TRANSFER: "Transferência Bancária",
  STORE_CREDIT: "Crédito em Conta",
  OTHER: "Outro",
};

export function PaymentMethodsClient() {
  const trpc = useTRPC();
  const [createOpen, setCreateOpen] = useState(false);
  const [installmentsMethodId, setInstallmentsMethodId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: methods = [], refetch } = useQuery(
    trpc.settings.listPaymentMethods.queryOptions(),
  );

  const createMutation = useMutation(
    trpc.settings.createPaymentMethod.mutationOptions({
      onSuccess: () => {
        toast.success("Forma de pagamento criada!");
        setCreateOpen(false);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.settings.updatePaymentMethod.mutationOptions({
      onSuccess: () => void refetch(),
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.settings.deletePaymentMethod.mutationOptions({
      onSuccess: () => {
        toast.success("Forma de pagamento desativada.");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createPaymentMethodSchema),
    defaultValues: {
      name: "",
      type: "CASH",
      feePercent: 0,
      acceptsChange: false,
    },
  });

  const onCreateSubmit = (values: CreateFormValues) => {
    createMutation.mutate(values);
  };

  const activeMethod = methods.find((m) => m.id === installmentsMethodId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Forma de Pagamento
        </Button>
      </div>

      {methods.length === 0 ? (
        <EmptyState
          title="Nenhuma forma de pagamento"
          description="Adicione formas de pagamento aceitas pela sua loja."
        />
      ) : (
        <div className="space-y-2">
          {methods.map((method) => (
            <div
              key={method.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border"
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={method.active}
                  onCheckedChange={(checked) =>
                    updateMutation.mutate({ id: method.id, active: checked })
                  }
                />
                <div>
                  <p className="font-medium text-sm">{method.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-xs">
                      {PAYMENT_TYPE_LABELS[method.type] ?? method.type}
                    </Badge>
                    {Number(method.feePercent) > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Taxa: {Number(method.feePercent).toFixed(2)}%
                      </span>
                    )}
                    {method.acceptsChange && (
                      <span className="text-xs text-muted-foreground">Aceita troco</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(method.type === "CREDIT_CARD" || method.type === "BANK_TRANSFER") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInstallmentsMethodId(method.id)}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Parcelamentos ({method.installmentRules.length})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteId(method.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Forma de Pagamento</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: PIX Arena Tech" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="feePercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Taxa (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="acceptsChange"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="mb-2">Aceita Troco</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  Criar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Installment rules sheet */}
      <Sheet
        open={!!installmentsMethodId}
        onOpenChange={(open) => !open && setInstallmentsMethodId(null)}
      >
        <SheetContent className="min-w-[400px]">
          <SheetHeader>
            <SheetTitle>
              Parcelamentos — {activeMethod?.name}
            </SheetTitle>
          </SheetHeader>
          {installmentsMethodId && (
            <InstallmentRulesEditor paymentMethodId={installmentsMethodId} />
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Desativar forma de pagamento?"
        description="A forma de pagamento será desativada e não estará disponível para novas vendas."
        confirmLabel="Desativar"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Installment Rules Editor (inside Sheet)
// ────────────────────────────────────────────────────────────────────────────

function InstallmentRulesEditor({ paymentMethodId }: { paymentMethodId: string }) {
  const trpc = useTRPC();
  const [rules, setRules] = useState<Array<{ installments: number; feePercent: number; minAmount: number }>>([]);
  const [loaded, setLoaded] = useState(false);

  const { data: existingRules } = useQuery(
    trpc.settings.listInstallmentRules.queryOptions({ paymentMethodId }),
  );

  if (!loaded && existingRules) {
    setLoaded(true);
    setRules(
      existingRules.map((r) => ({
        installments: r.installments,
        feePercent: Number(r.feePercent),
        minAmount: Number(r.minAmount),
      })),
    );
  }

  const saveMutation = useMutation(
    trpc.settings.upsertInstallmentRules.mutationOptions({
      onSuccess: () => toast.success("Regras de parcelamento salvas!"),
      onError: (err) => toast.error(err.message),
    }),
  );

  const addRule = () => {
    const next = rules.length + 2;
    setRules([...rules, { installments: next, feePercent: 0, minAmount: 0 }]);
  };

  const removeRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  const updateRule = (idx: number, field: string, value: number) => {
    setRules(rules.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  return (
    <div className="mt-6 space-y-4">
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma regra de parcelamento configurada.</p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-24">
                <label className="text-xs text-muted-foreground">Parcelas</label>
                <Input
                  type="number"
                  min={2}
                  max={36}
                  value={rule.installments}
                  onChange={(e) => updateRule(idx, "installments", parseInt(e.target.value) || 2)}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Taxa %</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={rule.feePercent}
                  onChange={(e) => updateRule(idx, "feePercent", parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Mínimo (R$)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={rule.minAmount}
                  onChange={(e) => updateRule(idx, "minAmount", parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="mt-5 text-destructive hover:text-destructive shrink-0"
                onClick={() => removeRule(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={addRule}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
        <Button
          size="sm"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate({ paymentMethodId, rules })}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
