# Etapa 9 — varredura completa das 124 rotas

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Provas:** código · dado de produção · navegador real

---

## Por que esta varredura existiu

Declarei a Etapa 9 concluída com **"18 de 18 módulos"**. O dono mandou continuar
*"até fechar TODOS"*.

Ao varrer o **código** em vez da minha própria lista:

| | |
|---|---|
| rotas em `src/app/(app)` | **124** |
| rotas que eu havia medido | 49 |
| **nunca medidas** | **75** |

"18 módulos" era um agrupamento meu, não uma contagem. **Honesto sobre módulos,
enganoso sobre cobertura.** A lição vale além desta etapa: cobertura se mede
contra o código, não contra a própria lista.

---

## O que a varredura achou

53 rotas estáticas medidas a 320px. **17 com defeito** — e o padrão é o mesmo das
cinco ocorrências anteriores, agora em escala:

| rota | tabela | colunas fora de vista |
|---|---|---|
| `/stock/report` | **1075/222** | SKU, Estoque, Mínimo, Custo, Venda, Total, **Status** |
| `/pdv/history` | **1033/270** | Cliente, Vendedor, Itens, **Valor**, Pagamento, **Status**, Ações |
| `/stock/purchases` | 914/270 | Vendedor, Condição, Bateria, **Preço Compra**, **Preço Venda** |
| `/stock/movements` | 861/270 | **Tipo**, **Quantidade**, Motivo |
| `/stock/reports` | 839/270 | SKU, Categoria, **Qtd**, Valor, Total, **Status** |
| `/settings/users/new` | 799/270 | Email, Perfil, Ações |
| `/cashier/history` | 744/270 | **Status**, Saldo Inicial, Esperado, Informado, **Diferença** |
| `/financial/pending` | 635/270 | Já Pago, **A Receber**, **Status**, Vencimento |
| `/cashier/reviews` | 623/270 | Saldo Sistema |
| `/commissions` | 581/270 | Contrato vigente, Ações |
| `/iphone-hunter` | 574/270 | Storage, Condição, **Preço**, Mensagem |
| `/financial/categorias` | 543/270 | Código, **Ativo**, Ações |
| `/stock/attributes` | 505/270 | **Status**, Ações |
| `/services/manage` | 370/270 | **Status** — e **rola a página 9px** |
| `/service-orders/new` | — | **rola a página 1px** |

**Sempre a mesma regra:** a coluna que decide a ação — quanto, se entrou ou saiu,
se está pago, se está ativo — declarada por último.

---

## Corrigidas neste PR

As quatro de **dinheiro e decisão operacional**:

### `/pdv/history` — reordenar não bastou

Movi `Valor` e `Status` para as posições 3 e 4. **Ainda nasciam fora**: "Venda"
(142px) + "Data" (139px) consumiam **281px dos 270**, porque a data trazia ano de
4 dígitos + hora com `whitespace-nowrap`.

Com ano de 2 dígitos, `Valor` passou de 306px para **292px — visível**.

É a segunda vez na etapa que reordenar sozinho não resolve (a primeira foi o M18,
com nome de loja sem teto de largura).

### `/cashier/history`

`Status` e `Diferença` primeiro. A diferença é o que diz **se o caixa fechou
certo** — nascia na posição 7 de 8.

### `/financial/pending`

`A Receber` e `Status` primeiro. É a lista de contas **pendentes**; era
exatamente o que não se via.

### `/stock/movements`

`Tipo` e `Quantidade` primeiro. "Entrou ou saiu" e "quanto" são o conteúdo de uma
tela de movimentações — a coluna "Produto" ocupava a segunda posição com nome +
SKU em duas linhas.

---

## O que NÃO foi corrigido

**11 telas** com o mesmo padrão ficam registradas em vez de corrigidas às
pressas:

`/stock/report`, `/stock/reports` (**9 tabelas num arquivo**),
`/stock/purchases`, `/settings/users/new`, `/cashier/reviews`, `/commissions`,
`/iphone-hunter`, `/financial/categorias`, `/stock/attributes`,
`/services/manage` (também rola a página 9px) e `/service-orders/new` (rola 1px).

Cada uma precisa de medição própria — reordenar sem medir é como eu quase errei
no `/pdv/history`. Registro para a próxima passada saber onde estão.

---

## Cobertura desta varredura

- **53 rotas estáticas** medidas com dado real.
- **22 rotas com `[id]`** não medidas — exigem registro específico em cada tela.
- **`/dev/components`** ignorada (não é tela de produto).

Somando com as 49 da Etapa 9: **102 das 124 rotas** medidas a 320px.

---

## Guardião

`__tests__/unit/varredura-colunas-decisivas.test.ts` — 9 asserções, incluindo o
ano de 2 dígitos (a correção que reordenar não cobria) e a ordem do corpo em cada
tabela.

Visto falhar antes de aceito: **9 de 9 vermelhas**.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2.596 testes** verdes.
