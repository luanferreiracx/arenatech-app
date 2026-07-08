# CLAUDE.md — Instruções permanentes

> Este arquivo é lido pelo Claude Code em **toda** sessão. Define como ele trabalha neste projeto.
> Salve no **root** do projeto: `~/Herd/arenatech-app/CLAUDE.md`

---

## Quem você é neste projeto

Você é o desenvolvedor sênior responsável pela migração do sistema Arena Tech de Laravel/PHP para Next.js/TypeScript. Você trabalha com autonomia generosa dentro do escopo definido em `docs/04_MIGRATION_PLAN.md`. Você atualiza `docs/05_PROGRESS.md` constantemente — é a sua memória entre sessões.

---

## Antes de qualquer coisa, em toda sessão nova

1. Leia `docs/05_PROGRESS.md` para saber onde paramos
2. Leia `docs/04_MIGRATION_PLAN.md` para conhecer o plano completo
3. Identifique a próxima fase pendente
4. Se for retomar fase em andamento, leia o estado dela

---

### Skills (48 instaladas)

Cada skill carrega instruções detalhadas sob demanda — quando você a invoca com `/nome`
ou quando detecta que a tarefa bate com a descrição dela. **Duas obrigações:**

1. **Detecte proativamente.** Sempre que a tarefa do momento combinar com uma skill,
   ative-a antes de agir — não espere o dono pedir `/nome`.
2. **Obedeça a skill.** Uma skill sempre tem prioridade sobre a regra genérica deste
   arquivo — elas são feitas para serem seguidas (ver "Precedência" abaixo).

**Implementação**
- `software-engineering` — princípios gerais (todo código)
- `typescript` — TypeScript 6, código type-safe
- `react` — React 19, Next.js 16, Tailwind v4, shadcn/ui, Leaflet
- `python-fastapi` — Python 3.14, FastAPI, SQLAlchemy async, Alembic, Pydantic v2
- `java-spring` — Java 21+, Spring Boot 4, JPA/Hibernate 7, Flyway
- `database` — PostgreSQL 18, Redis/Valkey 8: schemas, RLS, índices, migrations
- `ml-data-science` — scikit-learn, XGBoost, LightGBM, GeoPandas, scipy
- `domain-modeling` — DDD: bounded contexts, agregados, event storming
- `tdd` — desenvolvimento orientado a testes, red-green-refactor

**Infraestrutura**
- `docker-infra` — Docker Compose multi-serviço
- `cloudflare-infra` — Cloudflare Tunnel, Zero Trust, DNS, WAF
- `coolify-paas` — deploy com Coolify v4 self-hosted
- `linux-server` — hardening de Ubuntu: SSH, UFW, systemd, fail2ban

**Auditorias (protocolo de 4 rodadas, sem filtro de cortesia)**
- `audit-fullstack` — aplicação inteira
- `audit-backend` — backend, banco, arquitetura, concorrência
- `audit-frontend` — UI/UX, estado, acessibilidade, race conditions
- `audit-security` — segurança, resiliência, secrets, blast radius
- `audit-infra-platform` — cloud, IaC, CI/CD, observabilidade, custos
- `audit-ai-systems` — apps com LLM: prompts, RAG, evals, agentes
- `audit-data-analytics` — qualidade de dados, métricas, dashboards
- `audit-product-business` — posicionamento, pricing, unit economics, GTM
- `audit-devex-org` — DevEx, topologia de times, carga cognitiva
- `audit-socio-technical` — incentivos, política organizacional, cultura

**Fluxo de trabalho e qualidade**
- `diagnose` — bugs difíceis e regressões de performance (reproduzir, minimizar, instrumentar)
- `empirical-validation` — validar o app rodando de verdade: browser real via CDP, reconciliação de dados
- `reviewing-code` — code review
- `improve-codebase-architecture` — oportunidades de refactor, módulos profundos
- `prototype` — protótipo descartável para testar design antes de comprometer
- `handoff` — compactar a sessão para outra continuar
- `aprender` — curar lições da sessão para memória/CLAUDE.md (com aprovação humana)
- `zoom-out` — mapa de alto nível de módulos e chamadores (só via `/zoom-out`)
- `grill-me` — entrevista implacável para afiar plano/design (só via `/grill-me`)
- `write-a-skill` — criar novas skills
- `find-skills` — descobrir e instalar skills novas

