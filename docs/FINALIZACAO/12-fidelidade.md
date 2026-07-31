# Módulo 12 — Fidelidade

**Passada A (backend):** concluída em 2026-07-30.
**Passada B (frontend):** pendente (`/fidelidade` + painel no cliente).

## Superfície

| | |
|---|---|
| Router | `reward.ts` (949) — 16 procedures |
| Tabelas | `reward_campaigns`, `reward_actions`, `reward_balances`, `reward_movements` |
| Telas | `/fidelidade`, painel de fidelidade em `/customers/[id]` |

## O que a produção diz (medido em 2026-07-30)

| | |
|---|---|
| Campanhas | **0** |
| Ações | **0** |
| Saldos | **0** |
| Movimentos | **0** |

**Zero linhas nas quatro tabelas.** O módulo foi construído ponta a ponta nos PRs
#685–#690 (de 846 linhas mortas a produto) e nunca foi ligado pela loja.

Isso muda o que esta passada pode e não pode fazer: **não há prova de dados**.
Nenhum achado aqui pode ser medido por incidência, e nenhum defeito está
sangrando. A auditoria é de código e de invariante — e o entregável certo é
proteção para o dia em que a loja ligar o programa, não conserto de algo que
esteja doendo.

## O que auditei e está íntegro

O módulo é bem construído, e listo os pontos porque desfazer qualquer um seria
caro:

- **CAS em toda transição de saldo.** `lockBalance`/`unlockBalance` usam
  `updateMany` com a condição repetida no `where` e conferem `count`, devolvendo
  `CONFLICT` quando o saldo mudou no meio.
- **O banco é a rede final.** Há `CHECK` barrando saldo negativo escrito
  diretamente — e um teste que prova isso, batendo no banco na marra.
- **Saldo e movimento são gravados na MESMA transação**, sempre em par.
- **Cobertura real**: 7 arquivos de teste, incluindo dois casos de concorrência
  (duas reservas simultâneas sobre o mesmo saldo, duas liberações da mesma
  reserva) e o resgate no PDV.

## FD-1 — o razão e os agregados não tinham guardião (P3)

`RewardBalance` carrega **nove agregados derivados** — `totalBalance`,
`lockedBalance`, `availableBalance`, `totalCreditedMonth`,
`totalCreditedHistorical`, `totalUsedHistorical`, `totalExpiredHistorical`,
`totalRewardsReceived`, `totalRewardsUsed` — ao lado de `RewardMovement`, que é o
razão. São **duas fontes de verdade para o mesmo fato**, e nenhuma constraint liga
as duas: o `CHECK` do banco garante apenas que o saldo não fica negativo.

Os testes que já existiam cobrem as peças. **Nenhum somava o razão e comparava
com os agregados ao fim de um ciclo inteiro** — que é exatamente onde a deriva
aparece: basta um caminho novo atualizar o saldo e esquecer o movimento (ou o
contrário) para as duas versões da verdade discordarem em silêncio, sem nada
reclamar.

Não é um defeito presente; é a ausência da rede que impede um defeito futuro num
módulo que ainda vai começar a rodar.

**Entregue:** `__tests__/integration/reward-ledger-reconciles.test.ts`, que
percorre crédito → reserva → liberação pelo caller tRPC e afirma, em cada
transição:

- `disponível = total − reservado`;
- `totalCreditedHistorical` = soma dos créditos do razão;
- `total = créditos − débitos − expirações`;
- toda mudança de saldo tem **exatamente uma** linha nova no razão explicando.

**Prova de que o guardião morde:** fiz o razão gravar `0` no movimento de reserva
mantendo o saldo correto — a deriva silenciosa exata que ele existe para pegar — e
o teste reprovou com `expected +0 to be 50`.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit   # verde
pnpm test:integration                           # verde (2 novos)
```
