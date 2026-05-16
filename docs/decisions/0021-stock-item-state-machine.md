# ADR 0021 — StockItem: Máquina de Estados

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-B (Posição e Movimentações)

## Decisão

StockItem.status segue máquina de estados com 6 valores e transições explícitas:

```
AVAILABLE → RESERVED, SOLD, DEFECTIVE, BLOCKED
RESERVED  → AVAILABLE (liberar), SOLD (venda concretizada)
SOLD      → RETURNED (devolução)
DEFECTIVE → AVAILABLE (após reparo), BLOCKED
RETURNED  → AVAILABLE (recondicionado), DEFECTIVE, BLOCKED
BLOCKED   → AVAILABLE (desbloqueio owner), DEFECTIVE
```

Transições não listadas geram erro FORBIDDEN.

## Justificativa

- Legacy (`EstoqueItem::TRANSICOES_PERMITIDAS`) já define transições válidas
- Máquina de estados previne estados incoerentes (ex: SOLD → AVAILABLE direto sem registro de devolução)
- Auditoria fica completa: cada transição gera StockMovement com reason

## Implementação

- Validação em `isValidTransition(currentStatus, newStatus)` — validador puro
- Service `changeItemStatus` valida antes de executar
- Procedure tRPC retorna erro amigável se transição inválida

## Mapeamento do legacy

| Legacy | Novo | Notas |
|--------|------|-------|
| disponivel | AVAILABLE | |
| reservado | RESERVED | |
| vendido | SOLD | |
| defeito | DEFECTIVE | |
| devolvido | RETURNED | |
| baixa | (soft delete + EXIT movement) | Não é status, é remoção |
| — | BLOCKED | Novo: auditoria/proveniência |
