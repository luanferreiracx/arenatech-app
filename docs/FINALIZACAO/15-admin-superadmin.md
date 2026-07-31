# Módulo 15 — Admin / Superadmin / onboarding NO-KYC

**Passada A (backend/segurança):** concluída em 2026-07-31.
**Passada B (frontend):** concluída em 2026-07-31.

## Superfície

| | |
|---|---|
| Routers | `admin.ts` (2.025), `no-kyc.ts` (231), `depix-fee-wallet-admin.ts`, `depix-holds-admin.ts`, `depix-lbtc-admin.ts` |
| Telas | `(admin)/*` (15), `/register/*` (4) |
| Mecanismo crítico | `withAdmin` — transação com **BYPASSRLS** |

## Mapa de privilégio (medido)

| Router | adminProcedure | publicProcedure |
|---|---|---|
| `admin.ts` | **38** | 1 (`publicPlans`, página de preços) |
| `no-kyc.ts` | 0 | **4 mutations anônimas** |
| DePix admin (3 routers) | 15 | 0 |

Produção: 8 pré-cadastros (5 aprovados, 2 rejeitados, 1 pendente) e 7 tenants.

## O que auditei e está íntegro

- **O fluxo anônimo de auto-cadastro tem teto em todas as quatro mutations**:
  `startRegistration` 5/h, `verifyEmail` e `verifyPhone` 10/h, `resendCode`
  5/15min. Contra spam de conta, bombardeio de e-mail/SMS e força bruta de código,
  os três de uma vez. Há ainda contador de tentativas por código
  (`too_many_attempts`).
- **Os 53 procedures administrativos são `adminProcedure`** — nenhum ficou num
  nível mais frouxo.
- **Entropia dos links públicos**: `generatePublicToken` usa `crypto.randomBytes`
  (CSPRNG, nunca `Math.random`) sobre base32-crockford; 12 chars ≈ 60 bits, 16 ≈ 80.
- **`withAdmin` fora do admin é escopado à mão** onde precisa ser. Auditei os 11
  usos de `service-order.ts`, que são os mais numerosos fora de `admin.ts`, e eles
  se dividem em três grupos legítimos: leitura de `users` por IDs já derivados do
  tenant (a tabela é global, sem `tenant_id` — `withAdmin` é o mecanismo certo),
  `userTenant` filtrado por `ctx.tenantId` explícito, e as rotas públicas de OS.

## AD-1 — leitura pública de OS e orçamento sem teto de tentativas (P3)

`byPublicLink` e `getQuoteByLink` são anônimas **e rodam em `withAdmin`**, ou seja,
com o RLS desligado. O controle de acesso é o segredo do link — e a entropia
sustenta isso (60 bits não se adivinha por HTTP).

Faltava a **segunda camada**: teto de tentativas. Sem ele o endpoint aceita
martelada de graça, e quem já tem um link não fica limitado a nada.

O detalhe que fecha o argumento: `respondToQuote`, a mutation **logo abaixo no
mesmo arquivo**, já tinha `rateLimitMiddleware`. As leituras é que ficaram de fora
— o padrão era conhecido e não foi aplicado ao lado.

### O que a medição de produção acrescentou

Distribuição de comprimento dos links de OS:

| Tamanho | Período | Qtd |
|---|---|---|
| 64 | nov/2025 | 9 |
| 32 | dez/2025 – mai/2026 | 158 |
| **12** | **mai/2026 – hoje** | **70** |
| **7** | 22/05/2026 | **2** |

Os de 32 e 64 são herança do Laravel — **mais longos**, não mais fracos. O de 12 é
o formato atual (60 bits). Mas **2 OS têm link de 7 caracteres** (≈35 bits), e
**nenhum gerador do código produz 7** — os quatro call sites usam 12 ou 16. Vieram
de backfill.

35 bits ainda são ~34 bilhões de combinações, inviável por HTTP; mas é exatamente
o caso em que a segunda camada deixa de ser luxo. O teto cobre os dois links
fracos sem precisar reescrevê-los.

> Registro de método: minha primeira leitura da tabela foi **ao contrário** — vi
> "70 OS com apenas 12 caracteres" e quase escrevi que o formato atual era o
> fraco. Datar as gerações desfez o erro antes de virar achado.

## AD-2 — as telas de auto-cadastro não tinham landmark (P2)

As 15 telas de admin passaram limpas nos dois viewports. O achado está na outra
ponta: as **4 telas de `/register`**, que são a porta de entrada de quem chega de
fora e ainda não tem conta.

Medido, anonimamente: `main: 0`, `header: 0` nas quatro (cada uma tem `h1`, isso
sim). Sem `<main>` não há como pular para o conteúdo (WCAG 1.3.1).

É a **mesma ausência** do catálogo público (CTU-2, Módulo 13) — as duas superfícies
anônimas do sistema tinham o mesmo buraco. Corrigido do mesmo jeito: mesma caixa,
tag com significado.

> Registro de método, de novo: minha sonda marcou as quatro como "main vazio" e
> quase virou "as telas de registro não renderizam". Elas renderizam — a sonda é
> que lia um `<main>` que não existia. Foi exatamente o que aconteceu no catálogo,
> e reconhecer o padrão custou uma medição em vez de um achado falso.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit   # 2040 verdes (4 novos)
```

Telas verificadas no navegador: 15 de admin (superadmin, 1440 e 390) e 4 de
registro (anônimo, 1440 e 390) — sem overflow, sem erro de console, sem request
4xx/5xx.

**Falha antes do fix, verificada:** removi o middleware de `byPublicLink` e o
guardião reprovou em dois casos — o direto e o de cobertura, que exige teto em
**toda** `publicProcedure` do router (procedure pública nova nasce com limite ou o
teste cai).
