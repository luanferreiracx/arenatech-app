# ADR 0045 — Deploy serializado + E2E em paralelo (não bloqueia deploy)

Data: 2026-06-03
Status: Aceito

## Contexto

Dois problemas operacionais no CI/CD:

1. **Deploys concorrentes colidiam.** O `concurrency` global do workflow usava
   `cancel-in-progress: false` na `main`, mas o group era por `ref`. Dois pushes
   próximos na `main` rodavam o job `deploy` **em paralelo na mesma VPS** —
   `git reset --hard origin/main` + `docker compose up` + `prisma migrate deploy`
   simultâneos, pisando um no outro. Sessões distintas deployando perto no tempo =
   corrida real.

2. **Percepção de "deploy lento por E2E".** Histórico: o pre-push rodava a suíte
   E2E completa (~4min, + flakiness do Turbopack dev travando pushes legítimos).
   Isso já tinha sido simplificado (commit `20dab70`: pre-push = typecheck+unit).
   Efeito colateral: **E2E não rodava em lugar nenhum** — regressões passavam
   direto pra prod. O tempo real do CI (~6min) é dominado pelo **build Docker
   (~3min)**, não por E2E.

## Decisão

**Deploy serializado (fila), E2E no CI em paralelo sem bloquear o deploy.**

### 1. Serializar o job de deploy
`concurrency` DEDICADO no job `deploy`:
```yaml
concurrency:
  group: deploy-vps-production   # group fixo: toda a main na MESMA fila
  cancel-in-progress: false      # 2o deploy ESPERA o 1o (não cancela, não perde)
```
- Group fixo (não por ref/sha) → todos os deploys entram numa fila única.
- `cancel-in-progress: false` → o segundo deploy aguarda o primeiro terminar.
- Só o **deploy** serializa; lint/typecheck/test/build continuam paralelos.
- Idempotência preservada: o deploy faz `git reset --hard origin/main` +
  `migrate deploy`, sempre convergindo para o commit mais recente.

### 2. E2E no CI, paralelo, não-bloqueante
Job `e2e` que:
- `needs: build-image` (parte da imagem pronta), mas **NÃO** é `needs` do
  `deploy` → roda em paralelo ao deploy e não o atrasa.
- Roda contra a **imagem Docker buildada** (mesma de prod) — sem Turbopack dev,
  elimina a flakiness que era a dor original. Postgres+Redis como services,
  `migrate deploy` + `seed`, sobe o container, Playwright via
  `PLAYWRIGHT_BASE_URL`.
- Se quebrar: job vermelho (você é avisado, report como artifact) mas o deploy
  já seguiu. Recupera cobertura sem custo no caminho crítico.

## Consequências

- **Positivas:** sem corrida de deploy; E2E volta a rodar (estável, contra
  imagem de prod); push rápido; deploy não espera E2E.
- **Trade-off aceito:** E2E não bloqueia o deploy — uma regressão de E2E pode ir
  a prod, mas você é avisado imediatamente para hotfix. Escolhido por causa da
  flakiness histórica que travava deploys legítimos.
- **Limite conhecido (deploy manual):** a fila protege deploys **via push**. Um
  `docker compose up --force-recreate` MANUAL na VPS durante um deploy do CI
  ainda pode colidir (o flock na VPS — não adotado agora — cobriria isso).
  **Procedimento:** não fazer recreate manual com deploy do CI em andamento;
  checar `gh run list` antes. Se manutenção manual virar rotina, revisitar com
  flock (cinto-e-suspensório).
