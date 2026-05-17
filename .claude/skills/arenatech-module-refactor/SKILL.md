# Skill: arenatech-module-refactor

## Triggers
- "refatorar E2E do módulo X para 100% @business"
- "transformar @smoke em @business no módulo X"
- "remover módulo X da whitelist do lint:e2e"

## Objetivo
Refatorar testes E2E de um módulo de @smoke (fake) para @business (real). Cada test() deve ter ação real + assertion específica conforme ADR 0036.

## Contexto crítico

ADR 0036 (Revisão 2):
- 100% @business obrigatório por arquivo
- @smoke não é mais categoria aceita
- Whitelist em `__tests__/e2e/lint-e2e.config.json` lista arquivos pendentes
- Conforme refatoração completa, módulo sai da whitelist

## Critérios de @business (linter valida)

Cada test() DEVE conter:

**1. Pelo menos UMA ação:**
- `page.fill()` seguido de submit
- `page.click()` em botão de mutation
- `page.selectOption()`, `page.check()`, `page.press()`
- `page.request.post/put/patch/delete()`

**2. Pelo menos UMA assertion específica:**
- `toHaveValue`, `toHaveCount`, `toHaveText`, `toHaveURL`
- `toBeDisabled`, `toBeEnabled`, `toBeChecked`
- `toBe` com valor específico
- `toEqual`, `toHaveProperty`, `toMatch`
- `response.ok()`, `response.json()`
- `getByText("texto específico").toBeVisible()`

**3. toContainText com regex genérico NÃO basta sozinho**

## Workflow

### Passo 1 — Diagnóstico do arquivo
```bash
# Ver estado atual
npx tsx __tests__/e2e/lint-e2e.ts
# Listar testes do módulo
grep 'test("' __tests__/e2e/<modulo>.spec.ts
```

### Passo 2 — Para cada @smoke, decidir:
- **(a) Refatorar para @business** — reescrever com ação + assertion real
- **(b) Deletar** — se outro teste já cobre a mesma página/funcionalidade
- **(c) Manter @smoke** — RARO, apenas para páginas estáticas sem lógica

### Passo 3 — Reescrever

Padrão obrigatório:
```typescript
test("@business cria cliente PF e verifica na listagem", async ({ page }) => {
  // Setup
  await login(page);
  await page.goto("/customers/new");

  // Ação (mutation)
  await page.getByLabel("Nome").fill("João Silva E2E");
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByLabel("Telefone").fill("86999991234");
  await page.getByRole("button", { name: /Cadastrar|Salvar/ }).click();

  // Assertion específica (side effect verificado)
  await expect(page).toHaveURL(/\/customers\/[a-z0-9-]+$/);
  await expect(page.getByText("João Silva E2E")).toBeVisible();
});
```

### Passo 4 — Validar
```bash
# Rodar testes do módulo
pnpm test:e2e --grep "<modulo>"  # workers=2 é padrão (ADR 0039)

# Rodar linter
pnpm test:e2e:lint

# Arquivo refatorado deve aparecer como ✅ (não mais ⚠️)
```

### Passo 5 — Remover da whitelist
Editar `__tests__/e2e/lint-e2e.config.json`:
- Remover entrada do array `pendingRefactor`
- Rodar `pnpm test:e2e:lint` — deve passar

### Passo 6 — Commit e push
```bash
git add __tests__/e2e/<modulo>.spec.ts __tests__/e2e/lint-e2e.config.json
git commit -m "refactor(e2e): <modulo> 100% @business — removido da whitelist"
git push  # pre-push hook valida automaticamente
```

## Helpers (REUSAR)
- `__tests__/e2e/helpers/cashier.helper.ts` — loginAs, goToCashier
- Padrão de login: `waitForLoadState("networkidle")`
- Criar helpers específicos do módulo se necessário (via API, não UI)

## Critério de pronto
- 100% dos testes do arquivo são @business válidos
- Linter valida sem erro
- Arquivo removido de `pendingRefactor`
- Push aceito pelo pre-push hook (sem --no-verify)
- Sem regressão em outros arquivos

## Output
- Arquivo .spec.ts 100% @business
- lint-e2e.config.json atualizado
- `docs/05_PROGRESS.md` atualizado com novo % business
- Push limpo
- Notificação: `osascript -e 'display notification "Módulo X: 100% @business" with title "Arena Tech" sound name "Glass"'`
