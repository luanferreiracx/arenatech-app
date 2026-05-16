# SPEC: Estoque-B (Posição, Movimentações, IMEI)

> **Status:** aprovada (SPEC+IMPLEMENT consolidado, decisões do dono registradas no prompt)
> **Base:** docs/legacy/estoque.md + leitura direta Laravel (EstoqueItem, EstoqueMovimentacao, EstoqueService, EstoqueController) + decisões D1-D8
> **Versão:** 1.0

---

## 1. Visão geral

Módulo de posição de estoque, movimentações e rastreio individual por IMEI/número de série. Gerencia o ciclo de vida de itens serializados (aparelhos) desde a entrada até a venda, incluindo reservas, devoluções e defeitos. Para produtos não-serializados, gerencia o counter `Product.currentStock` via movimentações. Não inclui compra de aparelhos (Estoque-C), importação de NF-e (Estoque-D) nem relatórios avançados.

---

## 2. Glossário

| Termo | Definição |
|-------|-----------|
| **StockItem** | Instância individual de produto serializado. 1 IMEI/série = 1 StockItem. Só existe para `isSerialized=true`. |
| **StockMovement** | Log imutável de toda alteração de quantidade ou status. Append-only. |
| **Reserva** | Bloqueio de StockItem para venda futura (OS/quote). Status = RESERVED. |
| **IMEI** | International Mobile Equipment Identity. 15 dígitos numéricos com dígito verificador Luhn. |
| **Série** | Número de série genérico (alternativa a IMEI para não-Apple). 4-30 chars alfanuméricos. |
| **Entrada** | Recebimento de produto/item no estoque. |
| **Baixa** | Saída de estoque sem venda (perda, furto, brinde, consumo próprio). |
| **Ajuste** | Correção de quantidade após inventário/auditoria. |

---

## 3. Modelos de dados

### 3.1 StockItem

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem Laravel | Notas |
|-------|-------------|----------|---------|---------------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | RLS | FK → Tenant |
| productId | String @db.Uuid | NO | — | z.string().uuid() | `estoque_itens.produto_id` | FK → Product |
| variationId | String? @db.Uuid | YES | — | z.string().uuid().optional() | `estoque_itens.variacao_id` | FK → ProductVariation |
| supplierId | String? @db.Uuid | YES | — | z.string().uuid().optional() | `estoque_itens.fornecedor_id` | FK → Supplier |
| imei | String? | YES | — | validateImei (Luhn 15 dígitos) | `estoque_itens.imei` | Unique por tenant (non-deleted) |
| serialNumber | String? | YES | — | z.string().min(4).max(30).optional() | `estoque_itens.numero_serie` | Alternativa a IMEI |
| barcode | String? | YES | — | z.string().max(50).optional() | `estoque_itens.codigo_barras` | |
| condition | StockItemCondition | NO | NEW | z.enum([...]) | `estoque_itens.condicao` | novo/seminovo/usado/vitrine |
| conservationGrade | String? | YES | — | z.enum(['A','B','C','D']).optional() | `estoque_itens.grau_conservacao` | Excelente/Bom/Regular/Ruim |
| batteryHealth | Int? | YES | — | z.number().int().min(0).max(100).optional() | `estoque_itens.bateria_saude` | % saúde bateria |
| warrantyMonths | Int? | YES | — | z.number().int().min(0).optional() | `estoque_itens.garantia_meses` | |
| costPrice | Decimal @db.Decimal(10,2) | NO | 0 | z.number().min(0) | `estoque_itens.preco_custo_unitario` | |
| suggestedSalePrice | Decimal? @db.Decimal(10,2) | YES | — | z.number().min(0).optional() | `estoque_itens.preco_venda_unitario` | |
| invoiceNumber | String? | YES | — | z.string().max(50).optional() | `estoque_itens.nota_fiscal_entrada` | NF de entrada |
| entryDate | DateTime | NO | now() | z.date() | `estoque_itens.data_entrada` | |
| status | StockItemStatus | NO | AVAILABLE | — | `estoque_itens.status` | D4: 6 valores |
| reservedForType | String? | YES | — | — | — | Ref polimórfica (D3) |
| reservedForId | String? @db.Uuid | YES | — | — | — | UUID da ref |
| reservedAt | DateTime? | YES | — | — | — | |
| saleId | String? @db.Uuid | YES | — | — | `estoque_itens.venda_id` | Ref futura PDV |
| soldAt | DateTime? | YES | — | — | `estoque_itens.data_venda` | |
| notes | String? @db.Text | YES | — | z.string().optional() | `estoque_itens.observacoes` | |
| deletedAt | DateTime? | YES | — | — | — | Soft delete |
| createdAt | DateTime @default(now()) | NO | now() | — | `criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | — | `atualizado_em` | |

**Constraints:**
- `@@unique([tenantId, imei])` partial WHERE imei IS NOT NULL AND deletedAt IS NULL
- `@@index([tenantId, productId, status])`
- `@@index([tenantId, imei])`
- `@@index([tenantId, serialNumber])`
- `@@index([tenantId, status])`

---

### 3.2 StockMovement (refatorado)

| Campo | Tipo Prisma | Nullable | Default | Origem Laravel | Notas |
|-------|-------------|----------|---------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | padrão | PK |
| tenantId | String @db.Uuid | NO | — | RLS | |
| productId | String @db.Uuid | NO | — | `estoque_movimentacoes.produto_id` | FK → Product (sempre) |
| variationId | String? @db.Uuid | YES | — | `estoque_movimentacoes.variacao_id` | FK → ProductVariation |
| stockItemId | String? @db.Uuid | YES | — | `estoque_movimentacoes.estoque_item_id` | FK → StockItem (para serializados) |
| type | StockMovementType | NO | — | `estoque_movimentacoes.tipo` | D2: 5 tipos |
| quantity | Int | NO | — | `estoque_movimentacoes.quantidade` | Sempre positivo, tipo define sinal |
| quantityBefore | Int? | YES | — | — | Counter antes (não-serializados) |
| quantityAfter | Int? | YES | — | — | Counter depois (não-serializados) |
| reason | String? | YES | — | `estoque_movimentacoes.motivo` | |
| notes | String? @db.Text | YES | — | `estoque_movimentacoes.observacoes` | |
| referenceType | String? | YES | — | `estoque_movimentacoes.referencia_tipo` | "sale", "order_service", "manual", etc. |
| referenceId | String? @db.Uuid | YES | — | `estoque_movimentacoes.referencia_id` | |
| userId | String @db.Uuid | NO | — | `estoque_movimentacoes.usuario_id` | FK → User |
| createdAt | DateTime @default(now()) | NO | now() | `criado_em` | Imutável (sem updatedAt) |

**Constraints:**
- `@@index([tenantId, productId, createdAt])`
- `@@index([tenantId, stockItemId, createdAt])`
- `@@index([tenantId, type, createdAt])`

---

### 3.3 Enums

```prisma
enum StockItemStatus {
  AVAILABLE
  RESERVED
  SOLD
  DEFECTIVE
  RETURNED
  BLOCKED
}

