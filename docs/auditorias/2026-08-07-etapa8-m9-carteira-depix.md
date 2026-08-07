# Etapa 8 · Módulo 9 — Carteira DePix

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-security`.

## Superfície

5 carteiras provisionadas, 2 BYOW, 57 registros de limite diário.

| tenant | modelo de custódia | seed cifrada no banco |
|---|---|---|
| `arena-tech` | **custodial** | não (vive no volume) |
| `arena-fees` | **custodial** | não |
| `pdv-06a429b8` | non_custodial | sim |
| `pdv-b35c6eb5` | non_custodial | sim |
| `pdv-ff198666` | external | não |

---

## E8-10 — Revelar a seed não exigia 2FA; sacar R$ 1 exigia — ✅ CORRIGIDO

| operação | exigia 2FA? | o que permite |
|---|---|---|
| `depixTransaction.createWithdraw` | **sim** | sacar um valor, com cap diário e trilha |
| `depixWallet.revealMnemonic` | **não** | mover o saldo **inteiro**, por fora do sistema |

A seed dá controle **total e permanente** da carteira: quem a tem importa no
SideSwap e move tudo — sem limite diário, sem cap, sem trilha nossa.

### Provado no navegador

Antes, com a senha de login correta e **nenhum** código 2FA:

```
HTTP 200 | mnemonic retornado
```

### Escala medida

A `arena-tech` é **custodial** — a seed vive no volume, então **basta a senha de
login**. Ela movimentou **R$ 130.808** em 330 transações.

**5 admins** podem chamar esta procedure. **Só 2 têm 2FA ativo.**

As duas `non_custodial` estão melhor por construção (seed cifrada com passphrase
que o servidor não conhece), mas ganharam o step-up igual: defesa em
profundidade, e o custo é o mesmo.

### Verificado depois do fix

```
sem código     -> 400 (schema recusa)
código errado  -> 412 "Revelar a frase de recuperacao exige 2FA"
```

A seed não sai em nenhum dos dois caminhos.

### A UI precisou mudar junto

O typecheck apontou: sem campo na tela, o admin ficaria sem conseguir usar a
própria carteira. Adicionei o campo de código, e o payload passou a ser montado
**num lugar só** — o botão e o Enter mandavam formas diferentes antes, e um
deles esqueceria o código.

O 2FA é **adicional**, não substituto: a senha (custodial) e a passphrase
(non-custodial) continuam obrigatórias.

---

## O que verifiquei e está correto

- **Todas as 4 mutations sensíveis são `tenantAdminProcedure` + rate limit +
  senha/passphrase.** O 2FA era a única peça faltando, e só no `revealMnemonic`
  ela era crítica.
- **`updateFeeConfig` é `superAdminTenantProcedure`** — mudar a taxa que a
  plataforma cobra não é decisão do tenant. Fronteira certa.
- **A distinção custodial × non-custodial é real, não cosmética**: nas
  non-custodial a seed está cifrada com passphrase que o servidor não conhece,
  e o código respeita isso (pede `passphrase`, não `password`).

---

## Baixa confiança

- **Não testei `recoverNonCustodial` nem `rewrapPassphrase`** com passphrase
  real. São os caminhos de recuperação, e recuperação mal testada é onde
  incidente nasce.
- **Não verifiquei se `revealMnemonic` grava trilha.** Ele tem rate limit, mas
  não confirmei se existe registro de "fulano revelou a seed em tal data" — que
  é exatamente o que se quer auditar depois de um incidente.
- **Os 57 registros de limite diário** foram contados, não auditados: não
  verifiquei se o cap é aplicado corretamente na virada do dia (o fuso BRT já
  mordeu este sistema antes).
