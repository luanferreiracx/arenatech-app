# Runbook — API de Parceiros (DePix)

Operação da API externa de parceiros (ADR 0057). Para o contrato/endpoints, ver
`docs/PARTNER_API.md`. Este doc é o **operacional**: onboarding, incidentes,
monitoramento.

---

## Arquitetura em 1 parágrafo

Parceiro → `Authorization: Bearer at_<prefix>_<secret>` → `withPartnerAuth`
(valida key + escopo + rate-limit **fail-closed**) → `withTenant(tenantId)` (RLS,
isolamento) → service DePix existente → DTO versionado. Saída: webhook **assinado
(HMAC)** best-effort em depósito/saque concluído. **Superadmin** libera o acesso por
tenant; **o próprio tenant** (admin) emite/gere as keys.

---

## Como o saque (PIX) funciona por dentro — Eulen **+** LWK

O saque via API é **só PIX** (on-chain não é exposto — ver "Garantias de segurança").
Mas **PIX não é Eulen puro**: são **duas pernas**, e o **LWK sempre participa**.
`partnerCreateWithdraw` → `createWithdraw` (`depix-transaction.service.ts`):

1. **Pede o off-ramp à Eulen** (`createDepixWithdraw`): a Arena informa "pagar R$X
   via PIX pra essa chave/CPF". A Eulen devolve **um endereço Liquid de depósito**
   (`depositAddress`), o valor exato em DePix a depositar e uma **janela de expiração**.
2. **O LWK do tenant transmite o DePix on-chain** (`lwk.transfer`) para o endereço
   que a **Eulen** informou (+ a fatia da taxa Arena, quando houver). **Quem envia é
   o LWK, não o parceiro** — o parceiro nunca escolhe o destino.
3. A Eulen vê o DePix cair no endereço dela e **efetua o PIX** pro destinatário.

**Por isso o saque PIX é seguro pra API:** o destino do envio LWK é sempre um endereço
**da Eulen** (a Arena/parceiro não escolhe). Mesmo com a API-key vazada, o dinheiro vai
pra Eulen → PIX pro CPF do request (rastreável, disputável) — **não dá pra redirecionar
pra uma carteira do atacante**. Era exatamente isso que o saque on-chain permitia (destino
arbitrário) e por isso foi removido da API.

**Implicações operacionais** (todo saque PIX depende do LWK):
- Exige **saldo DePix on-chain** do tenant cobrindo o bruto (líquido + taxas).
- Exige **L-BTC** na carteira pra pagar o gás da rede Liquid — se a central secar,
  os saques travam com `insufficient_lbtc` ([[depix-lbtc-gas-management]]). Vale pra
  API igual ao painel.
- Se a **janela da Eulen expirar** antes do envio LWK, o saque é **abortado ANTES de
  transmitir** (sem perda de fundos; doc Eulen: "never deposit after expiration").
  O parceiro recebe erro e deve **gerar o saque de novo**.

---

## Onboarding de um parceiro

1. **Superadmin liga o acesso:** `/admin/tenants → [tenant] → API externa = ON`.
2. **Admin do tenant emite a key:** `/settings/partner-api → Nova chave`, escolhe os
   **escopos** (princípio do menor privilégio):
   - `depix:read` — saldo/extrato (comece só com isto).
   - `depix:deposit` — gerar cobrança.
   - `depix:withdraw` — **saca dinheiro**; só conceda com necessidade real.
   O segredo (`at_..._...`) é mostrado **uma vez** — o parceiro guarda.
3. **(Opcional) Webhook:** `/settings/partner-api → Webhook`: URL HTTPS do parceiro;
   o secret HMAC é gerado e exibido uma vez. O parceiro valida o `X-Signature`.
4. **Parceiro testa:** começar por `GET /api/v1/partner/depix/balance` (read-only),
   depois depósito de valor baixo, conferindo o webhook chegar.

**Recomendação de go-live:** liberar **só read+deposit** primeiro; habilitar
`depix:withdraw` depois de validar a integração.

---

## Limites e quotas (env-overridable)

