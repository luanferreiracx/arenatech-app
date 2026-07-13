# H — Auditoria de RLS (Row-Level Security)

**Data:** 2026-07-13
**Escopo:** PostgreSQL 18 de PRODUÇÃO (`arenatech-postgres-prod`), read-only, + código (`src/server/db.ts`, routers, migrations).
**Método:** queries reais contra `pg_policies`, `pg_class`, `information_schema`, `pg_proc`, `pg_index`. FATO = query rodada e resultado colado. HIPÓTESE marcada.

---

## Resumo executivo

- **136 tabelas** em `public`. **113 tabelas têm coluna `tenant_id`.**
- **110 dessas 113 têm RLS habilitado + FORÇADO + política.** ✅
- **3 tabelas com `tenant_id` SEM política nenhuma:** `product_brands`, `subscriptions`, `user_tenants`.
  - `subscriptions` e `user_tenants` são **globais por design** e acessadas só via `withAdmin` / com filtro explícito por `ctx.tenantId` — corretas.
  - `product_brands` é uma **tabela órfã legada** (sem modelo Prisma, sem uso no código) com RLS **desabilitado** e `GRANT` completo a `app_user` — **landmine latente** (H1).
- **0 tabelas com política incompleta por comando.** Toda política é `cmd=ALL` (cobre SELECT/INSERT/UPDATE/DELETE de uma vez). O risco clássico "SELECT sem UPDATE/DELETE" **não existe aqui.**
- **RLS FORÇADO (`relforcerowsecurity=t`) em 100% das tabelas com política** — o owner não bypassa. Além disso o runtime nunca roda como owner (`app_login`→`SET LOCAL ROLE app_user`, ambos `rolbypassrls=f`).
- Todas as colunas de política (`tenant_id`) têm índice-líder. Único sem índice-líder é `user_tenants`, que não usa RLS.

---

## Arquitetura confirmada (contexto, não achado)

**Roles** (FATO — `pg_roles`):
```
app_admin | super=f | bypassrls=t   ← withAdmin faz SET LOCAL ROLE app_admin (bypassa RLS)
app_login | super=f | bypassrls=f   ← conexão do runtime (APP_DATABASE_URL)
app_user  | super=f | bypassrls=f   ← withTenant faz SET LOCAL ROLE app_user (sujeito a RLS)
arenatech | super=t | bypassrls=t   ← owner das tabelas / migrations (DATABASE_URL)
```

**Função de contexto** (FATO — `pg_proc`):
```sql
current_tenant_id() = SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
```
`current_setting(..., true)` (missing_ok=true) → se o GUC não estiver setado, retorna NULL, e `tenant_id = NULL` é falso → **fail-closed** (nenhuma linha). ✅

**Forma da política** (FATO — `pg_policies`, amostra `customers`/`product_categories`/`depix_withdrawals`):
- `tenant_isolation` (role `public`): `qual` e `with_check` = `tenant_id = current_tenant_id()` (ou a variante `(tenant_id)::text = current_setting('app.current_tenant_id', true)` em algumas tabelas mais antigas — equivalente).
- Muitas tabelas têm também `admin_bypass` (role `app_admin`, `qual=true`). Redundante (app_admin já tem BYPASSRLS globalmente) mas **inofensivo**.

**`src/server/db.ts`** (FATO): `withTenant` faz `SET LOCAL ROLE app_user` **antes** de `SET LOCAL app.current_tenant_id`. Ordem correta — o role sujeito a RLS é aplicado antes do filtro. `SET LOCAL` → escopo de transação, sem vazamento entre conexões do pool. ✅

---

## H1 — `product_brands`: tabela com `tenant_id`, RLS DESABILITADO, GRANT total a app_user (landmine latente)

**Severidade:** MÉDIA (latente; não explorável pela superfície atual, mas sem rede de proteção).
**Confiança:** ALTA (FATO).

**Evidência:**

Cross-join tenant_id × política (FATO):
```sql
WITH tt AS (SELECT relname FROM ... WHERE attname='tenant_id'),
     pol AS (SELECT DISTINCT tablename FROM pg_policies WHERE schemaname='public')
SELECT tt.relname FROM tt LEFT JOIN pol ON pol.tablename=tt.relname WHERE pol.tablename IS NULL;
→ product_brands
  subscriptions
  user_tenants
```

