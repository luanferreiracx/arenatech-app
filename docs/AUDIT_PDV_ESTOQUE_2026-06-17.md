# Auditoria de robustez — PDV / Estoque (2026-06-17)

**Escopo:** vendas (`sale.ts`), vendas avulsas (`quick-sale.ts`), estoque (`stock.ts`), e integração com caixa/financeiro/recebíveis/OS/fiscal/comissão.
**Método:** varredura ampla (3 subagentes Explore) + **validação manual de cada achado contra o código** (skill `reviewing-code`). Muitos "achados" dos subagentes eram falsos positivos — listados no fim para não voltarem a aparecer.

---

## Achados REAIS (validados), priorizados

### 🔴 R1 — Estorno PARCIAL não cancela `CardReceivable` (recebível de cartão fantasma)
`src/server/api/routers/sale.ts` — bloco de refund, ramo `isPartial` (~linha 1816).
No estorno **total** os `CardReceivable` PENDING são cancelados (linha 1812); no **parcial**, não. Itens estornados pagos no cartão continuam com recebível PENDING → entra no fluxo projetado e na visão de recebíveis como dinheiro que nunca virá.
**Impacto:** receita fantasma no projetado/recebíveis. Introduzido na PR #168 (só tratei o caso total).
**Correção:** no ramo parcial, cancelar `CardReceivable` PENDING proporcional ao estornado (ou, no mínimo, os vinculados aos itens estornados). Decisão de produto: cartão não tem "meia parcela" — provavelmente cancelar os recebíveis dos itens estornados.

### 🟠 R2 — Estorno parcial deixa `FinancialTransaction.totalAmount` dessincronizado
`sale.ts` ~linha 1837. No parcial, as `Installment` são marcadas CANCELLED, mas o `FinancialTransaction.totalAmount` da transação-pai **não é reduzido**. Fica uma transação com `totalAmount` cheio e parcelas canceladas — dashboard de contas a receber pode somar errado.
**Impacto:** "a receber" superestimado; relatório confuso.
**Correção:** ao cancelar installments no parcial, recomputar `totalAmount`/`status` da transação (ou cancelar a transação e recriar pelo saldo). Avaliar junto de R3.

### 🟠 R3 — Estorno parcial cancela parcelas "inteiras" (pode cancelar a mais)
`sale.ts` ~linha 1827. Cancela installments inteiras até cobrir `refundedCents`. Se as parcelas não casam exato com o valor estornado (ex.: estornar R$ 500 com parcelas de 400+300 → cancela 700), cancela mais que o devido.
**Impacto:** crédito excessivo ao cliente / recebível some demais. É um trade-off conhecido, mas vale tratar junto de R1/R2 num refactor do estorno parcelado.

### 🟡 R4 — Comissão de venda não é estornada no refund
`sale.ts` refund (~1606–1919) não toca em `Commission`. Comissão de OS é criada no finalize, mas o estorno de venda não reverte comissão alguma.
**Impacto:** vendedor mantém comissão de venda estornada. **Depende de regra de produto** (a comissão de venda hoje parece vir de fluxo separado em `commission.ts` por status PAID/DELIVERED — confirmar com o dono se o estorno deveria reverter).

### 🟡 R5 — `finalize` não é idempotente em duplo-submit (erro feio, mas seguro)
`sale.ts:752`. 2ª chamada com a venda já `COMPLETED` lança `BAD_REQUEST` em vez de retornar sucesso idempotente. **Não causa dupla venda** (o update DRAFT→COMPLETED serializa no lock de linha), mas em rede lenta o operador vê erro e pode achar que falhou.
**Impacto:** UX ruim em retry; risco de o operador refazer a venda. Correção barata: se já COMPLETED e os pagamentos batem, retornar a venda existente (idempotente) em vez de erro.

### 🟡 R6 — DePix "recebido manualmente" pula validação de liquidação
`sale.ts:786` — pagamentos `depixManual:true` não passam por `checkTransactionStatus`. É **intencional** (operador assume recebimento por outro app), mas não há comprovante/trava — risco de finalizar venda sem o dinheiro ter entrado.
**Impacto:** fraude interna / erro humano. Mitigar: exigir nota/observação no manual e registrar em audit log (como o caixa exige nota acima do limite).