| Item | Default | Env |
|---|---|---|
| Rate-limit depósito | 30 req/min por key | (código) |
| Rate-limit saque | 10 req/min por key | (código) |
| Cap diário saque **via API** | R$ 10.000 / 24h por tenant | `PARTNER_DEPIX_WITHDRAW_DAILY_CAP_CENTS` |
| Cap diário saque (geral, painel+API) | R$ 25.000 / 24h por tenant | `DEPIX_WITHDRAW_DAILY_CAP_CENTS` |
| Valor depósito | R$ 10 – R$ 5.000 | (validador) |
| CPF/CNPJ no depósito | obrigatório ≥ R$ 500 | (regra Eulen) |

Os dois caps de saque **somam** (a API nunca ultrapassa nenhum dos dois). Saque via
API **só** em carteira **custodial** (non-custodial exige a senha do titular → 412).

---

## Incidentes

### Key vazada / comprometida
- **Ação imediata:** o admin do tenant revoga em `/settings/partner-api → Revogar`
  (ou superadmin desliga o acesso inteiro no `/admin/tenants`). Revogação é instantânea
  (a validação rejeita `revokedAt != null`).
- Emitir uma key nova com os mesmos escopos; o parceiro troca o segredo.
- A key revogada não some do histórico (auditoria: `keyPrefix`, `lastUsedAt`).

### Webhook secret vazado
- `/settings/partner-api → Webhook → Rotacionar secret`. O parceiro atualiza o secret
  do lado dele. Entregas com o secret antigo passam a falhar a validação dele.

### Parceiro reclama de 401/403/429
- **401** key inválida/revogada ou header ausente. **403** key sem o escopo da rota.
  **429** acima da quota (orientar backoff). **412** saque em carteira non-custodial
  ou pré-condição (tenant sem usuário). **503** rate-limit sem Redis (ver abaixo).

### 503 "indisponível" na API de parceiro
- É o **fail-closed**: em produção, sem Redis, a borda de parceiro **recusa** (não
  libera geral). Verificar `REDIS_URL` / saúde do Redis na VPS. Os fluxos internos
  do app não são afetados (eles toleram fallback in-memory).

### Saque preso / não conclui
- Mesmo fluxo do painel (Eulen + LWK, ver "Como o saque funciona por dentro"). Onde
  costuma travar:
  - **Perna 1 (Eulen) falhou** → tx `FAILED` com `errorMessage` do provedor; o parceiro
    reenvia (nada foi transmitido on-chain).
  - **Perna 2 (LWK) falhou** → tipicamente `insufficient_lbtc` (falta gás L-BTC —
    reabastecer pela central, [[depix-lbtc-gas-management]]) ou saldo DePix on-chain
    insuficiente. Reconciliação: cron `reconcile-depix-*`.
  - **Janela Eulen expirou antes do envio** → `FAILED` "janela expirou (sem perda de
    fundos)"; o parceiro **gera o saque novamente**.
  A API usa os MESMOS services do painel, então as mesmas redes de segurança valem.

---

## Monitoramento

Logs estruturados (→ Sentry em erro). Sinais úteis pra dashboard/alerta:
- `partner-api: deposito` / `partner-api: saque` — ações que movem dinheiro
  (contém `keyPrefix`, `tenantId`, `amountCents`).
- `partner-api: escopo insuficiente` — 403 repetido pode indicar config errada ou
  tentativa de abuso.
- `partner-api: rate-limit sem backend distribuído` — **crítico** (Redis fora).
- `partner-webhook: entregue` / `falha na entrega` — saúde das notificações.
- `partner-api-key: emitida` / `revogada` — trilha de gestão de keys.

**Onde olhar primeiro num incidente:** filtrar o Sentry/logs por `keyPrefix` (sai em
toda chamada autenticada) → isola o parceiro/integração.

---

## Garantias de segurança (recap)

- **Isolamento:** toda leitura/escrita roda em `withTenant` (RLS Postgres) — key de um
  tenant nunca enxerga dados de outro (404, não vazamento).
- **DTOs versionados:** as respostas nunca expõem tipos/campos internos do Prisma.
- **Idempotência:** escrita aceita `Idempotency-Key`; o `idempotencyKey` propaga aos
  services (replay não duplica depósito/saque).
- **Saque:** sem 2FA (máquina) — compensado por escopo opt-in + custodial-only + 2
  caps diários + advisory lock + cross-check on-chain.
- **Webhook:** assinado (HMAC); o parceiro deve validar o `X-Signature` antes de
  confiar no corpo.

Ver `docs/decisions/0057-api-parceiros-externos.md` (ADR) e `docs/PARTNER_API.md`.
