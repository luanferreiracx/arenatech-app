# 04 — MIGRATION PLAN

Plano mestre da migração Arena Tech (Laravel → Next.js).
Este documento é a **fonte da verdade** do projeto. Claude lê antes de cada fase. Você aprova mudanças aqui antes de modificar curso.

---

## Princípios

1. **Sequencial nas fases 0-6** (fundação) — uma fase por vez, validar antes de avançar
2. **Paralelo nas fases 7+** (módulos folha) — múltiplas branches simultâneas se quiser acelerar
3. **Cada fase termina em estado utilizável** — se parar no meio, ainda funciona
4. **Migrações Prisma versionadas** — toda mudança de schema é uma migration commitada
5. **Testes obrigatórios** — qualquer fase que entra em main passou em CI verde
6. **PROGRESS.md atualizado constantemente** — Claude registra o que fez e o que falta

---

## Fases — visão geral

| Fase | Nome | Tipo | Duração estimada | Depende de |
|---|---|---|---|---|
| 0 | Bootstrap & infra local | Sequencial | 1 dia | — |
| 1 | Esqueleto Next.js + tRPC + Prisma | Sequencial | 2 dias | 0 |
| 2 | Schema base + RLS multi-tenant | Sequencial | 2-3 dias | 1 |
| 3 | Auth (NextAuth + Credentials CPF) | Sequencial | 1-2 dias | 2 |
| 4 | Design system + layout shell | Sequencial | 2 dias | 3 |
| 5 | Módulos core: Configurações + Catálogo + Clientes | Sequencial | 3-4 dias | 4 |
| 6 | Módulos core: Estoque + Caixa + Financeiro | Sequencial | 4-5 dias | 5 |
| 7 | Módulo OS (Ordens de Serviço) | Sequencial (crítico) | 3-4 dias | 6 |
| 8 | Módulo PDV | Sequencial (crítico) | 2-3 dias | 7 |
| 9 | Fiscal (NF-e Nuvem Fiscal) | Paralelo | 2-3 dias | 6 |
| 10 | Comissões | Paralelo | 2 dias | 6 |
| 11 | Operação (entregadores, laboratórios, prestadores) | Paralelo | 2 dias | 5 |
| 12 | Consulta IMEI | Paralelo | 1 dia | 5 |
| 13 | Comunicação (WhatsApp + Chatwoot + VendaBot) | Paralelo | 3-4 dias | 8 |
| 14 | Recompensas (refeito do zero) | Paralelo | 2-3 dias | 5 |
| 15 | Admin Central (SaaS) | Paralelo | 3-4 dias | 6 |
| 16 | Hardening (segurança, performance, SEO) | Sequencial | 2 dias | 7-15 |
| 17 | Migração final + cutover | Sequencial | 1-2 dias | 16 |

**Total estimado:** 35-50 dias úteis (com Claude trabalhando intensivamente).

---

# FASE 0 — Bootstrap & infra local

**Objetivo:** Próximo passo após `01-03` concluídos. Garantir que tudo da infra local está funcional e o `.env` do Laravel foi mapeado.

## 0.1 Pré-requisitos verificados

Claude executa o diagnóstico do `01_DEV_LOCAL_SETUP.md` Parte 1 e confirma que tudo está `✓`.

## 0.2 Docker Compose da stack local

Cria `~/dev/arenatech-app/docker-compose.yml`:

```yaml
name: arenatech

services:
  postgres:
    image: postgres:16-alpine
    container_name: arenatech-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: arenatech
      POSTGRES_PASSWORD: arenatech_local
      POSTGRES_DB: arenatech
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U arenatech"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: arenatech-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: arenatech-minio
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: arenatech
      MINIO_ROOT_PASSWORD: arenatech_local
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  mailhog:
    image: mailhog/mailhog:latest
    container_name: arenatech-mailhog
    restart: unless-stopped
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

## 0.3 Scripts de inicialização do Postgres (RLS prep)

`docker/postgres/init/01-extensions.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
```

## 0.4 Subir stack e verificar

```bash
cd ~/dev/arenatech-app
docker compose up -d
docker compose ps   # tudo deve estar healthy
```

Testes de conectividade:
```bash
docker exec arenatech-postgres pg_isready -U arenatech
docker exec arenatech-redis redis-cli ping
curl http://localhost:9000/minio/health/live
```

## 0.5 Mapeamento do `.env` do Laravel

Claude lê `/Users/luanferreira/Herd/intranetpdv/.env` e cria `~/dev/arenatech-app/.env.example`:

```env
# === App ===
NODE_ENV=development
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# === Database ===
DATABASE_URL=postgresql://arenatech:arenatech_local@localhost:5432/arenatech?schema=public

