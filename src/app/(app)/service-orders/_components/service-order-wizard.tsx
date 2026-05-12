"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntitySelector } from "@/components/domain/entity-selector";
import { MoneyInput } from "@/components/inputs/money-input";
import { DatePicker } from "@/components/inputs/date-picker";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  CHECKLIST_LABELS,
  DEVICE_INFO_LABELS,
  WARRANTY_TYPE_LABELS,
  WARRANTY_TYPES,
  type ChecklistInput,
  type DeviceInfoInput,
  type ServiceOrderItemInput,
  type WarrantyType,
} from "@/lib/validators/service-order";
import { Plus, Trash2, ChevronLeft, ChevronRight, Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Cliente",
  "Equipamento",
  "Problema",
  "Serviços e Produtos",
  "Resumo",
] as const;

const DEVICE_TYPES = [
  "iPhone",
  "iPad",
  "MacBook",
  "Android",
  "Notebook",
  "Console",
  "Outro",
];

interface WizardState {
  // Step 1
  customerId: string;
  customerName: string;
  // Step 2
  deviceType: string;
  deviceBrand: string;
  deviceModel: string;
  serialNumber: string;
  imei: string;
  devicePassword: string;
  // Step 3
  reportedProblem: string;
  entryChecklist: ChecklistInput;
  deviceInfo: DeviceInfoInput;
  // Step 4
  items: ServiceOrderItemInput[];
  discount: number;
  // Step 5
  estimatedDate: Date | undefined;
  technicianId: string;
  technicianName: string;
  isWarranty: boolean;
  warrantyType: WarrantyType | "";
  warrantyMonths: number;
  originalOrderId: string;
  internalNotes: string;
  customerNotes: string;
}

const initialState: WizardState = {
  customerId: "",
  customerName: "",
  deviceType: "",
  deviceBrand: "",
  deviceModel: "",
  serialNumber: "",
  imei: "",
  devicePassword: "",
  reportedProblem: "",
  entryChecklist: {},
  deviceInfo: {},
  items: [],
  discount: 0,
  estimatedDate: undefined,
  technicianId: "",
  technicianName: "",
  isWarranty: false,
  warrantyType: "",
  warrantyMonths: 3,
  originalOrderId: "",
  internalNotes: "",
  customerNotes: "",
};

