# ADR 0056 — Arquitetura de comissões: remover o legado e unificar no Provider

**Status:** Aceito (2026-06-23). Implementado em `refactor/remover-comissao-legado-m7`.
**Origem:** auditoria do Módulo 7 (Comissões); dono pediu "rever isso".

## Decisão (do dono)

- **D1+D3 — Remover o legado por inteiro.** O sistema legado `Commission` nunca foi
  usado em produção ("nunca chegamos a usar de fato"). Não há por que manter código/tabelas
  mortos. Removido: router `commission`, service `createOsTechnicianCommission`, modelos
  `Commission`/`CommissionRule`/`SocioCommissionRule` (+ enums) com migration de DROP,
  validators, UI (`/commissions/{my,partner,report,rules}` + lista), export CSV e o tipo
  `commission` do relatório PDF. Fim do double-count: passa a existir **um** sistema por
  pessoa — o **Provider** (apuração progressiva) é o único autoritativo para quem é `User`.
- **D2 — `serviceProviderId` vira conta a pagar (PAYABLE).** `ServiceProvider` não é `User`,
  então não cabe na apuração do Provider. No pagamento da OS, se houver `serviceProviderId`,
  gera-se uma **PAYABLE** ao prestador usando `ServiceProvider.commissionRate` — o prestador
  externo é tratado como **custo/despesa**, não como comissão interna.

## Implementação realizada

- **Service novo** `createOsServiceProviderPayable` (`src/server/services/os-service-provider-payable.service.ts`):
  gera `FinancialTransaction(type=PAYABLE, status=PENDING)` + parcela única, com
  `referenceType="service_order_commission"`. **Idempotente** (não duplica por OS) e no-op
  sem `serviceProviderId`/sem `commissionRate`/base ≤ 0. Disparado nos 3 caminhos de pagamento
  da OS: `registerPayment`, `finalize` do PDV (pagamento de OS via venda) e `updateStatus → PAID`.
- **Estorno de OS:** cancela a PAYABLE da comissão ainda não quitada (PENDING/OVERDUE → CANCELLED,
  com a parcela), espelhando o cancelamento do recebível. PAYABLE já paga não é mexida (clawback
  é fluxo à parte).
- **Dashboard:** removidos os alertas de comissão legada (workflow de aprovação que deixou de existir).
- **Migration** `20260623173300_drop_legacy_commission`: `DROP TABLE` de `commissions`,
  `commission_rules`, `socio_commission_rules` (sem FK externa — verificado) + `DROP TYPE` dos enums.
- **Testes:** 6 casos de regressão do novo service (caminho feliz, arredondamento de centavos,
  no-op sem prestador/sem taxa/base 0, idempotência).

---

## Contexto histórico (por que existia o problema)

## Contexto — 3 entidades, 2 sistemas que se sobrepõem

Hoje convivem dois sistemas de comissão sobre as MESMAS transações:

1. **Legado `Commission`** (`commission.ts`): regras por papel (`CommissionRule`: SALE/SERVICE_ORDER,
   role seller/technician, %). Gera por (a) batch `calculate` — varre vendas (`sellerId`) e OS
   (`technicianId`) — e (b) real-time `createOsTechnicianCommission` no pagamento da OS. UI `/commissions`.
2. **Provider/sócio** (`provider-commission.ts`): contrato (MEI/CLT) com apuração progressiva por faixa,
   reversões e allowances. `collectProviderEvents` coleta vendas (`sellerId = provider.userId`) e OS
   (`technicianId`/`vendorId = provider.userId`). UI Comissões → Prestadores. **É onde estão os
   prestadores reais do dono** (PROGRESS 2026-06-22).

Entidades que recebem comissão:
- **Usuário interno** (`technicianId`/`sellerId`) → legado.
- **Provider** (é um `User` via `userId`; MEI/CLT) → apuração. **MAS também tem `technicianId`/`sellerId`**
  nas mesmas vendas/OS → **o legado credita o mesmo Provider de novo**.
- **ServiceProvider** (`operation.ts`, entidade própria com `commissionRate`, NÃO é User) → atribuível
  na OS (`serviceProviderId`), mas **nenhum sistema gera comissão** para ele.

## Problemas (confirmados no código)

- **P0 — Double-count:** o legado NÃO exclui quem é Provider (verificado: sem filtro `provider`).
  Um Provider que também é vendedor/técnico é creditado **duas vezes** pela mesma venda/OS — uma na
  apuração do Provider, outra no `Commission` legado. Dinheiro de comissão inflado.
- **Decisão #3 — `serviceProviderId` sem comissão:** OS atribuída a um `ServiceProvider` não gera
  comissão, mesmo havendo `ServiceProvider.commissionRate`.
- **Vestígio:** `SocioCommissionRule` parece não-referenciado (3º caminho morto) — confirmar e remover.

## Alternativas consideradas (superadas pela decisão)

A proposta inicial era *mitigar* o double-count mantendo o legado para "internos sem Provider"
(filtrar `userId NOT IN providers` nas queries do legado). O dono confirmou que **o legado nunca
foi usado** — então mantê-lo seria preservar código morto. Optou-se pela remoção total, que elimina
o double-count na raiz (não há segundo sistema para duplicar).

Para o `serviceProviderId` (D2), as opções eram: **(A) PAYABLE** — escolhida; **(B)** transformar
`ServiceProvider` em `Provider` (migration + redesenho da Operação, custo alto); **(C)** novo modelo
keyed por `serviceProviderId` (duplica conceito de comissão). (A) reaproveita o fluxo de contas a
pagar existente e trata o prestador externo como custo, que é o que ele é.

> **Futuro:** se algum dia houver comissão para **usuário interno que não é Provider** (ex.: CLT na
> régua de % simples), o caminho é cadastrá-lo como `Provider` (sistema único), não ressuscitar o legado.
