# Legacy: Multi-tenancy (stancl/tenancy)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Implementação

**Pacote:** stancl/tenancy v3+
**Estratégia:** Banco de dados separado por tenant (MySQL)

### Configuração (config/tenancy.php)
- `tenant_model` → App\Models\Tenant
- `central_domains` → ['intranet.arenatechpi.com.br', 'catalogo.arenatechpi.com.br', 'localhost', etc.]
- `bootstrappers`: DatabaseTenancyBootstrapper, FilesystemTenancyBootstrapper, QueueTenancyBootstrapper
- `database.central_connection` → 'central'
- `database.template_tenant_connection` → 'tenant_template'
- Sem prefix/suffix — bancos com nomes próprios na coluna `database_name` da tabela tenants

### Fluxo de resolução
1. Request chega em subdomínio (ex: loja1.arenatechpi.com.br)
2. Middleware `InitializeTenancyBySubdomain` resolve o tenant pelo subdomínio
3. stancl/tenancy troca a conexão de banco para o banco do tenant
4. Guard 'tenant' autentica no banco do tenant
5. Todas queries do request usam o banco do tenant

### Banco central vs tenant
| Entidade | Banco |
|----------|-------|
| Tenants, Domains | Central |
| Users (admin central) | Central |
| Planos, Precadastros | Central |
| Addons, TenantAddonCompra | Central |
| TenantEstorno | Central |
| **Todo o resto** | **Tenant** |

### Modelo Tenant
**Tabela:** `tenants` (banco central)
- id (string), nome, database_name, database_host, database_port, status, data, created_at, updated_at
- **Relações:** domains (hasMany Domain), assinaturas, cobrancas

### Evento DatabaseMigrated
- Listener `SeedTenantDatabase` roda seeds iniciais (ConfiguracoesFiscaisSeeder, AppleProdutosSeeder) quando banco do tenant é migrado.

## 2. Rotas

- `routes/tenant.php` — Rotas de subdomínio, com InitializeTenancyBySubdomain
- `routes/web.php` — Rotas centrais, com `Route::domain(CENTRAL_DOMAIN)`

## 3. Guards

- `web` — Auth no banco central (admin Arena Tech)
- `tenant` — Auth no banco do tenant (usuários do tenant)

## 4. Diferença para o Next.js

| Aspecto | Laravel (atual) | Next.js (novo) |
|---------|----------------|----------------|
| Estratégia | Banco separado por tenant | RLS com tenant_id por linha |
| Banco | MySQL (1 por tenant) | PostgreSQL (1 banco, RLS) |
| Resolução | Subdomínio → stancl | Cookie/JWT → SET LOCAL |
| Auth | 2 guards (web/tenant) | 1 auth (NextAuth, multi-tenant via JWT) |
| Isolamento | Total (bancos separados) | Row-level (tenant_id + policies) |
| Criação tenant | Migration + seeds no novo banco | INSERT tenant + seed data |

## 5. Observações técnicas relevantes

1. **Bancos MySQL separados** — Cada tenant tem banco próprio com schema idêntico. Migrations rodam em todos.
2. **Sem CacheTenancyBootstrapper** — Desabilitado por falta de driver com tags.
3. **Central domains incluem catálogo** — catalogo.arenatechpi.com.br é central, não tenant.
4. **QueueTenancyBootstrapper ativo** — Jobs dispatchados mantêm contexto do tenant.
5. **ID generator = null** — IDs dos tenants são auto-increment, não UUID.
