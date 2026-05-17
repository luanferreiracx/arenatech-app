# ADR 0035 — E2E obrigatório antes de push (pre-push hook)

**Status:** Aceito
**Data:** 2026-05-17
**Contexto:** Pós-mortem da refatoração — descoberta de testes E2E nunca executados

## Contexto

Durante a refatoração dos módulos Clientes, Configurações e início de Caixa, foi detectado que os testes E2E (Playwright) nunca haviam sido executados desde o início do projeto. Os módulos foram marcados como "test ✓" baseados exclusivamente em:

1. `pnpm typecheck` — valida tipos, não comportamento
2. `pnpm test` — roda apenas Vitest em `__tests__/unit/`, ignora `__tests__/e2e/`
3. `pnpm build` — não executa testes

Causa raiz: o pipeline de validação manual do agente de implementação não incluía `pnpm test:e2e`. Os arquivos `.e2e.spec.ts` existiam como código compilável (passavam typecheck) mas nunca tocavam o server real. O CI também não executa E2E por padrão (decisão de velocidade).

Quando os E2E foram finalmente executados (módulo Caixa), 9 de 25 cenários falharam em Clientes e Financeiro — não por bug da aplicação, mas porque os helpers de login tinham rotas, placeholders e senhas incorretos. Indicando que nunca haviam sido executados sequer 1x.

## Decisão

1. **Adicionar Husky pre-push hook** que executa typecheck + unit + E2E antes de qualquer push aceitar
2. **Atualizar CLAUDE.md e PATTERNS.md** com Definition of Done obrigatório, incluindo E2E como critério não-negociável
3. **Manter `reuseExistingServer: true`** no playwright.config para evitar conflito de portas
4. **CI continua sem E2E** (decisão de velocidade preservada), mas pre-push hook compensa

## Consequências

**Positivas:**
- Impossível pushar código com E2E vermelho sem bypass explícito (`--no-verify`)
- Bypass fica registrado no histórico do git e pode ser auditado
- Desenvolvedor recebe feedback em ~30s-2min antes do push, não após merge

**Negativas:**
- Push fica mais lento (tempo dos E2E + setup do dev server se não estiver rodando)
- Workflow exige dev server ativo em outra aba durante desenvolvimento
- Hotfixes urgentes precisam de `--no-verify` consciente

## Alternativas consideradas

- **CI rodando E2E em todo PR:** mais robusto, mas adiciona 3-5min em cada PR. Rejeitado por agora
- **Apenas regra documental no SPEC:** rejeitado — foi exatamente o que falhou anteriormente
- **Pre-commit hook em vez de pre-push:** rejeitado — commits frequentes durante desenvolvimento ficariam lentos demais
