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
| 1 | PDV / Vendas | ✅ auditado + corrigido (PR aberto) |
| 2 | Caixa | ⬜ |
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

## Decisões de produto pendentes (próximos módulos)
- **#3 — Comissão de prestador externo na OS** (Módulo 5/7): quando o técnico é `serviceProviderId`,
  o pagamento da OS não gera comissão. Confirmar escopo no gate do módulo de Comissões.

---

## Histórico
- **2026-06-23** — Plano aprovado (gate por módulo, do zero, profundidade extrema). Passo 0: revertidas
  alterações prematuras, baseline limpo. Módulo 1 (PDV) auditado + corrigido (desconto fixo + estorno admin).
