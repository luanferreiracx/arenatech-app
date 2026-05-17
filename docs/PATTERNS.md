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

---

## Design System

### Referência visual

`/dev/components` — catálogo de todos os componentes (disponível em dev e para super admins em prod).

### Tokens CSS (globals.css)

A paleta Arena Tech está em `src/app/globals.css`:
- **Primary (dourado):** `#c9a55c` → classe `text-primary`, `bg-primary`
- **Background:** `#0a0a0a` (dark) / `#fafaf9` (light)
- **Success:** `#22c55e` → `text-success`, `bg-success`
- **Warning:** `#f59e0b` → `text-warning`, `bg-warning`

### Componentes disponíveis

| Componente | Path | Uso |
|---|---|---|
| `DataTable` | `@/components/domain/data-table` | Listas com paginação server-side |
| `PageHeader` | `@/components/domain/page-header` | Título + subtitle + actions por página |
| `StatusBadge` | `@/components/domain/status-badge` | Status semânticos (success/warning/destructive/info) |
| `EmptyState` | `@/components/domain/empty-state` | Estado vazio em listas |
| `LoadingState` | `@/components/domain/loading-state` | Skeletons (table/card/list) |
| `ConfirmDialog` | `@/components/domain/confirm-dialog` | Dialog de confirmação destrutiva |
| `EntitySelector` | `@/components/domain/entity-selector` | Combobox com search async |
| `FormSection` | `@/components/domain/forms/form-section` | Agrupador de campos com título |
| `FormActions` | `@/components/domain/forms/form-actions` | Botões Salvar/Cancelar com loading |
| `MoneyInput` | `@/components/inputs/money-input` | Input de valor monetário (centavos) |
| `CpfInput` | `@/components/inputs/cpf-input` | Input CPF com máscara |
| `CnpjInput` | `@/components/inputs/cnpj-input` | Input CNPJ com máscara |
| `PhoneInput` | `@/components/inputs/phone-input` | Input telefone com máscara dinâmica |
| `CepInput` | `@/components/inputs/cep-input` | Input CEP + busca ViaCEP |
| `DatePicker` | `@/components/inputs/date-picker` | Seletor de data com Calendar |
| `DateRangePicker` | `@/components/inputs/date-range-picker` | Seletor de período |

### Toast helpers

```ts
import { toast } from "@/lib/toast";

toast.success("Salvo com sucesso!");
toast.error("Erro ao processar.");
toast.promise(minhaPromise, { loading: "Salvando...", success: "Salvo!", error: "Erro." });
```

---

## Como criar uma nova página

Checklist:

1. **Criar o arquivo** em `src/app/(app)/[modulo]/page.tsx`
2. **É Server Component** por padrão — fetch dados com tRPC server caller ou diretamente via Prisma
3. **Usar `PageHeader`** para título e ações
4. **Autenticação** já protegida pelo `(app)/layout.tsx` — não precisa checar `auth()` na maioria dos casos
5. **Se precisar de interatividade** (formulários, filtros), separar em um componente `"use client"`
6. **Paginação**: usar `DataTable` com `pageCount`, `pageIndex`, `pageSize` controlados via `searchParams`

Exemplo mínimo:

```tsx
// src/app/(app)/clientes/page.tsx
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";

export default function ClientesPage() {
  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Gerencie os clientes da loja"
        actions={<Button size="sm">Novo Cliente</Button>}
      />
      {/* conteúdo */}
    </div>
  );
}
```

---

## Como criar um novo componente de domínio

Checklist:

1. **Decidir se é Server ou Client Component**
   - Usa hooks, event handlers, browser APIs → `"use client"`
   - Apenas renderiza dados → Server Component (sem directive)
2. **Local:** `src/components/domain/[nome].tsx`
3. **Props:** interface TypeScript explícita, sem `any`
4. **Acessibilidade:** `aria-label` em botões sem texto, `<Label htmlFor>` em inputs
5. **Estilo:** usar tokens do design system (`text-primary`, `bg-muted`, etc.) em vez de cores hardcoded
6. **Export:** named export (não default)
7. **Documentar** no catálogo `/dev/components` se for componente genérico reutilizável

