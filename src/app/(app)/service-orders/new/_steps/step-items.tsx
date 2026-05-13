"use client";

import { useState, useCallback } from "react";
import { Trash2, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntitySelector } from "@/components/domain/entity-selector";
import { MoneyInput } from "@/components/inputs/money-input";
import type { CreateServiceOrderInput } from "@/lib/validators/service-order";
import type { z } from "zod";
import type { createItemSchema } from "@/lib/validators/service-order";

type ItemData = z.infer<typeof createItemSchema>;

interface Props {
  data: Partial<CreateServiceOrderInput>;
  onChange: (patch: Partial<CreateServiceOrderInput>) => void;
}

interface ServiceOption {
  id: string;
  name: string;
  basePrice: number;
}

function formatMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function ItemRow({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: ItemData;
  index: number;
  onUpdate: (index: number, patch: Partial<ItemData>) => void;
  onRemove: (index: number) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [manualMode, setManualMode] = useState(!item.serviceId && !item.productId);

  const searchServices = useCallback(
    async (query: string): Promise<ServiceOption[]> => {
      const result = await queryClient.fetchQuery(
        trpc.catalog.listServices.queryOptions({
          search: query,
          active: true,
          pageSize: 20,
        }),
      );
      return result.data.map((s) => ({
        id: s.id,
        name: s.name,
        basePrice: Math.round(Number(s.basePrice) * 100),
      }));
    },
    [trpc.catalog.listServices, queryClient]
  );

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Item {index + 1}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select
            value={item.type}
            onValueChange={(v) => onUpdate(index, { type: v as "SERVICE" | "PRODUCT" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SERVICE">Servico</SelectItem>
              <SelectItem value="PRODUCT">Produto/Peca</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-3">
          {!manualMode ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Servico/Produto</Label>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Nao encontrou? Digitar manual
                </button>
              </div>
              <EntitySelector<ServiceOption>
                value={item.serviceId ?? undefined}
                onChange={(val) => onUpdate(index, { serviceId: val })}
                onSelect={(svc) => {
                  onUpdate(index, {
                    serviceId: svc.id,
                    description: svc.name,
                    unitPrice: svc.basePrice,
                  });
                }}
                searchFn={searchServices}
                getOptionLabel={(s) => `${s.name} — ${formatMoney(s.basePrice)}`}
                getOptionValue={(s) => s.id}
                placeholder="Buscar servico ou produto..."
                emptyMessage="Nenhum resultado."
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Descricao</Label>
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className="text-xs text-primary hover:underline"
                >
                  Buscar no catalogo
                </button>
              </div>
              <Input
                value={item.description}
                onChange={(e) => onUpdate(index, { description: e.target.value })}
                placeholder="Descricao do servico/produto"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Quantidade</Label>
          <Input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) =>
              onUpdate(index, { quantity: Math.max(1, parseInt(e.target.value) || 1) })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Valor Unitario</Label>
          <MoneyInput
            value={item.unitPrice}
            onChange={(v) => onUpdate(index, { unitPrice: v })}
          />
        </div>
        <div className="space-y-2">
          <Label>Subtotal</Label>
          <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/50 font-mono text-sm">
            {formatMoney(item.unitPrice * item.quantity)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StepItems({ data, onChange }: Props) {
  const items = data.items ?? [];

  const addItem = () => {
    onChange({
      items: [
        ...items,
        {
          type: "SERVICE",
          serviceId: null,
          productId: null,
          description: "",
          quantity: 1,
          unitPrice: 0,
          costPrice: 0,
        },
      ],
    });
  };

  const updateItem = (index: number, patch: Partial<ItemData>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index]!, ...patch };
    onChange({ items: newItems });
  };

  const removeItem = (index: number) => {
    onChange({ items: items.filter((_, i) => i !== index) });
  };

  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Servicos e Pecas</h3>
        <Button onClick={addItem} variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Item
        </Button>
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
          <p>Nenhum item adicionado.</p>
          <p className="text-sm">Clique em &quot;Adicionar Item&quot; para comecar.</p>
        </div>
      )}

      {items.map((item, index) => (
        <ItemRow
          key={index}
          item={item}
          index={index}
          onUpdate={updateItem}
          onRemove={removeItem}
        />
      ))}

      {items.length > 0 && (
        <div className="flex justify-end">
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-6 py-3">
            <span className="text-sm text-muted-foreground mr-3">Total:</span>
            <span className="text-xl font-bold text-primary font-mono">
              {formatMoney(total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
