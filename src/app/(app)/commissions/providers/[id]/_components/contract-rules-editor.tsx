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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/inputs/date-input";
import { toast } from "@/lib/toast";
import {
  COMMISSION_CATEGORY_LABELS,
  COMMISSION_SCOPE_LABELS,
  COMMISSION_VALUE_TYPE_LABELS,
  COMMISSION_BASE_LABELS,
  COMMISSION_SOURCE_LABELS,
  CATEGORIES_WITH_SCOPE,
  PRODUCT_CATEGORIES,
  commissionCategoryEnum,
  validateBracketSet,
  type CommissionCategory,
  type CommissionScope,
  type CommissionValueType,
  type CommissionBase,
  type CommissionSource,
} from "@/lib/validators/provider-commission";

type RuleRow = {
  id: string | null;
  category: CommissionCategory;
  scope: CommissionScope;
  valueType: CommissionValueType;
  base: CommissionBase;
  source: CommissionSource;
  rangeMin: number;
  rangeMax: number | null;
  rate: number;
};

type ContractRule = {
  id: string;
  category: string;
  scope: string;
  valueType: string;
  base: string;
  source: string;
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

function isProductCategory(category: CommissionCategory): boolean {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(category);
}

function toDateInput(value: string | Date | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().split("T")[0] ?? "";
}

/** Escopos disponiveis para uma categoria. Servicos/intermediacao so tem `normal`. */
function scopesFor(category: CommissionCategory): CommissionScope[] {
  return CATEGORIES_WITH_SCOPE.includes(category) ? ["normal", "premium"] : ["normal"];
}

/** Origens disponiveis: participacao na loja (STORE) so vale para produtos. */
function sourcesFor(category: CommissionCategory): CommissionSource[] {
  return isProductCategory(category) ? ["OWN", "STORE"] : ["OWN"];
}

/** Chave do grupo (mesmo balde do calculo): categoria × escopo × origem. */
function groupKey(r: { category: string; scope: string; source: string }): string {
  return `${r.category}|${r.scope}|${r.source}`;
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
      valueType: (r.valueType ?? "PERCENT") as CommissionValueType,
      base: (r.base ?? "PROFIT") as CommissionBase,
      source: (r.source ?? "OWN") as CommissionSource,
      rangeMin: r.rangeMin,
      rangeMax: r.rangeMax,
      rate: r.rate,
    })),
  );

  const createContract = useMutation(trpc.providerCommission.createContract.mutationOptions());
  const updateContract = useMutation(trpc.providerCommission.updateContract.mutationOptions());
  const updateRules = useMutation(trpc.providerCommission.updateRules.mutationOptions());

  // Adiciona uma faixa a um grupo (categoria × escopo × origem), herdando o modo
  // (tipo/base) das faixas ja existentes do grupo.
  const addRule = (category: CommissionCategory, scope: CommissionScope, source: CommissionSource) => {
    setRules((prev) => {
      const sameGroup = prev.filter(
        (r) => r.category === category && r.scope === scope && r.source === source,
      );
      const mode = sameGroup[0];
      const isFixed = mode?.valueType === "FIXED_PER_UNIT";
      const lastMax = sameGroup.reduce((max, r) => (r.rangeMax != null && r.rangeMax > max ? r.rangeMax : max), 0);
      const startAt = sameGroup.length === 0 ? 0 : lastMax;
      return [
        ...prev,
        {
          id: null,
          category,
          scope,
          valueType: mode?.valueType ?? "PERCENT",
          base: mode?.base ?? "PROFIT",
          source,
          rangeMin: isFixed ? 0 : startAt,
          rangeMax: null,
          rate: 0,
        },
      ];
    });
  };

  const updateRule = (index: number, patch: Partial<RuleRow>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  // Muda o modo (tipo/base) de um grupo inteiro — mantem os 3 eixos coerentes por balde.
  const updateGroupMode = (key: string, patch: Partial<Pick<RuleRow, "valueType" | "base">>) => {
    setRules((prev) =>
      prev.map((r) => {
        if (groupKey(r) !== key) return r;
        const next = { ...r, ...patch };
        // Regra fixa nao usa faixa nem base "total" — normaliza.
        if (next.valueType === "FIXED_PER_UNIT") {
          next.rangeMax = null;
          next.base = "PROFIT";
        }
        return next;
      }),
    );
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const invalidateDetail = () => {
    queryClient.invalidateQueries({ queryKey: trpc.providerCommission.getDetail.queryKey() });
  };

  const validateAll = (): string | null => {
    // Faixas por (categoria, escopo, origem); regras fixas nao entram na checagem.
    const groups = new Map<string, RuleRow[]>();
    for (const rule of rules) {
      if (rule.valueType === "FIXED_PER_UNIT") continue;
      const key = groupKey(rule);
      groups.set(key, [...(groups.get(key) ?? []), rule]);
    }
    for (const [key, list] of groups) {
      const result = validateBracketSet(list);
      if (!result.ok) {
        const [category, scope, source] = key.split("|");
        return `${COMMISSION_CATEGORY_LABELS[category!]} (${COMMISSION_SCOPE_LABELS[scope!]} / ${COMMISSION_SOURCE_LABELS[source!]}): ${result.message}`;
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
            valueType: r.valueType,
            base: r.base,
            source: r.source,
            rangeMin: r.rangeMin,
            rangeMax: r.valueType === "FIXED_PER_UNIT" ? null : r.rangeMax,
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
            Defina o periodo, a ajuda de custo e as aliquotas por categoria. Cada grupo pode ser
            percentual (com faixas progressivas) ou valor fixo por unidade, sobre o lucro ou o valor
            total, e ainda uma participacao nas vendas da loja (feitas por outros).
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
              onUpdateGroupMode={updateGroupMode}
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
  onUpdateGroupMode,
  onRemove,
}: {
  category: CommissionCategory;
  rules: RuleRow[];
  onAdd: (category: CommissionCategory, scope: CommissionScope, source: CommissionSource) => void;
  onUpdate: (index: number, patch: Partial<RuleRow>) => void;
  onUpdateGroupMode: (key: string, patch: Partial<Pick<RuleRow, "valueType" | "base">>) => void;
  onRemove: (index: number) => void;
}) {
  const scopes = scopesFor(category);
  const sources = sourcesFor(category);
  const isProduct = isProductCategory(category);

  return (
    <div className="rounded-md border border-border p-3 bg-muted/30">
      <h4 className="text-sm font-semibold text-primary mb-2">{COMMISSION_CATEGORY_LABELS[category]}</h4>
      <div className="space-y-4">
        {scopes.map((scope) =>
          sources.map((source) => (
            <RuleGroup
              key={`${scope}|${source}`}
              category={category}
              scope={scope}
              source={source}
              showScope={scopes.length > 1}
              showSource={sources.length > 1}
              isProduct={isProduct}
              rules={rules}
              onAdd={onAdd}
              onUpdate={onUpdate}
              onUpdateGroupMode={onUpdateGroupMode}
              onRemove={onRemove}
            />
          )),
        )}
      </div>
    </div>
  );
}

function RuleGroup({
  category,
  scope,
  source,
  showScope,
  showSource,
  isProduct,
  rules,
  onAdd,
  onUpdate,
  onUpdateGroupMode,
  onRemove,
}: {
  category: CommissionCategory;
  scope: CommissionScope;
  source: CommissionSource;
  showScope: boolean;
  showSource: boolean;
  isProduct: boolean;
  rules: RuleRow[];
  onAdd: (category: CommissionCategory, scope: CommissionScope, source: CommissionSource) => void;
  onUpdate: (index: number, patch: Partial<RuleRow>) => void;
  onUpdateGroupMode: (key: string, patch: Partial<Pick<RuleRow, "valueType" | "base">>) => void;
  onRemove: (index: number) => void;
}) {
  const key = `${category}|${scope}|${source}`;
  const groupIndexes = rules
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.category === category && r.scope === scope && r.source === source);

  const mode = groupIndexes[0]?.r;
  const valueType: CommissionValueType = mode?.valueType ?? "PERCENT";
  const base: CommissionBase = mode?.base ?? "PROFIT";
  const isFixed = valueType === "FIXED_PER_UNIT";

  const subtitleParts = [
    showScope ? COMMISSION_SCOPE_LABELS[scope] : null,
    showSource ? COMMISSION_SOURCE_LABELS[source] : null,
  ].filter(Boolean);

  return (
    <div>
      {subtitleParts.length > 0 && (
        <p className="text-[11px] uppercase text-muted-foreground mb-1">{subtitleParts.join(" · ")}</p>
      )}

      {/* Modo do grupo: so para produtos (servico e sempre %/lucro). */}
      {isProduct && groupIndexes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Tipo</Label>
            <Select
              value={valueType}
              onValueChange={(v) => onUpdateGroupMode(key, { valueType: v as CommissionValueType })}
            >
              <SelectTrigger className="h-7 text-xs w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COMMISSION_VALUE_TYPE_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isFixed && (
            <div>
              <Label className="text-[10px] text-muted-foreground">Base</Label>
              <Select value={base} onValueChange={(v) => onUpdateGroupMode(key, { base: v as CommissionBase })}>
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMMISSION_BASE_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {groupIndexes.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sem regra.</p>
      ) : (
        <div className="space-y-1">
          {groupIndexes.map(({ r, i }, pos) => (
            <div
              key={i}
              className={
                isFixed
                  ? "grid grid-cols-[1fr_auto] gap-2 items-end"
                  : "grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
              }
            >
              {!isFixed && (
                <>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Piso (R$)</Label>
                    <ReaisInput value={r.rangeMin} onChange={(v) => onUpdate(i, { rangeMin: v })} ariaLabel="Piso da faixa" />
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
                </>
              )}
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  {isFixed ? "Valor por unidade (R$)" : "Aliquota (%)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={isFixed ? undefined : 100}
                  value={r.rate || ""}
                  onChange={(e) => onUpdate(i, { rate: Number(e.target.value) || 0 })}
                  className="h-8 text-xs"
                  aria-label={isFixed ? "Valor por unidade" : "Aliquota da faixa"}
                />
              </div>
              {/* Regra fixa e unica; percentual mostra remover a partir da 2a faixa. */}
              {(isFixed || pos > 0 || groupIndexes.length > 1) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Remover"
                  onClick={() => onRemove(i)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fixo = uma regra so; percentual pode ter varias faixas. */}
      {!(isFixed && groupIndexes.length >= 1) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 text-xs"
          onClick={() => onAdd(category, scope, source)}
        >
          <Plus className="h-3 w-3 mr-1" />
          {groupIndexes.length === 0 ? "Adicionar regra" : "Adicionar faixa"}
        </Button>
      )}
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
