# ADR 0039 — Playwright workers=2 como padrão em dev

## Status
Aceita.

## Contexto

Refatoração de Settings (17 testes E2E) revelou flakiness com workers=1: Turbopack compila Server Components on-demand, causando timeouts quando 1 worker sequencial hit cold cache. Verificação: 3 runs consecutivos com workers=2 = 17/17 consistente.

## Decisão

`playwright.config.ts`: `workers: process.env.CI ? 1 : 2`

- Dev local: 2 workers paralelos (cache aquece mais rápido, evita flakiness)
- CI: 1 worker (build pré-compilado, paralelismo desnecessário)

## Consequências

- E2E estável em dev e pre-push hook confiável
- 2 workers usa ~2x memória de browser (aceitável em Mac M2/M3)
