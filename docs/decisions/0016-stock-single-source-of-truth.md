# ADR 0016 — Modelo Híbrido de Estoque: counter para não-serializados, StockItem para serializados

**Status:** revisado
**Data:** 2026-05-16
**Contexto:** Estoque-A + Estoque-B

## Problema

O Laravel usa **dual model de estoque**:
1. `Produto.quantidade_estoque` — contador rápido (denormalizado)
2. `EstoqueItem` — registro individual por unidade (com IMEI, status, fornecedor)

## Decisão original (superseded)

Remover `currentStock` completamente. Tudo via count(StockItem).

## Atualização pós-revisão (2026-05-16)

O dono revisou a decisão após análise prática:
- 200 capinhas gerando 200 linhas em StockItem é desperdício (sem IMEI, sem rastreio individual)
- Apenas produtos serializados (IMEI) precisam rastreio individual real

### Decisão final: MODELO HÍBRIDO

| Tipo de produto | Fonte da verdade | Como funciona |
|----------------|-----------------|---------------|
| `isSerialized = false` | `Product.currentStock` (counter) | Movimentações incrementam/decrementam o campo |
| `isSerialized = true` | `count(StockItem WHERE status=AVAILABLE)` | StockItem individual rastreado por IMEI/série |

### Regras

- Um produto NUNCA usa ambos simultaneamente
- `isSerialized` é definido na criação e não muda (ou migra com procedimento manual)
- `ProductService.getAvailableQuantity()` é a ÚNICA interface pública — resolve internamente qual fonte consultar
- Movimentações SEMPRE criam StockMovement (log) independente do tipo

## Justificativa da revisão

- **Pragmatismo**: 80% dos produtos (capas, cabos, películas) não precisam de rastreio individual
- **Performance**: counter é O(1) para leitura, sem JOIN
- **Sem risco de inconsistência**: as duas fontes nunca operam no mesmo produto
- **Fidelidade ao legacy**: o Laravel faz exatamente isso (controla_imei decide o modelo)

## Trade-offs aceitos

- Duas "fontes de verdade" coexistem — mas nunca para o mesmo produto
- `currentStock` pode divergir em caso de bug — mitigado por ajuste de inventário
- Service `getAvailableQuantity` precisa ser usado SEMPRE (não ler diretamente)

## Alternativas descartadas

- Tudo via StockItem (decisão original): overhead para não-serializados
- Cache Redis do count: prematura ��� count com index é suficiente
- Campo computed virtual no Prisma: não suportado nativamente