---

## Padrão CRUD por módulo (Fase 5+)

Todo módulo de negócio segue o mesmo fluxo de implementação:

### 1. Schema Prisma (`prisma/schema/<agregado>.prisma`)

Checklist obrigatório:
- [ ] `id String @id @default(uuid()) @db.Uuid`
- [ ] `tenantId String @map("tenant_id") @db.Uuid`
- [ ] `createdAt DateTime @default(now()) @map("created_at")`
- [ ] `updatedAt DateTime @updatedAt @map("updated_at")`
- [ ] `deletedAt DateTime? @map("deleted_at")` (se aplicável — clientes, catálogo)
- [ ] `@@index([tenantId])` no mínimo; `@@index([tenantId, campo])` para filtros frequentes
- [ ] `@@map("nome_tabela_snake_case")`
- [ ] Migration SQL com `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policy `tenant_isolation`

### 2. Validator Zod (`src/lib/validators/<modulo>.ts`)

- Use `z.boolean()` em vez de `z.boolean().default(true)` — defaults causam mismatch com react-hook-form
- Use `z.number().min(0)` em vez de `z.number().default(0)` — mesma razão
- Para schemas com `.superRefine()` (validação cruzada), NÃO use `.partial()` — Zod v4 não suporta. Crie um schema de update separado explicitamente
- Para forms com react-hook-form, use `z.input<typeof schema>` como `type FormValues` se o output type difere do input type
- Schemas de listagem: `page`, `pageSize` sem `.default()` — passe os defaults no código do cliente

### 3. tRPC Router (`src/server/api/routers/<modulo>.ts`)

- Registrar em `src/server/api/root.ts`
- `tenantProcedure` para todas as operações escopadas por tenant
- `adminProcedure` só para operações cross-tenant (super admin)
- Listagens SEMPRE com `take` (pageSize) e `skip` (page * pageSize)
- Soft delete: `deletedAt: new Date()` — filtrar com `deletedAt: null` nas listagens por padrão
- Para tabelas globais (users, tenants) dentro de tenantProcedure: usar `withAdmin` importado dinamicamente

### 4. Páginas (`src/app/(app)/<modulo>/`)

Estrutura padrão de um módulo CRUD completo:

```
<modulo>/
  page.tsx                   # redirect para subpágina (se houver) ou listagem direta
  layout.tsx                 # nav lateral/horizontal (se tiver submódulos)
  _components/
    <modulo>-table.tsx       # DataTable client — useTRPC + estados search/page/delete
    <modulo>-form.tsx        # form client — react-hook-form + zodResolver
  new/
    page.tsx                 # Server Component: PageHeader + <ModuloForm mode="create" />
  [id]/
    page.tsx                 # Server Component: <ModuloDetailClient id={id} />
    edit/
      page.tsx               # Server Component: PageHeader + <ModuloEditClient id={id} />
      _components/
        <modulo>-edit-client.tsx  # Client: useQuery para buscar, <ModuloForm mode="edit" defaultValues={...} />
```

### 5. Checklist por módulo

- [ ] Schema com RLS
- [ ] Validator sem `.default()` nos campos primitivos
- [ ] tRPC router registrado em root.ts
- [ ] Listagem com busca + paginação server-side
- [ ] Form de criar com `FormSection` + `FormActions`
- [ ] Form de editar reaproveitando o mesmo componente com `mode="edit"`
- [ ] Soft delete + feedback com `toast.success()`
- [ ] `ConfirmDialog` antes de deletar
- [ ] `LoadingState` nos edit clients
- [ ] Typecheck verde (`pnpm typecheck`)

### Notas de Zod v4 + react-hook-form

O problema mais comum ao usar `zodResolver` com Zod v4 schemas que têm `.default()`:

```ts
// ❌ Causa erro de tipo no resolver:
const schema = z.object({ active: z.boolean().default(true) });

