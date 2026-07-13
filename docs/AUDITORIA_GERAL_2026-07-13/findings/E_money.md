# E — Dinheiro / DePix / Caixa / Financeiro / Comissão / Fiscal / Billing

> Auditoria manual (agentes cortados por limite de sessão). Foco em invariantes de
> dinheiro e no bug de fuso recorrente. Os módulos de dinheiro já passaram por
> auditorias anteriores (07-04/07-10/07-11) — foco aqui no que restou.

## Achados

### E1 — Bug de FUSO em cálculos de "hoje/mês" em vários routers de dinheiro/relatório — P1
**Fato (arquivo:linha):** o padrão `new Date(now.getFullYear(), now.getMonth(), now.getDate())`
computa "início do dia/mês" no fuso do PROCESSO. O container roda **UTC**, não BRT.
Aparece em:
- `dashboard.ts:51-55` — dashboard.stats (faturamento hoje/mês/mês-anterior)
- `sale.ts:2806-2807` — stats de vendas (hoje/mês)
- `financial.ts:737-738` — período financeiro (mês)
- `fiscal.ts:835` — mês fiscal
- `stock.ts:2619,2662` — stats de estoque hoje/semana (`setHours(0,0,0,0)` idem)
- `dashboard.ts:260` — `setHours(0,0,0,0)` em série temporal
- (reward.ts:260 — módulo morto, ignorar)

**Impacto:** vendas/OS entre 21h–24h BRT (00h–03h UTC) caem no DIA/MÊS ERRADO.
"Faturamento de hoje", "vendas do mês", relatório fiscal e financeiro mensal ficam
com números errados nas bordas de dia/mês. É EXATAMENTE o bug corrigido em #521
(dashboard) e D6/J3/R7 (comissão/recebimento), mas **persistente nestes routers**.
Dado de decisão errado = grave.
**CORREÇÃO IMPORTANTE (o audit skill em ação — eu li um checkout STALE):**
`src/lib/utils/date-range.ts` em `origin/main` JÁ TEM os helpers BRT completos
(`startOfTodayBrt`, `startOfMonthBrt`, `startOfPrevMonthBrt`, `endOfPrevMonthBrt`,
`brtDateParts`, `brtDayKey`) — adicionados em #521. E o `dashboard.ts` JÁ USA os
helpers (verificado em origin/main, linhas 61-63/270/286). Minha primeira varredura
leu o checkout local defasado. **Verificação contra origin/main real** mostrou que
os offensores REMANESCENTES são só: `financial.ts:737-738`, `fiscal.ts:835`,
`sale.ts:2806-2807`, `checklist.ts:191` (+ reward.ts, módulo morto).

**FIX APLICADO nesta sessão** (PR fix/timezone-brt-reports): esses 4 routers agora
usam `startOfTodayBrt`/`startOfMonthBrt`/`endOfMonthBrt` (novo helper que adicionei).
Teste unit TZ-independente (6 casos, incl. virada de ano). **Confiança: alta.**
É leitura de período (não move saldo/escrita) → baixo risco. ⚠️ Mexe em NÚMEROS que
o dono vê — deixei claro no PR pra ele conferir ao acordar.

### E2 — (a auditar) idempotência de estornos multi-efeito
Verificar se cancelar venda/OS reverte recebível + caixa + comissão + estoque + fiscal
de forma atômica. Auditorias anteriores fecharam vários (ver memórias audit-financeiro-*).
Pendente re-confirmar sale.ts refund paths. **Não concluído nesta passagem.**

### E3 — (a auditar) billing DePix novo (ADR 0058)
Renovação idempotente já tem teste (subscription-depix-renewal). Verificar se a
cobrança no tenant central credita corretamente e se há caminho de reconciliação se
o webhook falhar. **Não concluído.**

## Invariantes já sólidos (de auditorias anteriores, preservar)
- Consumo de cota IMEI atômico (CAS SQL) com estorno em falha de rede.
- Fechamento de caixa recalcula no servidor (anti-falsificação).
- Comissão STORE/OWN estornada ao cancelar venda (reverseSaleCommissions).
- DRE = recebível (teste-guardião de paridade de taxa de cartão).
- Renovação de assinatura idempotente (CAS subscription_applied_at).

## Questões abertas
- E1: confirmar com o dono se quer o fix agora (é relatório, não move saldo) — baixo
  risco mas mexe em números que ele vê.
- E2/E3 precisam de mais uma passagem de leitura (sale.ts tem 4306 linhas).