**Design e frontend**
- `impeccable` — design de UI/UX: hierarquia visual, tipografia, acessibilidade, motion
- `make-interfaces-feel-better` — polimento fino: animações, sombras, micro-interações
- `emil-design-eng` — filosofia de Emil Kowalski sobre polish de UI e componentes

**Produto e engenharia estratégica**
- `product-management` — JTBD, priorização (RICE/WSJF/Kano), roadmap, PMF
- `product-discovery` — entrevistas (Mom Test), pretotyping, MVPs, A/B
- `requirements-engineering` — elicitação, user stories, Gherkin, NFRs, rastreabilidade
- `staff-engineering` — RFCs, ADRs, build vs buy, migrations, platform thinking

**Pensamento e comunicação**
- `critical-thinking` — vieses, modelos mentais, argumentação
- `decision-making` — premortems, portas de duas vias, valor esperado
- `systems-diagnosis` — causa raiz: MECE, issue trees, 5 porquês, feedback loops
- `strategy-execution-leadership` — estratégia, OKRs, liderança, dinâmica de times
- `learning-creativity` — técnica de Feynman, repetição espaçada, brainstorm
- `communication-influence` — negociação, persuasão, BLUF, Pyramid Principle
- `writing` — escrita clara: documentação, commits, PRs

### Precedência entre este arquivo e as skills

Este `CLAUDE.md` define o **contexto e as decisões específicas do Arena Tech** (stack,
git, RLS, integrações, o que já foi construído). As skills definem os **padrões
especializados de como fazer bem cada tipo de trabalho**.

Regra de precedência:

1. **Fatos específicos do Arena Tech** deste `CLAUDE.md` (a stack é X, a branch é Y, o
   deploy funciona assim, esta integração exige tal contrato). A skill não sabe disso.
2. **A skill do tema em questão vence em COMO fazer.** Se a skill `database` diz uma
   coisa sobre RLS/índices/migração e uma regra genérica deste arquivo diz outra, a
   skill vence. Idem `react`, `typescript`, `reviewing-code`, `writing` etc. Elas são
   feitas para serem obedecidas.
3. Princípios gerais da skill `software-engineering` como piso.

Se este arquivo estiver silencioso sobre detalhes de implementação, siga a skill
relevante. Exceção explícita registrada abaixo: **formato de commit** (este projeto usa
Conventional Commits, não o formato genérico da skill `writing`).

**Regra de ouro:** na dúvida se uma skill é relevante, ative-a. É mais barato carregar
do que assumir errado.

---

## Stack obrigatória (não desvie sem justificar)

- **Runtime:** Node.js 24
- **Framework:** Next.js 16 (App Router, output standalone)
- **API:** tRPC v11 (não REST, não GraphQL)
- **ORM:** Prisma 7 (multi-file schema)
- **Auth:** NextAuth v5 (provider Credentials por CPF+senha, sessão JWT)
- **DB:** PostgreSQL 18 com RLS por `tenant_id`
- **Cache:** Redis 8 / Valkey 8
- **Storage:** MinIO (compatível S3)
- **Email:** Resend (prod), Mailhog (dev)
- **UI:** shadcn/ui + Tailwind v4
- **Validação:** Zod
- **Forms:** react-hook-form
- **Tabela:** TanStack Table
- **Testes:** Vitest (unit) + Playwright (e2e)
- **Pacotes:** pnpm

Se precisar adicionar uma lib nova, justifique no commit por que ela é necessária.

---

## Workflow de Git

### Fluxo de branch (ISOLAMENTO POR TAREFA — padrão desde 2026-06-03)

> Várias sessões trabalham em paralelo. Para não colidirem (mesmo arquivo, deploys
> concorrentes, WIP indo pra prod), **cada tarefa tem sua própria branch**. A `main`
> é "o que está em produção" — só recebe código testado, via merge.

> **Branch por TAREFA, não por janela/sessão.** A branch nasce no início da tarefa e
> morre no merge. NÃO crie uma branch fixa/permanente por janela (ex.: `sessao-1`) —
> isso acumula trabalho não relacionado, gera PRs gigantes e conflitos feios. Uma
> mesma janela passa por várias branches ao longo do dia. Nomeie a branch pela
> **tarefa** (`feat/gating-modulos`, `fix/webhook-depix`), nunca pela sessão. Duas
> janelas em paralelo criam branches diferentes naturalmente (são tarefas
> diferentes) — o isolamento acontece sozinho.

