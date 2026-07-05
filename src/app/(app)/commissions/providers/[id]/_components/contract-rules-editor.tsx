"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DateInput } from "@/components/inputs/date-input";
import { toast } from "@/lib/toast";
import {
  COMMISSION_CATEGORY_LABELS,
  COMMISSION_SCOPE_LABELS,
  CATEGORIES_WITH_SCOPE,
  commissionCategoryEnum,
  validateBracketSet,
  type CommissionCategory,
  type CommissionScope,
} from "@/lib/validators/provider-commission";

type RuleRow = {
  id: string | null;
  category: CommissionCategory;
  scope: CommissionScope;
  rangeMin: number;
  rangeMax: number | null;
  rate: number;
};

type ContractRule = {
  id: string;
  category: string;
  scope: string;
  rangeMin: number;
  rangeMax: number | null;
  rate: number;
};

type CurrentContract = {
  id: string;
  startDate: string | Date;
  endDate: string | Date | null;
  allowanceCap: number;
  dailyMeal: number;
  dailyTransport: number;
  monthlyCellphone: number;
  rules: ContractRule[];
};

const CATEGORIES = commissionCategoryEnum.options;

function toDateInput(value: string | Date | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().split("T")[0] ?? "";
}

/** Escopos disponiveis para uma categoria. Servicos/intermediacao so tem `normal`. */
function scopesFor(category: CommissionCategory): CommissionScope[] {
  return CATEGORIES_WITH_SCOPE.includes(category) ? ["normal", "premium"] : ["normal"];
}

