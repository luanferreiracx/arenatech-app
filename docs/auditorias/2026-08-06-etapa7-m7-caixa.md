# Etapa 7 · Módulo 7 — Caixa

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-06. Primeiro dos três módulos de dinheiro.

## Superfície

O caixa não é um router — é uma **regra que seis arquivos precisam respeitar**.
`writeCashMovement` é chamado de:

| arquivo | escritas na gaveta |
|---|---|
| `cashier.ts` | 6 |
| `sale.ts` | 6 |
| `financial.ts` | 4 |
| `service-order.ts` | 4 |
| `stock.ts` | 3 |
| `cash-session.service.ts` | define a função |

Regra que precisa valer em seis lugares é a forma exata do padrão que esta
auditoria já nomeou oito vezes. Foi por aí que comecei.

---

## M7-1 — Quatro escritas na gaveta sem travar a sessão — ✅ CORRIGIDO

O B9 (auditoria 05/08) fechou a corrida fechar-caixa × finalizar-venda e deixou
o diagnóstico escrito no `sale.ts`:

> "Entre o `findFirst` acima e o `writeCashMovement` abaixo há uma janela em que
> o fechamento pode commitar: o movimento entraria numa sessão já fechada e
> ficaria FORA da conferência."

Quatro caminhos têm exatamente essa janela e **nenhum lock**:

| sítio | operação | movimento |
|---|---|---|
| `stock.ts:1419` | compra de aparelho à vista | saída |
| `stock.ts:1813` | cancelamento da compra | devolução |
| `sale.ts:2747` | estorno de venda (parte em dinheiro) | saída |
| `sale.ts:2761` | estorno de venda (parte não-dinheiro) | saída |

Volume real em produção: **R$ 409.280 em 73 compras** e **R$ 24.569 em 11
estornos**.

No `refund` a janela é a **mais larga do sistema**: `refundSession` é lido no
guard early (para não mexer em estoque sem caixa) e só é usado ~190 linhas
depois — devolução de estoque e recebíveis acontecem no meio.

### Impacto medido: zero ocorrências

Procurei movimento gravado depois do `closed_at` da própria sessão. Os 6 que
apareceram (R$ 8.556,90) são todos do tenant `audit-loja-2` — **que eu mesmo
semeei nesta auditoria**, com atraso de exatamente 691200s (8 dias cravados) e
timestamp idêntico. Artefato de seed, não corrida. Descartado.

O defeito é real no código; a corrida ainda não aconteceu em produção. É
correção preventiva de dinheiro, não incidente.

---

## O achado de verdade: o teste da paridade passou cego

O M1 desta mesma etapa criou `os-cash-lock-parity.test.ts` para impedir que a
nona instância aparecesse em silêncio. **Ele tinha dois furos:**

1. **A lista de arquivos era escrita à mão** — e `stock.ts` não estava nela.
2. **A asserção era `locks > 0`**, que um único lock satisfaz. O `sale.ts` tinha
   lock no `finalize`; as duas escritas do `refund`, 900 linhas abaixo, passavam.

O teste da paridade cometeu o erro que existe para pegar: **fechou a instância,
não a classe.** É a nona ocorrência do padrão — e a primeira dentro de um
guardião.

### O que mudou no teste

- A lista de arquivos é **derivada do código** (`grep -rl writeCashMovement`),
  não escrita à mão. Arquivo novo entra sozinho.
- A asserção é **posicional**: para cada escrita, exige um lock antes dela **na
  mesma procedure**. A fronteira de procedure é o que impede o lock do
  `finalize` de "cobrir" o `refund`.
- Contagem 1:1 seria errada na direção oposta: um lock antes de um laço protege
  legitimamente todas as escritas do laço. Foi o que a primeira tentativa fez, e
  ela acusou o `sale.ts` já corrigido.

Verificado nas duas direções: **6/6 com o fix**; sem o fix, aponta os 4 sítios
pelo número da linha.

### Um falso positivo, mantido como exceção documentada

A versão posicional acusou `cashier.ts:129` — a **abertura** de caixa. Ali a
sessão é criada na própria transação: ninguém mais conhece o id, não existe
janela. Travar uma linha recém-inserida seria ruído, não defesa. A exceção está
no teste com a razão escrita.

Vale registrar que a contagem antiga **absolvia** esse arquivo (7 locks ≥ 6
escritas) por acidente, não por análise.

---

## O que verifiquei e está correto

- **`lockOpenCashSessionOrThrow` faz o certo**: `SELECT ... FOR UPDATE` com
  `closed_at IS NULL`, e lança `CONFLICT` se a sessão sumiu — não silencia.
- **Sessão é sempre buscada por `userId`**: o índice único parcial
  `cash_sessions_one_open_per_user` garante uma aberta por usuário. Buscar sem
  `userId` debitaria a gaveta de um colega — corrigido na auditoria de 04/08 e
  ainda de pé nos 6 arquivos.
- **`affectsCashDrawer` é fonte única**: PIX/cartão não movem a gaveta física, e
  a conferência os ignora na soma. Os dois lados concordam.
- **`signedDepositCents`** assina por `nature`, então retirada manual não entra
  como entrada.

## Baixa confiança

- **Não reproduzi a corrida com duas transações concorrentes de verdade** nestes
  4 sítios. O teste é estático — afirma que o lock está lá, não que ele segura
  sob concorrência. O comportamento do lock em si já tem cobertura de integração
  (`sale-finalize-cash-close-race.test.ts`, do B9).
- **Não auditei o fechamento** (`closeSession`/conferência) nesta passada; o B9
  mexeu nele há um dia e a suíte de integração cobre.
