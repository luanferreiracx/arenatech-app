# Auditoria de Segurança Total (2026-06-28)

> Força-tarefa de 5 agentes paralelos (auth/2FA, RBAC/RLS, money flows, webhooks/injeção, frontend/infra), com **confirmação manual de cada P0/P1 lendo o código** antes de consolidar. Os agentes **super-afirmaram** — os 2 "P0/P1 críticos" que reportaram foram **falsos-positivos** (ver no fim). Baseline já sólido (auditorias DePix/LWK 27/06, Tenant Isolation, Força-Tarefa 26/06) — esta rodada focou em achados NOVOS, sobretudo a superfície de **auth/2FA/recovery** (#307–#315, nunca auditada antes).

## Sumário executivo

**Nenhum P0. Um P1 confirmado e CORRIGIDO nesta rodada.** O núcleo de segurança permanece sólido: RLS multi-tenant (role `app_login` NOSUPERUSER), sem SQLi, webhooks com HMAC/revalidação, crons autenticados + lock, sem XSS (escapeHtml nos PDFs/emails, 0 `dangerouslySetInnerHTML`), container non-root, timeouts em HTTP externo, idempotência financeira.

| Sev | Qtd | Natureza |
|---|---|---|
| **P0** | 0 | — |
| **P1** | 1 | ✅ **corrigido** — replay de backup code (consumo não-atômico) |
| **P2** | 4 (3 ✅) | ✅ TOTP intra-window replay no step-up (corrigido); RBAC de comissões (operador); ✅ open-redirect via Host header (corrigido); ✅ rate-limit XFF (verificado — já pega o last-hop) |
| **P3** | 5 | confirmRecovery queima código no erro parcial; flags de cookie explícitas; `.env`/exemplos; Chatwoot token em query; cap diário por-CPF |

---

## ✅ P1 — Replay de backup code (CORRIGIDO nesta rodada)
- **Onde:** `src/lib/auth/two-factor-verify.ts` (step-up do saque) e `src/server/auth.ts` (login).
- **O quê:** o backup code de uso único era consumido em **2 passos** — `consumeBackupCode` (lê o array) + `tx.user.update` (grava `remaining`) separados. Duas requisições **concorrentes** com o MESMO backup code: ambas liam o array (código presente), ambas passavam, ambas gravavam → o código de uso único era aceito **2×** (replay). No step-up, 1 backup code autorizaria **2 saques**; no login, 2 sessões.
- **Confiança:** Alta (padrão read-then-write clássico; precisa concorrência).
- **✅ Fix:** `consumeBackupCodeAtomic` (`src/server/services/backup-code.service.ts`) — um único `UPDATE ... SET codes = array_remove(codes, $hash) WHERE id=$id AND $hash = ANY(codes)`. Só **uma** das requisições concorrentes afeta a linha (count=1); a outra vê count=0 → rejeitada. Sem migration. +8 testes. (O `disable` não precisa — ele zera TODOS os backup codes, então não há replay.)

---

## P2 — corrigir quando priorizar

### ✅ P2-1 · TOTP pode ser reusado dentro da janela no step-up do saque (CORRIGIDO)
- **Onde:** `src/lib/auth/two-factor-verify.ts` + `verifyTotp` (`src/lib/auth/two-factor.ts`).
- **O quê:** o TOTP era validado por janela de tempo (±, ~30–90s) e **não havia registro do último código usado**. O MESMO código de 6 dígitos autorizava **mais de um saque** dentro da janela. Cada saque tem `idempotencyKey` própria (UUID do client), então saques DIFERENTES (valor/destino distintos) com o mesmo código passavam. Um atacante que capturou 1 código (phishing) + tem a sessão/senha faria 2 saques no intervalo.
- **Impacto:** enfraquecia o step-up (o código deveria provar presença POR operação).
- **✅ Fix:** coluna `two_factor_last_used_counter BIGINT?` (migration `20260628120000`). `verifyTotpReturningCounter` devolve o counter absoluto (`floor(unixtime/30)+delta`) do passo que casou; `markTotpCounterUsedAtomic` faz um `UPDATE ... SET counter=$c WHERE id=$id AND (counter IS NULL OR counter < $c)` — só aceita passo **estritamente novo** (atômico → resiste a concorrência). Replay (mesmo counter) → `invalid_code`, sem cair pra backup code. **Escopo: só o step-up do saque/transferência** — o login segue com `verifyTotp` (sem consumir o counter) pra não rejeitar um saque legítimo feito dentro de 30s do login (mesma janela = mesmo código). +5 testes.

### P2-2 · Escritas de comissão de prestador como `tenantProcedure` (qualquer membro)
- **Onde:** `src/server/api/routers/provider-commission.ts` — `createReversal` (702), `deleteReversal` (723), `updateRules` (194), `createProvider`/`updateProvider`/`createContract`.
- **O quê:** **NÃO é cross-tenant** (roda em `withTenant` → RLS protege; o agente errou ao chamar de "P0"). Mas todo o módulo de comissões é `tenantProcedure` — um **operador comum** pode criar/excluir estornos de prestador e alterar regras de comissão (afeta o que a loja paga). É consistente no módulo (não é descuido pontual), então é **decisão de RBAC de produto**, não furo de segurança.
- **Proposta (decisão do dono):** gatear escritas de comissão por `isTenantAdmin`/`can()` (como o financeiro sensível), OU manter por design (ADR 0053). Surface ao dono.

### ✅ P2-3 · Open-redirect / host-injection via header (CORRIGIDO)
- **Onde:** `src/proxy.ts` `selfUrl()` — usava `x-forwarded-host`/`host` do request pra montar URLs de redirect.
- **O quê:** os redirects vão pra paths FIXOS (`/painel`, `/login`, `/change-password`), mas o HOST vinha do header do request. Atrás de Cloudflare/nginx (que setam o host real) o risco é baixo; se o nginx repassar um `x-forwarded-host` forjado, dava redirect pra `atacante.com/painel` (phishing).
- **✅ Fix:** `isKnownHost()` (`src/lib/brand-host.ts`) — allowlist de hosts conhecidos (pdvdepix.app + aliases, app/catalogo.arenatechpi, arenatechpi.com.br, localhost). `selfUrl` só ecoa o host se estiver na allowlist; senão cai pro `CANONICAL_APP_HOST` (`pdvdepix.app`). Host forjado → redirect sempre pro host canônico, nunca pro atacante. +2 testes.

### ✅ P2-4 · Rate-limit de login confia em X-Forwarded-For (JÁ MITIGADO — verificado)
- **Onde:** `src/app/actions/auth.ts` `clientIp()` + `src/lib/webhooks/replay-guard.ts` `extractSourceIp()`.
- **Verificado:** AMBOS os extratores já pegam o **ÚLTIMO** elemento do `X-Forwarded-For` (`.split(",").at(-1)`), que é o IP appendado pelo nginx confiável — não o primeiro (atacante-controlável). O comentário no código já documenta isso. **Não é furo de código.** O único risco residual é de **infra** (nginx mal-configurado que repasse o XFF cru sem appendar); isso é assunto de config do proxy, não da app. Login também limita por CPF (defense-in-depth). Sem mudança de código.

---

## P3 — hardening (baixa prioridade)
- **confirmRecovery queima o código do email no erro parcial** (`two-factor.ts`): se o email valida mas o WhatsApp falha, o código do email já foi consumido → UX (re-enviar). **Fail-closed** (não desativa 2FA sem os dois) — não é furo. Melhoria: só consumir após ambos validarem.
- **Flags de cookie de sessão** (NextAuth): garantir `Secure`+`HttpOnly`+`SameSite` explícitos e prefixo `__Secure-`/`__Host-` em prod (NextAuth já faz por padrão; tornar explícito).
- **`.env`/exemplos** com valores de dev versionados — revisar (não há secret de prod no repo; já verificado).
- **Chatwoot token em query string** pode ir pra logs — mover pra header.
- **Cap diário de saque é por-tenant, não por-CPF** — concentração não controlada (Eulen pode recusar). Decisão de produto.

---

## ✅ Falsos-positivos dos agentes (verificados e descartados)
- **"P0 cross-tenant em provider-commission"** → FP: roda em `withTenant` (RLS protege). É RBAC interno, não cross-tenant. Rebaixado a P2-2.
- **"P1 PagBank marca venda de outro tenant"** → FP: o handler já faz `findMany({ number }, take:2)` e **recusa se >1 match** (documentado no código); além disso PagBank **não é gateway ativo** (só DePix). Sem risco.
- **"P1 confirmRecovery não-atômico / brute-force"** → FP: **fail-closed** (exige password + os DOIS códigos); brute-force limitado por max-5-tentativas/código + rate-limit 10/h. O `target` (email/phone) vem do registro do usuário logado, não do client → sem reuso cross-contexto da tabela `verification_codes`.
- **Vários "criticos"** de varredura confirmados sólidos: RLS app_login, HMAC nos webhooks, sem SQLi (queries parametrizadas, `pg_notify` parametrizado), sem path traversal (storage), PDFs com `escapeHtml`, container non-root, cron-lock atômico, idempotência de depósito/saque.

---

## Sugestão de ordem de execução
1. **✅ P1 backup-code atômico** — feito (#318).
2. **✅ P2-1 TOTP last-used** (anti-replay no step-up de saque) — feito (migration `20260628120000`).
3. **✅ P2-3** host allowlist no redirect — feito. **✅ P2-4** rate-limit — verificado (já pega o last-hop do XFF, sem mudança).
4. **P2-2** comissões RBAC — gatear escritas por `isTenantAdmin`.
5. **P3** — higiene conforme prioridade.
