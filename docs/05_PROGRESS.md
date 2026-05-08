# 05 — PROGRESS

> Este arquivo é a **memória viva** do projeto. Claude atualiza após cada checkpoint.
> Você consulta com `arena-progress` de qualquer lugar.

---

## Estado atual

**Fase atual:** Fase 7 — Ordens de Serviço (PRÓXIMA)
**Última atualização:** 2026-05-08
**Branch atual:** `main`
**Commits desde último deploy:** 30

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

### ✓ Fase 3 — Auth
- [x] Validador CPF com Zod (26 unit tests)
- [x] NextAuth v5 beta.31: Credentials provider (CPF + bcrypt)
- [x] JWT callbacks: availableTenants, activeTenantId, isSuperAdmin
- [x] Auth config split: auth.config.ts (Edge) + auth.ts (Node)
- [x] Cookie x-active-tenant para switch de tenant sem re-auth
- [x] Middleware Edge: proteção de rotas, redirect por estado auth/tenant
- [x] tRPC: publicProcedure, protectedProcedure, tenantProcedure, adminProcedure
- [x] Páginas: login, select-tenant, no-access, forgot-password, dashboard, admin
- [x] CpfInput component com máscara automática
- [x] Seed: 4 users (super admin, single-tenant, multi-tenant, no-access)
- [x] E2E: 8 cenários (invalid CPF, wrong password, single/multi/super admin, logout, redirect)
- [x] ADR 0002 + PATTERNS.md atualizado
- [x] typecheck ✓ | lint ✓ | test ✓ | e2e ✓ | build ✓
- [x] Commit final