Estado de RLS (FATO — `pg_class`):
```
product_brands | relrowsecurity=f | relforcerowsecurity=f   ← RLS nem habilitado
```

Dados reais (FATO):
```sql
SELECT count(*), count(tenant_id), count(DISTINCT tenant_id) FROM product_brands;
→ 80 | 80 | 1     ← 80 linhas, TODAS com tenant_id (dado real de tenant)
```

Grants (FATO — `information_schema.role_table_grants`):
```
app_user | SELECT / INSERT / UPDATE / DELETE   ← app_user pode ler e escrever tudo
```

**É EXPLORÁVEL cross-tenant?** **HOJE NÃO** — mas é um landmine.
- FATO: `grep -rn "product_brands\|ProductBrand\|productBrand"` em `prisma/schema/` e `src/` → **zero** resultados. Não há modelo Prisma nem raw SQL apontando pra ela. `brand` hoje é um `String?` direto em `products`/`stock_items`, não um FK.
- FATO: `product_brands` **não aparece em nenhuma migration** de `prisma/migrations/` → é artefato pré-Prisma (schema legado do Laravel), nunca adotado no modelo atual.
- HIPÓTESE: como não há caminho de código que a toque via `app_user`, não há vazamento ativo. Mas se um dev criar um `model ProductBrand` no schema ou um `$queryRaw` contra ela dentro de `withTenant`, o SELECT/UPDATE/DELETE **vazará entre todos os tenants silenciosamente** — sem a rede do RLS pra barrar.

**Fix (SQL):** ou dropar a tabela órfã, ou colocá-la na rede de RLS. Como ela não é usada, o mais limpo é dropar; se houver dúvida, endurecer:

```sql
-- Opção A (recomendada): remover artefato legado não usado
DROP TABLE IF EXISTS public.product_brands;

-- Opção B (se quiser preservar): trazer pra rede de RLS
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_brands FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.product_brands
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
-- (tenant_id já é indexável; criar índice-líder se for manter)
CREATE INDEX IF NOT EXISTS product_brands_tenant_id_idx ON public.product_brands (tenant_id);
```

---

## H2 — `subscriptions` e `user_tenants`: globais sem RLS, isolamento por app_admin/filtro (intencional, verificado)

**Severidade:** BAIXA / informativo.
**Confiança:** ALTA (FATO).

**Evidência:**

`subscriptions` (FATO — `pg_class`: `relrowsecurity=f`), sem política. Acesso **exclusivo** em `admin.ts` via `adminProcedure` + `ctx.withAdmin` (FATO):
```
src/server/api/routers/admin.ts:466  ctx.withAdmin(async (tx) => tx.subscription.findUnique(...))
```
`grep -rn "tx.subscription|prisma.subscription"` → **só admin.ts**. Nenhum `tenantProcedure` toca. Correto: billing é domínio de superadmin (BYPASSRLS).

`user_tenants` (FATO — `pg_class`: `relrowsecurity=f`), sem política. É join table user↔tenant (um user pertence a N tenants), então **não pode** ser filtrada por um único tenant no nível do banco. Isolamento é por **filtro explícito de `ctx.tenantId`** em todo uso dentro de router de tenant (FATO):
```
settings.ts:437  where = { tenantId: ctx.tenantId, ... }
cashier.ts:488   where: { tenantId: ctx.tenantId, userId: { in: userIds } }
cashier.ts:617   where: { tenantId: ctx.tenantId, userId: { in: userIds } }
sale.ts:2865     where: { tenantId: ctx.tenantId }
sale.ts:4196     where: { tenantId: ctx.tenantId, userId: input.sellerId }
```
Leituras em `auth.ts` (login) → todas via `withAdmin` (FATO: linhas 106, 328).

**É EXPLORÁVEL cross-tenant?** Não pela superfície atual. **Ressalva (HIPÓTESE):** o isolamento de `user_tenants` depende de **disciplina de desenvolvedor** (lembrar de `where tenantId`), não da rede do banco. Um `findMany` futuro sem esse filtro dentro de `withTenant` vazaria memberships de outros tenants (nome/role de usuários). É a mesma classe de risco do H1, porém aqui é by-design (join N:N não comporta RLS por-tenant trivial). Mitigação possível (opcional): política RLS que permita ler linha onde `tenant_id = current_tenant_id()` — funciona para os 5 usos acima (todos filtram por tenant) e transforma o filtro em rede do banco. Requer validar que `auth.ts` (que precisa ver todos os tenants de um user) continua via `withAdmin`.

