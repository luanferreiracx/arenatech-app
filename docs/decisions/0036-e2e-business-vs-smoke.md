# ADR 0036 — Diferenciação explícita entre E2E business e smoke tests

## Status

Aceita.

## Contexto

Em 17/05/2026, auditoria detectou que 96 de 103 testes E2E (93%) eram smoke tests disfarçados de business tests. Padrão recorrente:
- test() com nome prometendo regra de negócio
- corpo executa apenas page.goto + page.toContainText
- nenhuma mutation, nenhuma assertion sobre side effects
- testes passavam pelo pre-push hook (ADR 0035) porque tecnicamente são E2E válidos

Causa raiz: pre-push hook valida que E2E passam, não que E2E testam algo.

## Decisão

1. Toda função test() em `__tests__/e2e/` DEVE começar com tag explícita: `@business` ou `@smoke`
2. Linter customizado `__tests__/e2e/lint-e2e.ts` valida formato e conteúdo
3. Pre-push hook v2 chama linter antes dos E2E
4. % mínimo de business agregado: 60%
5. Smoke tests permitidos para: carregamento de página, navegação básica, presença de elementos UI estáticos

### Critérios de @business

Todos devem ser verdadeiros:
- Nome começa com `@business`
- Corpo contém pelo menos UMA ação: click em botão de mutation, fill + submit, ou chamada direta a API/procedure
- Corpo contém pelo menos UMA assertion específica: toHaveValue, toHaveCount, toHaveText, toHaveURL com path específico, toBeDisabled/Enabled, not.toContain, response.json(), ou verificação de dados retornados

### Critérios de @smoke

- Nome começa com `@smoke`
- Apenas verificações de UI estática (toBeVisible, toContainText genérico)
- Nome NÃO promete comportamento dinâmico

## Consequências

**Positivas:**
- Impossível mascarar smoke como business sem violar convenção explícita
- Auditoria automatizada via linter
- Clareza sobre o que cada teste valida

**Negativas:**
- Refatoração obrigatória dos 103 testes existentes (renomear com tags)
- Mais tempo de desenvolvimento por E2E business real

## Alternativas consideradas e rejeitadas

- Code review manual: não escala
- Coverage de assertions: técnico demais, falso positivo alto
- Limitar quantidade de toContainText por teste: contornável

## Revisão em 2026-05-17

Threshold revisado de 60% para **100% @business**.

**Razão:** smoke tests viraram muleta na prática. Sessão anterior renomeou 99 testes para @smoke pra evitar refatoração real. Para sistema de gestão de negócio real (Arena Tech: financeiro, estoque, vendas, OS), cada cenário tem lógica de negócio testável — smoke é desnecessário.

**Mudanças:**
- Tag @smoke removida como categoria válida — linter reporta erro
- Apenas @business aceito
- Páginas sem lógica de negócio (404, institucionais) não devem ter E2E
- Se necessário testar "página carrega", isso é coberto incidentalmente por qualquer @business que navegue pra essa página

**Consequência imediata:**
- 99 testes @smoke existentes precisam ser refatorados para @business OU removidos
- Linter bloqueia push até 100% atingido
- Estimativa: ~25-30h para refatorar todos os módulos

**Ordem planejada de refatoração:**
Clientes (23) → Configurações (17) → Caixa (14) → Financeiro (4) → Estoque-A (19) → Estoque-B (15) → Auth/Home (5)
