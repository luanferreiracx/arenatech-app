# ADR 0027 — CatalogDevice separado de Product

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Catálogo (Aparelhos)

## Problema

O sistema tem dois conceitos de "aparelho":
1. Product (Estoque-A): item físico com SKU, custo, fornecedor, estoque
2. AparelhoCatalogo (legacy): referência de marketing/atendimento para chatbot Lia

Compartilhar schema geraria confusão e acoplamento indevido.

## Decisão

**CatalogDevice é entidade independente de Product.**

- Tabela própria: `catalog_devices`
- Sem FK para Product
- Propósito: referência de marketing, preço de vitrine, disponibilidade para Lia
- Product: item real do estoque, com movimentações, IMEI, custo

## Justificativa

- Propósitos distintos: CatalogDevice é "o que a loja oferece"; Product é "o que a loja tem fisicamente"
- Ciclos de vida diferentes: CatalogDevice pode existir sem nenhum Product em estoque
- Consumidores diferentes: Lia/chatbot usa CatalogDevice; PDV/OS usa Product
- Legacy já separa: `aparelhos_catalogo` está em banco `central`, não no banco do tenant
- Evita confusão: "iPhone 15 Pro Max" pode ser CatalogDevice (marketing) E ter vários Products (cada IMEI individual)

## Trade-off

- Operador precisa manter dois cadastros se quiser ambos atualizados
- Sem sincronização automática entre CatalogDevice.price e Product.salePrice