---

## Tabela — Tabelas com `tenant_id`: RLS / comandos / FORCE

Fonte: `pg_class` (RLS/FORCE), `pg_policies` (cmd). **Todas as políticas são `cmd=ALL`** → uma linha cobre S/I/U/D. Legenda: RLS = row security habilitado; FORCE = forçado (owner não bypassa); POL = tem política de isolamento.

| Grupo | Tabelas | RLS | FORCE | POL (cmd=ALL cobre S/I/U/D) |
|---|---|---|---|---|
| **Com RLS completo (110)** | acquirer_rates, acquirers, addon_purchases, audit_logs, card_brands, card_receivables, cash_movements, cash_sessions, catalog_device_categories, catalog_devices, chatbot_configs, chatbot_conversations, chatbot_follow_ups, chatbot_messages, checklists, customers, dashboard_categories, dashboard_links, delivery_persons, depix_daily_limits, depix_deposit_repayments, depix_lbtc_refills, depix_withdrawals, device_purchases, device_valuations, expenses, external_labs, financial_categories, financial_transactions, imei_queries, imei_quotas, installment_payments, installment_rules, installments, interest_interactions, interests, invoice_items, invoices, iphone_listings, lab_orders, message_templates, messages, nfe_import_items, nfe_imports, notification_configs, partner_api_keys, partner_webhook_configs, payment_links, payment_method_rates, payment_methods, product_attribute_values, product_attributes, product_categories, product_category_pivots, product_photos, product_variations, products, provider_apuracoes, provider_commission_rules, provider_contracts, provider_reversals, provider_uncovered_days, providers, quick_sales, receiving_accounts, refunds, reward_actions, reward_balances, reward_campaigns, reward_movements, sale_audits, sale_documents, sale_items, sale_upgrades, sales, service_observations, service_order_documents, service_order_history, service_order_items, service_order_quotes, service_orders, service_providers, service_types, services, simulator_installment_tiers, simulator_rate_configs, stock_items, stock_movements, suppliers, tenant_assistance_settings, tenant_byow_wallets, tenant_depix_fee_configs, tenant_depix_fee_ledger, tenant_depix_transactions, tenant_depix_wallets, tenant_fiscal_settings, tenant_integrations, tenant_number_sequences, tenant_receiving_settings, tenant_security_settings, tenant_settings, user_roles, whatsapp_ai_conversations, whatsapp_ai_executions, whatsapp_ai_messages, whatsapp_conversations, whatsapp_group_messages, whatsapp_groups, whatsapp_messages_sent | ✅ t | ✅ t | ✅ ALL (S+I+U+D) |
| **`product_brands` (H1)** | product_brands | ❌ **f** | ❌ **f** | ❌ **NENHUMA** — GRANT total a app_user |
| **`subscriptions` (H2)** | subscriptions | ❌ f | ❌ f | ❌ (global, só withAdmin) — OK |
| **`user_tenants` (H2)** | user_tenants | ❌ f | ❌ f | ❌ (join N:N, filtro por ctx.tenantId) — OK |

> Nota sobre "cmd=ALL": em Postgres, uma política `FOR ALL` aplica `USING` a SELECT/UPDATE/DELETE e `WITH_CHECK` a INSERT/UPDATE. Como **todas** as `tenant_isolation` têm `with_check` = `tenant_id = current_tenant_id()` (FATO, amostrado), não há brecha de INSERT/UPDATE gravando linha de outro tenant. **Não há o gap "SELECT sem UPDATE/DELETE"** que a missão pediu pra caçar.

---

## Tabelas globais confirmadas (sem `tenant_id`, sem RLS — intencional)

FATO (`pg_class` relrowsecurity=f + sem coluna tenant_id):