### ✓ Fase 4 — Design system + layout
- [x] Tokens CSS — paleta Arena Tech (dourado #c9a55c, preto #0a0a0a, prata)
- [x] Branding — logo placeholder SVG "ARENA·TECH"
- [x] Layout shell (app) — sidebar 224px/64px + header + breadcrumb
- [x] Layout shell (admin) — variação para super admin
- [x] Componentes de domínio — data-table, forms, inputs especializados
- [x] Status-badge, entity-selector, confirm-dialog, page-header, empty-state
- [x] Command palette ⌘K
- [x] Toast helpers (sonner)
- [x] Auth pages redesign (login, select-tenant, no-access)
- [x] Página /dev/components (catálogo completo)
- [x] Testes unit + e2e do shell (11 unit + 8 e2e)
- [x] ADR 0004
- [x] Commit final

### ✓ Fase 5 — Configurações + Catálogo + Clientes
- [x] Configurações (6 submódulos: settings, payment methods, installment rules, integrations, user roles, invite user)
- [x] Catálogo (4 submódulos: services, diagnostic templates, device categories, devices)
- [x] Clientes (4 submódulos: list, create, edit, detail + interests)
- [x] PATTERNS.md documentado com padrão CRUD + notas Zod v4
- [x] Testes verdes (82 unit + integration customers + e2e customers)
- [x] Commit final

### ✓ Fase 6 — Estoque + Caixa + Financeiro
- [x] Estoque (produtos CRUD, movimentações atômicas, compras de aparelhos, relatório inventário)
- [x] Caixa (abrir/fechar com conferência, sangria/suprimento, histórico, resumo por forma de pagamento)
- [x] Financeiro (transações AP/AR, parcelamento automático, pagamento de parcelas, fluxo de caixa, vencidos)
- [ ] Saques Depix (integração Pixpay adiada para Fase 7/8 — depende de OS/PDV)
- [x] Testes verdes (31 unit tests de validators)
- [x] Commit final

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

### 2026-05-08 — Fase 6

- **Implementado:**
  - 3 schemas Prisma (stock.prisma, cashier.prisma, financial.prisma) com 7 novas tabelas + 6 enums
  - RLS habilitado em todas as 7 tabelas tenant-scoped via migration SQL
  - Validators Zod: stock.ts, cashier.ts, financial.ts
  - tRPC routers: stockRouter (11 procedures), cashierRouter (7 procedures), financialRouter (9 procedures)
  - Stock UI: Produtos (DataTable + CRUD + ajuste estoque Dialog), Movimentações (histórico geral filtrado), Compras de Aparelhos (DataTable + form), Relatório de Inventário (cards resumo + tabela)
  - Cashier UI: Página principal com dois estados (sem caixa/caixa aberto), Dialogs para abrir/sangria/suprimento/fechar com conferência, Resumo por forma de pagamento, Histórico de caixas, Detalhe de caixa fechado
  - Financial UI: Listagem com Tabs A Pagar/A Receber + filtros, Criar transação com parcelamento automático (1-36x), Detalhe com pagamento de parcelas (Dialog), Fluxo de Caixa (agrupamento dia/semana/mês + cards resumo), Seção de vencidos
  - Sidebar nav atualizada (Estoque → /stock, Caixa → /cashier, Financeiro → /financial)
  - Testes: 31 unit tests de validators (product, cash register, financial transaction, installment, device purchase)
- **Decisões:**
  - MoneyInput trabalha em centavos internamente — forms convertem centavos↔reais no submit/defaultValues
  - Prisma Decimal retornado em queries precisa de cast para Number() nas tabelas UI — row interfaces usam `unknown` para Decimal fields
  - Saques Depix (integração Pixpay) adiados para Fase 7/8 — dependem de OS e PDV para fazer sentido
  - `adjustStock` usa delta atômico (increment/decrement) dentro de `withTenant` transaction
  - Caixa: apenas 1 aberto por user (validado server-side com CONFLICT error)
  - Parcelas geradas automaticamente com divisão proporcional (última parcela recebe resto)
- **Próximo:** Fase 7 — Ordens de Serviço

---

### 2026-05-08 — Fase 5

- **Implementado:**
  - 3 schemas Prisma (settings.prisma, catalog.prisma, customer.prisma) com 11 novas tabelas + 5 enums
  - RLS habilitado em todas as 11 tabelas tenant-scoped via migration SQL
  - Validators Zod: settings.ts, catalog.ts, customer.ts (CNPJ com dígito verificador)
  - tRPC routers: settingsRouter (14 procedures), catalogRouter (16 procedures), customerRouter (11 procedures)
  - Settings UI: Geral (form com ViaCEP), Formas de Pagamento (CRUD + parcelamentos Sheet), Integrações (grid de cards com config Dialog), Usuários (tabela + invite por CPF)
  - Catalog UI: Serviços (DataTable + form), Templates de Diagnóstico (DataTable + form), Aparelhos (DataTable + filtros), Categorias (inline CRUD)
  - Customers UI: listagem com busca+filtro PF/PJ, criar (LGPD consent), editar, detalhe (tabs Dados/OS/Interesses)
  - Testes: 23 unit tests de validators (CPF/CNPJ/serviço/pagamento), 7 integration tests de RLS de clientes, 4 e2e specs de clientes
  - LoadingState ganhou variante "form"
  - ConfirmDialog ganhou prop variant="destructive"
  - PATTERNS.md: seção "Padrão CRUD por módulo" com template completo + notas Zod v4
- **Decisões:**
  - Zod v4 não suporta `.default()` em schemas usados com react-hook-form (causa type mismatch no resolver) — removidos todos os `.default()` dos validators, defaults passados no `useForm({ defaultValues })`
  - Zod v4 não suporta `.partial()` em schemas com `.superRefine()` — updateCustomerSchema definido explicitamente
  - `z.input<>` usado como FormValues type quando schema tem refinements que mudam o output type
  - Prisma Device.attributes usa `as Parameters<...>` cast para contornar ambiguidade de union type no Prisma v7 (DeviceCreateInput vs DeviceUncheckedCreateInput com categoryId)
  - Settings layout usa `headers()` `x-pathname` para destacar nav ativa (padrão estático — Next.js não expõe pathname em Server Components sem headers)
  - Users page: user_roles é tenant-scoped, mas users é global — busca roles via withTenant, depois users via withAdmin
- **Próximo:** Fase 6 — Estoque + Caixa + Financeiro

---

### 2026-05-08 — Fase 4

- **Implementado:**
  - globals.css: paleta Arena Tech completa (dark/light com tokens success, warning, sidebar)
  - next-themes ThemeProvider (dark padrão) + Sonner Toaster no root layout
  - Logo placeholder SVG "ARENA·TECH" (variantes: full, icon, monogram; tamanhos: sm/md/lg)
  - App Shell: SidebarProvider com cookie de persistência, AppSidebar colapsável (224/64px), MobileSidebar (Sheet), AppHeader com breadcrumb e trigger ⌘K
  - Admin Shell: AdminSidebar e AdminHeader com badge SUPER ADMIN dourado/warning
  - DataTable com TanStack Table v8 (server-side pagination, skeleton loading, toolbar)
  - FormSection + FormActions com loading state
  - Inputs especializados: MoneyInput (centavos), CnpjInput, PhoneInput, CepInput (ViaCEP), DatePicker, DateRangePicker
  - Domain components: StatusBadge (CVA), EntitySelector (Popover+Command+debounce), ConfirmDialog, PageHeader, EmptyState, LoadingState
  - Command Palette ⌘K via CommandDialog (Context Provider global)
  - Toast helpers wrapper (lib/toast.ts)
  - Auth pages redesign: layout com glassmorphism + radial gradient dourado, login/select-tenant/no-access/forgot-password atualizados
  - /dev/components: catálogo de 13 seções (typo, cores, botões, inputs, badges, cards, tabela, toast, empty, loading, confirm, form, command palette)
  - Unit tests: 11 testes de inputs (CPF, CNPJ, phone, money) passando
  - E2E tests: 8 cenários de shell (sidebar, cookie, navegação, ⌘K, /dev/components, toast, mobile)
  - ADR 0004 + PATTERNS.md atualizado com seções de design system, nova página, novo componente
- **Decisões:**
  - Sidebar mobile usa Sheet (gaveta) em vez de overlay fixo — melhor UX em telas pequenas
  - Cookie arena_sidebar_collapsed lido no servidor evita flash de estado no SSR
  - CommandPaletteProvider no (app)/layout.tsx — disponível em todas as páginas autenticadas
  - E2E usa credenciais do seed (não mockadas) — testa fluxo real
  - Integration tests (rls, auth-tenant-access) falhando por issue pré-existente de credenciais DB test — não é regressão da Fase 4
- **Próximo:** Fase 5 — Configurações + Catálogo + Clientes

---

### 2026-05-08 — Revisão e fechamento da Fase 3

- **Contexto:** Revisão do dono identificou duas pendências antes do fechamento.
- **Correção A — Segurança:** Brecha no tenantProcedure corrigida. Cookie `x-active-tenant` é raw, mas agora validado em dois pontos independentes (proxy.ts + tenantProcedure). 6 testes de regressão adicionados.
- **Correção B — Next.js 16:** middleware.ts migrado para proxy.ts (Node.js runtime). auth.config.ts mesclado em auth.ts (split não mais necessário). Zero warnings de deprecação.
- **Documentação:** ADR 0002 com adendo pós-revisão, ADR 0003 novo (Next.js 16), PATTERNS.md atualizado.

---

### 2026-05-08 — Fase 3

- **Implementado:**
  - Validador CPF (normalizeCpf, validateCpf, cpfSchema) com 26 unit tests
  - NextAuth v5 (beta.31) com Credentials provider (CPF + bcrypt)
  - JWT callbacks carregam availableTenants, auto-select single-tenant
  - Auth config split: auth.config.ts (Edge-safe) + auth.ts (Node-only)
  - Cookie x-active-tenant para switch sem re-auth
  - Middleware Edge com protecao completa de rotas
  - tRPC: 4 tipos de procedures (public, protected, tenant, admin)
  - Auth router: me + validateTenantAccess
  - Server actions: loginAction, logoutAction, switchTenantAction
  - 6 paginas: login, select-tenant, no-access, forgot-password, dashboard, admin
  - CpfInput component com mascara automatica
  - Seed expandido: 2 tenants + 4 users cobrindo todos os cenarios de auth
  - 8 cenarios E2E passando (fluxos completos de auth)
  - ADR 0002 em docs/decisions/0002-auth-strategy.md
- **Decisoes:**
  - SEM subdomain — tenant resolvido por cookie/JWT pos-login
  - Auth config split para Edge runtime (middleware nao pode importar crypto/pg)
  - middleware.ts deprecated no Next.js 16 em favor de proxy.ts — funciona com warning
  - bcryptjs mantido (pure JS, Docker-safe, performance negligivel para login)
  - Passwords no .env sem chars $ para evitar shell expansion no source
  - impersonatedTenantId preparado no JWT para futuro uso
- **Proximo:** Fase 4 — Design system + layout (aguardando confirmacao)

---

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
| Linhas de código | ~6000 |
| Cobertura de testes | 69 unit + 6 integration + 16 e2e |
| Tabelas no schema | 22 (15 anteriores + 7 Fase 6: products, stock_movements, device_purchases, cash_registers, cash_movements, financial_transactions, installments) |
| Procedures tRPC | 71 (44 anteriores + stock.11, cashier.7, financial.9) |
| Páginas | 45+ (28 anteriores + stock 8 + cashier 4 + financial 5) |
| Componentes shadcn/ui | 24 (+ tooltip, calendar) |
| Componentes de domínio | 15 (DataTable, StatusBadge, EntitySelector, ConfirmDialog, PageHeader, EmptyState, LoadingState, FormSection, FormActions, MoneyInput, CnpjInput, PhoneInput, CepInput, DatePicker, DateRangePicker) |
| Tabelas inventariadas do Laravel | ~55 tabelas tenant + ~20 tabelas central |
| Rotas inventariadas do Laravel | ~150+ rotas |
| Jobs identificados | 13 |
| Integrações externas | 11 (Autentique, Depix, Evolution/WhatsApp, Chatwoot, Nuvem Fiscal, Focus NFe, IMEI Check, Asaas, Anthropic, DirectD, MeuDANFE) |