// ✅ Correto — passar o default no form:
const schema = z.object({ active: z.boolean() });
const form = useForm({ defaultValues: { active: true } });
```

Para schemas com `.superRefine()` cross-field:

```ts
// ❌ Falha em runtime no Zod v4:
const updateSchema = createSchema.partial(); // "cannot be used on schemas containing refinements"

// ✅ Definir o schema de update explicitamente sem o superRefine
export const updateSchema = z.object({ ... }).partial equivalent manually
```

---

## Formulários de endereço

Todo formulário que coleta endereço brasileiro usa o componente `CepInput` com callback `onAddressFound` integrado. **Não duplicar lógica de consulta ViaCEP em outros componentes.**

```tsx
import { CepInput, type AddressResult } from "@/components/inputs/cep-input";

<CepInput
  value={form.watch("zipCode") ?? ""}
  onValueChange={(raw) => form.setValue("zipCode", raw)}
  onAddressFound={(address: AddressResult) => {
    form.setValue("street", address.logradouro);
    form.setValue("neighborhood", address.bairro);
    form.setValue("city", address.cidade);
    form.setValue("state", address.estado);
  }}
/>
```

**Comportamento:**
- Debounce de 500ms após 8 dígitos digitados
- Loading spinner no input durante consulta
- Se ViaCEP falhar: mensagem discreta "CEP não encontrado, preencha manualmente"
- Campos preenchidos automaticamente ficam editáveis (nunca disabled)
- Lógica de fetch em `src/lib/integrations/viacep.ts` (reusável fora de componentes React)

**ADR:** docs/decisions/0009-viacep-integration.md

---

## Modelo híbrido de estoque

O estoque usa modelo híbrido baseado no campo `Product.isSerialized`:

| isSerialized | Fonte da verdade | Mecanismo |
|---|---|---|
| `false` (capas, cabos) | `Product.currentStock` | Movimentações incrementam/decrementam counter |
| `true` (aparelhos com IMEI) | `count(StockItem WHERE status=AVAILABLE)` | Rastreio individual por IMEI/série |

**Regra:** nunca leia `Product.currentStock` diretamente para determinar disponibilidade. Use sempre `ProductService.getAvailableQuantity(tx, tenantId, productId)` — ele resolve internamente qual fonte consultar.

```typescript
// src/server/services/product.service.ts
async function getAvailableQuantity(tx, tenantId, productId): Promise<number> {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { isSerialized: true, currentStock: true } })
  if (!product.isSerialized) return product.currentStock  // counter
  return tx.stockItem.count({ where: { tenantId, productId, status: "AVAILABLE", deletedAt: null } })  // computed
}
```

**ADR:** docs/decisions/0016-stock-single-source-of-truth.md

---

## Event log append-only

Registros financeiros e de auditoria são imutáveis:
- Sem update procedure
- Soft delete só em casos excepcionais (administrativo)
- Correções via novos eventos em sentido contrário (ex: estorno é movimento adicional, não edição)
- Histórico completo preservado — saldo é determinístico (soma de eventos)

**Aplicado em:** CashMovement (Caixa), StockMovement (Estoque-B)
**Futuros:** AccountingEntry (Financeiro), AuditLog

**ADR:** docs/decisions/0030-cash-movement-append-only.md

---

## RBAC granular por procedure

Cada módulo define matriz papel × ação na SPEC. Implementação:
- `tenantProcedure` + checagem manual para "próprio recurso" (`ctx.session.user.id === resource.userId`)
- Checagem de role via `ctx.session.availableTenants.find(t => t.id === ctx.tenantId)?.role`
- Procedures gerenciais verificam `role !== "operator"` (ou `role === "owner"` para operações críticas)
- Owner herda permissões de Manager

**Aplicado em:** Caixa, Estoque-A, Estoque-B, Catálogo, Financeiro
**Futuros:** PDV, OS

**ADR:** docs/decisions/0031-cash-rbac-granular.md

---

## Modelo unificado com discriminador

Usado quando 2 entidades têm 80%+ schema comum e mesma lógica de negócio:
- Campo discriminador (type, kind) preserva semântica
- Procedures filtram por type quando contexto exige
- RBAC pode ser aplicado via filtro de type por role
- Queries explicitam WHERE type=X para clareza

**Aplicado em:** FinancialTransaction (RECEIVABLE/PAYABLE)
**ADR:** docs/decisions/0032-financial-transaction-unified.md

---

## Status derivado vs persistido

- Status persistido: para transições reais com efeito colateral (PENDING → PAID via baixa)
- Status computed: para estados função-pura de schema + tempo (VENCIDA = PENDING + dueDate < now)
- Sem jobs para manter — query no momento da consulta
- Índice em (status, dueDate) cobre queries eficientemente

**Aplicado em:** Installment.status (VENCIDA é computed)
**ADR:** docs/decisions/0033-installment-overdue-computed.md

---

## Híbrido sistema-tenant (FIXED + CUSTOM)

- FIXED: seeded com sistema, code imutável, não deletável (apenas desativável Owner)
- CUSTOM: criado pelo tenant, CRUD livre Manager+, code gerado de slug
- Procedures @public-api referenciam FIXED por code estável
- Tenant init service garante FIXED em todo tenant novo (idempotente)

**Aplicado em:** FinancialCategory, PaymentMethod
**ADR:** docs/decisions/0034-financial-categories-hybrid.md

---

## Definition of Done — Critérios obrigatórios por módulo

Nenhum módulo é considerado entregue (status ✓) sem atender TODOS os critérios abaixo.

| # | Critério | Como validar |
|---|----------|--------------|
| 1 | Typecheck verde | `pnpm typecheck` exit 0 |
| 2 | Unit tests verdes | `pnpm test` exit 0 |
| 3 | **E2E @business contra server real** | `pnpm test:e2e --reporter=list` exit 0 |
| 4 | **E2E linter verde** | `pnpm test:e2e:lint` exit 0 (100% @business) |
| 5 | Build de produção verde | `pnpm build` exit 0 |

### Convenção de E2E tests

Todo `test()` em `__tests__/e2e/` DEVE começar com `@business` e cumprir critérios:

**Critérios de @business (todos obrigatórios):**
- Faz pelo menos UMA mutation: click em ação, form fill + submit, ou chamada a API/procedure
- Faz pelo menos UMA assertion específica: toHaveValue, toHaveCount, toHaveText, toHaveURL, toBeDisabled, toBe, toEqual, toHaveProperty, toMatch, response.ok/json, ou getByText("texto específico").toBeVisible
- toContainText com regex genérico NÃO basta sozinho

**@smoke não é categoria aceita.** Todo teste deve ter lógica de negócio.

**Páginas sem lógica (404, institucionais):** não devem ter E2E. Se necessário testar "página carrega", é coberto incidentalmente por @business que navega pra ela.

### Cobertura mínima de E2E por módulo

- **CRUDs:** criar + verificar dados, editar + verificar mudança, deletar + verificar ausência (3 cenários mínimo)
- **Validação:** input inválido → mensagem de erro específica (1 cenário mínimo)
- **RBAC:** user sem permissão → 403 ou redirect (1 cenário mínimo)
- **Fluxos transacionais:** happy path com side effect verificado (1 cenário mínimo)

### Proibido

- Marcar módulo como ✓ baseado apenas em typecheck + unit
- Usar tag @smoke (categoria removida — ADR 0036 revisado)
- Commitar `*.spec.ts` sem ter executado ao menos 1x localmente
- Usar `--passWithNoTests` ou flags que mascarem ausência de testes

### Whitelist de refatoração pendente

Durante a refatoração inicial (maio/2026), arquivos legados estão listados em `__tests__/e2e/lint-e2e.config.json::pendingRefactor`. Conforme cada módulo é refatorado para 100% @business, deve ser removido da whitelist. Quando criar novo arquivo .spec.ts, NÃO adicionar à whitelist.

**ADRs:** docs/decisions/0035-e2e-obrigatorio-antes-de-push.md, docs/decisions/0036-e2e-business-vs-smoke.md
**Enforcement:** Husky pre-push hook + pnpm test:e2e:lint

---