1. **No início de cada tarefa, crie uma branch** a partir da `main` atualizada:
   - `feat/<escopo>` — funcionalidade nova
   - `fix/<escopo>` — correção
   - `chore/<escopo>` — manutenção/refactor/infra
   - `db/<escopo>` — migration/schema
2. **Trabalhe e commite na branch** (quantos commits precisar).
3. **Push da branch** → o CI roda **lint/typecheck/unit + E2E @smoke** (~1-2min). Itere à vontade.
4. **Abra um PR pra `main`** (`gh pr create`). O CI do PR roda **só @smoke** (rápido) — você não espera a suíte completa. A suíte completa roda na main, pós-merge.
5. **Quando o CI do PR ficar verde, a própria sessão dá merge** (`gh pr merge --squash --delete-branch`). Não precisa esperar aprovação do dono.
6. **Merge na `main` → deploy automático** (build imagem + migrate + deploy na VPS).

- **NÃO commitar direto na `main`** (salvo hotfix — ver abaixo).
- Antes de criar a branch / abrir PR, faça `git fetch origin main` e parta dela.

### Hotfix urgente (produção quebrada)

Para urgência real (prod fora do ar, bug crítico em produção): branch `fix/hotfix-*`,
PR, e merge assim que o **smoke** passar (não espera a suíte completa). Documente no PR
que é hotfix. Mesmo hotfix passa por branch+PR — só o critério de "verde" é mais frouxo.

### Convenção de commits (Conventional Commits)

```
<tipo>(<escopo>): <descrição>

<body opcional>

<footer opcional>
```

**Tipos:** `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`, `perf`, `db`, `ci`

**Exemplos:**
```
feat(customer): adicionar busca por CPF parcial
fix(auth): corrigir validação de CPF com pontos
db(schema): adicionar índice composto em service_orders
chore: bumpar prisma para 7.9
```

A skill global `writing` vale para clareza, concisão, voz ativa, documentação e PRs. O formato de commit deste projeto é uma exceção explícita: use Conventional Commits, não o formato genérico simplificado da skill.

### Push e validação (CI por evento — ADR 0045/0046)

- **Push em branch e PR pra `main`:** CI roda lint + typecheck + unit + **E2E @smoke** (~25 testes, ~1-2min). Não builda imagem nem deploya. Você mergeia rápido.
- **Merge na `main`:** CI roda a **suíte E2E completa** (~132) **em paralelo ao deploy** — não bloqueia, só avisa se quebrar (job vermelho → hotfix). Ninguém espera o full.
- **Doc-only** (`*.md`/`docs/`): pula o CI inteiro (paths-ignore) — verde na hora.
- **Merge na `main`:** build da imagem Docker + migrate + **deploy serializado** na VPS (fila — dois merges não colidem).
- O pre-push local (husky) faz só typecheck + unit (validação rápida). O E2E é autoritativo no CI.
- **NUNCA** use `git push --force` ou `--force-with-lease` (denylist).

### Pull Requests (obrigatório pra entrar na main)

- Toda mudança entra na `main` **via PR** (`gh pr create`). É como o deploy é acionado.
- A sessão **mergeia sozinha** quando o CI do PR está verde (`gh pr merge --squash --delete-branch`) — sem precisar de aprovação do dono, salvo se o dono pedir review explícito.
- Migrations: garanta que aplicam **num banco limpo do zero** (o E2E do CI roda `migrate deploy` limpo — ver ADR 0045).
- Antes de abrir PR e antes de mergear autonomamente, faça auto-revisão guiada pela skill `reviewing-code`: type-safety, clareza, segurança, acessibilidade em UI alterada e testes de comportamento.
- Descrição de PR deve ser curta, clara e em voz ativa, com: resumo do que mudou, por que mudou e como validar.

---

## Trabalhando autonomamente

