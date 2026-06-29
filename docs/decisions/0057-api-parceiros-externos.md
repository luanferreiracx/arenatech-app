# ADR 0057 — API de parceiros externos (API-key + REST v1, começando por DePix)

**Status:** Proposto (2026-06-29). Aguardando implementação.
**Origem:** dono pediu "disponibilizar a API para acesso externo (parceiros)" e
perguntou se o sistema está robusto o suficiente para iniciar.

---

## Veredito de prontidão

**A fundação está sólida; falta a camada de borda para máquinas.** Avaliação
(2026-06-29) dos pilares que importam para abrir a API a terceiros:

| Pilar | Estado | Pronto? |
|---|---|---|
| Isolamento multi-tenant (RLS Postgres `SET LOCAL` + FORCE + defesa em profundidade) | sólido | ✅ |
| Validação de input (Zod em todas as procedures) | sólido | ✅ |
| Módulo DePix (idempotência, cross-check on-chain, reconciliação, limites, CPF≥R$500) | maduro | ✅ |
| Webhooks (HMAC + timing-safe + replay-guard) | maduro | ✅ |
| Observabilidade (Sentry + logs estruturados) | ok | ✅ |
| **Autenticação de máquina (API-key/token de parceiro)** | **inexistente** | ❌ |
| **Superfície REST estável/versionada** (hoje só tRPC interno) | **inexistente** | ❌ |
| **Rate-limit fail-closed + por-parceiro** | parcial (fail-open in-memory) | 🟠 |

**Conclusão:** não há conserto de fundação a fazer — o que falta é **infra de
borda** (auth de máquina + camada REST versionada + quota por parceiro). É um épico
focado, não um retrabalho. Seguro iniciar **com este ADR como base**.

## Decisões (do dono)

- **D1 — Escopo inicial: DePix** (depósito / saldo / saque). É o módulo mais maduro
  e o caso de uso mais provável de parceiro.
- **D2 — Auth de máquina: API-key por tenant**, hash no banco, revogável, com
  escopos. (Não OAuth2 agora — pode evoluir depois sem quebrar.)
- **D3 — Reusar a lógica de negócio existente.** Os endpoints REST de parceiro
  chamam os **mesmos services** já testados (`createDeposit`, `createWithdraw`,
  `createOnchainWithdraw`, `getOverview`/`getBalance`, `checkTransactionStatus`),
  apenas atrás da auth de API-key em vez de sessão. Pouca lógica nova.

## Arquitetura

### Autenticação — API-key por tenant
- Nova tabela **`partner_api_keys`**: `id`, `tenantId`, `name`, `keyPrefix` (8 chars
  visíveis p/ identificar), `keyHash` (Argon2id/bcrypt do segredo completo), `scopes`
  (string[]), `lastUsedAt`, `revokedAt`, `createdAt`, `createdByUserId`. RLS por
  tenant. **Índice no `keyPrefix`** (lookup O(1) antes do hash-compare).
- **Emissão:** procedure `superAdminTenantProcedure` (ou admin do tenant) gera a key,
  mostra o segredo **uma única vez** (`prefix.secret`), grava só o hash. Revogável.
- **Validação (na borda REST):** header `Authorization: Bearer at_<prefix>_<secret>`.
  Lookup por `keyPrefix` → `timingSafeEqual`/verify do hash → resolve `tenantId` +
  `scopes`. Falha → 401. Sem scope → 403. Atualiza `lastUsedAt` (best-effort).
- **Escopos** (mínimo): `depix:read` (saldo, status, extrato), `depix:deposit`
  (gerar QR), `depix:withdraw` (saque — sensível, opt-in explícito por key).

### Superfície REST versionada
- Rotas em **`src/app/api/v1/partner/...`** (REST, não tРPC), versionadas (`v1`):
  - `POST /api/v1/partner/depix/deposits` → cria depósito (gera QR). `depix:deposit`.
  - `GET  /api/v1/partner/depix/transactions/:id` → status de uma tx. `depix:read`.
  - `GET  /api/v1/partner/depix/balance` → saldo. `depix:read`.
  - `POST /api/v1/partner/depix/withdrawals` → saque PIX/on-chain. `depix:withdraw`.
  - `GET  /api/v1/partner/depix/transactions` → extrato paginado. `depix:read`.
