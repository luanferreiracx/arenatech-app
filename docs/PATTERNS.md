# PATTERNS.md — Convenções e Padrões do Arena Tech

> Referência para todos os desenvolvedores (humanos e Claude).
> Atualizado a cada fase que introduz novos padrões.

---

## Multi-tenancy

O Arena Tech usa **PostgreSQL Row Level Security (RLS)** para isolamento multi-tenant.

Toda query que toca dados de tenant deve usar `withTenant(tenantId, fn)` de `@/server/db`:

```ts
import { withTenant } from "@/server/db";

const logs = await withTenant(tenantId, async (tx) => {
  return tx.auditLog.findMany();
});
```

Para operações de super admin (cross-tenant):

```ts
import { withAdmin } from "@/server/db";

const allLogs = await withAdmin(async (tx) => {
  return tx.auditLog.findMany();
});
```

**Nunca** acesse dados de tenant via `prisma.model.findMany()` diretamente — isso bypassa RLS e retorna dados de todos os tenants.

---

## Convenções de Schema

### Regras numeradas

1. **IDs:** Sempre `String @id @default(uuid()) @db.Uuid`
2. **tenant_id:** Toda tabela com escopo de tenant DEVE ter `tenantId String @map("tenant_id") @db.Uuid`
3. **Naming banco:** snake_case via `@map` (campos) e `@@map` (tabelas). camelCase no schema Prisma.
4. **Timestamps:** Sempre `createdAt DateTime @default(now()) @map("created_at")` e `updatedAt DateTime @updatedAt @map("updated_at")`
5. **Soft delete:** `deletedAt DateTime? @map("deleted_at")` quando aplicável
6. **Índices compostos:** `@@index([tenantId, campo])` em colunas filtradas frequentemente
7. **Enums:** Em PascalCase, valores em UPPER_CASE
8. **Decimais monetários:** `@db.Decimal(10, 2)`
9. **JSON:** `Json?` para dados semi-estruturados (endereço, checklist, payload)
10. **Multi-file schema:** Um arquivo `.prisma` por agregado de domínio em `prisma/schema/`

### Tabelas globais (sem tenant_id)

- `tenants` — cadastro dos tenants
- `users` — usuários (podem pertencer a múltiplos tenants)
- `user_tenants` — vínculo usuário ↔ tenant

### Tabelas com tenant_id (RLS ativo)

- `audit_logs` — (Fase 2, cobaia)
- _Demais tabelas serão adicionadas nas fases seguintes_

---

## Como adicionar uma nova tabela escopada por tenant

### Checklist

- [ ] 1. Criar modelo no arquivo `.prisma` adequado (ou novo arquivo)
- [ ] 2. Incluir `tenantId String @map("tenant_id") @db.Uuid`
- [ ] 3. Incluir `createdAt`, `updatedAt` (e `deletedAt` se aplicável)
- [ ] 4. Adicionar `@@index([tenantId])` no mínimo
- [ ] 5. Adicionar `@@map("nome_tabela_snake_case")`
- [ ] 6. Rodar `pnpm prisma migrate dev --name descritivo`
- [ ] 7. Criar migration SQL para habilitar RLS na nova tabela
- [ ] 8. Rodar `pnpm prisma migrate dev` para aplicar a migration SQL
- [ ] 9. Verificar com `pnpm test` que RLS está funcionando

### Template SQL para RLS (copiar para cada nova tabela)

Criar uma nova migration SQL em `prisma/migrations/<timestamp>_rls_<tabela>/migration.sql`:

```sql
-- Habilitar RLS na tabela <nome_tabela>
ALTER TABLE <nome_tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <nome_tabela> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <nome_tabela>
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
```

### Template de modelo Prisma

```prisma
model NomeDoModelo {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  // ... campos do domínio
  deletedAt DateTime? @map("deleted_at")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  @@index([tenantId])
  @@map("nome_tabela_snake_case")
}
```

---

## Prisma 7 — Notas importantes

- **Driver adapter obrigatório:** `@prisma/adapter-pg` — sem `datasourceUrl` no schema
- **datasource url:** Configurado em `prisma.config.ts`, não no schema `.prisma`
- **Multi-file schema:** Nativo (sem `prismaSchemaFolder` preview feature)
- **PrismaClient constructor:** Requer `{ adapter }` — `new PrismaClient()` sem args falha
- **Migrations:** Rodam via `prisma migrate dev` que lê `prisma.config.ts` para obter URL

---

## Autenticacao e Autorizacao

### NextAuth v5 (JWT strategy)

- Provider: Credentials (CPF + senha, bcrypt cost 12)
- Session: JWT com claims customizados (id, cpf, isSuperAdmin, activeTenantId, availableTenants)
- Auth config: `src/server/auth.ts` (arquivo unico, sem split Edge/Node)
- `src/proxy.ts` (Next.js 16) le JWT e cookie `x-active-tenant` para resolver tenant ativo — roda em Node.js runtime

### Validacao de tenant (defense in depth)

O acesso ao tenant e validado em **dois pontos independentes**:

1. **proxy.ts**: valida cookie `x-active-tenant` contra `session.availableTenants`, redireciona se invalido
2. **tenantProcedure**: re-valida `ctx.tenantId` contra `session.availableTenants`, rejeita com FORBIDDEN se invalido

Se um for bypassado, o outro ainda protege. Custo negligivel (1 array.some por request).

### tRPC Procedures

| Procedure | Auth | Tenant | Uso |
|---|---|---|---|
| `publicProcedure` | Nenhuma | Nenhum | Login, health, dados públicos |
| `protectedProcedure` | Session JWT | Nenhum | Endpoints que precisam de user mas não de tenant (me, switchTenant) |
| `tenantProcedure` | Session JWT | `x-tenant-id` header | Todas operações de negócio (CRUD, queries) — usa `withTenant` |
| `adminProcedure` | Session JWT + isSuperAdmin | Nenhum (BYPASSRLS) | Admin central — usa `withAdmin` |

### Quando usar cada procedure

```ts
// Dados públicos (sem login)
myRouter.hello = publicProcedure.query(() => ...);

// Precisa de user, mas não de tenant
myRouter.me = protectedProcedure.query(({ ctx }) => {
  return ctx.session.user;
});

// Operação de negócio escopada por tenant
myRouter.list = tenantProcedure.query(({ ctx }) => {
  return ctx.withTenant(async (tx) => tx.customer.findMany());
});

// Admin central (cross-tenant)
myRouter.allTenants = adminProcedure.query(({ ctx }) => {
  return ctx.withAdmin(async (tx) => tx.tenant.findMany());
});
```

### Fluxo de login

1. `/login` → CPF + senha → NextAuth `signIn("credentials")`
2. JWT callback carrega `availableTenants` do banco
3. Se 1 tenant → auto-seleciona `activeTenantId` no JWT
4. Se 0 tenants (não super admin) → redirect `/no-access`
5. Se 2+ tenants → redirect `/select-tenant`
6. Se super admin sem tenant → redirect `/admin`
7. Troca de tenant → cookie `x-active-tenant` → proxy.ts lê

### Proxy de rota (src/proxy.ts)

Prioridade de decisão:
1. Rota pública → passa sempre
2. Não autenticado → redirect `/login`
3. 0 tenants, não super admin → redirect `/no-access`
4. `/admin` → exige isSuperAdmin
5. Sem tenant ativo → redirect `/select-tenant` (ou `/admin` se super admin)
6. Com tenant ativo → injeta header `x-tenant-id`, passa
