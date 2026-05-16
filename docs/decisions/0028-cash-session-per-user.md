# ADR 0028 — Modelo "uma sessão por usuário"

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Caixa

## Decisão

Cada usuário tem no máximo 1 CashSession aberta por vez. Enforçado via partial unique constraint `(tenantId, userId, closedAt)` — com closedAt NULL, apenas 1 registro por (tenantId, userId).

## Justificativa

- Legacy: cada operador tem "seu caixa" (CaixaAbertura vinculada a Caixa que é vinculado a usuário)
- Simplificação: não existe entidade "Caixa físico" separada — apenas CashSession
- Múltiplos caixas simultâneos por tenant são normais (Gabriel + Moisés + David)
- Apenas 1 por pessoa evita confusão de "qual caixa meu?" e auditoria clara
