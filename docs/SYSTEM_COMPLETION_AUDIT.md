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
| 2 | Caixa | ✅ auditado + corrigido (PR #224 MERGED) |
| 3 | Financeiro | ✅ auditado + corrigido (PR #225 MERGED) |
| 4 | Recebíveis de cartão | ✅ auditado — limpo (sem mudanças) |
| 5 | Ordens de Serviço | ✅ auditado + corrigido (PR #226 MERGED) |
| 6 | Estoque | ✅ auditado + corrigido (PR #227 MERGED) |
| 7 | Comissões | ✅ auditado + corrigido (PR aberto) · arquitetura a rever |
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

## Módulo 3 — Financeiro ✅ (2026-06-23)

**Veredito: sólido.** `create` (admin-only, `addMonthsSafe` evita bug fev/mar); `update` (guarda
PAID/CANCELLED + impede divergência em tx vinculada); `cancel` (bloqueia PAID); `payInstallment`
(CAS); `receiving.ts` bem gated. Paridade com `FinanceiroService.php` (métodos viraram lógica inline).

**Corrigido (aprovado pelo dono):**
- **P2 — `reverseInstallment` CAS:** trocado `update` por `updateMany` com guard otimista
  (status pagável + `paidAmount` igual ao lido) + checa count → blinda estornos concorrentes.
- **DRE — vendas parcialmente estornadas:** o filtro `status='COMPLETED'` excluía PARTIALLY_REFUNDED
  por inteiro (subestimava receita dos itens mantidos). Agora inclui PARTIALLY_REFUNDED escalando
  **receita e custo** pela **fração mantida** (`SUM(sale_items.total) / subtotal`) — preserva a margem;
  COMPLETED e `is_os_payment` têm fração 1 (comportamento inalterado). Colunas verificadas.
- **Cleanup — 8 órfãs removidas** (−391 linhas líquidas): `createReceivablesFromSale/FromServiceOrder`,
  `cancelReceivablesFromSale`, `payMultipleInstallments`, `createPayableDowngrade/FromPurchase`,
  `getCustomerOpenBalance`, `markOverdue` + helper `applyTypeFilter` órfão + comentário stale corrigido.

**Verificação:** typecheck 0 · lint 0 · unit 1159. CAS/DRE são DB-level → regressão coberta pelo
CI E2E (docker indisponível local).

---

## Módulo 4 — Recebíveis de cartão ✅ (2026-06-23) — limpo

**Veredito: excelente, nenhum bug.** Feature recém-construída e testada (`card-receivable.test.ts`):
`computeCardSettlement` (taxa = bruto×%+fixo clampado, líquido ≥ 0, D+N) e `splitCardReceivable`
(parcela em D+N+30×(n−1)) em integer-cents; `settle` (operador, idempotente, calcula divergência,
audita) / `unsettle` (admin); `assertOwned` = defense-in-depth além do RLS. Sem paridade Laravel
(feature nova). Único achado P3 (settle sem CAS — risco baixíssimo) **não corrigido por decisão do dono**.

## Módulo 5 — Ordens de Serviço ✅ (2026-06-23)

**Veredito: excelente** (módulo mais auditado — 16 PRs). `updateStatus` é máquina de estados rigorosa
(ALLOWED_TRANSITIONS, assinatura de entrada, guardas de lab/orçamento, PAID via PDV-only exceto
force-admin, CANCELLED via `cancel`, DELIVERED com termo); `registerPayment`/`refund`/`cancel`
sólidos e gated. Paridade com `OrdemServicoController` já estabelecida.

**Corrigido (aprovado pelo dono):**
- **P2 — `updateStatus`→PAID (force-admin) divergia do `registerPayment`:** o `serviceOrder.update`
  não tinha CAS de status (force-PAID concorrente podia duplicar cashMovement) e o branch não
  chamava `createOsTechnicianCommission` (OS paga via "force" não creditava comissão do técnico).
  Fix: transição agora é `updateMany` com CAS de status (count check) + chamada da comissão no
  branch PAID (idempotente; base 0 em garantia/cortesia → no-op).

**Não implementado:** P3 `updateData: any` (2×) → Fase Final de type-safety.

---

## Módulo 6 — Estoque ✅ (2026-06-23)

**Veredito: robusto.** RBAC exemplar (ADR 0053); reserva no carrinho PDV com CAS; compra→financeiro
atômica; `stockEntry` rejeita serializado; dualidade currentStock/StockItem consistente. Paridade
com `EstoqueService.php`.

**Corrigido (aprovado pelo dono):**
- **P2 — `writeOff` de serializado:** soft-delete sem guardar SOLD/RESERVED (podia orfanar venda).
  Agora lê o item antes, bloqueia SOLD/RESERVED, usa `item.productId` no movimento (remove lint warning).
- **P3 — IMEI na entrada bulk:** `entrySerializedItems` pré-valida IMEIs (Luhn + duplicado no lote +
  já-em-estoque não-deletado) antes do `createManyAndReturn`, trocando o P2002 cru por mensagem
  amigável; normaliza o IMEI (só dígitos) no insert.
- **P3 — `changeItemStatus` CAS:** `update` → `updateMany` com guard de status atual + count (blinda
  mudanças de status concorrentes).
- Bônus: removido import órfão `isValidTransition` (lint).

**Verificação:** typecheck 0 · lint 0 (stock.ts + service limpos) · unit 1159. CAS/IMEI são DB-level
→ regressão no CI E2E.

---

## Módulo 7 — Comissões ✅ parcial (2026-06-23)

**Veredito: bug latente corrigido; arquitetura a rever.** Existem DOIS sistemas de comissão:
o **legado `Commission`** (`commission.ts`, regras por papel, batch `calculate` + real-time
`createOsTechnicianCommission`) e o **Provider/sócio** (`provider-commission.ts`, contrato MEI/CLT,
apuração própria com lock CAS OPEN→CLOSING).

**Corrigido (aprovado pelo dono):**
- **P1 (latente) — double-count/perda no legado:** `calculate` apagava PENDING do período e
  regenerava, o que **wipava** as comissões real-time da OS (ou as **duplicava** quando o mês do
  pagamento ≠ mês do `updatedAt`). Agora `calculate` é **idempotente**: não apaga; só preenche o que
  falta, pulando vendas/OS que já têm comissão não-cancelada (dedup por referência). Rodar N vezes é seguro.

**Pendente (decisão do dono):**
- **Rever a arquitetura de comissões** (os dois sistemas) — o dono respondeu "precisamos rever isso".
  A **decisão #3** (comissão de prestador externo `serviceProviderId` na OS) depende disso. Não mexi
  no desenho nem no provider-commission; só blindei o double-count.

---

## Decisões de produto pendentes (próximos módulos)
- **Arquitetura de comissões** (M7): rever os 2 sistemas (legado vs Provider) + decidir #3
  (comissão de prestador externo na OS). Esforço próprio.
- **Sangria automática** (do M2): implementar o alerta de limite (config por tenant) — gate próprio.

---

## Histórico
- **2026-06-23** — Plano aprovado (gate por módulo, do zero, profundidade extrema). Passo 0: revertidas
  alterações prematuras, baseline limpo. Módulo 1 (PDV) auditado + corrigido (desconto fixo + estorno admin).
