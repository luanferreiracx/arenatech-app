# Auditoria Geral — Status das Correções (2026-07-14)

> Acompanha [REGISTRO_GAPS.md](./REGISTRO_GAPS.md). Marca o que já foi corrigido e o que resta.

## ✅ Corrigido e mergeado na `main` (15 PRs)

### Onda 1 — Segurança + P0
| PR | Achado | Resumo |
|----|--------|--------|
| #575 | G-P0-3 | Gate RBAC na rota REST `/api/financial/export` (operador não baixa PAYABLE) + hardening CSV |
| #576 | G-P1-15/16 | DePix: revalida `depix_sent` sem txid antes de liberar venda; `replay-guard` fail-closed (MED não some) |
| #577 | G-P1-17 | RLS backstop na tabela `subscriptions` (última tabela tenant sem a rede) |
| #578 | G-P1-08 | Custo/margem só para admin nos 5 relatórios de estoque (server + UI) |

### Onda 2 — Fuso/DRE/Dashboard/Frontend + OS
| PR | Achado | Resumo |
|----|--------|--------|
| #579 | T5 | Surfacing de erro de query no app inteiro (toast+Sentry) + `keepPreviousData` + `error.tsx`→Sentry |
| #580 | G-P1-03 | Relatório NF ancorado em BRT + ignora soft-delete |
| #581 | G-P1-05/01 | DRE ancorado em BRT + despesas via ledger `installment_payments` |
| #582 | G-P1-02/04 | `salesChart` via engine de receita + BRT; remove `dashboard.stockDashboard` morto |
| #583 | G-P1-09 | Custo/margem da OS admin-only (view + edit) — **mudança de workflow** (ver PR) |

### Onda 3 — Dinheiro / integridade
| PR | Achado | Resumo |
|----|--------|--------|
| #584 | G-P1-07 | `applyDiscount` abate trade-in do "A pagar" (delega a `recalculateSale`) |
| #585 | G-P1-06 | Relatório de trade-in ignora compras canceladas (`cancelledAt: null`) |
| #586 | R2/R3 | `delete` de OS com guarda de status + PAYABLE de lab atômico (CAS) |
| #587 | P1-13/14 | Normaliza telefone do customer + CAS no `interest.updateStatus` |

Todos validados: typecheck + lint + unit + E2E @smoke; migrations e queries de dinheiro
validadas em Postgres real (integração).

## ⏳ Restante (P1) — não feito ainda

- **R1 (OS refund direct-pay sem baixa de caixa)** — `service-order.ts` refund de OS paga
  direto em dinheiro sem sessão aberta pula o `WITHDRAWAL`; fluxo de caixa delicado, follow-up dedicado.
- **Auth** — P1-18 gating fail-open p/ prefixo não-registrado · P1-19 `Tenant.status` desacoplado
  de `Subscription` · P1-20 lockout DoS de login (envolve trade-off lockout-vs-captcha/Turnstile — **decisão do dono**).
- **Bot multi-tenant (T1)** — grupo/URL/marca globais do Talison (A2/A3/A10): **latente, vira P0 no 2º tenant
  com bot** · A1 canal WhatsApp→Claude Code (RCE, endurecer) · A4 24h-window nos envios genéricos · A5 teto de custo LLM.

## ⏳ Restante (P2) — ~40 itens
Ver [REGISTRO_GAPS.md](./REGISTRO_GAPS.md) seção P2. Destaques: fiscal (**PARADO** — API não decidida),
TOCTOU de cashback, `.max()` em lotes de estoque, índices, `detailedAlerts` órfão, `tabular-nums`.

## Decisões do dono registradas nesta rodada
1. **NF-e/fiscal:** API ainda não decidida → **fora de escopo** (G-P0-1/G-P0-2 e P2s fiscais parados).
2. **OS custos admin-only (#583):** técnico não-admin não registra mais custo de peças na OS (segue A3).
3. **"Total" vs "A pagar" (#584):** "Total"=subtotal/mercadoria=soma de tudo (intacto); "A pagar"=totalAmount=subtotal−desconto−trade-in.
