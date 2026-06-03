# ADR 0046 — Isolamento por branch: branch por tarefa, merge deploya

Data: 2026-06-03
Status: Aceito

## Contexto

Várias sessões (janelas) do Claude trabalham em paralelo, todas commitando **direto
na `main`**. Isso causava três dores recorrentes:

1. **Colisão de arquivo em tempo real** — sessões editando o mesmo arquivo
   (`service-order.ts`, `nav-items.ts`, `templates-catalog.ts`) tinham que costurar
   manualmente o trabalho uma da outra.
2. **Deploys concorrentes** — dois pushes próximos na main disparavam deploy
   simultâneo na VPS (mitigado pela fila do ADR 0045, mas a raiz era todos na main).
3. **WIP indo direto pra produção** — qualquer push na main buildava e deployava;
   não havia "rascunho".

Restrição: repo privado em plano **sem branch protection** (não dá pra *forçar* PR
pelo GitHub). A disciplina é por convenção (CLAUDE.md) + pelo design do CI.

## Decisão

**Branch por tarefa; a `main` só recebe via PR; o merge aciona o deploy.**

### Fluxo
1. Cada tarefa → branch `feat/*` `fix/*` `chore/*` `db/*` a partir da `main`.
2. Push na branch → CI roda **lint + typecheck + unit + E2E @smoke** (rápido).
3. PR pra `main` → CI roda a **suíte E2E completa**.
4. CI do PR verde → a própria sessão mergeia (`gh pr merge --squash --delete-branch`).
   Sem aprovação manual do dono (salvo pedido explícito).
5. Merge na `main` → build imagem + migrate + **deploy** (serializado, ADR 0045).

### E2E adaptativo (custo x confiança)
O E2E roda contra `next build && next start` (produção local, sem Turbopack →
sem flakiness), com escopo por evento:
- **push de branch:** `@smoke` (~25 testes, ~1min) — loop de dev rápido.
- **PR / main:** suíte completa (~132) — portão antes do merge.

Não buildamos imagem Docker em branch/PR (evita ~3min + poluir o registry); a
imagem só é buildada na main, no deploy.

## Consequências

- **Positivas:** sem colisão de arquivo em tempo real (resolve no merge); `main`
  sempre deployável; WIP não vai pra prod; rastreabilidade via PR; rollback por
  `revert` do merge. Mantém deploy automático (gatilho: push→merge).
- **Trade-off:** um passo a mais (abrir/mergear PR) entre terminar e deployar.
  Mitigado: a sessão mergeia sozinha quando verde (não bloqueia no dono).
- **Hotfix:** mesmo via branch+PR, mas mergeia assim que o `@smoke` passa (não
  espera a suíte completa).
- **Limite:** sem branch protection, nada *impede* tecnicamente um commit direto na
  main — é convenção. Se o plano do GitHub mudar, adicionar required status checks.

## Relacionado
ADR 0045 (deploy serializado + E2E paralelo) — este ADR move o gatilho do deploy
de "push na main" para "merge na main" e adiciona o escopo smoke/full por evento.
