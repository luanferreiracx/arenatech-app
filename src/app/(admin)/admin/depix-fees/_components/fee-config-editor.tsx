"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type FeeFields = {
  entryFeeFixed: number;
  entryFeePercent: number;
  exitFeeFixed: number;
  exitFeePercent: number;
  onchainFeeFixed: number;
  onchainFeePercent: number;
};

type TenantFee = FeeFields & { tenantId: string; tenantName: string };

/** Editor por-tenant das taxas DePix (superadmin). Depósito, saque PIX e saque
 *  on-chain têm taxas independentes. Fixos em reais, percentuais em %. */
export function FeeConfigEditor() {
  const trpc = useTRPC();
  const feesQuery = useQuery(trpc.depixFeeWalletAdmin.listTenantFees.queryOptions());
  const [selectedId, setSelectedId] = useState<string>("");

  const tenants = feesQuery.data ?? [];
  const selected = tenants.find((t) => t.tenantId === selectedId);

  return (
    <Card className="p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Taxas por tenant</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Taxa de intermediação Arena (receita). Depósito, saque PIX e saque on-chain são
          independentes. Fixos em reais, percentuais em %.
        </p>
      </div>

      <div>
        <Label htmlFor="feeTenant">Tenant</Label>
        <select
          id="feeTenant"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Selecione um tenant…</option>
          {tenants.map((t) => (
            <option key={t.tenantId} value={t.tenantId}>
              {t.tenantName}
            </option>
          ))}
        </select>
      </div>

      {/* key={selectedId}: remonta o form com os valores do tenant escolhido,
          sem precisar de useEffect+setState (estado inicial derivado da prop). */}
      {selected && <FeeForm key={selected.tenantId} tenant={selected} />}
    </Card>
  );
}

function FeeForm({ tenant }: { tenant: TenantFee }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FeeFields>({
    entryFeeFixed: tenant.entryFeeFixed,
    entryFeePercent: tenant.entryFeePercent,
    exitFeeFixed: tenant.exitFeeFixed,
    exitFeePercent: tenant.exitFeePercent,
    onchainFeeFixed: tenant.onchainFeeFixed,
    onchainFeePercent: tenant.onchainFeePercent,
  });

  const saveMutation = useMutation(
    trpc.depixFeeWalletAdmin.updateTenantFee.mutationOptions({
      onSuccess: () => {
        toast.success("Taxas atualizadas");
        void queryClient.invalidateQueries({ queryKey: [["depixFeeWalletAdmin", "listTenantFees"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function setField(key: keyof FeeFields, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <FeeRow
        label="Depósito"
        fixedValue={form.entryFeeFixed}
        percentValue={form.entryFeePercent}
        onFixed={(v) => setField("entryFeeFixed", v)}
        onPercent={(v) => setField("entryFeePercent", v)}
      />
      <FeeRow
        label="Saque PIX"
        fixedValue={form.exitFeeFixed}
        percentValue={form.exitFeePercent}
        onFixed={(v) => setField("exitFeeFixed", v)}
        onPercent={(v) => setField("exitFeePercent", v)}
      />
      <FeeRow
        label="Saque on-chain (Sideswap)"
        fixedValue={form.onchainFeeFixed}
        percentValue={form.onchainFeePercent}
        onFixed={(v) => setField("onchainFeeFixed", v)}
        onPercent={(v) => setField("onchainFeePercent", v)}
      />

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate({ tenantId: tenant.tenantId, ...form })}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar taxas
        </Button>
      </div>
    </div>
  );
}

function FeeRow({
  label,
  fixedValue,
  percentValue,
  onFixed,
  onPercent,
}: {
  label: string;
  fixedValue: number; // centavos
  percentValue: number;
  onFixed: (cents: number) => void;
  onPercent: (pct: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
      <p className="text-sm font-medium pb-2">{label}</p>
      <div className="w-28">
        <Label className="text-[11px] text-muted-foreground">Fixo (R$)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          defaultValue={(fixedValue / 100).toFixed(2)}
          onChange={(e) => onFixed(Math.round((Number(e.target.value) || 0) * 100))}
          className="font-mono tabular-nums"
        />
      </div>
      <div className="w-24">
        <Label className="text-[11px] text-muted-foreground">%</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={percentValue}
          onChange={(e) => onPercent(Number(e.target.value) || 0)}
          className="font-mono tabular-nums"
        />
      </div>
    </div>
  );
}
