# Diagnóstico: E2E Clientes — falhas de renderização

> Data: 2026-05-17

## Como o app real seta o cookie de tenant

1. **Single-tenant user** (operator, CPF 52998224725): JWT callback em `src/server/auth.ts:78` auto-seta `activeTenantId` no token se `userTenants.length === 1`. Cookie `x-active-tenant` NÃO é setado explicitamente — o proxy em `src/proxy.ts:94` usa fallback `session.activeTenantId` do JWT.

2. **Multi-tenant user**: após login, redireciona para `/select-tenant`. Ao clicar no tenant, chama `switchTenantAction()` em `src/app/actions/auth.ts:77` que seta cookie `x-active-tenant` via `cookieStore.set()`.

3. **Layout `(app)/layout.tsx:16-17`**: lê `cookieStore.get("x-active-tenant")?.value ?? session.activeTenantId`. Funciona para ambos os casos.

## O que o helper de login atual faz

O helper em `__tests__/e2e/helpers/cashier.helper.ts` (usado por customers.spec.ts via `login()` inline que é cópia do mesmo padrão):
1. Navega para `/login`
2. Preenche CPF + senha do operator (single-tenant)
3. Clica "Entrar"
4. `waitForLoadState("networkidle")`
5. NÃO seta cookie `x-active-tenant` explicitamente — depende do JWT auto-set

## Gap identificado

**O cookie NÃO é o problema.** O operator single-tenant funciona sem cookie explícito — o JWT contém `activeTenantId` e o layout faz fallback corretamente. Isso é confirmado pelo fato de que:
- Sidebar renderiza com nome do tenant ("Arena Tech")
- Testes de busca e listagem FUNCIONAM (8/20 passam)
- O layout `{children}` também deveria renderizar

## Causa real das falhas

Após investigação, os 4 testes que falham CONSISTENTEMENTE (mesmo com warmup, 1 worker, 90s timeout) são:

1. **T-1** (`/customers/new`): `fillField` executa sem erro, mas `getByRole("button", { name: /Cadastrar cliente/ })` retorna "element(s) not found". O page snapshot mostra sidebar mas main content vazio.

2. **T-10** (`/customers`): `locator("table tbody tr").first()` timeout — tabela não tem rows (sem seed data no DB).

3. **T-13** (`/customers`): `getByRole("link", { name: /Novo Cliente/ })` timeout — link não encontrado em 15s.

4. **T-14** (`/customers`): `getByRole("heading", { name: "Clientes" })` timeout — heading não encontrado em 15s.

**Padrão comum:** a page renderiza sidebar (layout) mas o conteúdo principal (children) não aparece. Isso é consistente com:
- **Turbopack first-compile race:** a primeira vez que uma rota é acessada no dev mode, Turbopack compila o chunk on-demand. Se múltiplos testes acessam rotas diferentes simultaneamente, a compilação pode demorar mais que o timeout.
- **RSC streaming incompleto:** o Server Component renderiza parcialmente (layout OK, children pendente) e Playwright avalia o DOM antes do streaming RSC terminar.

## Evidência

- Testes de Clientes/Configurações/Caixa passavam como @smoke porque SÓ verificavam `toContainText(regex)` que matcha o sidebar (não precisa de children).
- Quando refatoramos para @business (que interage com form no children), falhas apareceram.
- O mesmo `/customers/new` funciona perfeitamente no browser real (abrir manualmente).

## Solução proposta

Adicionar ao login helper: **navegação de warmup** antes de interagir. Após login, fazer `page.goto("/customers")` → `waitForSelector("main h1")` ou similar que garante que o children renderizou. Depois redirecionar para a rota alvo.

Alternativa: aumentar timeout do `waitForLoadState` para 60s e usar `page.waitForSelector` em vez de `waitForLoadState("networkidle")` — `networkidle` não espera RSC streaming terminar.