# === Redis ===
REDIS_URL=redis://localhost:6379

# === MinIO (S3-compatible) ===
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=arenatech
S3_SECRET_KEY=arenatech_local
S3_BUCKET=arenatech-app
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true

# === Email (Resend em prod, Mailhog em dev) ===
RESEND_API_KEY=
EMAIL_FROM=noreply@arenatechpi.com.br
SMTP_HOST=localhost
SMTP_PORT=1025

# === Integrações migradas do Laravel ===
# Autentique (assinatura digital)
AUTENTIQUE_API_KEY=
AUTENTIQUE_API_URL=https://api.autentique.com.br/v2

# Pixpay (pagamentos)
PIXPAY_CLIENT_ID=
PIXPAY_CLIENT_SECRET=
PIXPAY_API_URL=

# Nuvem Fiscal (NF-e)
NUVEM_FISCAL_API_KEY=
NUVEM_FISCAL_AMBIENTE=homologacao

# WhatsApp Business API (Meta Cloud API)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# Chatwoot
CHATWOOT_URL=
CHATWOOT_API_TOKEN=
CHATWOOT_ACCOUNT_ID=

# Consulta IMEI
IMEI_API_URL=
IMEI_API_KEY=
```

E também `.env.local` (gitignored) já preenchido com os valores do Laravel.

## 0.6 Criar `MIGRATION_NOTES.md` na pasta docs/

Claude lê **todo o código do Laravel** em `/Users/luanferreira/Herd/intranetpdv` e produz um documento `docs/MIGRATION_NOTES.md` com:

- Lista de **rotas** (web.php, api.php) com método, path, controller@action
- Lista de **models** com relações
- Lista de **migrations** (estrutura de cada tabela)
- Lista de **jobs** e **events**
- Lista de **observers**, **policies**, **middlewares**
- Lista de **integrações externas** (Autentique, Pixpay, Nuvem Fiscal, WhatsApp, Chatwoot, IMEI)
- Lista de **bibliotecas** importantes (com versões)
- Mapa de **packages stancl/tenancy** uso (como tenants são identificados, criados, deletados)
- **Lacunas identificadas** (TODOs, FIXMEs, hacks no código)
- **Funcionalidades não documentadas** descobertas

Esse documento é referência para todas as fases seguintes.

## 0.7 Checkpoint Fase 0

- [ ] Docker stack rodando, todos healthy
- [ ] `.env.example` com todos os campos documentados
- [ ] `.env.local` com valores reais migrados do Laravel
- [ ] `docs/MIGRATION_NOTES.md` criado com inventário do sistema antigo
- [ ] Commit: `chore: bootstrap fase 0 - infra local + mapeamento legado`

---

# FASE 1 — Esqueleto Next.js + tRPC + Prisma

**Objetivo:** projeto Next.js inicializado com toda a stack, "Hello World" funcionando.

> **Nota:** Stack atualizada para Next.js 16.2.5 desde a Fase 1 (consequência de `create-next-app@latest`). Detalhes em `docs/decisions/0003-nextjs-16-migration.md`.
>
> **Setup de VPS:** descartado da sequência de fases — VPS Contabo já configurada e inventariada em `docs/VPS_INVENTORY.md`. Deploy do app entrará em fase posterior, quando aplicável.

## 1.1 Inicializar projeto

```bash
cd ~/dev/arenatech-app
pnpm dlx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint
```

Isso pode pedir confirmação para sobrescrever — confirmar (mantemos `.gitignore`, `README.md`, `docs/`).

## 1.2 Configurar TypeScript estrito

`tsconfig.json` com `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.

## 1.3 ESLint + Prettier

```bash
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-config-next eslint-plugin-react eslint-plugin-react-hooks \
  prettier prettier-plugin-tailwindcss
```

Configs em `.eslintrc.cjs` e `.prettierrc`.

## 1.4 Standalone output

`next.config.mjs`:
```js
export default {
  output: 'standalone',
  // ...
};
```

## 1.5 Instalar tRPC v11

```bash
pnpm add @trpc/server @trpc/client @trpc/react-query @trpc/next \
  @tanstack/react-query zod superjson
```

Estrutura:
```
src/
  server/
    api/
      root.ts          # appRouter
      trpc.ts          # context, procedures
      routers/
        example.ts
  trpc/
    react.tsx          # provider client
    server.ts          # callers server-side
    shared.ts
```

## 1.6 Instalar Prisma 7 (multi-file schema)

```bash
pnpm add -D prisma
pnpm add @prisma/client

mkdir -p prisma/schema
```

