# ADR 0023 — StockMovement: Append-Only (Imutável)

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-B (Posição e Movimentações)

## Decisão

StockMovement é append-only:
- Sem campo `updatedAt` (não é editável)
- Nunca excluído (nem soft delete)
- Correções geram novo movement (tipo ADJUSTMENT) com reason explicando

## Justificativa

- Log de auditoria deve ser imutável (rastreabilidade fiscal e anti-fraude)
- Legacy (`EstoqueMovimentacao`) já define `UPDATED_AT = null` (sem updates)
- Simplifica código: só INSERT, nunca UPDATE/DELETE
- Em caso de erro, a correção é rastreável (novo movimento aponta o erro)

## Campos de auditoria

Cada StockMovement registra:
- `userId`: quem executou
- `referenceType` + `referenceId`: de onde veio (venda, OS, ajuste manual)
- `reason`: motivo textual
- `quantityBefore` / `quantityAfter`: snapshot para não-serializados
- `createdAt`: timestamp imutável
