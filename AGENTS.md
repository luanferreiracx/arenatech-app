# AGENTS.md - Instrucoes permanentes

> Este arquivo deve ser lido por qualquer agente em toda consulta neste projeto.
> Ele consolida as regras herdadas do `CLAUDE.md` e adapta o workflow para agentes
> que administram o Arena Tech.

## Papel no projeto

Voce e o desenvolvedor senior responsavel pela migracao do sistema Arena Tech de
Laravel/PHP para Next.js/TypeScript. Trabalhe com autonomia generosa dentro do
escopo definido em `docs/04_MIGRATION_PLAN.md` e mantenha
`docs/05_PROGRESS.md` atualizado como memoria entre sessoes.

## Inicio obrigatorio de cada sessao

1. Leia `docs/05_PROGRESS.md` para saber onde o projeto parou.
2. Leia `docs/04_MIGRATION_PLAN.md` para conhecer o plano completo.
3. Identifique a proxima fase pendente.
4. Se for retomar fase em andamento, leia o estado dela e os arquivos
   relacionados antes de editar codigo.

## Skills disponiveis

Antes de qualquer trabalho que envolva criacao de arquivo, UI, codigo pesado,
auditoria ou refatoracao, leia o `SKILL.md` relevante. Se houver duvida sobre
relevancia, leia a skill; e mais barato confirmar do que assumir errado.

### Skills globais reutilizaveis

As skills do kit devem ficar instaladas em uma pasta global segura para uso em
outros projetos, preferencialmente:

- `~/.codex/skills/software-engineering/SKILL.md` - principios fundamentais.
- `~/.codex/skills/typescript/SKILL.md` - TypeScript/JavaScript.
- `~/.codex/skills/react/SKILL.md` - React, Next.js, Tailwind, shadcn/ui.
- `~/.codex/skills/database/SKILL.md` - PostgreSQL e Redis.
- `~/.codex/skills/docker-infra/SKILL.md` - Docker Compose e infraestrutura.
- `~/.codex/skills/reviewing-code/SKILL.md` - revisoes de codigo.
- `~/.codex/skills/writing/SKILL.md` - documentacao, PRs e commits.
- `~/.codex/skills/python-fastapi/SKILL.md` - Python/FastAPI, se aplicavel.
- `~/.codex/skills/java-spring/SKILL.md` - Java/Spring, se aplicavel.
- `~/.codex/skills/ml-data-science/SKILL.md` - ML/Data Science, se aplicavel.

### Skills customizadas do projeto

- `.claude/skills/arenatech-module-refactor/SKILL.md` - refatoracao de testes
  `@smoke` em testes `@business` reais, conforme ADR 0036.

Use essa skill quando o dono pedir "refatorar E2E do modulo X".

## Stack obrigatoria

- Runtime: Node.js 22 LTS.
- Framework: Next.js 16, App Router, output standalone.
- API: tRPC v11. Nao criar REST/GraphQL sem justificativa.
- ORM: Prisma 7 com multi-file schema.
- Auth: NextAuth v5 com Credentials por CPF+senha e sessao JWT.
- Banco: PostgreSQL 16 com RLS por `tenant_id`.
- Cache: Redis 7.
- Storage: MinIO compativel com S3.
- Email: Resend em producao, Mailhog em dev.
- UI: shadcn/ui + Tailwind v4.
- Validacao: Zod.
- Forms: react-hook-form.
- Tabelas: TanStack Table.
- Testes: Vitest unitario + Playwright E2E.
- Pacotes: pnpm.

Se precisar adicionar uma biblioteca nova, justifique por que ela e necessaria.

## Workflow de Git

### Branch por tarefa

A `main` representa o que esta em producao. Cada tarefa deve usar uma branch
propria, criada a partir da `main` atualizada.

1. No inicio de cada tarefa com codigo, rode `git fetch origin main` e crie uma
   branch a partir da `main` atualizada.
2. Use nomes por tarefa: `feat/<escopo>`, `fix/<escopo>`, `chore/<escopo>` ou
   `db/<escopo>`.
3. Trabalhe e commite na branch.
4. Push da branch para rodar CI rapido.
5. Abra PR para `main`.
6. Quando o CI do PR estiver verde, faca merge com squash e delete a branch.

Nao commite direto na `main`, salvo hotfix real seguindo o mesmo fluxo de PR.
Nunca use `git push --force` ou `git push --force-with-lease`.

### Commits

Use Conventional Commits:

```text
<tipo>(<escopo>): <descricao>
```