Config em `prisma/schema.prisma`:
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["prismaSchemaFolder"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Schema vazio inicialmente — vamos preencher na Fase 2.

## 1.7 Instalar NextAuth v5 (preparação)

```bash
pnpm add next-auth@beta
pnpm add @auth/prisma-adapter
```

Config inicial em `src/server/auth.ts` — apenas placeholder, vamos completar na Fase 3.

## 1.8 Instalar Tailwind v4 + shadcn/ui

```bash
pnpm dlx shadcn@latest init
```

Escolhas:
- Style: New York
- Base color: Slate
- CSS variables: Yes
- Tailwind config: já existe
- Components: `~/components/ui`

Adiciona componentes base:
```bash
pnpm dlx shadcn@latest add button input label card dialog dropdown-menu \
  form select toast table tabs sheet separator avatar badge skeleton \
  alert command popover scroll-area textarea checkbox switch
```

## 1.9 Outros essenciais

```bash
pnpm add date-fns lucide-react clsx tailwind-merge
pnpm add -D vitest @vitejs/plugin-react @testing-library/react \
  @testing-library/jest-dom playwright @playwright/test
```

## 1.10 Scripts no package.json

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset"
  }
}
```

## 1.11 Hello World tRPC

Procedure `hello` que retorna `{ message: "olá" }`. Página `/` que chama essa procedure e exibe.

`pnpm dev` → `http://localhost:3000` mostra "olá".

## 1.12 Configurar Vitest e Playwright

`vitest.config.ts` com setup de testes.
`playwright.config.ts` com baseURL `http://localhost:3000`.

Smoke test do Playwright: abre `/`, verifica que "olá" aparece.

## 1.13 Checkpoint Fase 1

- [ ] `pnpm dev` sobe sem erros
- [ ] `/` exibe "olá" via tRPC
- [ ] `pnpm typecheck` verde
- [ ] `pnpm lint` verde
- [ ] `pnpm test` verde (smoke test)
- [ ] `pnpm test:e2e` verde
- [ ] `pnpm build` verde
- [ ] Commit: `feat: esqueleto Next.js + tRPC + Prisma + NextAuth + shadcn/ui`

---

# FASE 2 — Schema base + RLS multi-tenant

**Objetivo:** definir o modelo de dados central com Row Level Security funcional.

## 2.1 Estratégia de multi-tenancy via RLS

**Princípio:** todas as tabelas com escopo de tenant têm uma coluna `tenant_id UUID NOT NULL`. RLS policies do Postgres filtram automaticamente baseado em uma variável de sessão `app.current_tenant_id`.

**Vantagens sobre o stancl/tenancy do Laravel:**
- Banco único, backup único, monitoramento único
- Queries cross-tenant impossíveis por construção (vazamento de dados)
- Migration única, sem replicação por tenant
- Menos overhead de conexão

## 2.2 Schema base (Prisma)

Arquivos em `prisma/schema/`:

**`base.prisma`** — providers e generator (já criado).

**`tenant.prisma`** — modelo de tenants e usuários globais.

```prisma
model Tenant {
  id          String   @id @default(uuid()) @db.Uuid
  slug        String   @unique
  name        String
  cnpj        String?  @unique
  status      TenantStatus @default(PENDING)
  plan        String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  users       UserTenant[]

  @@map("tenants")
}

enum TenantStatus {
  PENDING
  ACTIVE
  SUSPENDED
  CANCELLED
}

model User {
  id          String   @id @default(uuid()) @db.Uuid
  cpf         String   @unique
  name        String
  email       String?
  passwordHash String  @map("password_hash")
  isSuperAdmin Boolean @default(false) @map("is_super_admin")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  tenants     UserTenant[]

  @@map("users")
}

model UserTenant {
  userId    String  @map("user_id") @db.Uuid
  tenantId  String  @map("tenant_id") @db.Uuid
  role      String  @default("operator")
  createdAt DateTime @default(now()) @map("created_at")

  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant    Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@id([userId, tenantId])
  @@map("user_tenants")
}
```

Modelos de domínio (Customer, Product, Order, etc) ficam em arquivos separados (`prisma/schema/customer.prisma`, etc) e **todos** carregam `tenantId String @db.Uuid`.

## 2.3 RLS policies

Migration SQL pura (não Prisma) `prisma/migrations/.../enable_rls.sql`:

```sql
-- Função para extrair tenant_id da sessão
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Aplicar RLS em cada tabela com tenant_id
-- (a Fase 2 cria isso pra cada tabela com tenant_id na medida que vamos criando)

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- bypass para super admins (executando como role app_admin)
CREATE POLICY admin_bypass ON customers
  TO app_admin
  USING (true);
```