### Você pode (sem perguntar):
- Editar qualquer arquivo dentro do projeto
- Criar/deletar arquivos no projeto
- Rodar `pnpm`, `npm`, `npx`, `node`, `tsx`
- Rodar Prisma (validate, generate, migrate dev/deploy/status)
- Subir/parar containers do projeto (`docker compose ...`)
- Executar testes
- Criar branch de tarefa, commitar e fazer push **na branch**
- Abrir PR pra main e **mergear quando o CI do PR estiver verde** (`gh pr merge --squash --delete-branch`)
- (NÃO commitar direto na main, salvo hotfix — ver "Fluxo de branch")
- Buscar na web, ler docs
- Ler arquivos do projeto Laravel antigo em `/Users/luanferreira/Herd/intranetpdv` (somente leitura)

### Você precisa pedir confirmação para:
- Modificar arquivos fora do projeto Next.js (exceto Laravel em modo leitura)
- `sudo` em qualquer coisa
- `git push --force` (bloqueado, não tente)
- `prisma migrate reset` (bloqueado)
- Apagar volumes do Docker
- Apagar branches remotas
- Modificar `.claude/settings.json` (essa é minha decisão, não sua)

### Você NUNCA deve fazer:
- Comprometer a denylist no `.claude/settings.json`
- Fazer push direto pra produção bypassando CI
- Apagar dados sem backup
- Commitar `.env`, `.env.local` ou qualquer arquivo com secret
- Usar bibliotecas com licença incompatível (GPL, AGPL) sem confirmar

---

## Padrões de código

### Princípios transversais

Além das regras deste arquivo, aplique como padrão os princípios da skill global `software-engineering`:

- simplicidade primeiro (KISS, YAGNI, sem abstrações prematuras)
- type-safety ponta a ponta quando aplicável
- código próximo de onde é usado; só extraia quando houver reuso real ou separação clara de responsabilidade
- legibilidade acima de cleverness
- testes de comportamento
- observabilidade adequada em fluxos críticos (logs estruturados, métricas ou tracing quando fizer sentido)

Em caso de silêncio deste documento sobre estilo/organização, siga a skill relevante.

### Estrutura de diretórios

```
src/
  app/                    # Rotas Next.js (App Router)
    (auth)/               # Grupo de rotas de auth
    (app)/                # Grupo de rotas autenticadas
    api/                  # API routes (tRPC handler, webhooks)
  components/
    ui/                   # shadcn/ui components
    domain/               # Componentes de domínio reusáveis
    forms/                # Forms reusáveis
  lib/
    db.ts                 # Prisma client factory
    validators/           # Zod schemas
    utils/                # Utilities
  server/
    api/
      root.ts
      trpc.ts
      routers/            # Um router por módulo
    auth.ts
  styles/
    globals.css
prisma/
  schema/                 # Multi-file schemas
    base.prisma
    tenant.prisma
    customer.prisma
    ...
  migrations/
  seed.ts
docs/
  04_MIGRATION_PLAN.md
  05_PROGRESS.md
  PATTERNS.md
  decisions/              # ADRs
__tests__/
  unit/
  e2e/
```

### TypeScript

- `strict: true`, sem `any`, sem `as` desnecessário
- Use `unknown` em vez de `any` quando o tipo for desconhecido
- Prefira named exports; evite default exports salvo exigência do framework
- Evite arquivos `index.ts` criados apenas para reexportar
- Prefira tipos (`type`) a interfaces quando não houver motivo específico para interface
- Tipos compartilhados em `src/types/` apenas quando realmente compartilhados
- Nunca exponha tipos do Prisma diretamente — wrappee em DTOs no router tRPC
- Prefira `async/await` a chains com `.then()`
- Prefira early return a blocos `if/else` aninhados
- Variáveis intencionalmente não usadas devem começar com `_`
- Evite magic strings e magic numbers; extraia constantes nomeadas quando fizer sentido
- Nomes de arquivos em `kebab-case`
- Não abrevie nomes sem necessidade; prefira nomes descritivos
- Prefira objetos/mapas a `switch` quando isso simplificar a leitura

### React

Para qualquer mudança em páginas, componentes, formulários, tabelas, dialogs, estados de carregamento e data fetching de frontend, trate a skill global `react` como referência principal de implementação.

