# Auditoria — Força-Tarefa de Finalização (2026-06-26)

> Varredura completa do sistema por 5 agentes paralelos (financeiro, segurança/multi-tenant, banco, frontend, integrações), com **confirmação manual** dos achados de maior impacto pela sessão principal antes de consolidar. Esta rodada **apenas documenta** — nenhuma correção foi aplicada. As correções serão PRs separados, na ordem sugerida ao final.

**Método:** cada agente recebeu o baseline do que já era conhecido (auditorias PDV/Estoque, Tenant Isolation, System Completion) para focar em **achados novos**. Achados P0/P1 e os de maior risco foram reabertos e **confirmados lendo o código real** (não só o relatório do agente) — dois achados que os agentes marcaram como P0 foram **rebaixados/descartados** após verificação (ver "Falsos-positivos corrigidos").

---

## Sumário executivo

O sistema está **sólido no núcleo**: RLS multi-tenant correto (116 tabelas, role `app_login` sem bypass), sem SQL injection, webhooks com HMAC/revalidação, crons autenticados, idempotência financeira (estornos R1–R7 do audit anterior implementados), timeouts em todas as chamadas HTTP externas, frontend sem `any`/fluxos quebrados/páginas incompletas. **Não há nenhum P0 confirmado.**

O passivo real é **dívida operacional e de higiene**, não bugs que sangram dinheiro hoje:

| Severidade | Qtd | Natureza |
|---|---|---|
| **P0** (perda de dado/dinheiro / furo explorável) | **0** | — |
| **P1** (gap sério: estado preso, compliance, robustez crítica) | **3** | repasse DePix sem maxRetries; saque preso sem escalação; crons sem lock (multi-instância). _(P1-3 "secrets em texto plano" foi descartado na verificação — ver FP-3.)_ |
| **P2** (robustez / risco de design / bug menor) | **5** | estorno sem caixa aberto; mutations admin sem audit trail; FK CashMovement; classificação de erro HTTP; rate-limit webhook InfinitePay |
| **P3** (melhoria / dívida técnica / limpeza) | **6** | ~21 procedures órfãs; 2 componentes mortos; logs de cron sem detalhe por ID; float em cash-session; onDelete implícito; doc de TTL/parcelas |

