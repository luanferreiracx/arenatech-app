# ADR 0031 — RBAC granular do módulo Caixa

## Status

Aceita.

## Contexto

Caixa envolve operações com graus distintos de criticidade. A tentação seria "tudo manager+owner" (restritivo demais) ou "tudo authenticated" (permissivo demais). Nenhum reflete a operação real.

## Decisão

RBAC granular por procedure, com 3 papéis (Operator, Manager, Owner). Procedures que envolvem "próprio caixa" permitem Operator. Procedures que envolvem "caixa de outros" exigem Manager+. Procedures de conferência e dashboard global exigem Manager+.

### Matriz completa (fonte: SPEC Caixa seção K10)

| Ação | Operator | Manager | Owner |
|------|----------|---------|-------|
| Abrir caixa (próprio) | ✓ | ✓ | ✓ |
| Fechar caixa (próprio) | ✓ | ✓ | ✓ |
| Sangria/Suprimento (próprio caixa) | ✓ | ✓ | ✓ |
| Despesa avulsa | ✓ | ✓ | ✓ |
| Ver próprio histórico | ✓ | ✓ | ✓ |
| Ver histórico de outros caixas | ✗ | ✓ | ✓ |
| Conferir caixa (qualquer) | ✗ | ✓ | ✓ |
| Dashboard de caixas abertos | ✗ | ✓ | ✓ |
| Forçar fechamento de outro | ✗ | ✓ | ✓ |

## Razões

- Modelo "uma caixa por funcionário" (ADR 0028) implica Operator com domínio sobre próprio caixa
- Conferência é função de auditoria — não deve ser feita por quem registrou
- Dashboard global expõe receita do tenant — visibilidade restrita a gestão

## Trade-offs aceitos

- Manager precisa logar para conferir caixas
- Operator não tem visibilidade da operação geral — pode pedir relatórios ao Manager

## Implementação

Procedures usam:
- `tenantProcedure` + checagem manual de "próprio caixa" via `ctx.session.user.id === session.userId`
- Checagem de role via `ctx.session.availableTenants.find(t => t.id === ctx.tenantId)?.role`
- Procedures gerenciais (pendingReviews, openCashiers, verify, forceClose) verificam `role !== "operator"`

## Conexão com a SPEC

- Seção 3 regra RN-10 referencia K10
- Todas as procedures do cashier router implementam os checks

## Aplicabilidade futura

Padrão replicado em:
- PDV (operator vende, manager faz estorno, owner cancela)
- OS (técnico vê próprias OS, manager vê todas)
- Financeiro (operator registra, owner aprova grandes valores)