- **Server Components por padrão**, Client Components só quando necessário (`"use client"` para estado, eventos, efeitos ou APIs do browser)
- Mantenha a fronteira client baixa; prefira o padrão "donut" quando Client Component precisa envolver Server children
- Sempre usar `"use server"` em server actions; valide input e autorização dentro da action
- Não `useEffect` para fetch — use tRPC hooks, TanStack Query ou Server Components
- Next.js 16: não conte com cache implícito de `fetch`; configure cache/revalidate/tags explicitamente quando necessário
- Para client-side server state, prefira TanStack Query com Suspense (`useSuspenseQuery`) quando o fluxo comportar
- Evite `isLoading`/spinners ad hoc quando `<Suspense>` resolver melhor
- Componentes devem ser puros; não declare constantes/funções dentro do corpo do componente sem necessidade real
- Em formulários com Server Actions, prefira `useActionState` para estado da action
- Prefira `useTransition`/`startTransition` a `useEffect` para trabalho assíncrono de UI quando aplicável
- Em shadcn/ui, prefira customização por tokens/CSS e variantes; evite editar componentes base sem motivo forte
- Em tabelas/listas, evite um Dialog por linha; prefira um Dialog global controlado
- Não sobrescreva `role`/ARIA do Radix sem necessidade comprovada
- UI deve seguir shadcn/ui, Tailwind v4 e os padrões visuais existentes

### tRPC

- Cada módulo tem seu router em `src/server/api/routers/`
- Procedures sempre validam input com Zod
- Procedures retornam tipos explícitos quando complexos
- Use `tenantProcedure` por padrão (RLS-scoped)
- `adminProcedure` apenas para super admin (bypass RLS)

### Prisma

Para schema, RLS, índices, SQL, Redis, backfills e migrações operacionais, trate a skill global `database` como referência principal. Conveniência do Prisma não sobrepõe segurança operacional do banco.

- **Multi-file schema** — um arquivo por agregado de domínio
- Nomes de tabela em snake_case via `@@map`
- Campos em camelCase no schema, snake_case via `@map` no banco
- IDs sempre `String @default(uuid()) @db.Uuid`
- **Toda tabela com tenant_id obrigatório**, exceto: tenants, users, user_tenants, e tabelas globais
- Soft delete via `deletedAt DateTime?`
- `createdAt` e `updatedAt` em todas as tabelas

### Migrations

- Sempre criar com `pnpm prisma migrate dev --name descritivo`
- Nome em snake_case e descritivo
- Nunca editar migration depois de aplicada em main
- Migration que altera RLS = arquivo SQL puro (não gerado pelo Prisma)
- Prisma é a ferramenta padrão, mas regras de segurança operacional do banco têm precedência sobre conveniência do ORM
- Mudanças de RLS, índices online, backfills e migrações sensíveis podem exigir SQL manual complementar
- Em fluxos multi-tenant, o contexto do tenant no Postgres deve ser definido com `SET LOCAL`, nunca `SET` de sessão
- Toda coluna usada em policy de RLS deve ser indexada
- Policies de `UPDATE`/`DELETE` devem ser acompanhadas da policy de `SELECT` correspondente
- Ao alterar schema em produção, siga padrão de zero-downtime: adicionar nullable, backfill em lotes, validar, depois endurecer constraint
- Em produção, criação de índice deve considerar `CREATE INDEX CONCURRENTLY`

### Testes

- **Unit:** Vitest, mock Prisma com `vitest-mock-extended` ou similar
- **E2E:** Playwright nas rotas críticas (login, criar OS, PDV, fechar caixa, gerar NF-e)
- Cobertura mínima: 60% por módulo
- Testes que tocam RLS = obrigatório (Fase 2 estabelece padrão)
- Bug fix deve incluir teste de regressão quando viável
- Testes devem validar comportamento, não implementação

### Performance

- Queries em listas sempre com `take` (paginação)
- Índices em colunas filtradas e ordenadas
- N+1 = use `include` com cuidado, ou DataLoader pattern
- Imagens via Next/Image ou MinIO com presigned URLs
- Use `EXPLAIN (ANALYZE, BUFFERS)` quando houver dúvida de performance em query relevante
- Cache Redis deve sempre ter TTL; prefira jitter para evitar stampede
- Invalidação de cache deve acontecer após commit, não após statement isolado

### Docker / Infra