## 2.4 Cliente Prisma com RLS automático

`src/server/db.ts`:

```ts
import { PrismaClient } from '@prisma/client';

export function createPrismaClient(tenantId?: string) {
  const prisma = new PrismaClient();
  
  if (tenantId) {
    prisma.$use(async (params, next) => {
      // antes de toda query, set local app.current_tenant_id
      await prisma.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`
      );
      return next(params);
    });
  }
  
  return prisma;
}
```

(O Claude vai refinar isso na implementação — middleware do Prisma é deprecated em v6, usa `$extends` ou Prisma Accelerate.)

## 2.5 Roles do Postgres

Migration cria duas roles:
- `app_user` — usado pela aplicação normal, sujeito a RLS
- `app_admin` — usado por jobs administrativos e super admin, bypass RLS

## 2.6 Seed inicial

`prisma/seed.ts`:
- 1 super admin
- 1 tenant `arena-tech` (a intranet central)
- 1 user vinculado ao tenant
- Dados básicos pra desenvolvimento

## 2.7 Testes de RLS

Suite específica em `__tests__/rls.test.ts`:
- Cria 2 tenants, 1 customer em cada
- Conecta como user do tenant 1 → vê só 1 customer
- Conecta como user do tenant 2 → vê só 1 customer (o outro)
- Tenta inserir customer com tenant_id de outro → falha
- Conecta como app_admin → vê os 2

## 2.8 Checkpoint Fase 2

- [ ] Schema multi-file Prisma estruturado
- [ ] Migration inicial gerada e aplicada
- [ ] RLS policies aplicadas em todas as tabelas com `tenant_id`
- [ ] Cliente Prisma com tenant scoping automático
- [ ] Roles `app_user` e `app_admin` criadas
- [ ] Seed cria tenant arena-tech + super admin
- [ ] Suite de testes RLS verde
- [ ] Commit: `feat(db): schema base + RLS multi-tenant`

---

# FASE 3 — Auth (NextAuth v5 + Credentials CPF)

**Objetivo:** login funcional com CPF + senha, sessão JWT, contexto tRPC com tenantId resolvido.

## 3.1 Provider Credentials

`src/server/auth.ts`:
- Provider Credentials que valida CPF (formato + dígitos verificadores) e bcrypt-compara senha
- Callback `jwt` adiciona `userId`, `cpf`, `isSuperAdmin`, `tenants[]`
- Callback `session` expõe esses dados ao client

## 3.2 Resolução de tenant

**Decisão arquitetural:** como o usuário pode ter acesso a múltiplos tenants, o tenant ativo é definido por:
1. Subdomain (se houver) — ex: `arenatech.app.arenatechpi.com.br` → tenant `arenatech`
2. Cookie `tenant_id` (escolha persistente)
3. Primeiro tenant do usuário (default)

`src/middleware.ts` (Edge middleware) resolve tenant a partir do host e injeta no header `x-tenant-id`.

Context tRPC lê o header e seta no Prisma client.

## 3.3 Telas de auth

- `/auth/login` — input CPF (com máscara), input senha, "Entrar"
- `/auth/select-tenant` — se usuário tem múltiplos tenants, escolhe qual
- `/auth/forgot-password` — solicitação por email
- `/auth/reset-password/[token]` — define nova senha
- `/auth/logout` — limpa sessão

## 3.4 Hashing

bcrypt com cost 12. Migração de senhas do Laravel: como Laravel usa bcrypt também, **os hashes são compatíveis** — pode reusar o `password_hash` do banco antigo se for migrar dados. Como vamos descartar tenants atuais, isso só vale para o super admin / intranet central.

## 3.5 Procedures protegidas

`src/server/api/trpc.ts`:
- `publicProcedure` — sem auth
- `protectedProcedure` — exige sessão válida
- `tenantProcedure` — exige sessão + tenantId resolvido (RLS-scoped)
- `adminProcedure` — exige `isSuperAdmin = true`

## 3.6 Testes

- Unit: validação de CPF, bcrypt, callbacks
- E2E: fluxo completo login → dashboard → logout

## 3.7 Checkpoint Fase 3

- [ ] Login com CPF+senha funciona
- [ ] Sessão JWT criada e válida
- [ ] Tenant resolvido via subdomain ou cookie
- [ ] tenantProcedure filtra automaticamente por RLS
- [ ] Telas de auth com design system mínimo (placeholder, polir na Fase 4)
- [ ] Recuperação de senha via email (Resend dev → Mailhog)
- [ ] E2E verde
- [ ] Commit: `feat(auth): NextAuth + credentials CPF + multi-tenant resolution`

---

# FASE 4 — Design system + layout shell

**Objetivo:** tema escuro minimalista, layout principal (sidebar, header, breadcrumbs), componentes de domínio reutilizáveis.

## 4.1 Aplicar skill `frontend-design`

Claude lê `/mnt/skills/public/frontend-design/SKILL.md` antes de começar UI. Princípios:
- Tema escuro (default)
- Minimalista, sem decoração desnecessária
- Tipografia clara (Inter ou Geist)
- Espaçamento consistente
- Densidade adequada para sistemas de gestão (não SaaS turístico — é ferramenta de trabalho)

## 4.2 Tokens de tema

`src/styles/globals.css` com CSS variables:
- background, foreground
- card, card-foreground
- primary (acento da marca — sugiro um dourado quente, cor da marca Arena Tech)
- secondary, muted, accent
- destructive
- border, input, ring

Modo claro disponível mas **default escuro**.

## 4.3 Layout shell

`src/app/(app)/layout.tsx`:
- Sidebar fixa (224px) com navegação por módulo
- Header com: breadcrumb, search global (cmd+k), notificações, avatar
- Content area com padding consistente
- Mobile: sidebar vira sheet

## 4.4 Componentes de domínio

`src/components/`:
- `data-table/` — wrapper sobre TanStack Table com paginação server-side, filtros, ordenação
- `forms/` — wrappers sobre react-hook-form + zod
- `money-input` — input com máscara monetária BRL
- `cpf-input`, `cnpj-input`, `phone-input` — máscaras
- `date-picker`, `date-range-picker`
- `status-badge` — badges de status com cores semânticas
- `entity-selector` — combobox com busca async (cliente, produto, etc)
- `confirm-dialog` — confirmação destrutiva
- `page-header` — header padrão de páginas
- `empty-state`
- `loading-state`

## 4.5 Comando palette (cmd+k)

Componente `command-palette` global que:
- Busca cliente por nome/CPF
- Busca OS por número
- Busca produto por nome/código
- Atalhos para criar (nova OS, nova venda, novo cliente)
- Atalhos de navegação

## 4.6 Notification system

Toast via shadcn (Sonner). Helpers para:
- `toast.success`, `toast.error`, `toast.info`
- `toast.promise` para operações async

## 4.7 Checkpoint Fase 4

- [ ] Tema escuro aplicado, modo claro funcional
- [ ] Layout shell com sidebar/header/content
- [ ] Componentes de domínio prontos e documentados
- [ ] Command palette funcional (placeholder de busca)
- [ ] Toast configurado
- [ ] Storybook ou página `/dev/components` lista todos os componentes
- [ ] E2E: navegação entre seções da sidebar
- [ ] Commit: `feat(ui): design system minimalista escuro + layout shell`

---

# FASE 5 — Configurações + Catálogo + Clientes

Os 3 módulos mais "fundacionais" do sistema. Tudo depende deles.

## 5.1 Configurações

**Submódulos:**
- Dados da assistência (logo, endereço, CNPJ, IE)
- Formas de pagamento (criar/editar/desativar, taxas, parcelamento)
- Parcelamentos (regras por forma de pagamento)
- Integrações (toggle on/off + credenciais por tenant — para Autentique, Pixpay, Nuvem Fiscal, WhatsApp, Chatwoot, IMEI)
- Usuários (CRUD de users do tenant, atribuir papéis)
- Roles & Permissões (definir o que cada papel pode fazer)

**Schema relevante:**
```prisma
model TenantSettings {
  tenantId  String  @id @map("tenant_id") @db.Uuid
  logoUrl   String? @map("logo_url")
  address   Json?
  ie        String?
  // ... etc
}
```

## 5.2 Catálogo

**Submódulos:**
- Serviços (CRUD: nome, preço, observações, comissão)
- Avaliações/Laudos pré-definidos (templates de laudo técnico)
- Aparelhos (CRUD: marca, modelo, categoria, atributos)
- Categorias e atributos de aparelhos

**Schema relevante:**
```prisma
model Service {
  id          String  @id @default(uuid()) @db.Uuid
  tenantId    String  @map("tenant_id") @db.Uuid
  name        String
  basePrice   Decimal @map("base_price") @db.Decimal(10, 2)
  description String?
  active      Boolean @default(true)
  // comissões: ver Fase 10
}

