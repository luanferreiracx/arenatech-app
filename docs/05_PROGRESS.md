# 05 — PROGRESS

> Este arquivo é a **memória viva** do projeto. Claude atualiza após cada checkpoint.
> Você consulta com `arena-progress` de qualquer lugar.

---

## Estado atual

**Fase atual:** Fase 3 — Auth (EM ANDAMENTO)
**Última atualização:** 2026-05-08
**Branch atual:** `main`
**Commits desde último deploy:** 6

---

## Fases

### ✓ Fase 0 — Bootstrap & infra local
- [x] Diagnóstico do ambiente
- [x] Docker Compose criado (postgres:16, redis:7, minio, mailhog)
- [x] Stack subindo — todos healthy (postgres, redis, minio, mailhog)
- [x] Mapeamento .env do Laravel → .env.example + .env.local
- [x] MIGRATION_NOTES.md com inventário do legado
- [x] Commit final

### ✓ Fase 1 — Esqueleto Next.js + tRPC + Prisma
- [x] create-next-app (Next.js 16.2.5, App Router, standalone)
- [x] TypeScript estrito (strict + noUncheckedIndexedAccess + noImplicitOverride)
- [x] ESLint flat config (eslint.config.mjs) + Prettier
- [x] tRPC v11 estruturado (server + client + API route)
- [x] Prisma 7 multi-file schema (prismaSchemaFolder preview)
- [x] NextAuth v5 placeholder
- [x] shadcn/ui inicializado (new-york, slate, 22 componentes)
- [x] Vitest + Playwright configurados
- [x] Hello World tRPC (`/` → "olá" via server caller)
- [x] typecheck ✓ | lint ✓ | test ✓ | e2e ✓ | build ✓
- [x] Commit final

### ✓ Fase 2 — Schema base + RLS
- [x] Schema Tenant + User + UserTenant + AuditLog (Prisma 7 multi-file)
- [x] Convenções documentadas em docs/PATTERNS.md
- [x] Migration RLS aplicada (current_tenant_id(), policies, FORCE ROW LEVEL SECURITY)
- [x] Cliente Prisma com tenant scoping (withTenant, withAdmin via $transaction + SET LOCAL)
- [x] Roles app_user (RLS) / app_admin (BYPASSRLS) criadas
- [x] Seed idempotente (tenant arena-tech + super admin via env)
- [x] Suite de testes RLS: 6 cenarios passando (isolamento, WITH CHECK, bypass, defense in depth)
- [x] ADR 0001 em docs/decisions/
- [x] typecheck ✓ | lint ✓ | test ✓ | e2e ✓ | build ✓
- [x] Commit final

### ☐ Fase 3 — Auth
- [ ] Provider Credentials (CPF + senha)
- [ ] JWT callbacks
- [ ] Resolução de tenant (subdomain/cookie)
- [ ] Middleware Edge
- [ ] Procedures protegidas
- [ ] Telas de login/logout/forgot/reset
- [ ] E2E auth
- [ ] Commit final

### ☐ Fase 4 — Design system + layout
- [ ] Tokens de tema (escuro default)
- [ ] Layout shell (sidebar/header/content)
- [ ] Componentes de domínio (data-table, forms, etc)
- [ ] Command palette
- [ ] Toast system
- [ ] Página /dev/components
- [ ] Commit final

### ☐ Fase 5 — Configurações + Catálogo + Clientes
- [ ] Configurações (6 submódulos)
- [ ] Catálogo (4 submódulos)
- [ ] Clientes (4 submódulos)
- [ ] PATTERNS.md documentado
- [ ] Testes verdes
- [ ] Commit final

### ☐ Fase 6 — Estoque + Caixa + Financeiro
- [ ] Estoque
- [ ] Caixa
- [ ] Financeiro
- [ ] Saques Depix
- [ ] Testes verdes
- [ ] Commit final

### ☐ Fase 7 — Ordens de Serviço (CRÍTICO)
- [ ] Schema OS + items + history
- [ ] Wizard de criação
- [ ] Mudança de status com regras
- [ ] Geração de PDF
- [ ] Integração Autentique
- [ ] Integração Depix/PixPay
- [ ] Envio WhatsApp (Evolution API)
- [ ] E2E completo
- [ ] Commit final

### ☐ Fase 8 — PDV
- [ ] Tela de venda
- [ ] Carrinho com cálculo
- [ ] Split payment
- [ ] Comissões
- [ ] PIX (Depix)
- [ ] E2E completo
- [ ] Commit final

