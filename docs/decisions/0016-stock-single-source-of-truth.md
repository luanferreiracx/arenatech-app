# ADR 0016 — Estoque: Single Source of Truth (sem dual model)

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-A (Catálogo de Produtos)

## Problema

O Laravel usa **dual model de estoque**:
1. `Produto.quantidade_estoque` — contador rápido (denormalizado)
2. `EstoqueItem` — registro individual por unidade (com IMEI, status, fornecedor)

Isso causa inconsistências: o counter pode divergir dos items reais (ex: bugs em transações, imports parciais).

## Decisão

**Remover o campo `quantidade_estoque` persistido.** O "estoque disponível" é SEMPRE computed:

```sql
SELECT COUNT(*) FROM stock_items
WHERE product_id = ? AND status = 'AVAILABLE' AND tenant_id = ?
```

- Product NÃO tem campo `currentStock`
- `availableQuantity` é computed field via query ao módulo Estoque-B
- Até Estoque-B ser implementado, o computed retorna 0 (stub)

## Justificativa

- **Fonte única de verdade**: StockItem é o registro canônico
- **Sem inconsistência**: impossível divergir (é derivado, não duplicado)
- **Complexidade reduzida**: sem trigger/event para sincronizar counter
- **Performance**: materializar via query com index `(product_id, status)` é O(1) com count index scan
- **Trade-off aceito**: listagem precisa de JOIN/subquery em vez de read direto. Mitigado com index e, se necessário futuro, cache Redis.

## Impacto

- PDV e OS que hoje leem `Product.currentStock` precisarão usar o service computed
- Schema `stock.prisma` terá campo `currentStock` removido na migration de Estoque-A
- Módulo Estoque-B definirá o StockItem e o service que resolve `availableQuantity`

## Alternativas descartadas

- Manter dual model com trigger: complexidade + risco de inconsistência
- Cache Redis do count: premature optimization — avaliar em Estoque-B se necessário
