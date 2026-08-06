# Etapa 7 · Módulo 9 — Financeiro

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-06. Último dos três módulos de dinheiro.

## O que está sólido (e é muito)

A integridade contábil deste módulo **resistiu a toda tentativa de derrubá-la**.
Não é preenchimento — são as reconciliações que rodei:

| verificação | resultado |
|---|---|
| soma das parcelas × total da obrigação | **1.341 obrigações, 0 divergências** |
| ledger líquido × `paid_amount` da parcela | **1.774 pagamentos, 0 divergências** |
| pagamento sem parcela | **0** |
| pagamento cross-tenant | **0** |
| parcela sem obrigação | **0** |
| pagamento sem conta de recebimento | **0** |

Volume: R$ 881.825 recebidos, R$ 789.229 pagos, R$ 2.425.500 no ledger.

O DRE também já está ancorado em BRT (G-P1-05) e usa receita líquida de
competência, com o comentário explicando por que **não** usa `totalAmount` (é
líquido do trade-in e inverteria o lucro em venda com aparelho de entrada).

---

## M9-1 — O RBAC vale nas escritas e some nos relatórios — ⚠️ ACHADO, não corrigido

A ADR 0032 é explícita: **"operador vê só RECEIVABLE"**. O router implementa
isso com `getUserRole`, usado em **5 pontos** — todos de escrita ou listagem:

| linha | o que protege |
|---|---|
| 190, 253, 267 | listar/criar obrigação |
| 373 | editar PAYABLE |
| 582 | pagar parcela de PAYABLE |

**Nenhum relatório chama `getUserRole`.** `dre`, `cashFlow`, `stats` e
`projectedCashFlow` são `tenantProcedure` sem filtro de papel.

### Provado no navegador

Operador e admin recebem **exatamente a mesma tela**:

```
RECEITA          R$ 1.556.378,58
CUSTO DAS PECAS  R$ 1.356.092,69
LUCRO BRUTO      R$   200.285,89
DESPESAS         R$ 1.541.129,98
LUCRO LIQUIDO   -R$ 1.340.844,09
```

70 valores em R$ na tela, idênticos nos dois perfis, mais o botão **Exportar
CSV**. E o item "DRE" está no menu do operador — os links do Financeiro são
**iguais** para os dois papéis.

### A contradição, numa tela só

O menu oferece "Contas a Pagar". O resolver força RECEIVABLE. Resultado para o
operador:

```
R$ 49.599,99
8 conta(s)
Contas a Pagar
```

Em produção há **3 PAYABLE pendentes (R$ 13.850)** e **73 RECEIVABLE
(R$ 109.449)**. Ou seja: a tela rotulada "Contas a Pagar" está exibindo
**recebimentos**. O RBAC funciona — o rótulo mente.

### Escala medida

**3 operadores reais** no tenant de produção. Eles não podem listar as 153
obrigações PAYABLE (R$ 805.638,98), mas veem a despesa **agregada** no DRE, mês
a mês, com opção de exportar.

### É a mesma classe do M6, na escala máxima

O M6 fechou hoje o custo do estoque no PDF (R$ 38.507). Este é o mesmo padrão —
**a política existe e foi aplicada num lugar e esquecida no irmão** — mas aqui o
valor exposto é **R$ 1,5 milhão** e a política está escrita numa ADR.

Décima ocorrência do padrão nesta auditoria.

---

## Por que não corrigi

Diferente do M6, aqui **não sei qual é a decisão do dono**, e o custo de errar é
alto nos dois sentidos:

- **Se o DRE virar admin-only:** um operador de confiança que hoje acompanha o
  resultado da loja perde a visão. Em loja pequena isso pode ser exatamente o
  que o dono quer — ou exatamente o que ele não quer.
- **Se ficar como está:** 3 pessoas veem margem, custo e lucro líquido do
  negócio, e podem exportar.

