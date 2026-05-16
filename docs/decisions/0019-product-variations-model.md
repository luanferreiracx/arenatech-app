# ADR 0019 — Variações de Produto: Modelo E-commerce Padrão

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-A (Catálogo de Produtos)

## Problema

Produtos como iPhones precisam de variações (cor, armazenamento) com SKU e preço próprios. Como modelar?

## Decisão

**Replicar o modelo do legacy fielmente — padrão e-commerce com atributos, valores e variações.**

### Estrutura

```
ProductAttribute (Cor, Armazenamento)
  └─ ProductAttributeValue (Preto, 128GB, 256GB)

Product (iPhone 15 Pro)
  ├─ ProductAttributeConfig (quais atributos este produto usa)
  └─ ProductVariation (iPhone 15 Pro Preto 256GB)
       └─ ProductVariationAttribute (pivot: variação ↔ valores)
```

### Tabelas

| Tabela | Propósito |
|--------|-----------|
| `product_attributes` | Dimensões (tenant-scoped, global por tenant) |
| `product_attribute_values` | Valores por dimensão |
| `product_attribute_configs` | Quais atributos um produto usa (pivot) |
| `product_variations` | Combinações concretas com SKU/preço |
| `product_variation_attributes` | Valores da variação (pivot) |

### Regras

- Atributos são globais por tenant (ex: "Cor" existe uma vez)
- Cada produto seleciona quais atributos usa (via config)
- Cada variação combina valores dos atributos selecionados
- Variação herda preço do produto se não definir o próprio
- Variação tem estoque próprio (via StockItem em Estoque-B)

## Justificativa

- Padrão e-commerce validado (WooCommerce, Shopify, Magento usam modelo similar)
- Legacy já implementa exatamente este modelo — replicar mantém fidelidade
- Flexível: suporta N atributos com M valores cada
- Normalization: sem campos JSON para atributos (queryable, indexável)

## Alternativas descartadas

- JSON de atributos no Product: não queryable, sem integridade referencial
- Tabela flat (um registro por combinação sem pivot): explosão de dados
- EAV genérico: over-engineering para o caso de uso (max 3-4 atributos por produto)