export function ContractRulesEditor({
  providerId,
  currentContract,
}: {
  providerId: string;
  currentContract: CurrentContract | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Contract fields (reais).
  const [startDate, setStartDate] = useState(toDateInput(currentContract?.startDate ?? new Date()));
  const [endDate, setEndDate] = useState(toDateInput(currentContract?.endDate ?? null));
  const [allowanceCap, setAllowanceCap] = useState(currentContract?.allowanceCap ?? 0);
  const [dailyMeal, setDailyMeal] = useState(currentContract?.dailyMeal ?? 0);
  const [dailyTransport, setDailyTransport] = useState(currentContract?.dailyTransport ?? 0);
  const [monthlyCellphone, setMonthlyCellphone] = useState(currentContract?.monthlyCellphone ?? 0);

  const [rules, setRules] = useState<RuleRow[]>(
    (currentContract?.rules ?? []).map((r) => ({
      id: r.id,
      category: r.category as CommissionCategory,
      scope: r.scope as CommissionScope,
      rangeMin: r.rangeMin,
      rangeMax: r.rangeMax,
      rate: r.rate,
    })),
  );

  const createContract = useMutation(trpc.providerCommission.createContract.mutationOptions());
  const updateContract = useMutation(trpc.providerCommission.updateContract.mutationOptions());
  const updateRules = useMutation(trpc.providerCommission.updateRules.mutationOptions());

  const addRule = (category: CommissionCategory, scope: CommissionScope) => {
    setRules((prev) => {
      const sameGroup = prev.filter((r) => r.category === category && r.scope === scope);
      // Nova faixa comeca onde a ultima terminou (teto aberto por padrao).
      const lastMax = sameGroup.reduce((max, r) => (r.rangeMax != null && r.rangeMax > max ? r.rangeMax : max), 0);
      const startAt = sameGroup.length === 0 ? 0 : lastMax;
      return [...prev, { id: null, category, scope, rangeMin: startAt, rangeMax: null, rate: 0 }];
    });
  };

  const updateRule = (index: number, patch: Partial<RuleRow>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const invalidateDetail = () => {
    queryClient.invalidateQueries({ queryKey: trpc.providerCommission.getDetail.queryKey() });
  };

  const validateAll = (): string | null => {
    const groups = new Map<string, RuleRow[]>();
    for (const rule of rules) {
      const key = `${rule.category}|${rule.scope}`;
      groups.set(key, [...(groups.get(key) ?? []), rule]);
    }
    for (const [key, list] of groups) {
      const result = validateBracketSet(list);
      if (!result.ok) {
        const [category, scope] = key.split("|");
        return `${COMMISSION_CATEGORY_LABELS[category!]} (${COMMISSION_SCOPE_LABELS[scope!]}): ${result.message}`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!startDate) {
      toast.error("Informe a data de inicio do contrato.");
      return;
    }
    const bracketError = validateAll();
    if (bracketError) {
      toast.error(bracketError);
      return;
    }

    const contractFields = {
      startDate,
      endDate: endDate || null,
      allowanceCap,
      dailyMeal,
      dailyTransport,
      monthlyCellphone,
    };

    try {
      // Sem contrato vigente → cria. Com contrato → atualiza os campos e as regras.
      let contractId: string;
      if (currentContract) {
        await updateContract.mutateAsync({ contractId: currentContract.id, ...contractFields });
        contractId = currentContract.id;
      } else {
        contractId = (await createContract.mutateAsync({ providerId, ...contractFields })).id;
      }

      await updateRules.mutateAsync({
        contractId,
        rules: rules
          .filter((r) => r.rate > 0)
          .map((r) => ({
            id: r.id,
            category: r.category,
            scope: r.scope,
            rangeMin: r.rangeMin,
            rangeMax: r.rangeMax,
            rate: r.rate,
          })),
      });

      toast.success("Contrato e aliquotas salvos.");
      invalidateDetail();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar o contrato.");
    }
  };

  const isSaving = createContract.isPending || updateContract.isPending || updateRules.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-1" />
          {currentContract ? "Editar contrato e aliquotas" : "Cadastrar contrato e aliquotas"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contrato e aliquotas de comissao</DialogTitle>
          <DialogDescription>
            Defina o periodo do contrato, a ajuda de custo e as aliquotas por categoria. As faixas sao
            progressivas (estilo IR): cada porcao da base recebe a aliquota da sua faixa.
          </DialogDescription>
        </DialogHeader>

        {/* Contrato */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Inicio *</Label>
            <DateInput value={startDate} onChange={setStartDate} aria-label="Inicio do contrato" />
          </div>
          <div>
            <Label className="text-xs">Fim (opcional)</Label>
            <DateInput value={endDate} onChange={setEndDate} aria-label="Fim do contrato" />
          </div>
          <div>
            <Label className="text-xs">Teto ajuda de custo (R$)</Label>
            <ReaisInput value={allowanceCap} onChange={setAllowanceCap} ariaLabel="Teto ajuda de custo" />
          </div>
          <div>
            <Label className="text-xs">Diaria refeicao (R$)</Label>
            <ReaisInput value={dailyMeal} onChange={setDailyMeal} ariaLabel="Diaria refeicao" />
          </div>
          <div>
            <Label className="text-xs">Diaria deslocamento (R$)</Label>
            <ReaisInput value={dailyTransport} onChange={setDailyTransport} ariaLabel="Diaria deslocamento" />
          </div>
          <div>
            <Label className="text-xs">Celular mensal (R$)</Label>
            <ReaisInput value={monthlyCellphone} onChange={setMonthlyCellphone} ariaLabel="Celular mensal" />
          </div>
        </section>

        <Separator />

        {/* Regras por categoria */}
        <section className="space-y-4">
          {CATEGORIES.map((category) => (
            <CategoryRules
              key={category}
              category={category}
              rules={rules}
              onAdd={addRule}
              onUpdate={updateRule}
              onRemove={removeRule}
            />
          ))}
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar contrato e aliquotas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRules({
  category,
  rules,
  onAdd,
  onUpdate,
  onRemove,
}: {
  category: CommissionCategory;
  rules: RuleRow[];
  onAdd: (category: CommissionCategory, scope: CommissionScope) => void;
  onUpdate: (index: number, patch: Partial<RuleRow>) => void;
  onRemove: (index: number) => void;
}) {
  const scopes = scopesFor(category);

  return (
    <div className="rounded-md border border-border p-3 bg-muted/30">
      <h4 className="text-sm font-semibold text-primary mb-2">
        {COMMISSION_CATEGORY_LABELS[category]}
      </h4>
      <div className="space-y-3">
        {scopes.map((scope) => {
          // Indices absolutos (em `rules`) das faixas deste grupo, para editar/remover.
          const groupIndexes = rules
            .map((r, i) => ({ r, i }))
            .filter(({ r }) => r.category === category && r.scope === scope);

          return (
            <div key={scope}>
              {scopes.length > 1 && (
                <p className="text-[11px] uppercase text-muted-foreground mb-1">
                  {COMMISSION_SCOPE_LABELS[scope]}
                </p>
              )}
              {groupIndexes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Sem faixas.</p>
              ) : (
                <div className="space-y-1">
                  {groupIndexes.map(({ r, i }) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Piso (R$)</Label>
                        <ReaisInput
                          value={r.rangeMin}
                          onChange={(v) => onUpdate(i, { rangeMin: v })}
                          ariaLabel="Piso da faixa"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Teto (R$, vazio = aberto)</Label>
                        <ReaisInput
                          value={r.rangeMax ?? 0}
                          allowEmpty
                          onChange={(v) => onUpdate(i, { rangeMax: v > 0 ? v : null })}
                          ariaLabel="Teto da faixa"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Aliquota (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={r.rate || ""}
                          onChange={(e) => onUpdate(i, { rate: Number(e.target.value) || 0 })}
                          className="h-8 text-xs"
                          aria-label="Aliquota da faixa"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Remover faixa"
                        onClick={() => onRemove(i)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => onAdd(category, scope)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Adicionar faixa
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Input numerico em reais (o backend recebe reais, nao centavos como o MoneyInput). */
function ReaisInput({
  value,
  onChange,
  ariaLabel,
  allowEmpty = false,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  allowEmpty?: boolean;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={allowEmpty && value === 0 ? "" : value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="h-8 text-xs"
      aria-label={ariaLabel}
    />
  );
}
