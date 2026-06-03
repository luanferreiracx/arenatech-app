# CLAUDE.md — Instruções permanentes

> Este arquivo é lido pelo Claude Code em **toda** sessão. Define como ele trabalha neste projeto.
> Salve no **root** do projeto: `~/dev/arenatech-app/CLAUDE.md`

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

## Skills Anthropic disponíveis

Antes de **qualquer** trabalho que envolva criação de arquivo ou código pesado, leia o SKILL.md relevante:

- **`/mnt/skills/public/frontend-design/SKILL.md`** — antes de criar qualquer componente UI, página, layout, formulário. Skill obrigatória para Fases 4+
- **`/mnt/skills/public/docx/SKILL.md`** — se for gerar documentação Word (raro neste projeto)
- **`/mnt/skills/public/pdf/SKILL.md`** — se for gerar PDF (Fase 7 — geração de PDF da OS)
- **`/mnt/skills/public/pptx/SKILL.md`** — se for gerar apresentação (raro neste projeto)
- **`/mnt/skills/public/file-reading/SKILL.md`** — antes de processar uploads do usuário
- **`/mnt/skills/public/skill-creator/SKILL.md`** — se identificar um padrão repetível e quiser criar uma skill nova

Skills do usuário em `/mnt/skills/user/` também devem ser consideradas — sempre que aparecer uma, prefira a do usuário em caso de conflito com as públicas.

### Skills customizadas do projeto

- **`.claude/skills/arenatech-module-audit/SKILL.md`** — protocolo de auditoria de módulo (diagnóstico → AUDIT_REPORT → correções → documentação)
- **`.claude/skills/arenatech-module-refactor/SKILL.md`** — refatoração de testes @smoke em @business reais (ADR 0036)

Usar quando o dono pedir "auditar módulo X" ou "refatorar E2E do módulo X".

**Regra de ouro:** se você não tem certeza se uma skill é relevante, leia o SKILL.md. É mais barato ler do que assumir errado.

---

## Stack obrigatória (não desvie sem justificar)

- **Runtime:** Node.js 22 (LTS)
- **Framework:** Next.js 15 (App Router, output standalone)
- **API:** tRPC v11 (não REST, não GraphQL)
- **ORM:** Prisma 6 (multi-file schema)
- **Auth:** NextAuth v5 (provider Credentials por CPF+senha, sessão JWT)
- **DB:** PostgreSQL 16 com RLS por `tenant_id`
- **Cache:** Redis 7
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
chore: bumpar prisma para 6.2
```

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
- Tipos compartilhados em `src/types/`
- Nunca exponha tipos do Prisma diretamente — wrappee em DTOs no router tRPC

### React

- **Server Components por padrão**, Client Components só quando necessário (`"use client"`)
- Sempre usar `"use server"` em server actions
- Não `useEffect` para fetch — use tRPC hooks ou Server Components

### tRPC

- Cada módulo tem seu router em `src/server/api/routers/`
- Procedures sempre validam input com Zod
- Procedures retornam tipos explícitos quando complexos
- Use `tenantProcedure` por padrão (RLS-scoped)
- `adminProcedure` apenas para super admin (bypass RLS)

### Prisma

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

### Testes

- **Unit:** Vitest, mock Prisma com `vitest-mock-extended` ou similar
- **E2E:** Playwright nas rotas críticas (login, criar OS, PDV, fechar caixa, gerar NF-e)
- Cobertura mínima: 60% por módulo
- Testes que tocam RLS = obrigatório (Fase 2 estabelece padrão)

### Performance

- Queries em listas sempre com `take` (paginação)
- Índices em colunas filtradas e ordenadas
- N+1 = use `include` com cuidado, ou DataLoader pattern
- Imagens via Next/Image ou MinIO com presigned URLs

### Segurança

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

- Next.js 15: https://nextjs.org/docs
- tRPC v11: https://trpc.io/docs
- Prisma 6: https://www.prisma.io/docs
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
