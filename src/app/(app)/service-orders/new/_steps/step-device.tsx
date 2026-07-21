"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImeiInput } from "@/components/inputs/imei-input";
import {
  deviceTypeEnum,
  warrantyTypeEnum,
  WARRANTY_TYPE_LABELS,
} from "@/lib/validators/service-order";
import type { CreateServiceOrderInput } from "@/lib/validators/service-order";

interface Props {
  data: Partial<CreateServiceOrderInput>;
  onChange: (patch: Partial<CreateServiceOrderInput>) => void;
}

const DEVICE_TYPES = deviceTypeEnum.options;
const WARRANTY_TYPES = warrantyTypeEnum.options.filter((t) => t !== "none");

export function StepDevice({ data, onChange }: Props) {
  const trpc = useTRPC();

  // Carrega OS anteriores do cliente para selecao em retorno_servico/garantia.
  // Habilita apenas se cliente foi escolhido na step 1.
  const customerOrdersQuery = useQuery(
    trpc.serviceOrder.getByCustomer.queryOptions(
      { customerId: data.customerId! },
      { enabled: !!data.customerId && (data.isWarranty ?? false) },
    ),
  );
  const customerOrders = customerOrdersQuery.data ?? [];

  // Herda equipamento + prazo da OS original. Chamado NO EVENTO de selecao (nao
  // num useEffect reativo): o efeito antigo dependia de `customerOrders` mas o
  // omitia das deps, entao podia disparar tarde e reescrever campos que o
  // usuario ja tinha editado. Aqui `customerOrders` ja esta carregado (os
  // selects so ficam habilitados quando ha OS anteriores).
  const buildInheritedDevicePatch = (
    originalOrderId: string | null,
    warrantyType: string | null | undefined,
  ): Partial<CreateServiceOrderInput> => {
    if (warrantyType !== "return" || !originalOrderId) return {};
    const original = customerOrders.find((o) => o.id === originalOrderId);
    if (!original) return {};
    return {
      deviceType: original.deviceType ?? null,
      deviceBrand: original.deviceBrand ?? null,
      deviceModel: original.deviceModel ?? null,
      serialNumber: original.serialNumber ?? null,
      imei: original.imei ?? null,
      devicePassword: original.devicePassword ?? null,
      warrantyMonths: original.warrantyMonths ?? 3,
    };
  };

  // Em retorno_servico com OS original selecionada, bloqueia campos do equipamento.
  const equipmentLocked =
    !!data.isWarranty && data.warrantyType === "return" && !!data.originalOrderId;

  return (
    <div className="space-y-6">
      {/* ── Tipo de Servico (garantia) ── */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Checkbox
            id="isWarranty"
            checked={data.isWarranty ?? false}
            onCheckedChange={(v) => {
              const checked = !!v;
              onChange({
                isWarranty: checked,
                // Reset campos derivados quando desliga garantia
                warrantyType: checked ? (data.warrantyType ?? "return") : null,
                originalOrderId: checked ? data.originalOrderId : null,
              });
            }}
            disabled={!data.customerId}
          />
          <Label htmlFor="isWarranty" className="cursor-pointer">
            Este equipamento esta em garantia / retorno
          </Label>
        </div>
        {!data.customerId && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" /> Selecione um cliente na etapa anterior para habilitar.
          </p>
        )}

        {data.isWarranty && data.customerId && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de servico a ser realizado *</Label>
              <Select
                value={data.warrantyType ?? "return"}
                onValueChange={(v) =>
                  onChange({
                    warrantyType: v,
                    ...buildInheritedDevicePatch(data.originalOrderId ?? null, v),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WARRANTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {WARRANTY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                OS Original {data.warrantyType === "return" && <span className="text-destructive">*</span>}
              </Label>
              <Select
                value={data.originalOrderId ?? ""}
                onValueChange={(v) =>
                  onChange({
                    originalOrderId: v || null,
                    ...buildInheritedDevicePatch(v || null, data.warrantyType ?? "return"),
                  })
                }
                disabled={customerOrders.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      customerOrdersQuery.isLoading
                        ? "Carregando..."
                        : customerOrders.length === 0
                          ? "Sem OS anteriores"
                          : "Selecione a OS original"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {customerOrders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.number} — {o.deviceModel ?? o.deviceType ?? "Equipamento"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Prazo de garantia (meses)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={data.warrantyMonths ?? 3}
                  onChange={(e) =>
                    onChange({ warrantyMonths: parseInt(e.target.value) || 3 })
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">meses</span>
              </div>
              {data.warrantyType === "return" && data.originalOrderId && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Info className="h-3 w-3" /> Prazo herdado da OS original. Altere se necessario.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Dados do Equipamento ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Dados do Equipamento</h3>
          {equipmentLocked && (
            <span className="text-xs text-muted-foreground">
              🔒 Bloqueado em retorno de servico (herdado da OS original)
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Tipo de Equipamento</Label>
            <Select
              value={data.deviceType ?? ""}
              onValueChange={(v) => onChange({ deviceType: v || null })}
              disabled={equipmentLocked}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
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

          {/* "Marca" foi removida — a marca cabe no proprio nome do item
              (ex.: "Apple iPhone 15 Pro"). Campo renomeado para "Item". */}
          <div className="space-y-2 md:col-span-2">
            <Label>Item</Label>
            <Input
              value={data.deviceModel ?? ""}
              onChange={(e) => onChange({ deviceModel: e.target.value || null })}
              placeholder="Ex: Apple iPhone 15 Pro, Samsung S23..."
              readOnly={equipmentLocked}
            />
          </div>

          <div className="space-y-2">
            <Label>Numero de Serie</Label>
            <Input
              value={data.serialNumber ?? ""}
              onChange={(e) => onChange({ serialNumber: e.target.value || null })}
              placeholder="Numero de serie"
              readOnly={equipmentLocked}
            />
          </div>

          <div className="space-y-2">
            <Label>IMEI</Label>
            <ImeiInput
              value={data.imei ?? ""}
              onValueChange={(raw) => onChange({ imei: raw || null })}
              readOnly={equipmentLocked}
            />
          </div>

          <div className="space-y-2">
            <Label>Senha do Equipamento</Label>
            <Input
              value={data.devicePassword ?? ""}
              onChange={(e) => onChange({ devicePassword: e.target.value || null })}
              placeholder="Senha / padrao de desbloqueio"
              readOnly={equipmentLocked}
            />
          </div>

          <div className="space-y-2 md:col-span-3">
            <Label>Acessorios</Label>
            <Textarea
              value={data.accessories ?? ""}
              onChange={(e) => onChange({ accessories: e.target.value || null })}
              placeholder="Capa, pelicula, carregador, chip..."
              rows={2}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