### ☐ Fase 9 — Fiscal (paralelizável)
### ☐ Fase 10 — Comissões (paralelizável)
### ☐ Fase 11 — Operação (paralelizável)
### ☐ Fase 12 — Consulta IMEI (paralelizável)
### ☐ Fase 13 — Comunicação (paralelizável)
### ☐ Fase 14 — Recompensas (paralelizável, requer decisão prévia)
### ☐ Fase 15 — Admin Central (paralelizável)

### ☐ Fase 16 — Hardening
### ☐ Fase 17 — Cutover

---

## Decisões pendentes (Claude registra aqui)

> Quando Claude precisa de uma decisão de produto sua, registra aqui em vez de pausar a execução. Continua com o que dá pra fazer e aguarda sua resposta.

### 2026-05-08 — Catálogo público (catalogo.arenatechpi.com.br)
O sistema Laravel tem um e-commerce completo separado (`catalogo.arenatechpi.com.br`) com VendaBot via WhatsApp. Está no escopo da migração? Se sim, em qual fase? Atualmente não está mapeado em nenhuma fase do plano.

### 2026-05-08 — Provider de NF-e
O sistema Laravel tem tanto Nuvem Fiscal quanto Focus NFe implementados via interface. Qual vai ser o provider padrão no Next.js? O plano menciona Nuvem Fiscal.

### 2026-05-08 — Cloudinary → MinIO
O sistema atual usa Cloudinary para imagens de produtos. A migração vai reescrever para MinIO (que está na stack). Isso vai requerer migração dos assets existentes no cutover (Fase 17).

---

## Lacunas identificadas no sistema antigo

- IMEI API key hardcoded em `IMEICheckService.php` — mover para env var
- Cross-banco FKs (depix_transacoes → ordens_servico em outro banco) — resolver no Postgres unificado
- Timestamps inconsistentes (criado_em vs created_at) — padronizar na migração
- configuracoes_parcelamento com 36 colunas (juros_2x...juros_36x) — redesenhar como tabela relacional
- avaliacoes.valor como string em vez de decimal
- Checklist OS com 30 colunas individuais — migrar para JSONB
- Status da OS mistura estados de processo + financeiros — redesenhar
- sem soft delete padronizado (alguns usam ativo boolean, sem deleted_at)
- Depix cria VendaAvulsa para toda transação PIX — redesenhar como Payment genérico
- PagBank webhook sem credenciais (provavelmente abandonado)
- Corrida99Service sem credenciais (provavelmente não ativo)

---

## Decisões arquiteturais (ADRs resumidos)

### 2026-05-08 — Multi-tenancy via RLS em vez de banco separado (ADR 0001)
O Laravel usa `stancl/tenancy` com banco MySQL separado por tenant. O Next.js usa RLS no PostgreSQL com `tenant_id UUID` + `SET LOCAL ROLE app_user` + `SET LOCAL app.current_tenant_id`. Ver `docs/decisions/0001-multi-tenancy-via-rls.md`.

### 2026-05-08 — Deploy Next.js via Docker na VPS (coexistência com Laravel)
O arenatech-app será hospedado na mesma VPS Contabo via Docker container próprio, com docker-compose dedicado. Next.js standalone na porta interna 3001, atrás do Nginx em `app.arenatechpi.com.br`. PostgreSQL 16 container na porta 5434, Redis 7 dedicado na porta 6380, MinIO nas portas 9000/9001.

### 2026-05-08 — WhatsApp via Evolution API (não Meta Cloud API diretamente)
O sistema atual usa Evolution API como wrapper sobre WhatsApp. Manter essa integração no Next.js — não migrar para Meta Cloud API diretamente pois a Evolution API já está funcionando e estável.

### 2026-05-08 — Payment via Depix/PixPay (não Pixpay.com.br diferente)
O "Pixpay" mencionado no plano de migração é na verdade o serviço "Depix" que usa a API `api.pixpay.space`. Não confundir com outros serviços de nome similar.

---

## Histórico de execução

### 2026-05-08 — Fase 2

- **Implementado:**
  - Prisma 7 multi-file schema: tenant.prisma (Tenant, User, UserTenant), audit.prisma (AuditLog)
  - prisma.config.ts para Prisma 7 (datasource url migrado do schema para config)
  - @prisma/adapter-pg para PrismaClient (Prisma 7 breaking change: driver adapter obrigatorio)
  - Migration SQL pura para RLS: current_tenant_id(), roles app_user/app_admin, policies em audit_logs
  - withTenant(id, fn) e withAdmin(fn) em src/server/db.ts
  - Seed idempotente: tenant arena-tech + super admin (CPF/senha via env vars)
  - 6 cenarios de teste RLS passando (isolamento A/B, WITH CHECK, BYPASSRLS, defense in depth, USING)
  - ADR 0001 em docs/decisions/0001-multi-tenancy-via-rls.md
  - PATTERNS.md com convencoes de schema, checklist de nova tabela, template SQL
