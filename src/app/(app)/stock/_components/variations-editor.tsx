"use client";

import { useState } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MoneyInput } from "@/components/inputs/money-input";
import { FormSection } from "@/components/domain/forms/form-section";
import type { CreateProductInput } from "@/lib/validators/stock";

/**
 * Editor de variacoes do produto (cor, tamanho, capacidade, etc).
 * Permite escolher quais atributos o produto usa (cor + tamanho) e depois
 * criar variacoes que combinam valores desses atributos.
 *
 * Paridade Laravel views/produtos/_form-variacoes.blade.php.
 */
export function VariationsEditor() {
  const trpc = useTRPC();
  const form = useFormContext<CreateProductInput>();

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "variations",
  });

  // Atributos disponiveis (cor, tamanho, capacidade)
  const attrsQuery = useQuery(
    trpc.stock.listAttributes.queryOptions({ active: true }),
  );
  const attributes = attrsQuery.data ?? [];

  // Atributos selecionados para o produto
  const selectedAttrIds = form.watch("attributeConfigIds") ?? [];

  const toggleAttr = (attrId: string) => {
    const current = form.getValues("attributeConfigIds") ?? [];
    const next = current.includes(attrId)
      ? current.filter((id) => id !== attrId)
      : [...current, attrId];
    form.setValue("attributeConfigIds", next, { shouldDirty: true });
  };

  const usedAttributes = attributes.filter((a) => selectedAttrIds.includes(a.id));

  return (
    <FormSection title="Variacoes">
      <p className="text-sm text-muted-foreground mb-4">
        Defina quais atributos seu produto possui (cor, tamanho, capacidade) e
        crie variacoes combinando valores. Cada variacao pode ter SKU e preco
        proprios.
      </p>

      {/* Step 1: atributos do produto */}
      <div className="space-y-2 mb-6">
        <Label>Atributos do produto</Label>
        {attributes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Nenhum atributo cadastrado.{" "}
            <a href="/stock/attributes" className="underline" target="_blank">
              Cadastre atributos aqui
            </a>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {attributes.map((attr) => {
              const selected = selectedAttrIds.includes(attr.id);
              return (
                <Button
                  key={attr.id}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleAttr(attr.id)}
                >
                  {attr.name}
                  {selected && <X className="ml-1 h-3 w-3" />}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 2: lista de variacoes */}
      {usedAttributes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Variacoes ({fields.length})</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  attributeValueIds: [],
                  sku: null,
                  barcode: null,
                  costPrice: null,
                  salePrice: null,
                  promotionalPrice: null,
                  minStock: 0,
                  imageUrl: null,
                  active: true,
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar variacao
            </Button>
          </div>

          {fields.length === 0 ? (
            <div className="text-sm text-muted-foreground italic border-2 border-dashed rounded-md p-6 text-center">
              Nenhuma variacao adicionada. Clique em &quot;Adicionar variacao&quot; para criar.
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <VariationRow
                  key={field.id}
                  index={index}
                  attributes={usedAttributes}
                  onRemove={() => remove(index)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </FormSection>
  );
}

interface Attribute {
  id: string;
  name: string;
  values: Array<{ id: string; value: string }>;
}

function VariationRow({
  index,
  attributes,
  onRemove,
}: {
  index: number;
  attributes: Attribute[];
  onRemove: () => void;
}) {
  const form = useFormContext<CreateProductInput>();
  const variationValues = form.watch(`variations.${index}.attributeValueIds`) ?? [];

  // Para cada atributo, qual valor esta selecionado nessa variacao
  const selectedByAttr: Record<string, string> = {};
  for (const attr of attributes) {
    const found = variationValues.find((vid) => attr.values.some((v) => v.id === vid));
    if (found) selectedByAttr[attr.id] = found;
  }

  const setAttrValue = (attrId: string, valueId: string) => {
    // Remove valor antigo desse atributo + adiciona o novo
    const attr = attributes.find((a) => a.id === attrId);
    if (!attr) return;
    const otherValues = variationValues.filter(
      (vid) => !attr.values.some((v) => v.id === vid),
    );
    form.setValue(
      `variations.${index}.attributeValueIds`,
      valueId ? [...otherValues, valueId] : otherValues,
      { shouldDirty: true },
    );
  };

  // Monta label da variacao para mostrar no header
  const label = attributes
    .map((attr) => {
      const vid = selectedByAttr[attr.id];
      const val = attr.values.find((v) => v.id === vid)?.value;
      return val ? `${attr.name}: ${val}` : null;
    })
    .filter(Boolean)
    .join(", ");

  return (
    <div className="border border-border rounded-md p-4 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline">#{index + 1}</Badge>
          {label && <span className="font-medium text-sm">{label}</span>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remover variacao"
          onClick={onRemove}
          className="h-7 w-7"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* Atributos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {attributes.map((attr) => (
          <div key={attr.id} className="space-y-1">
            <Label className="text-xs">{attr.name} *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedByAttr[attr.id] ?? ""}
              onChange={(e) => setAttrValue(attr.id, e.target.value)}
            >
              <option value="">Selecione...</option>
              {attr.values.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.value}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Precos + SKU + estoque min */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">SKU</Label>
          <Input
            value={form.watch(`variations.${index}.sku`) ?? ""}
            onChange={(e) =>
              form.setValue(`variations.${index}.sku`, e.target.value || null)
            }
            placeholder="Opcional"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preco custo</Label>
          <MoneyInput
            value={form.watch(`variations.${index}.costPrice`) ?? 0}
            onChange={(v) =>
              form.setValue(`variations.${index}.costPrice`, v > 0 ? v : null)
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preco venda</Label>
          <MoneyInput
            value={form.watch(`variations.${index}.salePrice`) ?? 0}
            onChange={(v) =>
              form.setValue(`variations.${index}.salePrice`, v > 0 ? v : null)
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Estoque min</Label>
          <Input
            type="number"
            min={0}
            value={form.watch(`variations.${index}.minStock`) ?? 0}
            onChange={(e) =>
              form.setValue(
                `variations.${index}.minStock`,
                Math.max(0, Number(e.target.value) || 0),
              )
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground italic">
        Preco em branco = usa o preco do produto pai.
      </p>
    </div>
  );
}