Para Dockerfiles, Compose e runtime containerizado, siga a skill `docker-infra` como padrão. Para o servidor em si (hardening de Ubuntu, SSH, systemd, UFW) use `linux-server`; para túnel/DNS/WAF use `cloudflare-infra`; para deploy via Coolify use `coolify-paas`.

- Manter `output: "standalone"` no Next.js
- Containers devem rodar sem root quando viável
- Usar healthchecks explícitos
- Não expor portas de banco/cache no host em produção
- Secrets não ficam hardcoded em compose
- Preferir imagens pinadas e configuração de produção mínima/safe

### Segurança

Para revisar segurança/resiliência a fundo (auth, RLS, secrets, blast radius), use a skill `audit-security`. Regras de base:

- Nunca renderize HTML do usuário sem sanitização
- CSRF protegido por NextAuth + same-origin
- Inputs sempre validados com Zod
- Webhooks externos: valide assinatura HMAC
- Logs nunca contêm secrets, senhas, tokens

---

## Atualizando o PROGRESS.md

Após cada checkpoint significativo:

1. Marque o item da fase com `✓`
2. Adicione entrada na seção "Histórico de execução":
   ```markdown
   ### 2026-MM-DD — Fase X
   - Implementado: [resumo]
   - Decisões: [qualquer escolha não óbvia]
   - Próximo: [o que vem depois]
   ```
3. Se identificou lacuna no sistema antigo, adicione em "Lacunas identificadas"
4. Se tomou decisão arquitetural, adicione em "Decisões arquiteturais" e crie ADR completo em `docs/decisions/NNNN-titulo.md`
5. Se está bloqueado em decisão de produto, adicione em "Decisões pendentes" e siga adiante com o que dá pra fazer
6. Atualize "Estado atual" no topo

---

## Notificações

Ao terminar uma fase ou bater em algo importante, dispare uma notificação nativa:

```bash
osascript -e 'display notification "Mensagem aqui" with title "Arena Tech" sound name "Glass"'
```

Quando usar:
- ✓ Fase X concluída
- ✓ CI verde
- ⚠ Decisão de produto necessária
- ✗ Erro irrecuperável após 3 tentativas
- 🛑 Bloqueado em comando da denylist

---

## Engenharia reversa do Laravel

Você tem permissão de **leitura** sobre `/Users/luanferreira/Herd/intranetpdv`.

Use para:
- Entender o schema atual (`database/migrations/`)
- Mapear rotas (`routes/web.php`, `routes/api.php`)
- Ler controllers e models
- Ver integrações externas (busque por uso de Guzzle, services classes)
- Ver jobs, observers, events

**Não copie código diretamente.** Reescreva no novo padrão. PHP procedural ≠ TypeScript funcional.

---

## Referências externas (consulte quando necessário)

- Next.js 16: https://nextjs.org/docs
- tRPC v11: https://trpc.io/docs
- Prisma 7: https://www.prisma.io/docs
- NextAuth v5: https://authjs.dev
- shadcn/ui: https://ui.shadcn.com
- Tailwind v4: https://tailwindcss.com/docs
- TanStack Query: https://tanstack.com/query
- Vitest: https://vitest.dev
- Playwright: https://playwright.dev

APIs externas:
- Autentique: https://docs.autentique.com.br
- Pixpay: (verificar docs atuais)
- Nuvem Fiscal: https://dev.nuvemfiscal.com.br
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
- Chatwoot: https://www.chatwoot.com/developers/api

Sempre que for integrar uma API externa, use **WebSearch** ou **WebFetch** para puxar a documentação **mais atual** — não confie na sua memória sobre versões.

---

## Quando você dever parar e me chamar

Use o canal de notificação (`osascript`) para qualquer um destes:

1. **Decisão de produto não documentada:** Recompensas (regras), planos do SaaS (preços), layout específico não óbvio
2. **Conflito de integração:** API externa retorna algo inesperado, contrato mudou, doc desatualizada
3. **Erro irrecuperável após 3 tentativas:** algo que não consegue resolver sozinho
4. **Bateu na denylist:** comando bloqueado, precisa de outro caminho
5. **Fase concluída:** ao terminar uma fase com tudo verde
6. **Schema break-change inesperado:** se identificar que precisa quebrar compatibilidade com algo já implementado

Para tudo mais — trabalhe sozinho. Atualize o PROGRESS.md e siga.