### 🟡 R7 — NF-e não é disparada/obrigada pela venda
`fiscal.ts` cria NF-e a partir de venda COMPLETED por ação manual; `sale.finalize` não chama nem obriga. Venda estornada com NF-e já autorizada não cancela a nota.
**Impacto:** risco fiscal (venda sem nota; nota sem estorno). **Decisão de produto** — pode ser intencional (emissão sob demanda).

---

## Itens MENORES / observações
- `stock.ts` filtro `lowStock` resolve em memória (TODO "Estoque-B"); lento em catálogo grande. Performance, não correção.
- `payment-dialog.tsx`: DePix restrito a `tenantSlug === "arena-tech"` (hardcode) e polling de 30s — aceitáveis hoje, revisitar quando DePix abrir a mais tenants.
- OS `force=PAID` (service-order.ts): cria CashMovement quando há valor, mas **não grava audit log do uso do `force`** — adicionar `logAudit` para rastreabilidade.

---

## FALSOS POSITIVOS dos subagentes (NÃO são bugs — documentado p/ não reaparecer)
- **"Data leakage no `stockDashboard`/relatórios" (queries sem `tenantId`):** `stockDashboard` e os relatórios são `tenantProcedure` + `ctx.withTenant`, e `stock_movements`/`sales`/`sale_items` têm **RLS `FORCE`** (migration `20260508195700_rls_fase6`). O `SET LOCAL app.current_tenant_id` isola no banco. É só ausência de defesa-em-profundidade redundante, **não vazamento**.
- **"Cron `release-stale-reservations` não agendado":** está em `.github/workflows/cron.yml` (`*/10 * * * *`). Reservas SÃO liberadas.
- **"Quick-sale não tem cancel/refund":** tem `cancel` (`quick-sale.ts:305`).
- **"Race condition / oversell em `stockEntry`/`adjustStock`":** saídas usam compare-and-set (`updateMany` com `WHERE currentStock >= qty`); entradas usam `increment` atômico do Prisma. Sem oversell pelo caminho normal.
- **"Dupla contagem caixa + financeiro":** `CashMovement` e `FinancialTransaction` são camadas distintas (gaveta física vs. contas a receber); os relatórios consomem a fonte certa para cada visão. Não há dupla contagem no DRE/fluxo — confirmado que cada relatório usa uma fonte.

---

## Recomendação de execução
Tratar **R1 (crítico)** já, e **R2+R3 juntos** num refactor do estorno parcial parcelado (mesmo bloco de código). R4/R6/R7 dependem de decisão de produto — levar ao dono. R5 é correção barata de idempotência. Cada um vira uma PR pequena com teste de regressão.

---

## Status (atualizado 2026-06-17)

**Corrigidos na PR #179** (decisão do dono: R1+R2+R3 + R4 + R6):
- ✅ **R1** — estorno parcial cancela `CardReceivable` PENDING (do prazo mais distante até cobrir).
- ✅ **R2** — recalcula `totalAmount`/`status` da `FinancialTransaction` no estorno parcial.
- ✅ **R3** — documentado (cancelamento por parcela inteira; total coerente via R2).
- ✅ **R4** — estorno total cancela `Commission` de venda PENDING/APPROVED (PAID só logada).
- ✅ **R6** — DePix manual exige observação + grava audit log (`sale_depix_manual`).
- Helper `selectIdsToCover` (`refund-coverage.service`) com 7 testes.

**Pendentes (decisão do dono — não priorizados agora):**
- **R5** — tornar `finalize` idempotente em duplo-submit (hoje dá erro feio, mas é seguro).
- **R7** — integrar/obrigar NF-e ao fluxo de venda (escopo fiscal maior; dono optou por deixar).
- Gap secundário achado durante R4: o batch de geração de comissão filtra só `status="COMPLETED"`, então venda `PARTIALLY_REFUNDED` **não gera comissão** sobre o saldo. Avaliar no módulo de comissão se for relevante.