- Cada handler: valida API-key → resolve tenant → **`withTenant(tenantId, …)`**
  (RLS aplicado, isolamento garantido) → chama o **service existente** → DTO de
  resposta versionado (NUNCA expõe tipo Prisma). Idempotência: aceita header
  `Idempotency-Key` do parceiro (reusa o `idempotencyKey` do service).
- **Webhooks de saída pro parceiro** (fase 2): quando um depósito conclui/é estornado,
  notificar a URL do parceiro com **HMAC** (reusa o padrão de `eulen-auth`/`lwk`).

### Rate-limit + quota por parceiro
- Reusar `enforceRateLimit` (`src/lib/rate-limit.ts`), com **chave por API-key**
  (`partner:<keyPrefix>:<rota>`). **Fail-closed** nesta superfície: se o Redis cair,
  a API de parceiro **recusa** (503) em vez de liberar geral (diferente do fluxo
  interno, que tolera fallback). Quotas por escopo (ex.: deposit 60/min, withdraw
  10/min — espelhando os limites já usados internamente).

### Observabilidade / auditoria
- Toda chamada de parceiro logada (structured + Sentry em erro), com `keyPrefix`,
  rota, tenant, status, latência. Nova tabela ou reuso de `audit_logs` para trilha
  de chamadas que movem dinheiro (deposit/withdraw).

### Segurança transversal
- Endpoints de **escrita que movem dinheiro** (deposit/withdraw): além do scope,
  manter os guards de negócio já existentes (CPF≥R$500, cap diário, advisory lock,
  cross-check on-chain). A API-key **não** dá bypass desses.
- Sem expor superadmin/RLS-bypass por API-key (nunca `withAdmin`).
- CORS restrito (API server-to-server; não para browser de terceiro).

## Plano em fases

- **Fase 0 — ADR (este doc).** Aprovação do desenho.
- **Fase 1 — Fundação de auth (sem expor negócio ainda):**
  schema `partner_api_keys` + migration + RLS; service de emissão/validação/revogação;
  middleware `withPartnerAuth` (resolve tenant+scopes, fail-closed rate-limit);
  UI superadmin pra emitir/revogar key. Testes: emissão, hash, validação, escopo,
  revogação, isolamento por tenant.
- **Fase 2 — Endpoints DePix read-only piloto:**
  `GET balance` + `GET transactions/:id` + `GET transactions`. Prova o fluxo
  ponta-a-ponta (auth → withTenant → service → DTO) sem mover dinheiro. Doc OpenAPI.
- **Fase 3 — Endpoints de escrita:**
  `POST deposits` (gera QR) + `POST withdrawals` (PIX/on-chain), com idempotência,
  scopes próprios, guards de negócio intactos.
- **Fase 4 — Webhooks de saída pro parceiro:**
  notificação assinada (HMAC) de confirmação/estorno de depósito; retry + replay-id.
- **Fase 5 — Endurecimento + go-live:**
  OpenAPI publicada, sandbox/keys de teste, quotas finais, runbook, Sentry alertas,
  rotação de key. (Opcional futuro: OAuth2 client-credentials por cima da mesma base.)

## Verificação (por fase)
- **Unit:** emissão/validação de API-key (hash, prefix lookup, timing-safe, scope,
  revogação); isolamento (key do tenant A não acessa dados do tenant B via `withTenant`);
  rate-limit fail-closed; DTOs sem vazar Prisma.
- **E2E (Playwright/HTTP):** fluxo real com key válida → balance/deposit/withdraw;
  401 sem key, 403 sem scope, 429 acima da quota.
- **Prod (com o dono):** emitir key de teste num tenant sandbox; rodar depósito real
  via API; conferir isolamento e auditoria.

## Riscos / notas
- **Risco financeiro:** endpoints de saque via parceiro movem dinheiro — exigir scope
  explícito `depix:withdraw` por key (default desligado) + manter cap diário + advisory
  lock + cross-check. Recomendado: começar **read-only** (Fase 2) em produção e só
  liberar escrita após validar.
- **Versionamento:** `v1` no path; mudanças quebrantes → `v2`, sem tocar `v1`.
- **A API da Eulen** continua sendo nosso upstream — o parceiro fala com a Arena, a
  Arena fala com a Eulen (o parceiro nunca recebe credencial Eulen). O `whitelist=true`
  (ADR informal recente) e os limites/CPF aplicam-se igualmente às chamadas de parceiro.
- **Não** reusar o flag `ALLOW_UNSIGNED_*` nem caminhos de bypass de dev na borda de
  parceiro.