**Top que mais importam:**
1. **[P1 — ✅ resolvido no PR #261] Repasse de depósito DePix sem `maxRetries`/escalação** — depósito non-custodial confirmado on-chain podia ficar `PENDING` para sempre se o cron de repasse falhasse repetidamente; tenant não recebia o líquido e ninguém era avisado.
2. **[P1 — ✅ resolvido no PR #261] Saque DePix preso em `PROCESSING` sem fallback** — se o PixPay falha na reconciliação, o saque travava sem alerta e o saldo ficava reservado.
3. **[P1] Crons sem lock distribuído** — só vira problema **se** rodar em mais de uma instância; hoje (instância única) é latente. Importante antes de escalar horizontalmente.
4. **[P2] Estorno sem caixa aberto não registra saída** — recebível é cancelado mas o caixa não é decrementado; gaveta fica desbalanceada sem o operador perceber.

---

## P0 — Crítico

Nenhum P0 confirmado nesta rodada. (Dois achados marcados P0 pelos agentes foram rebaixados após verificação — ver seção "Falsos-positivos corrigidos".)

---

## P1 — Sério

### P1-1 · Repasse de depósito DePix sem `maxRetries` nem escalação (estado preso)
- **Onde:** `src/server/services/depix-transaction.service.ts` (`settleDepositViaFeeWallet`) + `src/app/api/cron/process-deposit-repayments/route.ts`
- **O quê:** No fluxo non-custodial (ADR 0052), o webhook do LWK confirma o depósito → cria `DepixDepositRepayment` `PENDING` para repassar o líquido ao tenant via carteira de taxas. Se o `lwk.transfer()` falha, o repasse fica `PENDING` aguardando o cron. O cron reprocessa com `idempotencyKey = repay:{id}` (não duplica on-chain — **confirmado**), mas **não há `maxRetries`, dead-letter, nem alerta**: se o LWK ficar indisponível por tempo prolongado, o repasse fica `PENDING` indefinidamente, o depósito nunca credita ao tenant e ninguém é notificado.
- **Impacto:** Perda de dinheiro (líquido retido), saldo do tenant em suspenso sem visibilidade operacional.
- **Confiança:** Alta (confirmado: idempotência existe, escalação não).
- **Proposta:** Adicionar `retryCount`/`maxRetries` (ex. 5) em `DepixDepositRepayment`; após exceder → marcar `FAILED`, registrar log de erro estruturado e alertar (email admin ou painel superadmin `/admin/depix-fees`, que já lista repasses pendentes). Liberação manual pelo painel.

### P1-2 · Saque DePix preso em `PROCESSING` sem fallback de escalação
- **Onde:** `src/server/services/depix-transaction.service.ts` (`reconcileStaleDepixTransactions`) + `src/app/api/cron/reconcile-depix-transactions/route.ts`
- **O quê:** Saque (`WITHDRAW`) em `PROCESSING` é reconciliado pelo cron via `checkTransactionStatus()` (consulta PixPay). Se o PixPay está fora/lança erro, o loop loga `warn` e segue — **sem reenfileirar nem escalar**. Saque fica preso por horas; o saldo permanece reservado (usuário não pode sacar de novo).
- **Impacto:** Confiabilidade/UX; saldo bloqueado; tickets de suporte.
- **Confiança:** Média-Alta (lógica de reconciliação existe; falta tratamento de falha persistente do provedor).
- **Proposta:** Contador de falhas consecutivas por transação; após N (ex. 3) → estado `FAILED_PENDING_MANUAL_CHECK` + alerta para verificação humana no painel do PixPay. Não desbloquear saldo automaticamente (risco de duplo saque).

### ~~P1-3 · Secrets de integração em texto plano (`TenantIntegration.config`)~~ → **FALSO-POSITIVO (FP-3), verificado 2026-06-26**
- **O quê (afirmação do agente):** `TenantIntegration.config` guardaria `apiKey`/`secret`/`token` de Autentique/DePix/Chatwoot/InfinitePay/Evolution sem criptografia.
- **Verificação manual (descartado):** os serviços de integração leem credenciais de **`process.env`** (`DEPIX_API_KEY`, `EVOLUTION_API_KEY`, `getWhatsappAiAccessConfig()`/`getClaudeConfig()` via env), **não** do banco. As referências `config.apiKey` apontam para objetos de config montados a partir de env (ex. `depix-service.ts:71`), não para `TenantIntegration.config`. O que de fato é persistido em `config` é **não-secreto**: o `handle` público InfinitePay + `defaultEmail` + flags de feature (a UI de Integrações nem tem campo de apiKey/token). O único secret per-tenant real (PFX fiscal) **já é cifrado** (`pfx-encryption.service.ts`). Varredura dos schemas: **nenhuma** coluna `token`/`secret`/`api_key`/`password` em texto plano (só `password_hash`, PFX cifrado, 2FA, `encryptedSeed` DePix).
- **Conclusão:** Não há secret em claro no banco — a higiene de segredos do sistema está correta (env-vars no server). **Nada a cifrar.** Removido do backlog (PR-B cancelado). Risco residual genuíno = gestão dos próprios env-vars (rotação/escopo), fora deste escopo de código.

### P1-4 · Crons sem lock distribuído (latente — só com múltiplas instâncias)
- **Onde:** `src/app/api/cron/process-deposit-repayments/route.ts`, `release-stale-reservations/route.ts`, `reconcile-depix-transactions/route.ts`
- **O quê:** Nenhum lock (advisory Postgres / Redis) impede execução concorrente. Em **instância única** (estado atual) não há corrida. Em **múltiplas instâncias** ou disparos sobrepostos, dois processos pegam o mesmo lote: o repasse é protegido por idempotencyKey (não duplica dinheiro), mas `release-stale-reservations` pode liberar a mesma reserva 2x (estoque inconsistente).
- **Impacto:** Confiabilidade ao escalar horizontalmente; hoje é latente.
- **Confiança:** Alta (ausência de lock confirmada; impacto condicionado à topologia).
- **Proposta:** `SELECT pg_advisory_xact_lock(hashtext('<cron-name>'))` no início de cada cron (lock por nome de job). Barato e suficiente. Implementar **antes** de qualquer escala horizontal.

---

## P2 — Médio

### P2-1 · Estorno sem caixa aberto não registra saída (gaveta desbalanceada)
- **Onde:** `src/server/api/routers/sale.ts:1952-1960`
- **O quê:** `refund()` sem caixa aberto cancela o recebível mas **não cria `CashMovement`** — só `logger.warn`. Retorna `{ success: true }`, então o operador acha que estornou normalmente; a saída de dinheiro nunca entra no caixa. Conferência de caixa fica inconsistente.
- **Impacto:** Inconsistência financeira silenciosa.
- **Confiança:** Alta (confirmado).
- **Proposta:** Decisão de produto: **bloquear** estorno sem caixa aberto (paridade com outras operações de caixa) **ou** retornar `warnings: [...]` visível na UI. Recomendo bloquear.

### P2-2 · Mutations admin sensíveis sem trilha em `audit_logs`
- **Onde:** `src/server/api/routers/admin.ts` — `resetTenantUserPassword` (~l.404), `resetTenantUserTwoFactor` (~l.477)
- **O quê:** Superadmin reseta senha / desliga 2FA de usuário de tenant; registra só em `logger` (transiente), não em `audit_logs` (persistente). `settings.updateIntegration` já usa `logAudit()` — padrão existe, não aplicado aqui.
- **Impacto:** Compliance/LGPD; impossível rastrear pós-incidente quem resetou credencial de quem.
- **Confiança:** Alta. **Relacionado:** o P2 conhecido de `adminProcedure` aceitar `tenantId` do input confiando no superadmin — aceitável, mas reforça a necessidade da trilha.
- **Proposta:** Chamar `logAudit()` ao fim de cada mutation admin que toca credenciais (`action: reset_password` / `reset_two_factor`, com `tenantId`/`userId`/ator).

### P2-3 · `CashMovement → CashSession` sem soft-delete / política de retenção
- **Onde:** `prisma/schema/cashier.prisma:66`
- **O quê:** A relação herda o default Prisma (`Restrict`) — o banco **impede** deletar uma `CashSession` com movimentos (protege a trilha, não a quebra). O ponto real: `CashSession`/`CashMovement` **não têm soft-delete** e a política de retenção fiscal não está explícita. Não é orphan risk (ver falso-positivo FP-1).
- **Impacto:** Robustez/auditoria fiscal (baixo, hoje protegido pelo Restrict).
- **Confiança:** Média.
- **Proposta:** Documentar a política (registros de caixa são imutáveis/retidos). Se um dia precisar "apagar" uma sessão, usar soft-delete + filtro `deletedAt`, nunca DELETE físico.

### P2-4 · Erros de integração HTTP sem classificação (retryable vs fatal)
- **Onde:** `src/lib/services/*-service.ts` (depix, lwk, email, fiscal, whatsapp)
- **O quê:** **Positivo:** todos os `fetch` têm `AbortSignal.timeout()`. **Mas:** o handler retorna `{ success: false, error }` genérico sem distinguir timeout (429/503 → retryable) de erro fatal (401/404). Quem reprocessa não sabe se deve retry/backoff ou desistir.
- **Impacto:** Confiabilidade (retry cego ou desistência indevida).
- **Confiança:** Média.
- **Proposta:** Enriquecer o retorno com `{ retryable: boolean, retryAfterMs?: number }` derivado do HTTP status; camadas de retry leem esse campo.

### P2-5 · Webhook InfinitePay sem rate-limit no `payment_check`
- **Onde:** `src/app/api/webhooks/infinitepay/route.ts:89-111`
- **O quê:** InfinitePay não assina o webhook; a mitigação (revalidar via `checkInfinitepayPayment()`) está correta. Mas se o `payment_check` falha, retorna 400 pedindo retry **sem limite** — o provedor pode retentar agressivamente.
- **Impacto:** Robustez (retry storm), risco marginal.
- **Confiança:** Baixa-Média.
- **Proposta:** Rate-limit por `saleId` (ex. 5 tentativas/h → 429) ou backoff.

---

## P3 — Melhorias & dívida técnica

### P3-1 · Procedures tRPC órfãs (≈21, confirmadas sem nenhum caller)
Validadas com prefixo correto `trpc.<router>.<proc>` em `src/app`+`src/components`, e cruzadas com `src/app/api`, services e `actions` (0 callers em todos):

| Router | Procedures órfãs confirmadas |
|---|---|
| `stock` | `writeOff`, `entryQuantity`, `entrySerializedItems`, `adjustInventory`, `getCsvImportTemplate`, `getImeiHistory`, `getStockItem`, `getAvailableQuantity`, `createVariation`, `updatePurchaseDate` |
| `communication` | `getById`, `resend`, `resubscribeCustomer`, `sendToCustomer`, `unsubscribeCustomer` |
| `admin` | `assignAddon`, `deleteTenant`, `getAddon`, `getRefund`, `publicPlans` |
| `financial` | `exportCsv` (substituída pelo GET `/api/financial/export`), `update`, `updateCategory`, `getDashboardComparison` |
| `settings` | `getAuditLog`, `getSecurity`, `listTeam`, `upsertNotificationConfig`, `previewPaymentBreakdown` |

- **Nota:** algumas funções (`entrySerializedItems`, `adjustInventory`, `getAvailableQuantity`) **também existem como função de serviço** importada internamente — a *procedure tRPC* é órfã, a *função* não. Remover só a procedure.
- **Decisão de produto antes de remover:** `admin.deleteTenant`, `admin.assignAddon`/`getAddon` (ligados ao Admin SaaS/planos — Fase 15 pendente), `settings.getAuditLog`/`getSecurity`/`listTeam` (telas de admin que podem estar planejadas). `stock.*` e `communication.*` parecem seguras para remoção ou para religar a uma UI faltante.
- **Proposta:** Triagem em 1 PR: remover as comprovadamente mortas (ex. `financial.exportCsv` duplicada, `stock` órfãs sem feature correspondente); religar à UI as que representam feature faltante (ex. `settings.getAuditLog` → tela de logs já existe mas não consome). **Não** remover as bloqueadas por decisão de produto.

### P3-2 · Componentes mortos
- **Onde:** `src/components/ui/scroll-area.tsx`, `src/app/(app)/stock/_components/labels-export-menu.tsx`
- **O quê:** Nunca importados. `scroll-area` é wrapper shadcn não usado; `LabelsExportMenu` é feature de etiqueta Niimbot não plugada.
- **Proposta:** Remover `scroll-area` (re-adicionável via shadcn quando precisar). Confirmar com o dono se `LabelsExportMenu` é feature pendente antes de remover.

### P3-3 · Logs de cron sem granularidade por ID
- **Onde:** `src/app/api/cron/process-deposit-repayments/route.ts:56-61` (e crons análogos)
- **O quê:** Logam contadores agregados (`scanned/completed/stillPending`) sem dizer **qual** id falhou. Debug exige SQL manual.
- **Proposta:** Logar por item `{ repaymentId, status, error }` em INFO + manter o SUMMARY agregado. (Casa com P1-1.)

### P3-4 · Float em `cash-session.service` (cosmético)
- **Onde:** `src/server/services/cash-session.service.ts:27-31,57-61,89-93`
- **O quê:** Cálculo de saldo com float + `Math.round` no final. Correto hoje (arredonda no fim), mas subótimo. Já catalogado.
- **Proposta:** Refactor futuro para centavos inteiros/Decimal end-to-end. Baixa prioridade.

### P3-5 · `onDelete` implícito em 23 relations (explicitar por legibilidade)
- **Onde:** `prisma/schema/*.prisma` (23 de 59 relations sem `onDelete` explícito)
- **O quê:** **Não é bug** (ver FP-1): o Prisma aplica `Restrict` (obrigatória) / `SetNull` (opcional) por padrão, e as migrations refletem exatamente isso. Mas o comportamento fica implícito — um leitor não sabe a intenção sem consultar a migration.
- **Proposta:** Opcional/higiene: declarar `onDelete` explícito nas relations de domínios sensíveis (financeiro, venda, OS) para a intenção ficar no schema. Sem urgência.

### P3-6 · TTL/cálculos a documentar
- **Onde:** `src/lib/talison/scheduler.ts` (TTL do nonce), `src/server/api/routers/financial.ts:398-419` (última parcela absorve resto)
- **O quê:** Comportamentos corretos mas sem comentário. TTL do Talison existe (`EX`), só não está documentado o valor razoável; cálculo de parcela está certo (última absorve o resto), falta comentário.
- **Proposta:** Comentários de 1 linha; warning se `GENERATION_TTL_SECONDS > 3600`.

---

## Código órfão / páginas incompletas (resumo validado)

- **Páginas incompletas:** **0** encontradas. Os "stubs" pequenos em `(app)/**/page.tsx` são Server Components que delegam para `_components/` — padrão normal do projeto, não incompletude.
- **Fluxos quebrados:** **0** (links/`router.push` cruzados com a árvore de rotas).
- **Anti-padrões frontend:** `any` em `.tsx` = 0; mutations sem `invalidate` = 0; `useEffect` para fetch = 0. (A passada de type-safety anterior segurou.)
- **Órfãos confirmados:** ≈21 procedures (P3-1) + 2 componentes (P3-2). Distinção registrada: procedure órfã ≠ função de serviço (esta segue usada).

---

## Conhecido / decisão de produto (não são achados novos)

Itens já catalogados que continuam abertos — listados para não confundir com bug:
- **Comissões:** arquitetura fragmentada (legado `Commission` + `Provider`) — revisão pendente; comissão de prestador-técnico via `serviceProviderId` na OS ainda não gera.
- **Sangria automática** (alerta de limite de caixa): existe no Laravel, ausente no Next.
- **Recompensas (Fase 14)** e **Admin SaaS/planos (Fase 15)**: aguardam decisão de produto — vários órfãos de `admin.*` dependem disso.
- **Fiscal/NF-e:** emissão real adiada (certificado SEFAZ).
- **DePix:** provisionar `arena-fees` em prod + agendar cron de repasse + incluir no refill L-BTC; LWK deploy manual (não versionado).
- **`pdvdepix.app`** não verificado no Resend; rotacionar `RESEND_API_KEY` exposta.
- **Observabilidade:** sem Sentry (P3) — diretamente relacionado a P1-1/P1-2 (sem alerta, estados presos passam despercebidos).
- **Bugs R1–R7** (audit PDV/Estoque): todos **confirmados implementados** nesta rodada.

---

## Falsos-positivos corrigidos (verificação manual)

Três achados dos agentes foram rebaixados/descartados após leitura direta do código:

- **FP-1 · "FKs sem `onDelete` → risco de orphan / `db push` perde RESTRICT" (Agente 3, marcado P0) → DESCARTADO.** O Prisma aplica `Restrict`/`SetNull` por padrão quando `onDelete` é omitido; as 6 migrations citadas mostram **exatamente** esses valores (`ON DELETE RESTRICT`/`SET NULL`) — **não há divergência**. Confirmado em `FinancialTransaction.financialCategory` (opcional → migration `SET NULL`, default Prisma `SetNull`). Além disso o projeto faz deploy via `migrate deploy`, não `db push`. `prisma validate` passa. Sobra apenas a melhoria de legibilidade (P3-5).
- **FP-2 · "Crons sem lock perdem dinheiro no duplo disparo" (Agente 5, marcado P0) → REBAIXADO para P1-4.** O cron de repasse usa `idempotencyKey = repay:{id}`, então o duplo disparo **não duplica dinheiro on-chain** (confirmado no código). O risco real (corrida em `release-stale-reservations` / estado preso) é P1, condicionado a múltiplas instâncias — hoje instância única.
- **FP-3 · "Secrets de integração em texto plano em `TenantIntegration.config`" (Agente 2, marcado P1) → DESCARTADO (verificado ao iniciar o PR-B).** Os serviços leem credenciais de **`process.env`**, não do banco; as referências `config.apiKey` são objetos montados a partir de env (ex. `depix-service.ts:71`), não `TenantIntegration.config`. O que `config` persiste é não-secreto (handle público InfinitePay + email + flags). O único secret per-tenant real (PFX) já é cifrado. Varredura de schemas: nenhuma coluna de secret em claro. **Nada a cifrar** → PR-B cancelado.

Outros descartes dos agentes (confirmados sólidos, não re-investigar): race em `finalize` (Postgres serializa no lock de linha + idempotência R5), double-spend em webhook (dedup por unique/`alreadyPaid`), N+1 em `getDraft` (batch `in:`), oversell em estoque (compare-and-set), crons sem auth (todos com `CRON_SECRET` Bearer), webhooks sem HMAC (todos assinados ou com revalidação), secrets em log (nenhum), Redis sem TTL (Talison usa `EX`).

---

## Sugestão de ordem de execução (PRs futuros)

1. **PR-A — ✅ FEITO (PR #261):** `maxRetries` + escalação em `DepixDepositRepayment` (P1-1) **e** alerta de saque preso (P1-2). Casou com logs por ID (P3-3).
2. ~~**PR-B (segurança):** cifrar `TenantIntegration.config`~~ → **CANCELADO** (FP-3: não há secret em claro no banco).
3. **PR-C — ✅ FEITO (PR #263):** lock por job (tabela `cron_locks` + `withCronLock`, lease 15min, pool-safe) nos 3 crons (P1-4). Optou-se por lock por linha em vez de `pg_advisory_xact_lock` (pool de conexões + chamadas HTTP nos crons).
4. **PR-D (P2, financeiro):** bloquear/avisar estorno sem caixa aberto (P2-1) + `logAudit` nas mutations admin (P2-2). *Decisão de produto em P2-1.*
5. **PR-E (P2/P3, robustez):** classificação de erro HTTP `retryable` (P2-4) + rate-limit InfinitePay (P2-5).
6. **PR-F (P3, limpeza):** triagem de procedures órfãs (P3-1) + remover componentes mortos (P3-2). *Após o dono decidir sobre os órfãos ligados a Admin SaaS/planos.*
7. **PR-G (P3, higiene):** comentários/TTL doc (P3-6), float cash-session (P3-4), `onDelete` explícito (P3-5).

**Pré-requisito transversal:** instalar **Sentry** (ou equivalente) destrava o valor de PR-A/PR-C — sem alerta, estados presos passam despercebidos.

---

*Rascunhos por agente em `/tmp/audit-2026-06-26/agente{1..5}-*.md`. Nenhum código/schema foi alterado nesta rodada — `prisma validate` verde, sistema intacto.*
