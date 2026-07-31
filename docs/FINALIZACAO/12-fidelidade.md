# Módulo 12 — Fidelidade

**Passada A (backend):** concluída em 2026-07-30.
**Passada B (frontend):** concluída em 2026-07-30.

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

## Achados da passada de frontend

Crawler: 1 tela × 2 papéis × 2 viewports, **0 quebradas, 0 atenção**. Os dois
achados vieram de olhar a tela **no estado em que a produção está** — zero
campanhas.

### FDU-1 — o botão de criar campanha tinha um gêmeo sem gate (P2)

A aba Campanhas tem dois caminhos para criar: o botão do cabeçalho, envolvido em
`{isAdmin && …}`, e o CTA do estado vazio, **sem gate nenhum**.

`createCampaign` recusa quem não é admin (a guarda existe, e há teste de authz
cobrindo). Então, com zero campanhas — o estado de produção hoje — o CTA do vazio
era a **única ação visível para o operador na aba**, e só podia terminar em 403.

Mesma tela, dois gêmeos, um gateado e o outro não. É a versão mais concentrada do
padrão que este programa vem achando desde o Módulo 1.

Corrigido: o CTA herda o mesmo gate, e o texto do vazio muda para quem não pode
criar — *"A loja ainda não tem campanha de fidelidade. Quem cria é o
administrador."* em vez de um convite que não se cumpre.

### FDU-2 — a tela abria mandando esperar (P3)

`/fidelidade` abre em **Submissões**, cujo estado vazio diz: *"Quando um cliente
publicar sobre a loja, a submissão aparece aqui para aprovação."*

Com zero campanhas isso é conselho impossível: **sem campanha, nenhum cliente
publica**. A loja que abre o módulo pela primeira vez — o caso de toda loja hoje,
já que o programa nunca foi ligado — cai numa tela que manda aguardar quando o
próximo passo é criar uma campanha.

A aba de entrada passou a depender do estado: sem campanha, abre em **Campanhas**,
onde o próximo passo está à vista. Havendo campanha, segue abrindo em Submissões,
que é o trabalho do dia a dia.

Não afirmo que isto explica o módulo nunca ter sido ligado — é uma hipótese
razoável, não uma medição. O que é medido: a primeira tela dava o conselho errado
para o estado em que a loja está.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit        # verde
pnpm test:integration                                # 304 verdes (2 novos)
pnpm test:e2e __tests__/e2e/fidelidade.spec.ts       # 2 verdes (novo)
pnpm tsx scripts/audit/crawl-module.ts fidelidade    # 0 quebradas · 0 atenção
```

### Um limite que registro em vez de esconder

O E2E novo **não** cobre o defeito que o FDU-1 corrigiu. O banco de seed tem uma
campanha, então o estado vazio não renderiza — e eu confirmei que o teste passa
**mesmo com o gate removido**. Ele guarda o botão do cabeçalho, que já era gateado
antes desta passada.

Cobrir o vazio exigiria apagar as campanhas do seed, que outras suítes usam. O
caminho foi verificado à mão contra a cópia de produção (zero campanhas): o
operador passa a não ver botão de criar e lê a frase honesta. Está escrito assim
no cabeçalho do próprio teste, para ninguém confundir cobertura com garantia.
