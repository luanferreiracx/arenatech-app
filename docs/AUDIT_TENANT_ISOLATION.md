# Auditoria de Isolamento de Tenants — 2026-06-02

> Objetivo (dono): **SEMPRE, SEMPRE os dados de cada tenant devem ser independentes — jamais misturados com outro tenant.**

Investigação sistemática (3 frentes em paralelo): RLS por tabela, uso de `withAdmin`/`prisma` direto nas procedures, e robustez da própria camada de RLS.

## Como o isolamento funciona aqui

- **RLS no Postgres** é a camada de isolamento. Cada query de tenant roda dentro de uma transação que faz `SET LOCAL ROLE app_user` + `SET LOCAL app.current_tenant_id = '<uuid>'` (helper `withTenant` em `src/server/db.ts`). A policy `tenant_isolation` filtra `tenant_id = current_tenant_id()`.
- `withAdmin` faz `SET LOCAL ROLE app_admin` (BYPASSRLS) — para dados globais (tenants, users, user_tenants, plans) e super admin.
- Os routers fazem `findMany({ where })` / `findUnique({ where: { id } })` **sem filtro manual de tenant_id** — confiam 100% na RLS. **Logo, tabela de tenant SEM RLS = vazamento.**

## Achados e correções (aplicadas nesta sessão)

### 🔴 CRÍTICO — Account takeover cross-tenant
- **`settings.resetUserPassword`** — era `tenantProcedure` sem gate de role; recebia `userId` arbitrário e resetava a senha (→ "123456") de **qualquer** usuário via `withAdmin`, sem checar vínculo. Um membro da loja A invadia a conta do dono da loja B.
- **Fix:** valida vínculo `user_tenants[tenant ativo]` (404 se não pertence) + exige role admin (owner/manager/admin).

### 🟠 Vazamento de PII
- **`providerCommission.listAvailableUsers`** — listava id/nome/**CPF** de TODOS os usuários do sistema (todos os tenants).
- **Fix:** `where: { tenants: { some: { tenantId: ctx.tenantId } } }`.

### 🟡 Write cross-tenant
- **`serviceOrder.setTechnician`** — não validava que o técnico pertence ao tenant. **Fix:** checa `user_tenants` (escopado) antes de atribuir.
- **`webhooks/pagbank`** — casava `quick_sale.number` (único só por tenant) sem tenant. **Fix:** recusa se houver match ambíguo (>1). Obs: nenhum fluxo cria cobrança PagBank hoje (gateway ativo = DePix).

### 🛡️ RLS aplicada (defesa em profundidade) — migrations desta sessão
Tabelas com `tenant_id` que estavam **sem RLS** (corrigidas):
- `20260602120000` — `depix_withdrawals`, `quick_sales`
- `20260602123000` — `payment_method_rates`, `sale_audits`, `sale_documents`, `sale_upgrades`, `nfe_imports`, `nfe_import_items`
- `20260602130000` — `reward_balances`, `reward_movements`, `reward_actions`, `reward_campaigns`, `chatbot_conversations`, `chatbot_messages`, `chatbot_follow_ups`, `checklists`

### ✅ Falsos positivos (NÃO precisam RLS)
- **`user_tenants`** — junção global usuário↔tenant. RLS quebraria o login (lido via `withAdmin` antes de existir tenant ativo). Isolamento garantido pelos call sites (PK composta `userId_tenantId`).
- **`tenant_number_sequences`** — acesso só via `nextTenantNumber()`, upsert atômico `ON CONFLICT (tenant_id, scope, year)` sempre com tenant literal. Sem leitura cross-tenant.

## Furos estruturais — PENDENTE de decisão

### 1. A app conecta como SUPERUSER do Postgres (`arenatech`)
- Superuser **ignora RLS completamente**. Hoje só não vaza porque todo acesso passa por `withTenant`/`withAdmin` (que rebaixam o role com `SET LOCAL ROLE`). É uma rede de segurança **opcional**: qualquer `prisma.<model>` direto roda como superuser e vê todos os tenants.
- **Recomendação:** trocar `DATABASE_URL` para um role **NOLOGIN-derivado não-superuser** (login role que faz `SET ROLE app_user` por padrão). Fecha o furo de vez. É mudança de infra (criar role + grants + testar em prod) — requer janela e cuidado.

### 2. ~27 policies "fracas" (consistência, NÃO vazamento)
- Padrão antigo: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` — sem `, true` e sem `WITH CHECK` explícito.
- **Confirmado que NÃO vaza:** Postgres usa `USING` como `WITH CHECK` implícito (bloqueia INSERT/UPDATE cross-tenant — testado ao vivo); e o `current_setting` sem `true` dá erro (fail-loud) quando o setting falta, em vez de retornar linhas.
- **Recomendação (baixa prioridade):** padronizar com `, true` + `WITH CHECK` explícito + `admin_bypass` por legibilidade.

## Connection pooling — OK
Sem PgBouncer/pooler em modo transaction. `SET LOCAL` roda dentro de transação interativa e expira no fim → não vaza entre requests mesmo reusando conexão. O vetor crítico clássico está corretamente tratado.
