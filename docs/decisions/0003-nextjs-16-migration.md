# ADR 0003 — Ficar no Next.js 16 (sem downgrade para 15)

**Status:** Accepted
**Date:** 2026-05-08
**Decision makers:** Luan Ferreira (owner), Claude Code (architect)

---

## Context and Problem Statement

O projeto foi inicializado na Fase 1 com `create-next-app@latest`, que instalou Next.js 16.2.5 (a versao estavel mais recente). O plano de migracao original referenciava Next.js 15. Precisamos decidir se mantemos o Next.js 16 ou fazemos downgrade para 15.

## Decision

**Ficar no Next.js 16.** Os beneficios superam os custos de adaptacao.

## Breaking Changes Mapeados e Status

| Mudanca | Impacto | Status |
|---|---|---|
| `middleware.ts` → `proxy.ts` | proxy.ts roda em Node.js (nao Edge) | Migrado na revisao da Fase 3 |
| `next lint` removido | Substituido por `eslint src` direto | Resolvido na Fase 1 |
| `params` e `searchParams` sao async | `await params` em route handlers dinamicos | Implementar nas Fases 5+ |
| `cookies()`, `headers()` sao async | Ja usando `await` | Resolvido |
| Turbopack e default | Build 2-5x mais rapido | Ja rodando |
| `experimental.ppr` removido → `cacheComponents` | Nao estavamos usando | N/A |
| Parallel routes exigem `default.js` | Atentar na Fase 4 | Pendente |
| `revalidateTag()` requer segundo argumento | Usar na Fase 5+ com cacheLife profile | Pendente |
| Node.js 20.9+ minimo | Temos Node 24 | OK |

## Migracao middleware → proxy

A mudanca mais impactante. No Next.js 16:

- `middleware.ts` esta deprecado (funciona com warning, sera removido em versao futura)
- `proxy.ts` e o substituto oficial
- **Diferenca critica:** proxy.ts roda no **Node.js runtime**, nao no Edge runtime

Isso teve uma consequencia positiva:
- Na implementacao original, tivemos que criar `auth.config.ts` (Edge-safe, sem bcrypt/prisma) separado de `auth.ts` (Node-only) porque o middleware Edge nao suporta `crypto`
- Com proxy.ts rodando em Node.js, essa separacao nao e mais necessaria
- `auth.ts` agora e um arquivo unico com toda a config do NextAuth

## Consolidacao do auth

Antes:
```
src/server/auth.config.ts  (Edge-safe: callbacks, pages, sem providers)
src/server/auth.ts         (Node-only: providers com bcrypt + prisma)
src/middleware.ts           (importava auth.config.ts)
```

Depois:
```
src/server/auth.ts         (unico: providers, callbacks, pages, tudo)
src/proxy.ts               (importa auth.ts diretamente, roda em Node.js)
```

## Alternatives Considered

### Downgrade para Next.js 15

**Pros:** Stack referenciada no plano original, mais documentacao/exemplos
**Contras:**
- Ja temos 3 fases implementadas no 16 — downgrade arriscaria quebrar
- Perderiamos Turbopack estavel como default
- Teriamos que reverter a config de lint
- middleware.ts no Edge continuaria sendo problema (split auth config necessario)

**Rejeitado:** custo de migracao reversa alto para beneficio baixo.

### Usar middleware.ts com warning

**Pros:** Zero mudanca de codigo
**Contras:**
- Warning de deprecacao polui logs
- Sera removido em versao futura — divida tecnica
- Edge runtime forca o split auth.config.ts

**Rejeitado:** melhor resolver agora do que acumular divida.

## Consequences

### Positivas
- Auth simplificada em arquivo unico
- Proxy Node.js permite imports de qualquer modulo (bcrypt, prisma, etc)
- Build mais rapido com Turbopack
- Zero warnings de deprecacao
- Preparados para Cache Components e React 19.2 features

### Negativas
- Fases futuras precisam lembrar de `await params` e `await searchParams`
- Documentacao e exemplos da comunidade ainda majoritariamente Next.js 15
- NextAuth v5 beta pode ter comportamentos inesperados com Next.js 16

## References

- [Next.js 16 Blog Post](https://nextjs.org/blog/next-16)
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [proxy.ts Documentation](https://nextjs.org/docs/app/getting-started/proxy)
