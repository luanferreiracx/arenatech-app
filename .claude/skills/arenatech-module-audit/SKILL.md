# Skill: arenatech-module-audit

## Triggers
- "auditar módulo X do Arena Tech"
- "fechar pendências do módulo X"
- "diagnosticar estado do módulo X"
- "rodar AUDIT_REPORT no módulo X"

## Objetivo
Auditar o estado real de um módulo do Arena Tech: E2E, procedures, páginas, ADRs. Produzir AUDIT_REPORT.md e corrigir pendências.

## Metodologia (5 fases)

### Fase 1 — Diagnóstico
1. Verificar dev server rodando (porta 3000). Iniciar se necessário.
2. Rodar `pnpm test:e2e --grep "<modulo>"` — capturar saída completa.
3. Mapear procedures em `src/server/api/routers/` contra SPEC seção correspondente.
4. Mapear páginas em `src/app/(app)/` contra SPEC seção de telas.
5. Verificar implementação contra ADRs do módulo.
6. NÃO consertar nada nesta fase.

### Fase 2 — AUDIT_REPORT
Produzir `docs/specs/<modulo>/AUDIT_REPORT.md` com estrutura:

```markdown
# Audit Report — Módulo <Nome>

> Data: YYYY-MM-DD

## Estado encontrado

| Item | Esperado (SPEC) | Encontrado | Gap |
|------|-----------------|------------|-----|
| E2E cenários | X | Y | Z faltantes |
| Procedures | X | Y | ✓/gap |
| Páginas | X | Y | ✓/gap |
| Unit tests | X | Y | ✓/gap |
| ADRs | X | Y | ✓/gap |

## Diagnóstico detalhado
(procedures listadas, páginas mapeadas, integrações verificadas)

## Descobertas
(bugs, divergências, código morto)

## Plano de correção
(lista priorizada)
```

### Fase 3 — Apresentação
Mensagem curta: AUDIT_REPORT em 1 parágrafo + plano + estimativa.
Pausar APENAS se descoberta grande (3+ páginas faltantes, procedure crítica ausente, ADR não implementado).

### Fase 4 — Correções
- Reusar helpers em `__tests__/e2e/helpers/` — NUNCA recriar.
- Cada correção em commit semântico.
- NÃO refatorar testes @smoke (é trabalho de arenatech-module-refactor).

### Fase 5 — Documentação
- Atualizar SPEC.md, CLOSE.md, AUDIT_REPORT.md
- Atualizar `docs/05_PROGRESS.md`
- Criar ADR se decisão arquitetural foi tomada

## Helpers compartilhados (REUSAR, nunca recriar)
- `__tests__/e2e/helpers/cashier.helper.ts` — loginAs, goToCashier
- Padrão de login: waitForLoadState("networkidle"), não waitForURL

## Validações obrigatórias ao final
- `pnpm typecheck` verde
- `pnpm test` verde (sem regressão)
- `pnpm test:e2e:lint` verde
- `pnpm test:e2e` verde (com --workers=2 se flaky)
- `pnpm build` verde

## Output
- AUDIT_REPORT.md salvo
- Correções commitadas
- SPEC/CLOSE/PROGRESS atualizados
- Notificação macOS: `osascript -e 'display notification "Módulo X auditado" with title "Arena Tech" sound name "Glass"'`
