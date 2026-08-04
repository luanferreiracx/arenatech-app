# ADR 0069 — Conta do dinheiro vive no ledger de pagamentos

- **Status:** aceito
- **Data:** 2026-08-04
- **Contexto:** auditoria de estoque 2026-08-04 (`docs/auditorias/2026-08-04-auditoria-estoque.md`)

## Problema

O dono relatou, sobre a compra de aparelhos: *"informamos apenas que é PIX e já
passa, **não se escolhe conta**, não se faz mais nada."*

A queixa é maior que a tela onde apareceu. O sistema registra **como** o dinheiro
se moveu (`paymentMethod`), nunca **de onde saiu / para onde entrou**. Sem isso:

- não dá para conciliar extrato bancário com o sistema;
- não dá para responder "quanto tem em cada conta";
- uma loja com duas contas (Nubank + Itaú) e mais o caixa físico não sabe
  distinguir um PIX do outro.

Levantamento (agente, verificado à mão): existem **três ledgers paralelos** e só
um conhece conta.

| Ledger | Conta hoje |
|---|---|
| `CardReceivable` | ✅ `receivingAccountId` (herdado do Acquirer) + `settledAccountId` |
| `FinancialTransaction` / `Installment` / `InstallmentPayment` | ❌ só `paymentMethod` (string) |
| `CashMovement` (gaveta) | ❌ só `paymentMethod` (string) |

`ReceivingAccount` **já existe**, com o enum certo (`CASH | BANK | PIX | WALLET`),
CRUD completo, RLS, tela em `/settings/card-acquirers` e flag `isDefault`. Não é
modelo novo — é modelo subaproveitado: `isDefault` é escrito pela UI e **lido por
nenhum caminho de escrita**.

## Decisão

**1. A conta vive em `InstallmentPayment` — o ledger de pagamentos.**

Não em `FinancialTransaction`. A transação é a *obrigação* ("devo R$3.000"); o
pagamento é o *evento de caixa* ("saiu R$1.500 do Nubank hoje"). Conta é
propriedade do evento, não da obrigação:

- uma conta a pagar em 3x pode ser quitada de três contas diferentes;
- o estorno pode voltar para conta diferente da que pagou;
- `installment_payments` já é a fonte de verdade do regime de caixa (DRE e
  "pago/recebido no mês" leem só dele — ver `installment-ledger.service.ts`).

Colocar a conta aqui faz **um** campo cobrir venda, OS, compra, despesa manual e
recorrente de uma vez, porque todos já desembocam neste ledger.

**2. `CashMovement` também recebe a conta, mas ela é DERIVADA, não somada.**

A gaveta física já é uma conta implícita — definida por um predicado sobre string
(`affectsCashDrawer`), não por uma linha. Manter as duas visões sem double-count:

- `computeCashDrawerCents` continua filtrando por `affectsCashDrawer`, **nunca**
  por conta. Um PIX marcado com conta CASH não pode corromper a conferência da
  gaveta, que é o que fecha o caixa do operador.
- O saldo por conta do tipo `CASH` sai do ledger de pagamentos, não da soma dos
  `CashMovement` — senão a mesma cédula é contada duas vezes.

`CashSession` (por usuário, por turno) e `ReceivingAccount` tipo CASH (por tenant,
permanente) são granularidades diferentes do mesmo dinheiro físico — como extrato
e conta bancária. Não é conflito, desde que só um dos dois seja somado.

**3. Cadeia de resolução da conta, nesta ordem:**

```
1. conta escolhida explicitamente pelo operador (input)
2. conta padrão da FORMA de pagamento  (PaymentMethod.defaultReceivingAccountId)
3. conta marcada isDefault no tenant
4. null  — registrado, nunca inventado
```

O passo 2 é o de maior alavancagem: cadastrar "PIX Nubank → conta Nubank" uma vez
resolve o dia a dia sem o operador escolher nada. O passo 4 é deliberado: **conta
errada é pior que conta ausente**, porque conciliação com dado errado dá falso
negativo silencioso. Nulo aparece em relatório como "sem conta" e pede correção.

**4. A conta começou nullable e virou OBRIGATÓRIA na fase 2.**

Fase 1 (nullable) seguiu o padrão zero-downtime: coluna nullable → backfill do
que dá para inferir → endurecer depois.

**Fase 2 (2026-08-04, decisão do dono: "melhor forçar a sempre ter uma conta").**
O bloqueio para exigir de imediato era concreto: **nenhum** tenant tinha conta
cadastrada (0 de 6 na medição). Um `NOT NULL` seco pararia venda, OS e compra em
produção até cada loja cadastrar uma conta na mão.

A migration resolve isso garantindo a conta ANTES de exigi-la:

1. todo tenant sem conta ganha um **"Caixa da Loja"** (tipo `CASH`, padrão);
2. tenant com contas mas sem padrão promove a mais antiga;
3. backfill do que sobrou nulo, agora que sempre existe conta;
4. só então `NOT NULL`, pelo caminho seguro (`CHECK NOT VALID` → `VALIDATE` →
   `SET NOT NULL` → dropa o CHECK).

Consequências do endurecimento:

- A cascata ganhou um 4º degrau: **qualquer conta ativa** do tenant, antes de
  desistir. Só cai aí se o admin desmarcou o padrão sem marcar outro — o dado
  segue honesto (é conta real do tenant) e a venda não trava por configuração.
- `requireReceivingAccountId` falha ALTO (`PRECONDITION_FAILED`, com instrução
  de onde cadastrar) quando o tenant não tem conta ativa nenhuma. Travar é
  melhor que gravar dinheiro sem origem e descobrir na conciliação meses depois.
- A FK virou `ON DELETE RESTRICT`: com a coluna `NOT NULL`, um `SET NULL`
  viraria violação no momento em que alguém apagasse a conta.
- `tenantFinancialInit` passa a criar a conta padrão, e o **`prisma/seed.ts`
  passa a chamar `tenantFinancialInit`** — antes não chamava, e um banco montado
  do zero (o do CI) nascia com tenants sem categoria e sem conta.

## Consequências

**Boas**
- Uma coluna cobre todos os módulos, porque o ledger já é o funil comum.
- Conciliação bancária vira possível: `SUM(amount_cents) GROUP BY conta, mês`.
- `CardReceivable.settledAccountId`, hoje escrito e lido por ninguém, ganha par.

**Custos e riscos aceitos**
- `payInstallment`/`reverseInstallment` escrevem `installmentPayment` **direto**,
  sem passar pelo `installment-ledger.service`. Corrigir só o serviço deixaria o
  caminho manual — o de maior volume — sem conta para sempre. Os dois foram
  migrados para o serviço nesta mudança; é a parte mais arriscada do diff.
- Três serviços criam PAYABLE sem método nenhum (comissão de prestador, apuração
  mensal, despesa recorrente). O cron de recorrente roda `withAdmin`
  cross-tenant, então a busca da conta padrão precisa do `tenantId` explícito.
- `isDefault` não tinha unicidade no banco (só dois `updateMany` imperativos).
  Vira índice único parcial nesta mudança, porque passa a ser carregado.

## Alternativas descartadas

- **Conta em `FinancialTransaction`**: erra a granularidade. Não representa
  parcelas quitadas de contas diferentes, que é o caso comum de conta a pagar.
- **Conta só em `CashMovement`**: cobre a gaveta e ignora tudo que não passa por
  caixa aberto — transferência bancária, boleto, a maior parte do PAYABLE.
- **Modelo `BankAccount` novo**: duplicaria `ReceivingAccount`, que já tem tipo,
  RLS, CRUD e tela. Seriam duas listas de conta para o dono manter.
- **Obrigar conta em toda escrita**: quebraria estorno sem método conhecido e o
  cron cross-tenant, e forçaria o operador a inventar conta — exatamente o dado
  ruim que a conciliação não perdoa.

## Adendo — termo obrigatório também no trade-in (2026-08-04)

Decisão do dono, na mesma conversa: *"o termo existe sim nos dois casos, por isso
a confirmação de assinatura deve ser obrigatória para o produto entrar no
estoque"*.

Isso **corrige** o que a auditoria havia registrado como divergência deliberada.
A leitura anterior era que o trade-in dispensava termo porque o contrato da venda
já descrevia o aparelho de entrada. Não é o caso: o termo existe nos dois fluxos,
e a assinatura da venda **é** a assinatura desse termo.

Como ficou:

- O aparelho recebido em troca entra `BLOCKED`, igual à compra de balcão. A loja
  não pode revender antes de ter prova de que o aparelho é dela.
- A liberação (`BLOCKED → AVAILABLE`) acontece quando o termo de entrega da venda
  é assinado — `confirmPhysicalSignature` (papel) e `checkSignatureStatus`
  (retorno do Autentique). O webhook já cobria por outro caminho, casando a
  `DevicePurchase` por IMEI/série.
- A `DevicePurchase` da troca é marcada `termSigned` com
  `termSignedVia: "sale_delivery_term"` — distingue, no histórico, o termo que
  veio da venda do termo avulso da compra de balcão.
- Vale só para trocas NOVAS: aparelhos de troca já no estoque continuam
  vendáveis. Bloquear retroativamente sumiria com mercadoria que a loja já está
  anunciando.

## Fora de escopo (decisão do dono pendente)

- Saldo por conta com conciliação de extrato (OFX/CSV).
- Se a carteira DePix (`TenantDepixWallet`) vira uma `ReceivingAccount` do tipo
  `WALLET` ou apenas aponta para uma.