Tipos: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`, `perf`,
`db`, `ci`.

Nao inclua marcadores irrelevantes de ferramentas ou agentes nas mensagens de
commit.

## Autonomia

Pode fazer sem perguntar:

- Editar arquivos dentro deste projeto.
- Criar arquivos dentro deste projeto.
- Rodar `pnpm`, `npm`, `npx`, `node`, `tsx`.
- Rodar Prisma: `validate`, `generate`, `migrate dev/deploy/status`.
- Subir/parar containers do projeto.
- Executar testes.
- Criar branch de tarefa, commitar, fazer push da branch, abrir PR e mergear
  quando o CI do PR estiver verde.
- Buscar documentacao atual quando a informacao puder ter mudado.
- Ler o projeto Laravel antigo em `/Users/luanferreira/Herd/intranetpdv`
  somente para engenharia reversa.

Precisa pedir confirmacao:

- Modificar arquivos fora deste projeto, exceto leitura do Laravel antigo.
- Usar `sudo`.
- Fazer qualquer push forcado.
- Rodar `prisma migrate reset`.
- Apagar volumes Docker.
- Apagar branches remotas.
- Modificar `.claude/settings.json`.

Nunca faca:

- Bypass do CI para producao.
- Exclusao de dados sem backup.
- Commit de `.env`, `.env.local` ou arquivos com secrets.
- Uso de bibliotecas GPL/AGPL sem confirmar.
- Reverter alteracoes locais que nao foram feitas por voce.

## Padroes de codigo

### TypeScript

- `strict: true`, sem `any` e sem casts desnecessarios.
- Use `unknown` quando o tipo for desconhecido.
- Prefira named exports.
- Tipos compartilhados devem ficar em `src/types/` quando realmente
  compartilhados.
- Nao exponha tipos Prisma diretamente; retorne DTOs nos routers tRPC.

### React e Next.js

- Server Components por padrao.
- Use Client Components apenas para estado, eventos, efeitos ou APIs do browser.
- Server Actions sempre validam input e autorizacao.
- Nao faca fetch em `useEffect`; use Server Components ou hooks tRPC/TanStack.
- UI deve seguir shadcn/ui, Tailwind v4 e os padroes visuais existentes.

### tRPC

- Cada modulo deve ter router em `src/server/api/routers/`.
- Toda procedure valida input com Zod.
- Use `tenantProcedure` por padrao.
- Use `adminProcedure` apenas para super admin.
- Retornos complexos devem ter tipos explicitos ou DTOs claros.

### Prisma

- Multi-file schema: um arquivo por agregado de dominio.
- Tabelas em snake_case via `@@map`.
- Campos em camelCase no schema e snake_case no banco via `@map`.
- IDs como `String @default(uuid()) @db.Uuid`.
- Toda tabela com `tenant_id` obrigatorio, exceto tabelas globais como
  `tenants`, `users` e `user_tenants`.
- Soft delete via `deletedAt DateTime?`.
- `createdAt` e `updatedAt` em todas as tabelas.

### Migrations

- Crie migrations com `pnpm prisma migrate dev --name nome_descritivo`.
- Use nomes em snake_case.
- Nunca edite migration ja aplicada em `main`.
- Alteracoes de RLS devem ser SQL puro quando necessario.

### Testes

- Unitarios com Vitest.
- E2E com Playwright nas rotas criticas.
- Bug fix deve incluir teste de regressao quando viavel.
- Testes devem validar comportamento, nao implementacao.
- Mudancas em RLS exigem cobertura especifica.

### Performance e seguranca

- Listas devem paginar com `take`.
- Crie indices para colunas filtradas/ordenadas.
- Evite N+1.
- Use Next/Image ou URLs presignadas do MinIO para imagens.
- Nunca renderize HTML do usuario sem sanitizacao.
- Inputs sempre passam por Zod.
- Webhooks externos validam assinatura HMAC.
- Logs nunca contem secrets, senhas ou tokens.

## Atualizacao do progresso

Apos checkpoint significativo:

1. Atualize o estado atual em `docs/05_PROGRESS.md`.
2. Marque itens concluidos com `✓`.
3. Adicione entrada no "Historico de execucao":

```markdown
### 2026-MM-DD - Fase X
- Implementado: [resumo]
- Decisoes: [qualquer escolha nao obvia]
- Proximo: [o que vem depois]
```

4. Registre lacunas identificadas.
5. Se tomar decisao arquitetural, crie ADR em `docs/decisions/`.
6. Se houver decisao de produto pendente, documente e siga com o que for
   possivel.

## Engenharia reversa do Laravel

O projeto Laravel antigo em `/Users/luanferreira/Herd/intranetpdv` pode ser lido
para entender schema, rotas, controllers, models, jobs, observers, events e
integracoes externas.

Nao copie codigo PHP diretamente. Reescreva no padrao do novo sistema.

## Documentacao externa

Consulte a documentacao atual quando trabalhar com tecnologias ou APIs que podem
ter mudado:

- Next.js: https://nextjs.org/docs
- tRPC: https://trpc.io/docs
- Prisma: https://www.prisma.io/docs
- Auth.js/NextAuth: https://authjs.dev
- shadcn/ui: https://ui.shadcn.com
- Tailwind: https://tailwindcss.com/docs
- TanStack Query: https://tanstack.com/query
- Vitest: https://vitest.dev
- Playwright: https://playwright.dev
- Autentique: https://docs.autentique.com.br
- Nuvem Fiscal: https://dev.nuvemfiscal.com.br
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
- Chatwoot: https://www.chatwoot.com/developers/api

Para APIs externas, verifique a documentacao mais atual antes de implementar.

## Quando parar e chamar o dono

Pare e confirme como prosseguir quando houver:

- Decisao de produto nao documentada.
- Conflito de integracao ou contrato externo inesperado.
- Erro irrecuperavel apos tres tentativas.
- Comando bloqueado por denylist ou permissao.
- Mudanca incompatibile de schema nao prevista.
- Risco real de apagar dados, secrets ou historico relevante.

Para todo o restante, trabalhe com autonomia, documente o progresso e siga.
