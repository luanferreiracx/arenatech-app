import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { adjustStockSchema, bulkAdjustStockSchema } from "@/lib/validators/stock";

/**
 * Regressao: o ajuste rapido de estoque (+/-) nao aceitava `variationId`, entao
 * produtos com variacoes nao tinham como ser ajustados — o schema rejeitava o
 * campo e o backend nao sabia qual ProductVariation.currentStock mexer. O input
 * agora carrega a variacao (obrigatoria no backend quando hasVariations), em
 * paridade com stockEntry/stockExit.
 */
describe("adjustStockSchema", () => {
  it("aceita ajuste de produto simples (sem variacao)", () => {
    const r = adjustStockSchema.safeParse({
      productId: randomUUID(),
      quantity: 5,
      reason: "Contagem de inventario",
    });
    expect(r.success).toBe(true);
  });

  it("aceita ajuste com variationId (produto com variacoes)", () => {
    const r = adjustStockSchema.safeParse({
      productId: randomUUID(),
      variationId: randomUUID(),
      quantity: -3,
      reason: "Perda",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.variationId).toBeDefined();
    }
  });

  it("aceita variationId nulo (produto simples explicitamente)", () => {
    const r = adjustStockSchema.safeParse({
      productId: randomUUID(),
      variationId: null,
      quantity: 2,
      reason: "Devolucao",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita variationId que nao e uuid", () => {
    const r = adjustStockSchema.safeParse({
      productId: randomUUID(),
      variationId: "nao-e-uuid",
      quantity: 1,
      reason: "Ajuste",
    });
    expect(r.success).toBe(false);
  });

  it("quantidade zero e rejeitada", () => {
    const r = adjustStockSchema.safeParse({
      productId: randomUUID(),
      variationId: randomUUID(),
      quantity: 0,
      reason: "Ajuste",
    });
    expect(r.success).toBe(false);
  });

  it("motivo obrigatorio", () => {
    const r = adjustStockSchema.safeParse({
      productId: randomUUID(),
      variationId: randomUUID(),
      quantity: 4,
      reason: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("bulkAdjustStockSchema", () => {
  it("aceita itens com e sem variationId no mesmo lote", () => {
    const r = bulkAdjustStockSchema.safeParse({
      reason: "Contagem fisica",
      items: [
        { productId: randomUUID(), newQuantity: 10 },
        { productId: randomUUID(), variationId: randomUUID(), newQuantity: 5 },
        { productId: randomUUID(), variationId: null, newQuantity: 0 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejeita variationId invalido num item", () => {
    const r = bulkAdjustStockSchema.safeParse({
      reason: "Ajuste",
      items: [{ productId: randomUUID(), variationId: "x", newQuantity: 1 }],
    });
    expect(r.success).toBe(false);
  });
});