O que **não** tem defesa é o estado atual do rótulo: menu oferece "Contas a
Pagar" e a tela mostra recebimentos. Isso é bug puro, independente da decisão de
RBAC.

**Preciso da sua decisão** — está registrado abaixo como pendência.

---

---

## M9-2 — R$ 754.400 de obrigação cancelada inflando a despesa do DRE — ⚠️ ACHADO

O lucro líquido do DRE de 2026 é **-R$ 1.340.844,09** — implausível para uma
loja com R$ 1,5 mi de receita. Fui atrás.

As despesas do DRE vêm do **ledger `installment_payments`** de PAYABLE (regime
de caixa, G-P1-01). O ledger de 2026 soma **R$ 1.543.629,98**. Dentro dele:

| obrigação | valor | paga em | cancelada em |
|---|---|---|---|
| Compra de Aparelhos — CPA000006 | R$ 7.000 | 26/03 | 21/05 |
| **Compra de Aparelhos — CPA000034** | **R$ 740.000** | 29/04 | 21/05 |
| Compra de Aparelhos — CPA000035 | R$ 7.400 | 29/04 | 21/05 |

**R$ 754.400 — quase metade da despesa do ano** — são obrigações
**CANCELLED** cujo pagamento continua no ledger. A de R$ 740.000 é claramente um
erro de digitação (compra de aparelho), corrigida por cancelamento.

Nenhuma das três tem `device_purchase` viva por trás: o cancelamento foi
legítimo. **O que ficou foi o pagamento.**

### O caminho já foi fechado — o dado antigo ficou

Testei se recorre. Contas `CANCELLED` com `paid_amount > 0`:

| cancelada em | ocorrências | valor |
|---|---|---|
| 21/05 | 3 | R$ 754.400 |
| 05/06 | 1 | R$ 3.199,99 |
| 30/06 | 1 | R$ 170,00 |
| 07/07 | 1 | R$ 7.699,99 |
| **31/07** | 1 | R$ 218,12 |

O `financial.cancel` de hoje **bloqueia** conta PAID e tem CAS ancorado em
`status` **e** `paidAmount` — endurecido na auditoria de 25/07 exatamente contra
isto.

A ocorrência de **31/07 é posterior ao fix**, e eu quase a reportei como
recorrência. Não é: é `VND202602539`, uma venda **REFUNDED** — o estorno cancela
a FT por outro caminho (`sale.ts:2795`), e a receita sai do DRE pelo lado da
venda. Comportamento correto.

**Então o caminho está fechado e o passivo histórico continua no relatório.**

### Por que não corrigi

Mexer em ledger de dinheiro é decisão sua, não minha. As opções não são
equivalentes:

- **Estornar no ledger** (`kind='reversal'`, o mecanismo já existe e nunca
  rodou em produção): o DRE passa a refletir a realidade, e o histórico
  registra que houve pagamento e estorno. É o que a contabilidade faria.
- **Deixar como está:** o DRE de 2026 segue com R$ 754.400 de despesa que não
  existiu, e todo relatório derivado dele mente junto.

Não fiz nenhuma das duas por conta própria — é dinheiro, é histórico, e a de
R$ 740.000 pode ter contexto que eu não conheço.

## Baixa confiança

- **Não testei `cashFlow` e `projectedCashFlow` com os dois perfis** com a mesma
  profundidade do DRE. Verifiquei que também não chamam `getUserRole`, mas não
  medi o que expõem na tela.
- **Não auditei o cálculo do DRE contra o razão.** Confirmei a integridade
  obrigação↔parcela↔pagamento, não que a linha "CUSTO DAS PECAS" do DRE seja a
  soma correta das despesas de peça. O lucro líquido de **-R$ 1,34 milhão**
  foi investigado e virou o **M9-2** acima: R$ 754.400 de obrigação cancelada
  inflando a despesa. O que **não** conferi é se o restante (R$ 789 mil) bate
  com a realidade da loja.