export function ServiceOrderWizard() {
  const trpc = useTRPC();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(initialState);

  const update = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const createMutation = useMutation(
    trpc.serviceOrders.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`OS ${data?.number} criada com sucesso!`);
        router.push(`/service-orders/${data?.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return !!state.customerId;
      case 1:
        return true; // device is optional
      case 2:
        return state.reportedProblem.trim().length > 0;
      case 3:
        return true; // items can be 0
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = () => {
    const payload = {
      customerId: state.customerId,
      deviceType: state.deviceType || undefined,
      deviceBrand: state.deviceBrand || undefined,
      deviceModel: state.deviceModel || undefined,
      serialNumber: state.serialNumber || undefined,
      imei: state.imei || undefined,
      devicePassword: state.devicePassword || undefined,
      reportedProblem: state.reportedProblem,
      entryChecklist: Object.keys(state.entryChecklist).length > 0 ? state.entryChecklist : undefined,
      deviceInfo: Object.keys(state.deviceInfo).length > 0 ? state.deviceInfo : undefined,
      items: state.items.map((i) => ({
        ...i,
        unitPrice: i.unitPrice / 100,
        costPrice: (i.costPrice ?? 0) / 100,
      })),
      discount: state.discount > 0 ? state.discount / 100 : undefined,
      estimatedDate: state.estimatedDate?.toISOString(),
      technicianId: state.technicianId || undefined,
      isWarranty: state.isWarranty || undefined,
      warrantyType: (state.isWarranty && state.warrantyType) ? state.warrantyType as WarrantyType : undefined,
      warrantyMonths: state.isWarranty ? state.warrantyMonths : undefined,
      originalOrderId: (state.isWarranty && state.originalOrderId) ? state.originalOrderId : undefined,
      internalNotes: state.internalNotes || undefined,
      customerNotes: state.customerNotes || undefined,
    };

    createMutation.mutate(payload);
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                i <= step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              } ${i < step ? "cursor-pointer" : ""}`}
            >
              {i + 1}
            </button>
            <span
              className={`text-xs hidden sm:inline ${
                i === step ? "font-semibold" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 rounded ${
                  i < step ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="pt-6">
          {step === 0 && <Step1Customer state={state} update={update} />}
          {step === 1 && <Step2Device state={state} update={update} />}
          {step === 2 && <Step3Problem state={state} update={update} />}
          {step === 3 && <Step4Items state={state} setState={setState} />}
          {step === 4 && <Step5Summary state={state} update={update} />}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            disabled={!canGoNext()}
            onClick={() => setStep((s) => s + 1)}
          >
            Próximo
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            disabled={createMutation.isPending || !canGoNext()}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? "Criando..." : "Criar Ordem de Serviço"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Customer ─────────────────────────────────────────────────────────

interface CustomerItem {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
}

function Step1Customer({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const searchCustomers = useCallback(
    async (query: string): Promise<CustomerItem[]> => {
      const opts = trpc.customers.list.queryOptions({
        search: query,
        page: 0,
        pageSize: 20,
      });
      const result = await queryClient.fetchQuery(opts);
      return result.items as CustomerItem[];
    },
    [trpc.customers.list, queryClient],
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">1. Selecione o Cliente</h3>
      <EntitySelector<CustomerItem>
        value={state.customerId || undefined}
        onChange={(val) => {
          update("customerId", val ?? "");
        }}
        searchFn={searchCustomers}
        getOptionLabel={(c) =>
          `${c.name}${c.cpf ? ` — ${c.cpf}` : ""}${c.phone ? ` — ${c.phone}` : ""}`
        }
        getOptionValue={(c) => c.id}
        placeholder="Buscar cliente por nome, CPF ou telefone..."
        emptyMessage="Nenhum cliente encontrado."
      />
      {state.customerId && (
        <p className="text-sm text-muted-foreground">
          Cliente selecionado. Prossiga para a próxima etapa.
        </p>
      )}
    </div>
  );
}

// ── Step 2: Device ───────────────────────────────────────────────────────────

function Step2Device({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">2. Equipamento</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select
            value={state.deviceType}
            onValueChange={(v) => update("deviceType", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar tipo..." />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Marca</Label>
          <Input
            value={state.deviceBrand}
            onChange={(e) => update("deviceBrand", e.target.value)}
            placeholder="Apple, Samsung, Xiaomi..."
          />
        </div>
        <div className="space-y-2">
          <Label>Modelo</Label>
          <Input
            value={state.deviceModel}
            onChange={(e) => update("deviceModel", e.target.value)}
            placeholder="iPhone 15 Pro, Galaxy S24..."
          />
        </div>
        <div className="space-y-2">
          <Label>N. Serial</Label>
          <Input
            value={state.serialNumber}
            onChange={(e) => update("serialNumber", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>IMEI</Label>
          <Input
            value={state.imei}
            onChange={(e) => update("imei", e.target.value)}
            placeholder="15 dígitos"
          />
        </div>
        <div className="space-y-2">
          <Label>Senha do equipamento</Label>
          <Input
            value={state.devicePassword}
            onChange={(e) => update("devicePassword", e.target.value)}
            placeholder="PIN, padrão, senha..."
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Problem + Checklist ──────────────────────────────────────────────

/** 3-state checklist button group for a single checklist item */
function ChecklistToggle({
  value,
  onChange,
  label,
}: {
  value: boolean | null | undefined;
  onChange: (val: boolean | null) => void;
  label: string;
}) {
  // undefined and null both treated as N/A
  const normalized = value ?? null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-md border overflow-hidden shrink-0">
        <button
          type="button"
          onClick={() => onChange(normalized === true ? null : true)}
          className={cn(
            "flex h-7 w-7 items-center justify-center text-xs transition-colors",
            normalized === true
              ? "bg-green-600 text-white"
              : "hover:bg-muted text-muted-foreground",
          )}
          title="OK"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(normalized === false ? null : false)}
          className={cn(
            "flex h-7 w-7 items-center justify-center text-xs transition-colors border-x",
            normalized === false
              ? "bg-red-600 text-white"
              : "hover:bg-muted text-muted-foreground",
          )}
          title="Não OK"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "flex h-7 w-7 items-center justify-center text-xs transition-colors",
            normalized === null
              ? "bg-muted-foreground/20 text-muted-foreground"
              : "hover:bg-muted text-muted-foreground",
          )}
          title="N/A"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="text-sm">{label}</span>
    </div>
  );
}

function Step3Problem({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}) {
  const setChecklistValue = (key: string, val: boolean | null) => {
    update("entryChecklist", {
      ...state.entryChecklist,
      [key]: val,
    });
  };

  const toggleDeviceInfo = (key: string) => {
    const current = state.deviceInfo[key as keyof DeviceInfoInput];
    update("deviceInfo", {
      ...state.deviceInfo,
      [key]: !current,
    });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">3. Problema e Checklist</h3>

      <div className="space-y-2">
        <Label>Problema relatado *</Label>
        <Textarea
          value={state.reportedProblem}
          onChange={(e) => update("reportedProblem", e.target.value)}
          placeholder="Descreva o problema relatado pelo cliente..."
          rows={3}
        />
      </div>

      {/* Entry checklist — 3 states: OK / Não OK / N/A */}
      <div className="space-y-3">
        <div>
          <Label className="text-base">Checklist de Entrada</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Para cada item: <span className="text-green-600 font-medium">✓ OK</span>{" "}
            / <span className="text-red-600 font-medium">✗ Não OK</span>{" "}
            / <span className="text-muted-foreground font-medium">— N/A</span>
          </p>
        </div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
            <ChecklistToggle
              key={key}
              value={state.entryChecklist[key as keyof ChecklistInput]}
              onChange={(val) => setChecklistValue(key, val)}
              label={label}
            />
          ))}
        </div>
      </div>

      {/* Device info */}
      <div className="space-y-3">
        <Label className="text-base">Informações adicionais</Label>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {Object.entries(DEVICE_INFO_LABELS).map(([key, label]) => (
            <div
              key={key}
              className="flex items-center gap-2"
            >
              <Switch
                checked={!!state.deviceInfo[key as keyof DeviceInfoInput]}
                onCheckedChange={() => toggleDeviceInfo(key)}
              />
              <Label className="text-sm cursor-pointer font-normal">{label}</Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Items ────────────────────────────────────────────────────────────

interface ServiceItem {
  id: string;
  name: string;
  basePrice: unknown; // Decimal from Prisma
}

interface ProductItem {
  id: string;
  name: string;
  salePrice: unknown; // Decimal from Prisma
  costPrice: unknown; // Decimal from Prisma
}

function Step4Items({
  state,
  setState,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Track which items are in "manual" mode (typing description freely)
  const [manualMode, setManualMode] = useState<Record<number, boolean>>({});

  const searchServices = useCallback(
    async (query: string): Promise<ServiceItem[]> => {
      const opts = trpc.catalog.listServices.queryOptions({
        search: query,
        page: 0,
        pageSize: 20,
      });
      const result = await queryClient.fetchQuery(opts);
      return result.items as ServiceItem[];
    },
    [trpc.catalog.listServices, queryClient],
  );

  const searchProducts = useCallback(
    async (query: string): Promise<ProductItem[]> => {
      const opts = trpc.stock.listProducts.queryOptions({
        search: query,
        active: true,
        page: 0,
        pageSize: 20,
      });
      const result = await queryClient.fetchQuery(opts);
      return result.items as ProductItem[];
    },
    [trpc.stock.listProducts, queryClient],
  );

  const addItem = () => {
    setState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          type: "SERVICE" as const,
          description: "",
          quantity: 1,
          unitPrice: 0,
        },
      ],
    }));
  };

  const removeItem = (index: number) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
    setManualMode((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const updateItem = (index: number, field: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const toggleManualMode = (idx: number) => {
    setManualMode((prev) => ({ ...prev, [idx]: !prev[idx] }));
    // Clear entity selection when switching to manual
    if (!manualMode[idx]) {
      updateItem(idx, "serviceId", undefined);
      updateItem(idx, "productId", undefined);
    }
  };

  const handleSelectService = (idx: number, serviceId: string | undefined) => {
    if (!serviceId) {
      updateItem(idx, "serviceId", undefined);
      return;
    }
    void searchServices("").then((services) => {
      const service = services.find((s) => s.id === serviceId);
      if (service) {
        setState((prev) => ({
          ...prev,
          items: prev.items.map((item, i) =>
            i === idx
              ? {
                  ...item,
                  serviceId: service.id,
                  description: service.name,
                  unitPrice: Math.round(Number(service.basePrice) * 100),
                }
              : item,
          ),
        }));
      }
    });
  };

  const handleSelectProduct = (idx: number, productId: string | undefined) => {
    if (!productId) {
      updateItem(idx, "productId", undefined);
      return;
    }
    void searchProducts("").then((products) => {
      const product = products.find((p) => p.id === productId);
      if (product) {
        setState((prev) => ({
          ...prev,
          items: prev.items.map((item, i) =>
            i === idx
              ? {
                  ...item,
                  productId: product.id,
                  description: product.name,
                  unitPrice: Math.round(Number(product.salePrice) * 100),
                  costPrice: Math.round(Number(product.costPrice) * 100),
                }
              : item,
          ),
        }));
      }
    });
  };

  const subtotal = state.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const total = Math.max(0, subtotal - state.discount);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">4. Serviços e Produtos</h3>

      {state.items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum item adicionado. Clique em &ldquo;Adicionar item&rdquo; para incluir serviços ou produtos.
        </p>
      )}

      {state.items.map((item, idx) => {
        const isManual = !!manualMode[idx];
        const hasEntitySelected = !!(item.serviceId || item.productId);

        return (
          <div
            key={idx}
            className="space-y-3 rounded-md border p-3"
          >
            <div className="flex items-center gap-3">
              <Select
                value={item.type}
                onValueChange={(v) => {
                  updateItem(idx, "type", v);
                  updateItem(idx, "serviceId", undefined);
                  updateItem(idx, "productId", undefined);
                  updateItem(idx, "description", "");
                  updateItem(idx, "unitPrice", 0);
                  updateItem(idx, "costPrice", undefined);
                  setManualMode((prev) => ({ ...prev, [idx]: false }));
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SERVICE">Serviço</SelectItem>
                  <SelectItem value="PRODUCT">Produto</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1 space-y-2">
                {!isManual ? (
                  <>
                    {item.type === "SERVICE" ? (
                      <EntitySelector<ServiceItem>
                        value={item.serviceId}
                        onChange={(val) => handleSelectService(idx, val)}
                        searchFn={searchServices}
                        getOptionLabel={(s) => `${s.name} — R$ ${Number(s.basePrice).toFixed(2).replace(".", ",")}`}
                        getOptionValue={(s) => s.id}
                        placeholder="Buscar serviço do catálogo..."
                        emptyMessage="Nenhum serviço encontrado."
                      />
                    ) : (
                      <EntitySelector<ProductItem>
                        value={item.productId}
                        onChange={(val) => handleSelectProduct(idx, val)}
                        searchFn={searchProducts}
                        getOptionLabel={(p) => `${p.name} — R$ ${Number(p.salePrice).toFixed(2).replace(".", ",")}`}
                        getOptionValue={(p) => p.id}
                        placeholder="Buscar produto do estoque..."
                        emptyMessage="Nenhum produto encontrado."
                      />
                    )}
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => toggleManualMode(idx)}
                    >
                      Não encontrou? Digite manualmente
                    </button>
                  </>
                ) : (
                  <>
                    <Input
                      placeholder={item.type === "SERVICE" ? "Descrição do serviço" : "Descrição do produto"}
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                    />
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => toggleManualMode(idx)}
                    >
                      Buscar no catálogo
                    </button>
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => removeItem(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Selected item name + quantity + price */}
            <div className="grid gap-3 sm:grid-cols-[1fr_100px_140px]">
              {!isManual && hasEntitySelected ? (
                <div className="flex items-center px-3 text-sm text-muted-foreground bg-muted rounded-md">
                  {item.description}
                </div>
              ) : !isManual ? (
                <div />
              ) : (
                <div />
              )}
              <Input
                type="number"
                placeholder="Qtd"
                min={1}
                value={item.quantity}
                onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
              />
              <MoneyInput
                value={item.unitPrice}
                onChange={(val: number) => updateItem(idx, "unitPrice", val)}
              />
            </div>
          </div>
        );
      })}

      <Button variant="outline" size="sm" onClick={addItem}>
        <Plus className="mr-1 h-4 w-4" />
        Adicionar item
      </Button>

      {state.items.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">
              {(subtotal / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Desconto</span>
            <MoneyInput
              value={state.discount}
              onChange={(val: number) =>
                setState((prev) => ({ ...prev, discount: val }))
              }
              className="w-36"
            />
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="font-mono">
              {(total / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 5: Summary ──────────────────────────────────────────────────────────

interface TechnicianItem {
  id: string;
  name: string;
}

interface OrderSearchItem {
  id: string;
  number: string;
  deviceModel: string | null;
  reportedProblem: string | null;
}

function Step5Summary({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const searchTechnicians = useCallback(
    async (query: string): Promise<TechnicianItem[]> => {
      const opts = trpc.serviceOrders.listTechnicians.queryOptions({
        search: query || undefined,
      });
      const result = await queryClient.fetchQuery(opts);
      return result as TechnicianItem[];
    },
    [trpc.serviceOrders.listTechnicians, queryClient],
  );

  const searchOrders = useCallback(
    async (query: string): Promise<OrderSearchItem[]> => {
      if (!state.customerId) return [];
      const opts = trpc.serviceOrders.list.queryOptions({
        search: query,
        customerId: state.customerId,
        page: 0,
        pageSize: 20,
      });
      const result = await queryClient.fetchQuery(opts);
      return (result.items as OrderSearchItem[]).map((o) => ({
        id: o.id,
        number: o.number,
        deviceModel: o.deviceModel,
        reportedProblem: o.reportedProblem,
      }));
    },
    [trpc.serviceOrders.list, queryClient, state.customerId],
  );

  const subtotal = state.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const total = Math.max(0, subtotal - state.discount);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">5. Resumo e Finalização</h3>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border p-3 space-y-1 text-sm">
          <p className="font-medium">Equipamento</p>
          <p className="text-muted-foreground">
            {[state.deviceType, state.deviceBrand, state.deviceModel]
              .filter(Boolean)
              .join(" — ") || "Não informado"}
          </p>
        </div>
        <div className="rounded-md border p-3 space-y-1 text-sm">
          <p className="font-medium">Problema</p>
          <p className="text-muted-foreground line-clamp-2">
            {state.reportedProblem || "—"}
          </p>
        </div>
        <div className="rounded-md border p-3 space-y-1 text-sm">
          <p className="font-medium">Itens</p>
          <p className="text-muted-foreground">{state.items.length} item(ns)</p>
        </div>
        <div className="rounded-md border p-3 space-y-1 text-sm">
          <p className="font-medium">Valor Total</p>
          <p className="font-mono font-semibold">
            {(total / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>
        </div>
      </div>

      {/* Additional fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Data prevista</Label>
          <DatePicker
            value={state.estimatedDate}
            onChange={(date) => update("estimatedDate", date)}
            placeholder="Selecione uma data..."
          />
        </div>
        <div className="space-y-2">
          <Label>Técnico responsável</Label>
          <EntitySelector<TechnicianItem>
            value={state.technicianId || undefined}
            onChange={(val) => update("technicianId", val ?? "")}
            searchFn={searchTechnicians}
            getOptionLabel={(u) => u.name}
            getOptionValue={(u) => u.id}
            placeholder="Selecionar técnico..."
            emptyMessage="Nenhum técnico encontrado."
          />
        </div>
      </div>

      {/* Warranty */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={state.isWarranty}
            onCheckedChange={(v) => {
              update("isWarranty", v);
              if (!v) {
                update("warrantyType", "");
                update("originalOrderId", "");
              }
            }}
          />
          <Label>É garantia?</Label>
        </div>
        {state.isWarranty && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de garantia</Label>
              <Select
                value={state.warrantyType}
                onValueChange={(v) => update("warrantyType", v as WarrantyType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {WARRANTY_TYPES.map((wt) => (
                    <SelectItem key={wt} value={wt}>
                      {WARRANTY_TYPE_LABELS[wt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prazo de garantia (meses)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={state.warrantyMonths}
                onChange={(e) => update("warrantyMonths", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>OS original (do mesmo cliente)</Label>
              <EntitySelector<OrderSearchItem>
                value={state.originalOrderId || undefined}
                onChange={(val) => update("originalOrderId", val ?? "")}
                searchFn={searchOrders}
                getOptionLabel={(o) =>
                  `${o.number}${o.deviceModel ? ` — ${o.deviceModel}` : ""}${o.reportedProblem ? ` — ${o.reportedProblem.slice(0, 40)}` : ""}`
                }
                getOptionValue={(o) => o.id}
                placeholder="Buscar OS original..."
                emptyMessage="Nenhuma OS encontrada para este cliente."
              />
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Notas internas</Label>
          <Textarea
            value={state.internalNotes}
            onChange={(e) => update("internalNotes", e.target.value)}
            placeholder="Visível apenas pela equipe..."
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label>Notas para o cliente</Label>
          <Textarea
            value={state.customerNotes}
            onChange={(e) => update("customerNotes", e.target.value)}
            placeholder="Visível na vista pública..."
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
