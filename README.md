# Arena Tech

Sistema de gestao para assistencias tecnicas de celulares. Controle de ordens de servico, PDV, estoque, financeiro, fiscal (NF-e), comunicacao (WhatsApp), e administracao multi-tenant (SaaS).

Migracao completa de Laravel/PHP/MySQL para Next.js/TypeScript/PostgreSQL.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, standalone) |
| API | tRPC v11 |
| ORM | Prisma 7 (multi-file schema) |
| Auth | NextAuth v5 (Credentials CPF + JWT) |
| Database | PostgreSQL 16 com RLS multi-tenant |
| Cache | Redis 7 |
| Storage | MinIO (S3-compatible) |
| UI | shadcn/ui + Tailwind v4 |
| Forms | react-hook-form + Zod v4 |
| Tabelas | TanStack Table v8 |
| Testes | Vitest (unit) + Playwright (e2e) |
| Runtime | Node.js 22 LTS |
| Pacotes | pnpm |

## Setup local

### Pre-requisitos

- Node.js 22+
- pnpm 9+
- Docker (OrbStack ou Docker Desktop)

### Quick start

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/<owner>/arenatech-app.git
cd arenatech-app
pnpm install

# 2. Subir infra local (PostgreSQL, Redis, MinIO, Mailhog)
docker compose up -d

# 3. Configurar env
cp .env.example .env.local
# Editar .env.local com valores de dev

# 4. Gerar Prisma client e aplicar migrations
pnpm prisma generate
pnpm prisma migrate dev

# 5. Seed (tenant arena-tech + super admin + dados de teste)
pnpm db:seed

# 6. Rodar
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Comandos

| Comando | Descricao |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Build de producao |
| `pnpm start` | Rodar build de producao |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Testes unitarios (Vitest, sem integrações) |
| `pnpm test:unit` | Alias explicito dos testes unitarios |
| `pnpm test:integration` | Checa Postgres local, roda migrations + seed e executa integrações RLS/auth |
| `pnpm test:watch` | Testes unitarios em modo watch |
| `pnpm test:e2e` | Testes end-to-end (Playwright) |
| `pnpm db:generate` | Gerar Prisma client |
| `pnpm db:migrate` | Criar/aplicar migration dev |
| `pnpm db:studio` | Prisma Studio (GUI do banco) |
| `pnpm db:seed` | Executar seed |

## Estrutura de diretorios

```
src/
  app/                        # Rotas Next.js (App Router)
    (auth)/                   # Login, select-tenant, etc.
    (app)/                    # Rotas autenticadas (sidebar)
    (admin)/                  # Rotas admin (super admin)
    api/trpc/                 # tRPC API route handler
  components/
    ui/                       # shadcn/ui components
    domain/                   # DataTable, StatusBadge, EntitySelector, etc.
    forms/                    # MoneyInput, CpfInput, CnpjInput, etc.
  lib/
    validators/               # Schemas Zod por modulo
    utils/                    # Utilitarios
  server/
    api/
      routers/                # tRPC routers (1 por modulo)
      root.ts                 # AppRouter
      trpc.ts                 # Context + procedures
    auth.ts                   # NextAuth config
    db.ts                     # Prisma client (withTenant, withAdmin)
    services/                 # Integracoes externas
prisma/
  schema/                     # Multi-file schemas (.prisma)
  migrations/                 # Migrations SQL
  seed.ts                     # Seed de dev
deploy/
  nginx/                      # Config Nginx para producao
scripts/
  migrate-data.ts             # Script de migracao MySQL -> PostgreSQL
docs/
  04_MIGRATION_PLAN.md        # Plano de migracao
  05_PROGRESS.md              # Progresso (atualizado por sessao)
  RUNBOOK.md                  # Operacao e deploy
  decisions/                  # ADRs
__tests__/
  unit/                       # Testes unitarios
  e2e/                        # Testes end-to-end
```

## Modulos

- **OS (Ordens de Servico)** -- wizard de criacao, 13 estados, pagamento, vista publica
- **PDV** -- tela de venda, carrinho, split payment, estorno
- **Clientes** -- CRUD PF/PJ, historico de OS, interesses
- **Estoque** -- produtos, movimentacoes, compras de aparelhos, inventario
- **Caixa** -- abertura/fechamento, sangria, suprimento, conferencia
- **Financeiro** -- contas a pagar/receber, parcelas, fluxo de caixa
- **Fiscal** -- NF-e via Nuvem Fiscal (emissao, cancelamento, carta correcao)
- **Comissoes** -- regras por tipo, calculo mensal, aprovacao
- **Operacao** -- entregadores, laboratorios externos, prestadores
- **IMEI** -- consulta com quota mensal
- **Comunicacao** -- WhatsApp (Evolution API), email (Resend), templates
- **Admin Central** -- gestao de tenants, planos, pre-cadastros, relatorios

## Deploy

### Producao (VPS Contabo)

Deploy automatico via GitHub Actions: push na `main` -> CI (lint, typecheck, test, build) -> deploy via SSH.

Infraestrutura Docker:
- Next.js standalone na porta 3001
- PostgreSQL 16 na porta 5434
- Redis 7 na porta 6380
- MinIO nas portas 9000/9001
- Nginx reverse proxy em `app.arenatechpi.com.br`

Ver `docs/RUNBOOK.md` para detalhes operacionais.

### Build Docker manual

```bash
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d
```

## Multi-tenancy

RLS (Row Level Security) no PostgreSQL com `tenant_id UUID` em todas as tabelas de negocio. Cada requisicao autenticada resolve o tenant via JWT + cookie. Ver `docs/decisions/0001-multi-tenancy-via-rls.md`.

## Contribuicao

1. Branch: `feat/*`, `fix/*`, `chore/*`
2. Commits: Conventional Commits (`feat(modulo): descricao`)
3. CI deve passar: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
4. Para validar RLS/auth localmente, suba o Postgres com `docker compose up -d postgres` e rode: `pnpm test:integration`
5. Push direto na `main` permitido (com CI verde)