enum StockItemCondition {
  NEW
  SEMI_NEW
  USED
  DISPLAY
}

enum StockMovementType {
  ENTRY      // entrada
  EXIT       // saída/baixa
  ADJUSTMENT // ajuste de inventário
  RESERVE    // reserva
  RELEASE    // liberação de reserva
}
```

---

## 4. Máquina de estados (StockItem.status)

```
AVAILABLE → RESERVED, SOLD, DEFECTIVE, BLOCKED
RESERVED  → AVAILABLE (liberar), SOLD (venda concretizada)
SOLD      → RETURNED (devolução)
DEFECTIVE → AVAILABLE (após reparo), BLOCKED
RETURNED  → AVAILABLE (recondicionado), DEFECTIVE, BLOCKED
BLOCKED   → AVAILABLE (desbloqueio owner), DEFECTIVE
```

Transições não listadas são PROIBIDAS e geram erro.

---

## 5. Regras de negócio

| # | Regra | Fonte |
|---|-------|-------|
| RN-01 | StockItem só é criado para produtos com isSerialized=true. | D1 |
| RN-02 | Para isSerialized=false, movimentações atualizam Product.currentStock; quantityBefore/quantityAfter são gravados. | D1 |
| RN-03 | Para isSerialized=true, movimentações NÃO tocam Product.currentStock; afetam StockItem.status individual. | D1 |
| RN-04 | StockMovement é append-only — nunca editado ou excluído. | D2 |
| RN-05 | Reservar StockItem: status → RESERVED, preenche reservedForType/Id/At, cria StockMovement tipo RESERVE. | D3 |
| RN-06 | Liberar reserva: status → AVAILABLE, limpa campos reserved*, cria StockMovement tipo RELEASE. | D3 |
| RN-07 | Status transitions seguem máquina (seção 4). Transição inválida = erro FORBIDDEN. | D4 |
| RN-08 | IMEI: 15 dígitos numéricos, validação Luhn obrigatória. IMEI inválido rejeitado no input. | D5 |
| RN-09 | IMEI duplicado em StockItem ativos (deletedAt IS NULL) do mesmo tenant = erro. | D5 |
| RN-10 | Ao inserir IMEI que já existiu como SOLD (soft deleted ou não): aviso "IMEI já vendido anteriormente" (não bloqueia). | legacy EstoqueService |
| RN-11 | Busca por IMEI retorna estado atual + histórico completo de movimentações. | D6 |
| RN-12 | Toda mutation registra userId no StockMovement (auditoria). | D7 |
| RN-13 | Entrada com IMEI: cria 1 StockItem + 1 StockMovement por item. | legacy EstoqueService.entradaEstoque |
| RN-14 | Entrada sem IMEI: incrementa Product.currentStock + cria 1 StockMovement. | legacy EstoqueService.entradaQuantidade |
| RN-15 | Baixa avulsa (perda, furto, brinde): cria StockMovement type=EXIT com reason obrigatório. Para serializado, StockItem é soft-deleted. | legacy EstoqueService.baixaEstoque |
| RN-16 | Ajuste de inventário: define nova quantidade, cria StockMovement type=ADJUSTMENT com before/after e motivo obrigatório. | legacy EstoqueService.ajusteManual |
| RN-17 | Produto serializado vendido: StockItem.status → SOLD, soldAt = now, saleId preenchido. | legacy EstoqueItem.marcarVendido |
| RN-18 | Devolução: StockItem.status → RETURNED. Pode depois ir para AVAILABLE (recondicionado) ou DEFECTIVE. | legacy EstoqueItem.marcarDevolvido |

---

## 6. Permissões (D7)

| Ação | Operator | Manager | Owner |
|------|----------|---------|-------|
| Listar estoque | ✓ | ✓ | ✓ |
| Ver detalhe item | ✓ | ✓ | ✓ |
| Buscar IMEI / histórico | ✓ | ✓ | ✓ |
| Entrada de estoque | ✗ | ✓ | ✓ |
| Baixa avulsa | ✗ | ✓ | ✓ |
| Ajuste de inventário | ✗ | ✓ | ✓ |
| Reservar (próprio fluxo) | ✓ | ✓ | ✓ |
| Liberar reserva | ✓ | ✓ | ✓ |
| Marcar defeito | ✗ | ✓ | ✓ |
| Marcar devolvido | ✗ | ✓ | ✓ |
| Bloquear | ✗ | ✗ | ✓ |
| Desbloquear | ✗ | ✗ | ✓ |
| Soft delete StockItem | ✗ | ✗ | ✓ |
| Marcar SOLD (via sistema/PDV) | ✓ | ✓ | ✓ |

---

## 7. Validações

| Campo | Regra | Fonte |
|-------|-------|-------|
| imei | 15 dígitos numéricos + Luhn | D5 |
| serialNumber | 4-30 chars alfanuméricos | legacy (varchar 50, mas sanity check) |
| quantity (entrada) | inteiro >= 1 | legacy validation |
| quantity (ajuste) | inteiro >= 0 (nova quantidade absoluta) | legacy |
| condition | enum válido | legacy CONDICOES |
| conservationGrade | A/B/C/D ou null | legacy GRAUS |
| batteryHealth | 0-100 ou null | legacy (integer) |
| costPrice | >= 0 | legacy validation |
| status transitions | conforme máquina seção 4 | D4 + legacy TRANSICOES_PERMITIDAS |
| reason (baixa/ajuste) | obrigatório, min 3 chars | legacy (motivo required) |

---

## 8. Anti-escopo

| Item | Destino |
|------|---------|
| CompraAparelho (fluxo completo com Autentique) | Estoque-C |
| NfeImportacao (parse XML NF-e de entrada) | Estoque-D |
| Relatórios avançados (ABC, posição detalhada, vendas) | Módulo Relatórios |
| Dashboard de estoque | Módulo Dashboard |
| Lote CSV de entrada serializada (>50 itens) | Futuro |
| Variação de estoque por filial | Não existe no legacy |

---

## 9. Testes obrigatórios

| # | Cenário |
|---|---------|
| T-01 | Entrada serializada cria N StockItems com status AVAILABLE |
| T-02 | Entrada não-serializada incrementa Product.currentStock |
| T-03 | IMEI inválido (Luhn) é rejeitado |
| T-04 | IMEI duplicado em mesmo tenant é rejeitado |
| T-05 | Reserva muda status AVAILABLE → RESERVED |
| T-06 | Liberação de reserva volta para AVAILABLE |
| T-07 | Transição inválida (AVAILABLE → RETURNED) é bloqueada |
| T-08 | Ajuste cria StockMovement com quantityBefore/quantityAfter |
| T-09 | RBAC: operator não consegue entrada |
| T-10 | RLS: estoque tenant A não aparece em tenant B |
| T-11 | ProductService.getAvailableQuantity retorna currentStock para não-serializado |
| T-12 | ProductService.getAvailableQuantity retorna count(StockItem) para serializado |
| T-13 | Busca por IMEI retorna item com dados corretos |
| T-14 | Histórico de IMEI mostra movimentações ordenadas |
| T-15 | Soft delete StockItem oculta da listagem |
