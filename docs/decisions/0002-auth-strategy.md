# ADR 0002 — Estrategia de Autenticacao

**Status:** Accepted
**Date:** 2026-05-08
**Decision makers:** Luan Ferreira (owner), Claude Code (architect)

---

## Context and Problem Statement

O sistema Arena Tech precisa autenticar usuarios por CPF + senha e resolver qual tenant (loja) o usuario esta acessando. Usuarios podem pertencer a multiplos tenants.

## Decision

### Stack de auth

- **NextAuth v5** (beta.31) com **JWT strategy** (sem database sessions)
- **Credentials provider**: CPF + senha com bcrypt cost 12
- CPF como identificador unico (nao email)

### Fluxo de login

1. `/login`: CPF + senha
2. Apos autenticar:
   - 0 tenants → `/no-access`
   - 1 tenant → auto-seleciona, redireciona para `/`
   - 2+ tenants → `/select-tenant` com cards das lojas
   - Super admin → `/admin`
3. Troca de tenant via `/select-tenant` (regrava cookie `x-active-tenant`)
4. Logout limpa sessao

### Resolucao de tenant

**SEM subdomain.** App acessivel em uma URL so (`app.arenatechpi.com.br`). Tenant ativo resolido por:
1. Cookie HTTP-only `x-active-tenant` (definido no switch)
2. Fallback: JWT claim `activeTenantId` (definido no login para single-tenant users)

### JWT claims customizados

```ts
token: {
  id: string;           // user.id
  cpf: string;          // user.cpf
  isSuperAdmin: boolean;
  activeTenantId: string | null;
  impersonatedTenantId: string | null; // futuro: impersonacao
  availableTenants: Array<{ id, slug, name, role }>;
}
```

### Middleware Edge

Split em dois arquivos para compatibilidade com Edge runtime:
- `auth.config.ts` — config base sem Node.js deps (Edge-safe)
- `auth.ts` — config completa com Credentials provider, bcrypt, Prisma (Node-only)

O middleware usa `auth.config.ts` para verificar sessao JWT sem importar bcrypt/prisma.

### Procedures tRPC

- `publicProcedure` — sem auth
- `protectedProcedure` — exige sessao valida
- `tenantProcedure` — exige sessao + tenantId, usa `withTenant()` para RLS
- `adminProcedure` — exige `isSuperAdmin`, usa `withAdmin()` para bypass RLS

## Alternatives Considered

### Subdomain-based tenant resolution

Cada tenant teria seu subdominio (`loja1.app.arenatechpi.com.br`). Descartado por:
- Complexidade de DNS wildcard + SSL
- O Cloudflare ja faz proxy — adicionar subdomains complica a config
- Muitos usuarios acessam multiplos tenants — subdomains nao ajudam
- Simplicidade: uma URL so funciona para o caso de uso atual

### Database sessions

Sessoes armazenadas no banco. Descartado porque:
- JWT e stateless, nao requer query no banco a cada request
- Compativel com Edge middleware (cookie-only, sem DB call)
- Escala melhor para multiplos servers/containers

### Email como identificador

Usar email em vez de CPF. Descartado porque:
- O sistema Laravel usa CPF — continuidade para os usuarios
- CPF e unico por pessoa (email pode mudar)
- Operadores de loja podem nao ter email cadastrado

## Consequences

### Positivas
- Login familiar para usuarios migrados do Laravel
- JWT stateless — middleware Edge rapido
- Cookie `x-active-tenant` permite troca sem re-auth
- Super admin pode futuramente impersonar tenants (campo `impersonatedTenantId` preparado)

### Negativas
- NextAuth v5 ainda em beta — API pode mudar
- Password sem `$` chars no .env para evitar shell expansion no `source`

---

## Atualizacao pos-revisao (2026-05-08)

### Brecha identificada: cookie raw sem validacao no backend

**Problema original:** O cookie `x-active-tenant` era um UUID raw (sem assinatura ou criptografia). A validacao de que o usuario tinha acesso ao tenant ocorria **apenas no proxy.ts** (antigo middleware.ts). Se um usuario forjasse o cookie no DevTools para um tenant alheio, e se o matcher do proxy mudasse (ou uma API route ficasse fora dele), o `tenantProcedure` aceitaria o tenant forjado sem questionar.

**Risco real:** Horizontal privilege escalation — um usuario de um tenant poderia acessar dados de outro tenant.

**Correcao aplicada:** Validacao dupla (defense in depth):
1. **proxy.ts** valida o cookie contra `session.availableTenants` e redireciona se invalido (primeira linha de defesa)
2. **tenantProcedure** em `src/server/api/trpc.ts` re-valida que o `ctx.tenantId` esta em `session.availableTenants` ou que o user e super admin (segunda linha de defesa, independente do proxy)

```ts
// src/server/api/trpc.ts — tenantProcedure
const hasTenant = ctx.session.availableTenants.some(
  (t) => t.id === ctx.tenantId,
);
if (!hasTenant && !ctx.session.user.isSuperAdmin) {
  throw new TRPCError({ code: "FORBIDDEN", message: "No access to this tenant" });
}
```

**Por que validacao dupla e o padrao correto:**
- Proxy protege navegacao e requests HTTP — mas e uma camada de rede, nao de negocio
- tenantProcedure protege a logica de negocio — independente de como o request chegou
- Se um for bypassado (bug no matcher, novo endpoint sem proxy), o outro ainda protege
- O custo e negligivel (1 array.some por request)

### Migracao middleware.ts → proxy.ts

Resolvido via ADR 0003. O proxy.ts roda em Node.js, eliminando a necessidade do split `auth.config.ts` + `auth.ts`. Auth agora e um arquivo unico.

## References

- [NextAuth v5 docs](https://authjs.dev)
- [NextAuth Credentials provider](https://authjs.dev/getting-started/authentication/credentials)
- [Next.js 16 proxy.ts](https://nextjs.org/docs/messages/middleware-to-proxy)
