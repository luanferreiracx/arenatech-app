# Auditoria de Níveis E2E — 2026-05-17

## Resultado do linter endurecido (ADR 0036 Rev3)

| Arquivo | Total | Nível 2 | Nível 1.5 | Nível 1 | % L2 |
|---------|-------|---------|-----------|---------|------|
| customers.spec.ts | 20 | 4 | 8 | 8 | 20% |
| settings.spec.ts | 17 | 0 | 3 | 14 | 0% |
| stock-a.spec.ts | 19 | 2 | 6 | 11 | 11% |
| stock-b.spec.ts (upgrade) | 15 | 0 | 5 | 10 | 0% |
| auth (whitelist) | 6 | — | — | — | — |
| cashier (whitelist) | 16 | — | — | — | — |
| financial (whitelist) | 5 | — | — | — | — |
| home (whitelist) | 2 | — | — | — | — |
| **Total validado** | **71** | **6** | **22** | **43** | **6%** |

## Conclusões

- **6% Nível 2 real** — 6 de 100 testes fazem mutation + verificação pós-mutation
- Customers tem 4 Nível 2 (T-02 submit validation tests que ficam em /new após click)
- Stock-A tem 2 Nível 2 (T-01 e T-14 que criam produto + buscam na listagem)
- Settings tem 0 Nível 2 — nenhum teste submete form e verifica resultado
- Stock-B tem 0 Nível 2 — mesmo padrão

## Plano

- Stock-B: em `pendingLevelUpgrade` (warning, não bloqueia push)
- Customers, Settings, Stock-A: level issues como warnings (não erros) por agora
- Próxima fase: elevar para Nível 2 real, módulo por módulo
