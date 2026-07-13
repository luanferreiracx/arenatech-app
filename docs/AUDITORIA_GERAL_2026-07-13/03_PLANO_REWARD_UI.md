# Plano executável — Completar a UI do módulo Reward (fidelidade) — item #3

> Você pediu para COMPLETAR (não remover) o módulo de recompensas. Ele é uma feature
> robusta já pronta no backend (16 procedures, 4 modelos, 1 cron) mas 100% sem UI.
> Isto não é uma correção pontual — é construir uma feature nova. Plano abaixo.

## Domínio (já existe no backend, `reward.prisma` + `reward.ts`)
- **RewardCampaign**: regra de recompensa. `RewardType` = DISCOUNT_PERCENTAGE |
  DISCOUNT_FIXED | CASHBACK | GIFT. Campos: name, description, rules (Json), active.
- **RewardAction**: recompensa concedida a um cliente. `RewardActionStatus` = PENDING
  | APPROVED | REJECTED | CANCELLED | EXPIRED | USED. Fluxo de aprovação.
- **RewardBalance**: saldo (cashback) por cliente.
- **RewardMovement**: extrato do saldo.
- Cron `expire-rewards` (já ativo) expira ações vencidas.

## Procedures prontas (16) → mapeadas para telas
| Tela | Procedures |
|------|-----------|
| **Campanhas** (list + criar/editar + ativar/desativar) | listCampaigns, createCampaign, updateCampaign, toggleCampaign |
| **Ações/Recompensas** (fila de aprovação + conceder + usar) | listActions, createAction, approveAction, rejectAction, cancelAction, useAction |
| **Saldo do cliente** (extrato + recompensas disponíveis) | getBalance, getAvailableRewards, lockBalance, unlockBalance |
| **Dashboard** (topo do módulo) | stats |

## Plano de PRs (sequência)
1. **PR-A — Rota + nav + dashboard**: rota `/rewards` (gateada por módulo — decidir se
   entra num módulo existente ou novo `rewards` em modules.ts), item no menu
   (nav-items.ts), página com `stats` (cards de resumo). Skill: `react` + `impeccable`.
2. **PR-B — Campanhas**: tabela de campanhas (TanStack Table) + dialog criar/editar
   (react-hook-form + Zod; o `rules` Json precisa de um editor por RewardType) +
   toggle ativo. Este é o mais complexo (o editor de regras por tipo).
3. **PR-C — Ações/aprovação**: fila de ações PENDING com aprovar/rejeitar; conceder
   recompensa a um cliente (buscar cliente); marcar como usada.
4. **PR-D — Saldo no cliente**: no detalhe do cliente, aba/seção de saldo de cashback
   + extrato (getBalance/getAvailableRewards). Integra com customers.

## Decisões de produto que PRECISO de você antes de construir
1. **Gating**: `/rewards` entra em qual plano/módulo? Módulo novo `rewards` ou dentro
   de um existente (ex.: `customers`)? (afeta modules.ts + planos)
2. **Editor de `rules` (Json)**: cada RewardType tem regras diferentes (ex.: DISCOUNT
   precisa % ou valor; CASHBACK precisa taxa; GIFT precisa descrição). Como o dono quer
   configurar isso? (formulário por tipo vs Json livre)
3. **Concessão de recompensa**: manual (operador concede) e/ou automática (regra dispara
   na venda)? Hoje `createAction` é manual. Automático = integrar no finalize da venda.
4. **Cashback**: onde o cliente "usa" o saldo? No PDV como desconto? (integra com sale)

## Estimativa
4 PRs, cada uma com tela + validação visual (screenshot) + testes. É ~1 sessão
dedicada. Recomendo fazer com foco (não no fim de uma sessão longa) para garantir a
qualidade "extremely professional" que você pediu — e porque as 4 decisões de produto
acima moldam o design.

## Recomendação
Responder as 4 decisões de produto → eu executo as 4 PRs em sequência numa próxima
rodada focada. O cron `expire-rewards` pode continuar rodando (é inócuo sem dados) ou
ser pausado até a UI existir — sua escolha.
