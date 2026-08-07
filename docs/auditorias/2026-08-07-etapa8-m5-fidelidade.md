# Etapa 8 · Módulo 5 — Fidelidade / Recompensas

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-backend`.

## Por que auditar um módulo com zero dados

`reward.ts` tem **949 linhas** e as quatro tabelas — `reward_balances`,
`reward_movements`, `reward_campaigns`, `reward_actions` — estão **vazias em
produção**.

Superfície grande sem uso é onde defeito se esconde: **nenhum caminho foi
validado por operação real**. Quando o primeiro cliente entrar, tudo aqui roda
pela primeira vez com dinheiro de verdade (cashback é crédito que a loja deve).

---

## E8-5 — Débito de cashback decidido em snapshot — ✅ CORRIGIDO

`debitCashback` calculava quanto debitar com `Math.min` sobre um saldo lido
antes, e escrevia com `update` cru:

```ts
totalBalance:     { decrement: Math.min(amount, Number(balance.totalBalance)) },
availableBalance: { decrement: Math.min(amount, Number(balance.availableBalance)) },
```

Dois cancelamentos concorrentes de ações **diferentes** do mesmo cliente liam
R$ 100 cada, ambos calculavam "debitar 80", e o segundo levaria o saldo a
**-60**.

### O CAS que existia não cobre este caso

Há um CAS na linha ~540, mas ele é na **ação**:

```ts
where: { id: input.actionId, status: { in: ["PENDING", "APPROVED"] } }
```

Isso impede cancelar a **mesma** ação duas vezes. Não impede duas ações
**distintas** do mesmo cliente colidirem no saldo compartilhado.

### O que o banco fazia — e por que não bastava

Testado contra a cópia de produção: o CHECK
`reward_balances_available_non_negative` **barra** o saldo negativo.

```
ERROR:  new row for relation "reward_balances" violates check constraint
        "reward_balances_available_non_negative"
DETAIL: Failing row contains (..., -60.00, 0.00, -60.00, ...)
```

O dado **não corrompe** — e isso mudou o achado de "corrupção de saldo" para
"erro opaco". Mas violação de constraint **aborta a transação no Postgres**, e o
operador receberia um 500 em vez de "o saldo mudou, atualize".

É a mesma armadilha que o E8-4b já custou uma correção errada, no módulo
anterior desta etapa.

### O padrão, de novo

`lockBalance`/`unlockBalance` **já usavam** CAS com `gte` desde 25/07, e o
comentário lá diz textualmente:

> "o clamp `Math.min` usa um snapshot — dois unlock de R$100 sobre R$100
> reservados passavam os dois e deixavam `lockedBalance = -100`"

`debitCashback` é o irmão que ficou de fora. **Décima segunda ocorrência** deste
padrão no programa.

### Verificado contra o banco real, com o fix

```
1º débito (CAS passa):  total 20,00 | available 20,00
2º débito (CAS recusa): total 20,00 | available 20,00
```

Sem erro de constraint, sem transação abortada — o `claimed.count !== 1` vira
`CONFLICT` legível.

### Impacto medido: zero

0 registros em todas as quatro tabelas. **Correção preventiva antes do primeiro
cliente** — que é o melhor momento para fazê-la.

---

## O que verifiquei e está correto

- **`creditCashback` usa `increment` puro** — atômico no banco, sem snapshot.
  Não precisa de CAS, e o teste reconhece isso explicitamente (a primeira versão
  da asserção era grosseira demais e acusava o crédito; refinada para pegar só
  `decrement`).
- **CHECK constraints** em `available_balance >= 0` e `locked_balance >= 0`:
  defesa em profundidade real, que impediu o dado corromper.
- **CAS em 4 pontos** já existentes: campanha (377), ação (459, 540, 630) e
  saldo em lock/unlock (743, 800).
- **`total_balance` não tem CHECK próprio**, mas é decrementado **junto** com
  `available_balance` em toda operação — o CHECK do `available` o protege por
  consequência. Verificado no teste: o total ficou em 20, não em -60.

---

## Baixa confiança

- **Não exercitei o módulo pelo navegador com dados reais.** Com 0 registros,
  não há campanha nem ação para aprovar; criar o fluxo inteiro em produção só
  para testar seria pior que a lacuna. O teste de concorrência foi feito
  direto no banco, com SQL que reproduz o padrão do código.
- **Não auditei `expire-rewards`** (o cron que expira saldo) com a mesma
  profundidade. Ele nunca rodou com dados; a expiração mexe em
  `total_expired_historical` e no saldo, e é o próximo caminho a olhar.
- **`reference_month` / `total_credited_month`** sugerem um teto mensal de
  crédito. Não verifiquei se a virada de mês zera corretamente — e o fuso já
  mordeu este sistema antes (CM-1/J3).