model Device {
  id          String  @id @default(uuid()) @db.Uuid
  tenantId    String  @map("tenant_id") @db.Uuid
  brand       String
  model       String
  category    String
  attributes  Json?
}
```

## 5.3 Clientes

**Submódulos:**
- CRUD com busca (nome, CPF/CNPJ, telefone, email)
- Histórico de OS por cliente (preview, link para módulo OS)
- Interesses/Oportunidades (CRUD: cliente quer X, follow-up em data Y)
- LGPD: consent, soft delete

**Schema relevante:**
```prisma
model Customer {
  id          String  @id @default(uuid()) @db.Uuid
  tenantId    String  @map("tenant_id") @db.Uuid
  type        CustomerType  // PF | PJ
  name        String
  cpf         String?
  cnpj        String?
  email       String?
  phone       String?
  address     Json?
  notes       String?
  consentAt   DateTime? @map("consent_at")
  deletedAt   DateTime? @map("deleted_at")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([tenantId, name])
  @@index([tenantId, cpf])
  @@index([tenantId, cnpj])
}
```

## 5.4 Padrão de implementação por módulo

Cada submódulo segue **exatamente** este padrão (Claude estabelece como template):

1. Schema Prisma + migration
2. Router tRPC (`src/server/api/routers/customer.ts`):
   - `list` (com paginação, filtros, busca)
   - `byId`
   - `create`
   - `update`
   - `delete` (soft)
3. Validators Zod em `src/lib/validators/customer.ts`
4. Página de listagem (`src/app/(app)/customers/page.tsx`) usando data-table
5. Página de detalhe (`/customers/[id]`)
6. Página de criar (`/customers/new`)
7. Página de editar (`/customers/[id]/edit`)
8. Server actions para forms (Next 15 padrão)
9. Testes:
   - Unit: validators, router (mock Prisma)
   - E2E: criar/editar/listar/deletar pelo navegador

## 5.5 Checkpoint Fase 5

- [ ] Configurações: 6 submódulos completos
- [ ] Catálogo: 4 submódulos completos
- [ ] Clientes: 4 submódulos completos
- [ ] Padrão CRUD documentado em `docs/PATTERNS.md` para reuso nos próximos módulos
- [ ] Testes verdes (unit + e2e)
- [ ] Commit: `feat(modules): configurações + catálogo + clientes`

---

# FASE 6 — Estoque + Caixa + Financeiro

## 6.1 Estoque

- Produtos (CRUD com SKU, custo, preço, estoque mínimo)
- Movimentações (entrada/saída/ajuste com histórico)
- Compras de aparelhos (registro de aparelhos comprados de clientes — usados, recondicionados)
- Inventário (relatório de saldo)

## 6.2 Caixa

- Abertura (saldo inicial, usuário, hora)
- Fechamento (saldo final, conferência por forma de pagamento)
- Movimentações (sangria, suprimento)
- Histórico de caixas

## 6.3 Financeiro

- Contas a pagar (CRUD, vencimentos, status)
- Contas a receber (CRUD, vinculação com OS/PDV)
- Parcelamentos (geração automática de parcelas)
- Fluxo de caixa (relatório por período, categoria)
- Saques Pixpay (integração com API)

## 6.4 Checkpoint Fase 6

- [ ] Estoque: 4 submódulos
- [ ] Caixa: aberto/fechado funcional, conferência
- [ ] Financeiro: AP/AR/parcelas, integração Pixpay para saques
- [ ] Testes verdes
- [ ] Commit: `feat(modules): estoque + caixa + financeiro`

---

# FASE 7 — Ordens de Serviço (CRÍTICO)

Coração do sistema. Mais complexo de todos.

## 7.1 Schema

```prisma
model ServiceOrder {
  id            String  @id @default(uuid()) @db.Uuid
  tenantId     String  @map("tenant_id") @db.Uuid
  number       Int    // sequencial por tenant
  customerId   String @map("customer_id") @db.Uuid
  deviceId     String? @map("device_id") @db.Uuid
  technicianId String? @map("technician_id") @db.Uuid
  status       ServiceOrderStatus
  diagnostics  String?
  observations String?
  signatureUrl String? @map("signature_url")
  signatureData Json?  @map("signature_data")  // dados do Autentique
  totalAmount  Decimal @default(0) @map("total_amount") @db.Decimal(10, 2)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  items        ServiceOrderItem[]
  history      ServiceOrderHistory[]
  payments     Payment[]

  @@unique([tenantId, number])
}

