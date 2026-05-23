"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Search, Trash2, X } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  cartTotal: number;
}

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SelectedModel {
  brand: string | null;
  model: string;
}

export function UpgradeDialog(props: Props) {
  // Remonta o conteudo a cada abertura: garante reset completo do form
  // (paridade Laravel `abrirModalUpgrade` que zera todos os campos).
  if (!props.open) {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }
  return <UpgradeDialogInner {...props} />;
}

function UpgradeDialogInner({ open, onOpenChange, saleId, upgrades, cartTotal }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Busca de modelo do catalogo (paridade Laravel: campo busca + autocomplete).
  const [searchTerm, setSearchTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<SelectedModel | null>(null);

  // Form de dados do aparelho (so aparece apos selecionar modelo).
  const [imei, setImei] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [condition, setCondition] = useState<"USED" | "NEW" | "SEMI_NEW" | "DISPLAY">("SEMI_NEW");
  const [batteryHealth, setBatteryHealth] = useState<number | "">("");
  const [appraisedValue, setAppraisedValue] = useState(0);
  const [abatedValue, setAbatedValue] = useState(0);
  const [appraisedTouched, setAppraisedTouched] = useState(false);
  const [notes, setNotes] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);
  const imeiRef = useRef<HTMLInputElement>(null);

  // Foca campo de busca ao montar (reset agora vem via remontagem do componente).
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // Debounce busca de produtos
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm.trim()), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const productSearch = useQuery(
    trpc.sale.searchProducts.queryOptions(
      { query: debounced, withStock: false },
      { enabled: open && !selected && debounced.length >= 2 },
    ),
  );

  // Filtra so aparelhos (Product.isDevice=true). Paridade Laravel.
  const deviceResults = useMemo(
    () => (productSearch.data ?? []).filter((p) => p.isDevice),
    [productSearch.data],
  );

  // Verificacao de historico de IMEI ao sair do campo.
  const imeiHistoryQuery = useQuery(
    trpc.sale.checkImeiHistory.queryOptions(
      { imei: imei.replace(/\D/g, "") },
      {
        enabled: open && !!selected && imei.replace(/\D/g, "").length >= 5,
        staleTime: 30_000,
      },
    ),
  );

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
    // eslint-disable-next-line react-hooks/refs
    trpc.sale.addUpgrade.mutationOptions({
      onSuccess: () => {
        toast.success("Aparelho de entrada adicionado!");
        // Reset campos pra adicionar outro
        setSelected(null);
        setSearchTerm("");
        setDebounced("");
        setImei("");
        setSerialNumber("");
        setCondition("SEMI_NEW");
        setBatteryHealth("");
        setAppraisedValue(0);
        setAbatedValue(0);
        setAppraisedTouched(false);
        setNotes("");
        setTimeout(() => searchRef.current?.focus(), 100);
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const removeMut = useMutation(
    trpc.sale.removeUpgrade.mutationOptions({
      onSuccess: () => {
        toast.success("Aparelho de entrada removido.");
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  function selectModel(p: { name: string; brand: string | null }) {
    setSelected({ brand: p.brand, model: p.name });
    setSearchTerm("");
    setDebounced("");
    setTimeout(() => imeiRef.current?.focus(), 100);
  }

  function clearModel() {
    setSelected(null);
    setImei("");
    setSerialNumber("");
    setBatteryHealth("");
    setAppraisedValue(0);
    setAbatedValue(0);
    setAppraisedTouched(false);
    setNotes("");
    setTimeout(() => searchRef.current?.focus(), 100);
  }

  function save() {
    if (!selected) {
      toast.error("Selecione o modelo do aparelho.");
      return;
    }
    if (!imei.trim() && !serialNumber.trim()) {
      toast.error("Informe o IMEI ou o numero de serie do aparelho.");
      imeiRef.current?.focus();
      return;
    }
    if (appraisedValue <= 0) {
      toast.error("Informe o valor avaliado do aparelho.");
      return;
    }
    if (abatedValue <= 0 || abatedValue > appraisedValue) {
      toast.error("Valor abatido deve ser positivo e ate o valor avaliado.");
      return;
    }
    addMut.mutate({
      saleId,
      brand: selected.brand,
      model: selected.model,
      imei: imei.trim() || null,
      serialNumber: serialNumber.trim() || null,
      condition,
      batteryHealth: batteryHealth === "" ? null : Number(batteryHealth),
      appraisedValue,
      abatedValue,
      notes: notes.trim() || null,
    });
  }

  const historico = imeiHistoryQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upgrade — Aparelho de Entrada</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded-md px-3 py-2">
          Busque o modelo do aparelho que o cliente esta trazendo para troca. Voce pode adicionar varios aparelhos.
        </p>

        {/* Lista de upgrades ja adicionados */}
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

        {/* Resumo de impacto no carrinho */}
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

        {/* Etapa 1: busca de modelo do catalogo */}
        {!selected ? (
          <div className="space-y-2">
            <Label>Buscar modelo do aparelho</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ex.: iPhone 13, Galaxy S22..."
                className="pl-9"
                autoComplete="off"
              />
            </div>
            {debounced.length >= 2 && (
              <div className="border border-border rounded-md max-h-56 overflow-y-auto bg-background">
                {productSearch.isFetching ? (
                  <p className="p-3 text-sm text-muted-foreground">Buscando...</p>
                ) : deviceResults.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    Nenhum aparelho encontrado no catalogo.
                  </p>
                ) : (
                  deviceResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectModel(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted border-b border-border/40 last:border-b-0 transition-colors"
                    >
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {p.brand && <span>{p.brand}</span>}
                        {p.sku && <span>• {p.sku}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Card do modelo selecionado */}
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{selected.model}</p>
                {selected.brand && (
                  <p className="text-xs text-muted-foreground">Marca: {selected.brand}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={clearModel} title="Trocar modelo">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* IMEI + S/N */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>IMEI</Label>
                <ImeiInput value={imei} onValueChange={setImei} ref={imeiRef} />
                {historico && (
                  <div
                    className={
                      historico.alreadySold
                        ? "rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-900 dark:text-yellow-200"
                        : "rounded border border-primary/30 bg-primary/5 px-2 py-1 text-xs"
                    }
                  >
                    {historico.alreadySold ? (
                      <>
                        <strong>Aparelho ja vendido pela loja!</strong>
                        <br />
                        Produto: {historico.productName}
                        {historico.lastSale?.number && ` • Venda ${historico.lastSale.number}`}
                        {historico.lastSale?.customerName && ` • Cliente: ${historico.lastSale.customerName}`}
                      </>
                    ) : (
                      <>
                        <strong>IMEI encontrado no estoque</strong>
                        <br />
                        Produto: {historico.productName} • Status: {historico.status}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Numero de Serie</Label>
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="S/N (opcional se IMEI informado)"
                  maxLength={50}
                />
              </div>
            </div>

            {/* Condicao + bateria */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Condicao</Label>
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
                  placeholder="Ex.: 85"
                />
              </div>
            </div>

            {/* Valores */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor Avaliado *</Label>
                <MoneyInput
                  value={appraisedValue}
                  onChange={(v) => {
                    setAppraisedValue(v);
                    // Auto-copia para valor abatido enquanto operador nao
                    // mexer manualmente nele (paridade Laravel).
                    if (!appraisedTouched) setAbatedValue(v);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor a Abater *</Label>
                <MoneyInput
                  value={abatedValue}
                  onChange={(v) => {
                    setAppraisedTouched(true);
                    setAbatedValue(v);
                  }}
                />
              </div>
            </div>

            {/* Observacoes */}
            <div className="space-y-2">
              <Label>Observacoes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Riscos visiveis, acessorios, garantia, etc."
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {selected && (
            <Button onClick={save} disabled={addMut.isPending}>
              Confirmar Upgrade
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
