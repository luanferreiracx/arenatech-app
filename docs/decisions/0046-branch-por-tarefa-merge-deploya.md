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

### E2E adaptativo (custo x confiança) — REVISADO 2026-06-03
O E2E roda contra `next build && next start` (produção local, sem Turbopack →
sem flakiness), com escopo por evento. **Objetivo: ninguém espera o full.**
- **push de branch E PR pra main:** `@smoke` (~25 testes, ~1min) — iteração e
  merge rápidos.
- **merge na main (push):** suíte completa (~132) **em paralelo ao deploy** — o
  deploy não tem `needs: e2e`, então o full não bloqueia; só avisa (job vermelho
  → hotfix).

(Versão inicial deste ADR rodava full no PR, fazendo esperar ~7min por merge —
inclusive em PR de doc. Corrigido: full saiu do PR e foi pro pós-merge na main.)

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

## Docs-only pulam o CI (paths-ignore)

Mudanças que tocam **só** `**.md` / `docs/**` / `.vscode/**` não disparam o CI
(via `paths-ignore` nos triggers). Não há código a testar/buildar/deployar — o PR
de doc fica verde na hora, sem esperar a suíte E2E (~7min). PR que mistura doc +
código dispara o CI normalmente.

## Tempos reais (medidos 2026-06-03)

- **Deploy de código na main:** ~2min40 total (setup 31s + lint/typecheck/test em
  paralelo ~67s + build Docker **41s com cache GHA** + deploy ~30s). Saudável.
- **PR de código:** + E2E full ~7min (portão antes do merge — vale uma vez).
- **Push de branch:** lint/typecheck/test + E2E @smoke ~2-3min.

O "deploy demorava 10min" reportado era um **PR de documentação rodando E2E full
desnecessariamente** — corrigido pelo paths-ignore, não era o deploy em si.

## Addendum (2026-06-25): full cresceu, timeout ajustado

A estimativa de "~7min" para o full ficou desatualizada. A suíte cresceu para
~126 testes e roda **serial** (workers=1 em CI, ADR 0039), levando hoje ~25min
(setup ~9min + testes ~16min). O job `e2e` tinha `timeout-minutes: 18` e o full
era **cancelado no meio toda run da main** — ou seja, o "só avisa" não avisava
nada há dias (sinal zero; na prática só o @smoke validava). Ajustado para
`timeout-minutes: 35` para o full completar e voltar a avisar. Continua advisory
(deploy não tem `needs: e2e`). Se o full crescer muito mais, considerar shard
(matrix `--shard`, workers=1 por shard) em vez de subir timeout indefinidamente.

## Relacionado
ADR 0045 (deploy serializado + E2E paralelo) — este ADR move o gatilho do deploy
de "push na main" para "merge na main" e adiciona o escopo smoke/full por evento.
