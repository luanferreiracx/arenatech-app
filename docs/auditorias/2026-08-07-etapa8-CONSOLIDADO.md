# Etapa 8 — consolidado

> 10 módulos, cobertura de **39/39 routers**. Regra de sempre: três provas —
> código, dado de produção e navegador real. Achado sem medição entrou como
> hipótese, não como achado.

## Por que esta etapa existiu

A Etapa 7 fechou 9 módulos e pareceu completa. Medindo a cobertura **por
router**, porém, **24 dos 38 nunca haviam sido citados** em relatório nenhum — e
o maior bloco era o DePix, com 9 routers e R$ 159.687 movimentados em cripto.

Foi a mesma medição que abriu a Etapa 7 (que nasceu de uma cobrança do dono).
Duas vezes seguidas, contar cobertura revelou o que a sensação de "está feito"
escondia.

---

## Placar

| # | módulo | achado |
|---|---|---|
| M1 | DePix | operador cancelava saque que só admin cria; `update` sem CAS |
| M2 | Recebíveis de cartão | venda sem recebível falhava em silêncio |
| M3 | Configurações | trilha de auditoria: tela negava, resolver entregava |
| M4 | Avaliações | duas linhas ativas com preços diferentes; `duplicateModel` |
| M5 | Fidelidade | débito de cashback decidido em snapshot |
| M6 | Comunicação | 2 de 3 caminhos de envio sem rate limit |
| M7 | Vendas avulsas | declarar pagamento recebido sem rastro; CAS |
| M8 | 2FA | códigos de backup sem teto de tentativas |
| M9 | Carteira DePix | **revelar a seed sem 2FA e sem trilha** |
| M10 | Routers restantes | **sem achados** |

**12 achados corrigidos**, todos com PR, teste-guardião verificado nas duas
direções e produção restaurada ao estado original.

---

## O padrão, pela 14ª vez

**A regra existia e foi esquecida no irmão.** Em 8 dos 10 módulos:

| módulo | a regra existia em | faltava em |
|---|---|---|
| M1 | `depix-transaction.service` (4 pontos com CAS) | o router |
| M2 | a tela avisa "sem taxas" | o instante da falha |
| M3 | `getById` negava | `listAuditLogs` |
| M5 | `lock`/`unlockBalance` (desde 25/07) | `debitCashback` |
| M6 | `send` tinha rate limit | `resend`, `sendToCustomer` |
| M8 | `startDisable` (mesmo arquivo, 20 linhas abaixo) | `regenerateBackupCodes` |
| M9 | `createWithdraw` exigia 2FA | `revealMnemonic` |
| M9b | 3 mutations logavam | a mais grave, não |

O M10 não teve achado — e o motivo confirma a tese: **aqueles routers foram
escritos depois**, já com rate limit, hash e `adminProcedure` como padrão. Os
defeitos moram onde a regra nasceu **depois** do código.

---

## O achado mais grave: M9

| operação | exigia 2FA? | o que permite |
|---|---|---|
| `createWithdraw` | sim | sacar um valor, com cap e trilha |
| `revealMnemonic` | **não** | mover o saldo **inteiro**, por fora do sistema |

Provado no navegador: senha de login correta, zero código 2FA → **HTTP 200 e a
seed retornada**. E não gravava rastro nenhum.

Escala: a carteira `arena-tech` movimentou **R$ 130.808**; **5 admins** podiam
revelá-la, **só 2 têm 2FA**.

---

## Erros meus nesta etapa

Registro porque o método importa mais que o placar.

1. **Copiei o segredo 2FA de uma conta real** (M8) para um usuário de teste.
   Desfiz na hora; as 5 contas reais ficaram intactas. A prova que eu precisava
   não exigia segredo válido.
2. **Corrigi `duplicateModel` com `try/catch` de P2002** (M4) e chamei de
   idempotente. No Postgres, violação de constraint **aborta a transação** — o
   navegador provou com um 500. A correção real era filtrar antes de inserir.
3. **Marquei uma venda avulsa real como paga** (M7) durante o teste de RBAC.
   Revertida no mesmo minuto.
4. **Commitei numa branch alheia** durante uma queda de rede (M8). Movi por
   cherry-pick e restaurei a branch ao estado do remoto, sem force-push.
5. **Três testes-guardiões passaram cegos** antes de eu verificá-los contra o
   código sem o fix. Todos corrigidos — e é por isso que a regra "ver o teste
   falhar" virou obrigatória desde o M7 da Etapa 7.

---

## O que resistiu (contraponto honesto)

- **Isolamento entre tenants**: testado em 4 vetores diferentes (cancel DePix,
  bulkAdjust de preços, reset de senha/2FA cross-tenant). **Nenhum passou.** Em
  dois casos o `withAdmin` faz bypass de RLS e o escopo foi reposto na camada
  acima, explicitamente.
- **O step-up de saque**: anti-replay real (o mesmo código de 30s não autoriza
  dois saques), backup code consumido atomicamente, falha de cifra tratada como
  código inválido.
- **A fronteira da central**: 15 procedures em `adminProcedure`, 5 testadas com
  admin de tenant — todas 403, incluindo `sendOnchain`.
- **Webhooks**: `eulen` e `lwk-deposit` negam sem credencial **e com assinatura
  forjada** (401), testados contra produção.
- **Integridade financeira**: 1.341 obrigações, 1.774 pagamentos, 249
  recebíveis, 21 vendas avulsas — **zero divergências de invariante**.
- **O gate de LGPD** vive dentro do `dispatchMessage`: fonte única que todo
  caminho de envio atravessa.

---

## Pendências do dono (não dependem de código)

1. **L-BTC abaixo do piso** — 9.805 contra 10.000, margem para **um** refill.
   É o que pode travar o módulo de maior risco desta etapa.
2. **204 vendas antigas sem recebível** — R$ 124.039 fora do DRE. Backfill ou
   aceitar como passivo histórico.
3. **Retenção das conversas** — 44.787 mensagens, 17% do banco, ~12.600/mês.
   Decidido em 07/08: **não mexer agora**, revisitar quando escalar.
4. **Fiscal** — chave PFX não provisionada; ver
   `docs/operations/fiscal-prerequisitos.md`.
5. **Conciliação de recebíveis parada** — 187 vencidos, o mais antigo de 10/07.
   O sistema está certo; o processo é que não acontece.