- **Decisoes:**
  - Prisma 7 removeu datasourceUrl do schema — requer prisma.config.ts + @prisma/adapter-pg
  - prismaSchemaFolder preview feature removida em Prisma 7 (multi-file e nativo)
  - SET LOCAL ROLE app_user necessario porque superuser/owner bypassa RLS mesmo com FORCE
  - Interactive transaction ($transaction) em vez de Client Extensions (extensions ignoram contexto de transacao existente)
- **Proximo:** Fase 3 — Auth (aguardando confirmacao)

---

### 2026-05-08 — Diagnóstico VPS

- **Implementado:** Diagnóstico read-only completo da VPS Contabo (194.34.232.81). Ver `docs/VPS_INVENTORY.md`.
- **Decisões pendentes:** 8 decisões registradas no inventário (D1–D8) sobre estratégia de deploy, portas, limpeza de configs
- **Próximo:** Aguardando decisões D1–D8 antes de qualquer ação na VPS

---

### 2026-05-08 — Fase 1

- **Implementado:**
  - Scaffold Next.js 16.2.5 (App Router, `output: "standalone"`, Turbopack)
  - TypeScript estrito com `noUncheckedIndexedAccess` + `noImplicitOverride`
  - tRPC v11 completo: `src/server/api/trpc.ts`, `routers/example.ts`, `root.ts`, `api/trpc/[trpc]/route.ts`, `trpc/server.ts`, `trpc/react.tsx`
  - Prisma 7 multi-file schema em `prisma/schema/base.prisma`
  - NextAuth v5 placeholder em `src/server/auth.ts`
  - shadcn/ui new-york + 22 componentes base
  - ESLint flat config (`eslint.config.mjs`) — migrado de `.eslintrc.cjs` por ESLint 10→9 + Next.js 16 remover `next lint`
  - `src/lib/utils.ts` com `cn()` helper
  - Vitest + Playwright configurados com smoke tests verdes
  - `src/app/page.tsx` exibindo "olá" via tRPC server caller
- **Decisões:**
  - Downgrade ESLint 10→9 (`eslint-plugin-react@7` incompatível com ESLint 10 flat config)
  - `next lint` removido no Next.js 16 — lint script usa `eslint src` diretamente
  - Prisma 7 (mais recente estável) em vez de Prisma 6 conforme spec
- **Próximo:** Fase 2 — Schema base + RLS (aguardando confirmação)

---

### 2026-05-08 — Fase 0

- **Implementado:**
  - docker-compose.yml com postgres:16, redis:7, minio, mailhog
  - docker/postgres/init/01-extensions.sql (uuid-ossp, pg_trgm, unaccent)
  - Stack Docker subida e todos os 4 serviços healthy
  - .gitignore criado
  - .env.example com todos os campos mapeados do Laravel
  - .env.local com valores reais de dev (gitignored)
  - docs/MIGRATION_NOTES.md — inventário completo do sistema Laravel
- **Decisões:**
  - Docker context orbstack (OrbStack precisa estar rodando)
  - IMEI API key estava hardcoded no código Laravel — mapeado como lacuna de segurança
  - Evolution API é o provider de WhatsApp (não Meta Cloud API diretamente)
  - Depix = PixPay (api.pixpay.space) — não é o mesmo que outros serviços de PIX
  - Sistema tem catálogo e-commerce completo (catalogo.arenatechpi.com.br) não documentado no plano
- **Próximo:** Fase 1 — Esqueleto Next.js + tRPC + Prisma

---

## Bloqueios atuais

_(vazio)_

---

## Métricas

| Métrica | Valor |
|---|---|
| Linhas de código | ~1500 |
| Cobertura de testes | 1 unit + 6 integration + 1 e2e |
| Tabelas no schema | 4 (tenants, users, user_tenants, audit_logs) |
| Procedures tRPC | 1 (example.hello) |
| Páginas | 1 (/) |
| Componentes shadcn/ui | 22 |
| Tabelas inventariadas do Laravel | ~55 tabelas tenant + ~20 tabelas central |
| Rotas inventariadas do Laravel | ~150+ rotas |
| Jobs identificados | 13 |
| Integrações externas | 11 (Autentique, Depix, Evolution/WhatsApp, Chatwoot, Nuvem Fiscal, Focus NFe, IMEI Check, Asaas, Anthropic, DirectD, MeuDANFE) |
