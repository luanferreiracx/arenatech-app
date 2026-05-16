# ADR 0029 — Auto-fechamento via service idempotente (sem Job externo)

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Caixa

## Decisão

Auto-fechamento implementado como função idempotente `autoCloseAbandonedSessions()` em `cash-session.service.ts`. Pode ser chamada por:
- Cron job externo (systemd timer, GitHub Actions schedule)
- API route protegida `/api/cron/close-cash` com secret
- Manualmente pelo admin

## Justificativa

- Next.js standalone não tem scheduler nativo confiável (não é worker)
- BullMQ requer Redis worker separado (overhead para 1 job que roda 1x/dia)
- Função idempotente = chamar 2x não fecha 2x a mesma sessão
- Simplicidade: systemd timer ou cron na VPS chama endpoint HTTP com token

## Implementação

```typescript
autoCloseAbandonedSessions(tx, tenantId, maxHours=18)
// Fecha CashSessions onde openedAt < (now - maxHours) AND closedAt IS NULL
// Calcula calculatedBalance, seta closeType=AUTOMATIC, verified=false
// Idempotente: só atua em sessões ainda abertas
```

## Alternativas descartadas

- BullMQ: overhead de Redis worker para 1 job simples
- node-cron in-process: não funciona com standalone + replicas
- Vercel Cron: não aplicável (VPS com Docker)
