# ADR 0041 — Reserva de estoque para itens de OS

## Status
Aceita.

## Contexto
O Laravel (`OrdemServicoEstoqueService`) reserva estoque automaticamente ao adicionar um produto como item de OS e libera ao remover ou cancelar. A implementacao Next.js nao fazia isso — itens PRODUCT eram adicionados/removidos sem impacto no estoque, permitindo vender estoque inexistente.

## Decisao
Criar `src/server/services/os-stock.service.ts` com tres funcoes:

1. **`reserveStockForOsItem()`** — decrementa `currentStock`, cria `StockMovement` tipo `RESERVE` com `referenceType=service_order`
2. **`releaseStockForOsItem()`** — incrementa `currentStock`, cria `StockMovement` tipo `RELEASE`
3. **`releaseAllOsItems()`** — libera todos os itens PRODUCT de uma OS (usado no cancelamento)

Integrado nos seguintes pontos do router `service-order.ts`:
- `create`: reserva para cada item PRODUCT
- `addItem`: reserva antes de criar item
- `removeItem`: libera antes de deletar item
- `cancel`: libera todos os itens PRODUCT

## Consequencias
- Estoque reflete reservas de OS em tempo real
- Cancelamento de OS libera estoque automaticamente
- StockMovements com `referenceType=service_order` sao auditaveis
- Produtos serializados (isSerialized=true) sao ignorados por ora — usarao `changeItemStatus()` no futuro