enum ServiceOrderStatus {
  DRAFT
  AWAITING_APPROVAL
  APPROVED
  IN_SERVICE
  AWAITING_PARTS
  READY
  DELIVERED
  CANCELLED
}

model ServiceOrderItem {
  id              String  @id @default(uuid()) @db.Uuid
  serviceOrderId  String  @map("service_order_id") @db.Uuid
  type            String  // SERVICE | PRODUCT
  serviceId       String? @map("service_id") @db.Uuid
  productId       String? @map("product_id") @db.Uuid
  description     String
  quantity        Decimal @default(1)
  unitPrice       Decimal @map("unit_price") @db.Decimal(10, 2)
  total           Decimal @db.Decimal(10, 2)
}

model ServiceOrderHistory {
  id              String  @id @default(uuid()) @db.Uuid
  serviceOrderId  String  @map("service_order_id") @db.Uuid
  userId          String  @map("user_id") @db.Uuid
  action          String  // status_changed, item_added, etc
  payload         Json
  createdAt       DateTime @default(now()) @map("created_at")
}
```

## 7.2 Funcionalidades

- Wizard de criação (cliente → aparelho → laudo → itens → resumo)
- Edição com histórico de alterações
- Mudança de status com regras (não pode pular etapas)
- Geração de PDF (componente React → puppeteer ou react-pdf)
- Envio do link de assinatura via WhatsApp (integração Cloud API)
- Assinatura digital via Autentique (criar documento, webhook recebe assinado, anexa à OS)
- Pagamento via Pixpay (gerar QR Code, webhook recebe confirmação, registra payment)
- Finalização (entrega) registra pagamento, gera nota fiscal (se config), notifica cliente

## 7.3 Integrações externas

- **Autentique:** SDK ou client manual (Claude verifica documentação atual)
- **Pixpay:** mesmo
- **WhatsApp Cloud API:** envio de templates (assinatura, pronto para retirada, etc)

## 7.4 Checkpoint Fase 7

- [ ] CRUD de OS com wizard
- [ ] Histórico de alterações automático (Prisma middleware ou trigger)
- [ ] Geração de PDF da OS
- [ ] Integração Autentique (criar documento, webhook)
- [ ] Integração Pixpay (gerar PIX, webhook)
- [ ] Envio WhatsApp via Cloud API
- [ ] E2E completo: criar → assinar → pagar → finalizar
- [ ] Commit: `feat(os): módulo Ordens de Serviço completo`

---

# FASE 8 — PDV (Ponto de Venda)

## 8.1 Funcionalidades

- Tela de venda rápida (busca produto por código de barras / nome / SKU)
- Carrinho com cálculo automático
- Múltiplas formas de pagamento por venda (split payment)
- Cálculo de comissões automático (regras da Fase 10)
- PIX via Pixpay (mesmo fluxo da OS)
- Impressão de cupom (template ou ESC/POS futuramente)
- Vinculação opcional a cliente (vendas avulsas vs. com cliente)

## 8.2 Schema

```prisma
model Sale {
  id          String  @id @default(uuid()) @db.Uuid
  tenantId    String  @map("tenant_id") @db.Uuid
  number      Int
  customerId  String? @map("customer_id") @db.Uuid
  sellerId    String? @map("seller_id") @db.Uuid
  status      SaleStatus
  subtotal    Decimal @db.Decimal(10, 2)
  discount    Decimal @default(0) @db.Decimal(10, 2)
  total       Decimal @db.Decimal(10, 2)
  createdAt   DateTime @default(now()) @map("created_at")

  items       SaleItem[]
  payments    Payment[]

  @@unique([tenantId, number])
}
```

## 8.3 Checkpoint Fase 8

- [ ] PDV funcional: produto → carrinho → pagamento → finalização
- [ ] Split payment
- [ ] Comissões calculadas automaticamente
- [ ] PIX integrado
- [ ] E2E completo
- [ ] Commit: `feat(pdv): módulo PDV completo`

---

# FASES 9-15 — Módulos folha (paralelizáveis)

A partir daqui, **podem ser feitas em paralelo** se você quiser usar múltiplas instâncias do Claude. Cada fase em sua branch própria, merge na main quando pronta.

## Fase 9 — Fiscal (NF-e via Nuvem Fiscal)
- Emissão de NF-e a partir de OS ou Sale
- Importação de NF-e de fornecedores (XML upload)
- Cancelamento, carta de correção
- Espelho de PDF da NF-e

## Fase 10 — Comissões
- Regras por tipo (serviço, produto, técnico vs vendedor)
- Sócios com regras específicas
- Cálculo retroativo
- Apuração mensal com relatório

## Fase 11 — Operação
- Entregadores (CRUD, vinculação a OS)
- Laboratórios externos (envio de aparelho, retorno, custo)
- Prestadores de serviço (contratos, comissões)

## Fase 12 — Consulta IMEI
- Integração com API externa
- Limite mensal por plano
- Addons de consultas extras (cobrança via Pixpay)
- Histórico de consultas

## Fase 13 — Comunicação
- WhatsApp via Cloud API (envio de mensagens, templates)
- Chatwoot integrado (inbox unificada)
- Chatbot de vendas (fluxo simples)
- VendaBot (catálogo via WhatsApp + geração de PIX automática)

## Fase 14 — Recompensas (refeito)
- Definir regras junto a você antes de implementar (em `docs/decisions/recompensas.md`)
- Sistema de pontos por compra/serviço
- Resgate (descontos, brindes)
- Painel do cliente

## Fase 15 — Admin Central (SaaS)
- Gestão de tenants (aprovar pré-cadastros, suspender, reativar)
- Planos e assinaturas
- Cobranças via Pixpay
- Relatórios cross-tenant (apenas para super admin, bypass RLS)
- Pré-cadastros de novas lojas (form público)

---

# FASE 16 — Hardening

## 16.1 Segurança

- CSRF tokens
- Rate limiting (Upstash Redis ou ioredis)
- Headers de segurança (CSP, HSTS, X-Frame-Options já no Nginx)
- Audit log de ações sensíveis
- Sanitização de inputs (Zod já cobre, mas revisar)
- Pen test básico (OWASP top 10 manual)

## 16.2 Performance

- Cache de queries pesadas em Redis
- Streaming SSR onde apropriado
- Otimização de bundle (analyze, code split por rota)
- Lighthouse > 90 nas rotas principais
- DB indexes revisados

## 16.3 Observabilidade

- Sentry para erros
- Logger estruturado (pino)
- Métricas básicas (request count, latency, error rate)

## 16.4 SEO/UX

- Metadata por página
- Open Graph
- Sitemap
- Acessibilidade (axe-core nos testes)

---

# FASE 17 — Cutover

## 17.1 Plano de migração de dados

Como **descartamos os tenants atuais** e só migramos a intranet central (Arena Tech own data):

1. Script de migração lê MySQL do Laravel central
2. Mapeia tabela por tabela para Postgres novo (com `tenantId` da Arena Tech)
3. Validações pós-migração (counts, checksums)
4. Dry-run em staging
5. Cutover real em janela combinada

## 17.2 DNS e SSL

- Apontar `app.arenatechpi.com.br` definitivo
- Manter Laravel rodando em paralelo até confiança total
- Após validação, aposentar Laravel

## 17.3 Documentação final

- README atualizado
- ADRs (Architectural Decision Records) em `docs/decisions/`
- Runbook operacional em `docs/RUNBOOK.md`
- Manual do usuário (opcional)

---

## Estratégia de paralelização (Fases 9-15)

Quando chegar à Fase 9, você pode escolher:

**Modo conservador (1 agente sequencial):**
- Continua um módulo por vez, mais lento mas zero conflito.

**Modo agressivo (3 agentes paralelos):**
- 3 sessões `claude` em terminais separados, cada uma em uma branch diferente
- Branches: `feat/fiscal`, `feat/comissoes`, `feat/operacao`
- Você merge sequencialmente na main na ordem em que ficam prontas
- Conflito típico: schema do Prisma. Mitigação: cada módulo tem seu arquivo em `prisma/schema/*.prisma` (multi-file), então conflito é raro.

**Modo super agressivo (NÃO RECOMENDADO):**
- 5+ agentes em paralelo
- Risco alto de conflito, comissões dependem de OS/PDV, etc.

Eu recomendo **modo agressivo a partir da Fase 9**. Você ganha 30-40% de velocidade.

---

## Critério de "fase concluída"

Uma fase só está concluída quando **todos** estes itens estão verdes:

1. `pnpm typecheck` passa
2. `pnpm lint` passa
3. `pnpm test` passa
4. `pnpm test:e2e` passa
5. `pnpm build` passa
6. Migrações Prisma aplicadas e versionadas
7. CI no GitHub Actions verde
8. Deploy em produção (se for fase pós-cutover) ou staging (antes)
9. `docs/05_PROGRESS.md` atualizado com checkpoint
10. Commit semântico realizado

Se algum não passa, a fase **não está concluída**. Claude não avança.

---

## Adendo: Decisões em aberto

Estas precisam de input seu antes de chegar à fase respectiva. Claude registra as descobertas e te pergunta.

- **Fase 14 (Recompensas):** regras de pontuação, regras de resgate
- **Fase 15:** modelo de planos do SaaS (preços, limites)
- **Fase 17:** janela de cutover, plano de comunicação aos usuários
