# ADR 0040 — Níveis de cobertura E2E e padrão Nível 2 via UI

## Status
Aceita.

## Contexto

Refatoração de Estoque-A revelou que testes @business passavam no linter (ADR 0036) mas operavam em Nível 1: preenchiam formulários sem submeter, sem verificar side effects. Tentativa de verificar via Prisma direto bloqueada arquiteturalmente (projeto usa RLS com adapter-pg).

## Decisão

Três níveis formalmente definidos:

**Nível 1 (INSUFICIENTE):** form aceita input, sem mutation. NÃO USAR.

**Nível 2 (PADRÃO OBRIGATÓRIO):** mutation completa + verificação via UI.
- Submit do form / click em ação destrutiva
- Verificação: redirect, entidade aparece/sumiu/mudou na listagem
- Sem Prisma direto

**Nível 3 (integration test, não E2E):** Prisma direto. Pertence a `__tests__/integration/`.

## Mecânica

Auto-validação: (1) há mutation? (2) há verificação após? (3) via UI? → Sim para os 3 = Nível 2.

## Consequências

- Cobertura real, compatível com RLS
- Linter ADR 0036 + revisão amostral validam qualidade
- Skill arenatech-module-refactor atualizada protege próximos módulos
- Integration tests via Prisma ficam como estratégia separada futura