| Tabela | Papel | Acesso seguro? |
|---|---|---|
| `tenants` | registro-mestre de tenants | withAdmin (superadmin) ✅ |
| `users` | identidade global (CPF) | withAdmin (login/auth) ✅ |
| `user_tenants` | join user↔tenant N:N (tem tenant_id mas é global) | withAdmin + filtro ctx.tenantId ✅ (H2) |
| `subscriptions` | billing manual (tem tenant_id mas é global) | adminProcedure/withAdmin ✅ (H2) |
| `plans` | catálogo de planos do SaaS | global read; escrita superadmin ✅ |
| `addons` | catálogo de addons (0 linhas, sem tenant_id) | global ✅ |
| `webhook_events` | idempotência de webhooks externos | processado fora de contexto de tenant ✅ |
| `depix_webhook_events` | idempotência webhook DePix | idem ✅ |
| `password_reset_tokens` | tokens de reset (escopo user) | withAdmin (auth) ✅ |
| `verification_codes` | códigos de verificação (escopo user) | withAdmin (auth) ✅ |
| `pre_registrations` | auto-cadastro NO-KYC (pré-tenant) | superadmin aprova ✅ |
| `cron_locks` | lock de cron distribuído | infra global ✅ |
| `product_attribute_configs` | config de atributos (413 linhas, **sem tenant_id**) | escopado via join no parent ✅ |
| `product_variation_attributes` | pivot variação↔atributo (6117 linhas, **sem tenant_id**) | escopado via join no parent ✅ |
| `product_brands` | **LEGADA/ÓRFÃ — tem tenant_id, ver H1** | ⚠️ landmine |
| `_prisma_migrations` | metadados do Prisma | infra ✅ |
| `_map_*` (16 tabelas) | tabelas de mapeamento da migração Laravel→Prisma | staging/migração; verificar se ainda necessárias (HIPÓTESE: podem ser dropadas pós-migração) |

> **Observação (HIPÓTESE, fora de escopo estrito de RLS):** as 16 tabelas `_map_*` (mapeamento de IDs Laravel→UUID durante a migração) permanecem em prod sem RLS. Se contêm dados de múltiplos tenants e app_user tem GRANT, seriam um risco análogo ao H1 — mas presumo que sejam artefatos de migração sem caminho de código. Vale um follow-up: `grep _map_` no código; se órfãs, dropar. Não bloqueia esta auditoria.

---

## Índices em colunas de política (pergunta #7)

FATO — tabelas com `tenant_id` **sem** índice cujo 1º campo é `tenant_id`:
```
user_tenants   ← única; mas NÃO usa RLS (global), então tenant_id não é coluna de policy
```
**Todas as 110 tabelas com política `tenant_isolation` têm índice-líder em `tenant_id`.** ✅ Requisito do CLAUDE.md ("toda coluna usada em policy de RLS deve ser indexada") satisfeito.

---

## Migrations × políticas (pergunta do código)

FATO — o projeto separa criação de tabela e criação de política em migrations distintas (convenção do CLAUDE.md: "Migration que altera RLS = arquivo SQL puro"). Migrations `CREATE TABLE ... tenant_id` frequentemente têm **0** stmts de RLS no mesmo arquivo, mas há **20 migrations `rls_*` dedicadas** (`20260508185700_rls_fase5`, `20260602130000_rls_reward_chatbot_checklist`, `20260602123000_rls_sales_nfe_payment_rates`, `20260605101000_rls_tenant_number_sequences`, etc.) que aplicam as políticas em lote. Cruzando com o estado real de prod, **todas as tabelas de tenant criadas via Prisma receberam política** — a única sobra (`product_brands`) é pré-Prisma e nunca teve migration, por isso escapou (H1). Nenhuma migration recente criou tabela de tenant e esqueceu a `rls_*` correspondente.

---

## Recomendações priorizadas

1. **H1 — resolver `product_brands`** (dropar a órfã, ou ENABLE+FORCE+POLICY+índice). Fecha o único landmine com GRANT ativo a app_user.
2. **H2 — opcional:** avaliar adicionar `tenant_isolation` a `user_tenants` (os 5 usos já filtram por tenant; transforma disciplina em rede do banco). `auth.ts` precisa continuar em `withAdmin`.
3. **Higiene:** auditar e dropar `_map_*` órfãs pós-migração (follow-up, fora de escopo RLS).
4. **Guard-rail preventivo (HIPÓTESE de alto valor):** adicionar teste de integração que falha se existir tabela em `public` com coluna `tenant_id` e sem política RLS forçada — pega o próximo `product_brands` automaticamente no CI.
