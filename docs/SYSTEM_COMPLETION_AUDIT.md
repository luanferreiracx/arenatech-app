# SYSTEM COMPLETION AUDIT — Varredura módulo a módulo

> Auditoria sistemática para entregar o sistema **100% funcional, robusto e sem falhas**.
> Plano aprovado: gate por módulo · profundidade extrema · paridade Laravel + melhorias ·
> skills obrigatórias · verificação executável. Backend primeiro, depois frontend.
> Plano completo: `~/.claude/plans/lazy-meandering-manatee.md`.

**Baseline (origin/main `090dd09`):** typecheck 0 · lint 0 erros · unit 1152.

---

## Progresso por módulo

| # | Módulo | Status |
|---|--------|--------|
| 1 | PDV / Vendas | ✅ auditado + corrigido (PR #223 MERGED) |
| 2 | Caixa | ✅ auditado + corrigido (PR aberto) |
| 3 | Financeiro | ⬜ |
| 4 | Recebíveis de cartão | ⬜ |
| 5 | Ordens de Serviço | ⬜ |
| 6 | Estoque | ⬜ |
| 7 | Comissões | ⬜ |
| 8 | Fiscal | ⬜ |
| 9 | Métodos de pagamento & taxas | ⬜ |
| 10–12 | Configurações | ⬜ |
| 13–17 | Catálogo/Clientes/Operação/Avaliação/Recompensas | ⬜ |
| 18–21 | DePix | ⬜ |
| 22–25 | Comunicação/Chatbot/IMEI/Simulador | ⬜ |
| 26–28 | SaaS/NO-KYC/Dashboard | ⬜ |
| S1–S6 | Segurança | ⬜ |
| — | Webhooks & Crons · Observabilidade · Infra · Frontend · Limpeza | ⬜ |

---

## Módulo 1 — PDV / Vendas ✅ (2026-06-23)

**Veredito: robusto.** Rastreio ponta-a-ponta de todas as procedures de mutação (finalize, refund,
cancel, carrinho, upgrade, desconto, PIX, InfinitePay, pagamento de OS). Tudo atômico
(`withTenant` = transação + RLS), idempotente, com CAS anti-corrida no estoque/status, validações
de borda. **Paridade confirmada com `PdvService.php`** (Laravel) — o sistema novo é superset
(+DePix wallet, +InfinitePay, +recebíveis de cartão).

**Corrigido (aprovado pelo dono):**
- **P2 — Desconto fixo "fantasma":** `recalculateSale` não re-clampava o desconto fixo ao subtotal.
  Remover itens até o subtotal cair abaixo do desconto fixo deixava o líquido negativo → a venda
  virava *downgrade* (loja "devolvendo" dinheiro nunca pago). Fix: helper puro `effectiveDiscountCents`
  (`src/lib/sales/sale-discount.ts`, clamp `[0, subtotal]`), fonte única para `applyDiscount` +
  `recalculateSale`. Teste `__tests__/unit/sale-discount.test.ts` (7).
- **Decisão #1 — `sale.refund` admin-only:** estorno de venda finalizada (saída de caixa + cancela
  recebíveis/comissão) passou a exigir `isTenantAdmin` no servidor + botão escondido na UI para
  operador — coerência com o estorno de OS (já admin) e o ADR 0053.

**Achados NÃO implementados (decisão do dono):**
- P2 `updateItemQuantity` aceita qty≠1 em serializado (defense-in-depth; UI trava) — não corrigir agora.
- P3 `setCustomer` não valida customer no tenant (RLS resolve no finalize) — não corrigir agora.
- Observação: `addUpgrade` sem cap em `abatedValue` (trade-in over-credit → saída via downgrade) —
  paridade Laravel; possível controle futuro.
- Decisão #2 `quick-sale.markPaid` fora do caixa/financeiro — **manter como está** (dinheiro na wallet DePix).

**Verificação:** typecheck 0 · lint 0 erros · unit 1159 (+7). Integração/E2E: rodam no CI do PR
(docker indisponível localmente neste ambiente; CI é autoritativo — ADR 0045).

---

## Módulo 2 — Caixa ✅ (2026-06-23)

**Veredito: sólido.** `forceClose`/`manualAdjustment` admin-gated + audit; `close` exige nota quando
divergência > R$5/1%; `withdrawal` valida saldo; auto-close (cron) idempotente; `pendingReviews`
resolve nomes via `UserTenant` (evita leak da tabela global `users`). Paridade com `CaixaService.php`
mapeada método a método.

**Corrigido (aprovado pelo dono):**
- **P1 — Índice único não impedia 2 caixas abertos:** `@@unique([tenantId,userId,closedAt])` é inútil
  (NULLs distintos no Postgres → dois `closed_at NULL` passam). Defesa era só o `findFirst` (racy).
  Fix: migration `20260623140000_cash_session_single_open_partial_unique` (índice único **parcial**
  `WHERE closed_at IS NULL` + dedupe defensivo dos abertos duplicados) + schema atualizado + `open`
  traduz P2002 → CONFLICT amigável.
- **P2 — Conferência (`review`) admin-only:** era `tenantProcedure` sem filtro por userId → operador
  podia auto-conferir o próprio caixa, furando segregação de funções. Agora exige `isTenantAdmin`
  (servidor) + botão "Conferir" escondido para não-admin (UI).
- **Cleanup — 3 órfãs removidas:** `recordSale`, `recordServiceOrderPayment`, `recordReversal`
  (sem chamadores; PDV/OS registram `cashMovement` inline). −158 linhas.

**Pendência registrada (decisão do dono):**
- **Sangria automática (paridade Laravel `verificarSangriaAutomatica`):** alerta quando o dinheiro em
  caixa passa de um limite. Ausente no novo. → implementar depois, com **limite por tenant**
  (TenantSettings). Não inflar o M2.
- P3: `cash-session.service` usa float (arredonda a centavos) — cosmético, adiado.

**Verificação:** prisma validate OK · typecheck 0 · lint 0 · unit 1159. Migration + E2E: CI do PR
(docker indisponível local). 

---

## Decisões de produto pendentes (próximos módulos)
- **#3 — Comissão de prestador externo na OS** (Módulo 5/7): quando o técnico é `serviceProviderId`,
  o pagamento da OS não gera comissão. Confirmar escopo no gate do módulo de Comissões.
- **Sangria automática** (do M2): implementar o alerta de limite (config por tenant) — gate próprio.

---

## Histórico
- **2026-06-23** — Plano aprovado (gate por módulo, do zero, profundidade extrema). Passo 0: revertidas
  alterações prematuras, baseline limpo. Módulo 1 (PDV) auditado + corrigido (desconto fixo + estorno admin).
