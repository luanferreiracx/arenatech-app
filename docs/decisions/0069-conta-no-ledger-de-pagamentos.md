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

**4. Não tornamos a conta obrigatória agora.**

Zero-downtime (`docs/PATTERNS.md`): coluna nullable → backfill do que dá para
inferir → endurecer depois, se e quando o dono quiser. Tornar obrigatório de
imediato quebraria os caminhos que legitimamente não sabem a conta (estorno cujo
método original é nulo, cron cross-tenant, ajuste manual de gaveta).

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

## Fora de escopo (decisão do dono pendente)

- Tornar a conta obrigatória depois do backfill.
- Saldo por conta com conciliação de extrato (OFX/CSV).
- Se a carteira DePix (`TenantDepixWallet`) vira uma `ReceivingAccount` do tipo
  `WALLET` ou apenas aponta para uma.
