# ADR 0001 — Multi-tenancy via PostgreSQL Row Level Security

**Status:** Accepted
**Date:** 2026-05-08
**Decision makers:** Luan Ferreira (owner), Claude Code (architect)

---

## Context and Problem Statement

O sistema Arena Tech é um SaaS multi-tenant onde cada loja (tenant) tem seus próprios dados isolados. O sistema Laravel atual usa `stancl/tenancy` com **banco MySQL separado por tenant** — cada tenant tem seu próprio database (ex: `arenatech_loja1`, `arenatech_loja2`).

Na migração para Next.js + PostgreSQL, precisamos de uma estratégia de multi-tenancy que:
1. Garanta isolamento absoluto de dados entre tenants
2. Simplifique operações (backup, migrations, monitoramento)
3. Permita queries cross-tenant para super admin
4. Seja escalável para dezenas de tenants
5. Funcione com Prisma ORM

## Decision

Usar **Row Level Security (RLS) do PostgreSQL** com uma coluna `tenant_id UUID NOT NULL` em todas as tabelas com escopo de tenant.

### Como funciona

1. **Coluna `tenant_id`:** Toda tabela escopada por tenant tem `tenant_id UUID NOT NULL`
2. **Função `current_tenant_id()`:** Lê `app.current_tenant_id` da sessão PostgreSQL
3. **Policies por tabela:** `USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())`
4. **Roles:**
   - `app_user` — sujeito a RLS (aplicação normal)
   - `app_admin` — `BYPASSRLS` (super admin, jobs administrativos)
5. **SET LOCAL dentro de $transaction:** A aplicação faz `SET LOCAL ROLE app_user` + `SET LOCAL app.current_tenant_id = '<uuid>'` dentro de transações interativas do Prisma

### Por que SET LOCAL + $transaction (não Client Extensions)

- `SET LOCAL` só tem efeito dentro de uma transação — fora, é no-op silencioso
- Prisma Client Extensions `query` component pode ignorar contexto de transação existente (documentado como limitação)
- A abordagem explícita com `$transaction` é mais verbosa mas elimina escapes silenciosos de RLS
- Helpers `withTenant(id, fn)` e `withAdmin(fn)` abstraem a verbosidade

### Por que SET LOCAL ROLE (não conexões separadas)

- O superuser/owner PostgreSQL **sempre bypassa RLS**, mesmo com `FORCE ROW LEVEL SECURITY`
- `SET LOCAL ROLE app_user` faz a sessão operar como `app_user` apenas dentro da transação
- Após a transação, o role volta ao original automaticamente
- Zero overhead de conexão — usa a mesma conexão do pool

## Alternatives Considered

### Schema-per-tenant (PostgreSQL schemas)

Cada tenant em seu próprio schema PostgreSQL (`tenant_loja1.customers`, `tenant_loja2.customers`).

**Prós:** Isolamento forte, permite diferentes versões de schema
**Contras:**
- Migrations precisam rodar N vezes (uma por schema)
- Prisma não suporta schemas dinâmicos nativamente
- Backup/restore parcial complexo
- Connection pooling complicado (search_path por conexão)

**Rejeitado:** Complexidade operacional alta, incompatível com Prisma multi-file schema.

### Database-per-tenant (como o stancl/tenancy)

Cada tenant em seu próprio database PostgreSQL.

**Prós:** Isolamento máximo, pode mover tenants para servers separados
**Contras:**
- N conexões de banco (1 por tenant) — connection pooling problemático
- N migrations por release
- N backups
- Queries cross-tenant impossíveis (JOIN entre databases)
- Prisma não suporta múltiplos datasources dinâmicos

**Rejeitado:** Foi exatamente o que o Laravel usa e que estamos deixando por causa da complexidade operacional.

### Application-level filtering (WHERE tenant_id = X)

Sem RLS — apenas adicionar `WHERE tenant_id = ?` em cada query via middleware Prisma.

**Prós:** Simples, funciona com qualquer banco
**Contras:**
- Um bug no middleware = vazamento de dados cross-tenant
- Não protege queries raw SQL
- Sem garantia a nível de banco — depende 100% da aplicação
- N+1 de confiança: cada nova query precisa lembrar do filtro

**Rejeitado:** Risco de segurança inaceitável para dados financeiros/pessoais.

## Consequences

### Positivas
- **Banco único:** Um backup, uma migration, um monitoramento
- **Isolamento por construção:** RLS é enforcement no nível do banco — impossível vazar dados por bug na aplicação
- **Queries cross-tenant:** Super admin usa `SET ROLE app_admin` para ver tudo
- **Performance:** Índices compostos (tenant_id, ...) otimizam queries filtradas
- **Simplicidade operacional:** Mesma complexidade para 1 ou 100 tenants

### Negativas
- **Verbosidade:** Toda operação tenant-scoped precisa de `withTenant(id, async (tx) => { ... })`
- **Risco de escape:** Esqueceu de usar `withTenant`? A query roda como superuser e vê tudo. Mitigação: lint rule, code review, `FORCE ROW LEVEL SECURITY`
- **SET LOCAL + transaction overhead:** Cada operação tenant-scoped cria uma transação. Impacto mínimo mas mensurável
- **Prisma 7 adapter obrigatório:** `@prisma/adapter-pg` necessário (sem `datasourceUrl` no schema)
- **PostgreSQL lock-in:** RLS é feature específica do PostgreSQL — migrar para outro banco requer repensar a estratégia

## Technical Notes

### FORCE ROW LEVEL SECURITY

`ALTER TABLE ... FORCE ROW LEVEL SECURITY` faz com que RLS seja aplicado mesmo para o table owner. **Porém**, superusers (como o user principal do banco) sempre bypassam. Por isso fazemos `SET LOCAL ROLE app_user` — que não é superuser.

### Connection Pooling (PgBouncer)

`SET LOCAL` só funciona em transaction mode (que é o default do PgBouncer). Em statement mode, SET LOCAL não tem efeito. Prisma 7 com `@prisma/adapter-pg` usa connections diretas (sem PgBouncer externo), então isso não é um problema atualmente.

Se futuramente adicionarmos PgBouncer, deve estar em **transaction mode** (não statement mode).

### Tabelas globais (sem RLS)

Algumas tabelas são globais e **não têm** `tenant_id`:
- `tenants` — a própria tabela de tenants
- `users` — usuários podem pertencer a múltiplos tenants
- `user_tenants` — tabela de vínculo

Essas tabelas são acessíveis por qualquer role. O acesso é controlado pela aplicação (procedures tRPC com auth).

## References

- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
- [Prisma Client Extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
- [Prisma Interactive Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [stancl/tenancy (what we're migrating from)](https://tenancyforlaravel.com/)
