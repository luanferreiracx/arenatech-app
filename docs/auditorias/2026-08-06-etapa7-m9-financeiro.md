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

## Baixa confiança

- **Não testei `cashFlow` e `projectedCashFlow` com os dois perfis** com a mesma
  profundidade do DRE. Verifiquei que também não chamam `getUserRole`, mas não
  medi o que expõem na tela.
- **Não auditei o cálculo do DRE contra o razão.** Confirmei a integridade
  obrigação↔parcela↔pagamento, não que a linha "CUSTO DAS PECAS" do DRE seja a
  soma correta das despesas de peça. O lucro líquido de **-R$ 1,34 milhão**
  parece implausível para uma loja com R$ 1,5 mi de receita, e as despesas
  (R$ 1.541.129) incluem os R$ 754.400 de PAYABLE **CANCELLED** que apareceram
  na medição inicial — vale conferir se o DRE está somando obrigação cancelada.
