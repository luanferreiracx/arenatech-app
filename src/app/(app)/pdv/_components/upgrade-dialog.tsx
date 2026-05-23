"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImeiInput } from "@/components/inputs/imei-input";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";

interface UpgradeRow {
  id: string;
  brand: string | null;
  model: string;
  imei: string | null;
  appraisedValue: number; // cents
  abatedValue: number; // cents
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  upgrades: UpgradeRow[];
  /** Subtotal do carrinho ja com desconto aplicado (centavos). Usado pra
   * preview do impacto do upgrade — se total abatido > carrinho, vira
   * downgrade e loja devolve a diferenca. */
  cartTotal: number;
}

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function UpgradeDialog({ open, onOpenChange, saleId, upgrades, cartTotal }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [condition, setCondition] = useState<"USED" | "NEW" | "SEMI_NEW" | "DISPLAY">("USED");
  const [batteryHealth, setBatteryHealth] = useState<number | "">("");
  const [appraisedValue, setAppraisedValue] = useState(0);
  const [abatedValue, setAbatedValue] = useState(0);
  const [notes, setNotes] = useState("");

  const totalAbatedExistente = useMemo(
    () => upgrades.reduce((acc, u) => acc + u.abatedValue, 0),
    [upgrades],
  );
  const totalAbatedComNovo = totalAbatedExistente + (abatedValue > 0 ? abatedValue : 0);
  const saldoAposNovo = cartTotal - totalAbatedComNovo;
  const viraDowngrade = saldoAposNovo < 0;
  const valorDevolucao = viraDowngrade ? -saldoAposNovo : 0;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["sale", "getDraft"]] });

  const addMut = useMutation(
    trpc.sale.addUpgrade.mutationOptions({
      onSuccess: () => {
        toast.success("Upgrade adicionado.");
        setBrand("");
        setModel("");
        setImei("");
        setCondition("USED");
        setBatteryHealth("");
        setAppraisedValue(0);
        setAbatedValue(0);
        setNotes("");
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const removeMut = useMutation(
    trpc.sale.removeUpgrade.mutationOptions({
      onSuccess: () => {
        toast.success("Upgrade removido.");
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  function save() {
    if (!model.trim()) {
      toast.error("Informe o modelo do aparelho.");
      return;
    }
    if (appraisedValue <= 0) {
      toast.error("Valor avaliado deve ser maior que zero.");
      return;
    }
    if (abatedValue <= 0 || abatedValue > appraisedValue) {
      toast.error("Valor abatido deve ser positivo e ate o valor avaliado.");
      return;
    }
    addMut.mutate({
      saleId,
      brand: brand || null,
      model,
      imei: imei || null,
      condition,
      batteryHealth: batteryHealth === "" ? null : Number(batteryHealth),
      appraisedValue,
      abatedValue,
      notes: notes || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aparelho de Entrada (Trade-in)</DialogTitle>
        </DialogHeader>

        {upgrades.length > 0 && (
          <div className="border border-border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Aparelhos adicionados
            </p>
            {upgrades.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">
                    {[u.brand, u.model].filter(Boolean).join(" ") || u.model}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avaliado {formatMoney(u.appraisedValue)} • Abate {formatMoney(u.abatedValue)}
                    {u.imei ? ` • IMEI ${u.imei}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  disabled={removeMut.isPending}
                  onClick={() => removeMut.mutate({ id: u.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="border border-border rounded-md p-3 space-y-1 bg-muted/30">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total do carrinho</span>
            <span className="font-medium">{formatMoney(cartTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Total abatido {abatedValue > 0 ? "(c/ novo)" : ""}
            </span>
            <span className="font-medium">- {formatMoney(totalAbatedComNovo)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold pt-1 border-t border-border">
            <span>{viraDowngrade ? "Loja devolve" : "Cliente paga"}</span>
            <span className={viraDowngrade ? "text-orange-600" : "text-primary"}>
              {formatMoney(viraDowngrade ? valorDevolucao : Math.max(0, saldoAposNovo))}
            </span>
          </div>
          {viraDowngrade && (
            <div className="flex items-start gap-2 mt-2 p-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 rounded text-xs text-orange-900 dark:text-orange-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                <strong>Atencao:</strong> abatimento maior que o carrinho. Esta venda vira{" "}
                <strong>downgrade</strong> — a loja devolve{" "}
                <strong>{formatMoney(valorDevolucao)}</strong> ao cliente. Forma de devolucao
                (dinheiro / PIX / DePix) sera pedida na finalizacao.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Marca</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex.: Apple" />
          </div>
          <div className="space-y-2">
            <Label>Modelo *</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex.: iPhone 13 128GB" />
          </div>
          <div className="space-y-2">
            <Label>IMEI</Label>
            <ImeiInput value={imei} onValueChange={setImei} />
          </div>
          <div className="space-y-2">
            <Label>Condicao *</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as typeof condition)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">Novo</SelectItem>
                <SelectItem value="SEMI_NEW">Seminovo</SelectItem>
                <SelectItem value="USED">Usado</SelectItem>
                <SelectItem value="DISPLAY">Mostruario</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Saude da Bateria (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={batteryHealth}
              onChange={(e) =>
                setBatteryHealth(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </div>
          <div />
          <div className="space-y-2">
            <Label>Valor Avaliado *</Label>
            <MoneyInput value={appraisedValue} onChange={setAppraisedValue} />
          </div>
          <div className="space-y-2">
            <Label>Valor Abatido *</Label>
            <MoneyInput value={abatedValue} onChange={setAbatedValue} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Observacoes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Riscos visiveis, acessorios, garantia, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={save} disabled={addMut.isPending}>
            Adicionar Upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
