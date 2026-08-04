# Auditoria profunda — Módulo de Estoque (2026-08-04)

> Gatilho: o dono reportou que ao finalizar uma compra de aparelhos "informamos
> apenas que é PIX e já passa, não se escolhe conta, não se faz mais nada".
> Esta auditoria partiu desse sintoma e varreu o módulo inteiro e suas fronteiras
> (venda/PDV, OS, NF-e, financeiro, caixa).
>
> Protocolo: `audit-backend` (4 rodadas), 4 agentes em paralelo + verificação
> pessoal de cada achado P0/P1 citado abaixo. Nenhum arquivo foi modificado.

## Sumário executivo — os 5 maiores riscos

| # | Risco | Efeito | Sev |
|---|---|---|---|
| 1 | `stock.update` apaga variações e zera o saldo | Some estoque sem rastro no kardex | P0 |
| 2 | Estorno de OS nunca devolve peças | Peça some do estoque para sempre | P0 |
| 3 | Compra sem `paymentMode` não gera nada no financeiro | Lucro superestimado (mesma falha dos R$342k) | P0 |
| 4 | Cancelar compra não estorna o ledger | Despesa cancelada fica no DRE para sempre | P0 |
| 5 | Estorno "com defeito" de item não-serializado | ENTRY fantasma, saldo não volta nem baixa | P0 |

O padrão que liga quase tudo: **o caminho feliz é sólido; os caminhos de
reversão, exceção e variação são onde o sistema sangra.** A venda no PDV é a
peça mais bem construída do sistema. Estorno, cancelamento e produtos com
variação foram consistentemente tratados como segunda classe.

---

## P0 — Corrupção de dados / dinheiro

### P0-1 — `stock.update` HARD DELETE em variações, zerando saldo sem rastro
`src/server/api/routers/stock.ts:596-639`

A guarda olha o campo errado. Ela verifica `stockItems` (fonte de verdade dos
**serializados**), mas o saldo de uma variação vive em
`ProductVariation.currentStock`, que nunca é consultado:

```ts
const varsWithStock = existingVars.filter((v) => v.stockItems.length > 0);
...
// Soft delete das variacoes sem stock   ← o comentário mente
await tx.productVariation.deleteMany({ where: { id: { in: safeIds } } });
```

Três defeitos compostos:
1. Variação com `currentStock: 47` e zero `StockItem` é classificada como "safe".
2. `deleteMany` é **DELETE físico** — não há middleware de soft delete em
   `src/server/db.ts`, e a coluna `deletedAt` existe e é ignorada aqui.
   Compare com `deleteVariation` (`stock.ts:4011`), que faz certo.
3. `productVariationInputSchema` (`src/lib/validators/stock.ts:35-49`) **não tem
   `id`**, então recriar não preserva nada: toda variação nasce `currentStock: 0`.

**Cenário:** produto com "128GB" (47un) e "256GB" (12un). Admin abre o produto,
adiciona uma terceira variação, salva. **59 unidades somem, sem nenhum
`StockMovement`** — a perda é invisível no kardex e irrecuperável por ele.

Atenuante que piora o diagnóstico: a tela de edição não manda `variations` nos
`defaultValues`, então "só mudar o preço e salvar" não dispara. Só detona quando
o admin mexe no editor de variações — ou seja, é **intermitente**, parece
funcionar até não funcionar.

### P0-2 — Estorno de OS nunca devolve peças ao estoque
`src/server/api/routers/service-order.ts:1307-1613`

Varri as 306 linhas do procedure `refund`: **zero ocorrências** de `stock`,
`Stock`, `releaseAll` ou `reserve`. Ele estorna caixa, recebíveis e comissões —
mas as peças consumidas continuam consumidas.

Pior: o `delete` depois bloqueia com uma mensagem **falsa**
(`service-order.ts:1649`): "o estoque já foi liberado pelo cancel/refund" — o
refund nunca liberou. Não há remédio pela UI; só ajuste manual.

Assimetria relevante: `sale.refund` devolve estoque. Mesmo evento de negócio,
dois resultados diferentes conforme o módulo por onde o dinheiro passou.

### P0-3 — Compra sem forma de pagamento não gera NADA no financeiro
`src/lib/validators/stock.ts:186`, `stock.ts:1175`, `page.tsx:519-545`

```ts
paymentMode: z.enum(["now", "payable"]).optional(),   // validator
if (input.paymentMode && input.purchasePrice > 0) {   // router
```

O `<Select>` "Como vai pagar?" não tem `required`, não tem refine e nasce vazio.
Enviar sem tocar nele **passa**.

Resultado: cria `DevicePurchase` + `StockMovement` + `StockItem` com `costPrice`
— aparelho no estoque, avaliado, vendável — e **nenhum** `FinancialTransaction`,
`Installment`, linha de ledger ou `CashMovement`. O dinheiro saiu da gaveta na
vida real; no sistema não existe.

O DRE lê despesa só do ledger (`financial.ts:1334`), então essa compra é
invisível como despesa enquanto seu custo entra no CMV na revenda. **O lucro
fica superestimado pelo valor cheio da compra.** É exatamente o incidente dos
R$342k/62 compras já documentado em `installment-ledger.service.ts:16-21` — a
correção de então cobriu o caminho `"now"` e deixou o caminho `undefined` como
uma forma legal de reproduzir a mesma corrupção. Sendo o default do formulário,
virou o caminho de menor resistência.

### P0-4 — Cancelar compra não estorna o ledger: despesa fica no DRE para sempre
`stock.ts:1550-1598`

O cancel faz bastante coisa certa (cancela o PAID, devolve dinheiro à gaveta),
mas **nunca escreve a linha negativa do ledger**. O próprio serviço documenta que
"estorno entra como valor negativo" e `financial.ts:802-815` faz isso corretamente
no estorno de parcela. Aqui, não.

E os dois leitores do ledger filtram só `type`/`deletedAt` — **nunca `status`**
(`financial.ts:911` e `:1106`). Então a linha sobrevive ao cancelamento.

**Cenário:** compra iPhone R$3.000 à vista → cancela. Dinheiro volta à gaveta,
`StockItem` soft-deletado, FT `CANCELLED` — mas o DRE **continua contando
R$3.000 de despesa, permanentemente**. Vazamento duplo: devolveu o dinheiro E
manteve a despesa.

### P0-5 — Estorno "com defeito" de item não-serializado: ENTRY fantasma
`src/server/api/routers/sale.ts:2466-2497`

```ts
if (item.stockItemId || input.returnAsDefect) continue;
```

Para item **não-serializado** com `returnAsDefect: true`, o `continue` dispara
antes de qualquer incremento, e o ramo serializado (2503) não casa nada. Mas o
`StockMovement` type `ENTRY` **já foi escrito na linha 2466**.

O kardex diz +3, o saldo diz +0, e nenhuma baixa foi registrada. O comentário
logo acima afirma que itens com defeito "vão para DEFECTIVE no StockItem ou
descontam baixa permanente" — para não-serializados **nenhum dos dois acontece**.
Conciliar kardex contra saldo passa a ser impossível.

---

## P1 — Fragilidades sérias

### P1-1 — Sem caixa aberto, o dinheiro some do ledger da gaveta em silêncio
`stock.ts:1244-1263`. Não há `else`, não há aviso; a UI diz "Compra registrada
com sucesso". A venda faz o oposto e **bloqueia** (`sale.ts:1736`):

```ts
if ((hasCashPayment || downgradeInCash) && !openSession) {
  throw new TRPCError({ ... "Caixa nao esta aberto..." });
}
```

Assimetria traiçoeira: o DRE continua certo e só a gaveta quebra — no
fechamento aparece uma falta fantasma, atribuída ao operador, irrastreável depois.

### P1-2 — A compra debita a gaveta de OUTRO usuário
`stock.ts:1245` busca `cashSession.findFirst({ where: { closedAt: null } })` —
sem `userId`. A sessão é **por usuário** (índice único parcial
`cash_sessions_one_open_per_user`), e a venda filtra por `userId`
(`sale.ts:1729`). A compra pega qualquer caixa aberto do tenant: quem paga é o
caixa do colega, e a diferença aparece no fechamento dele.

### P1-3 — Compra não é categorizada no financeiro
Nenhum dos dois `create` de FT (`stock.ts:1207`, `:1271`) define `category` ou
`categoryId`, embora exista `resolveCategoryId` e a venda defina
(`sale.ts:1884`). A maior classe de despesa do negócio (24% do ano) não pode ser
segmentada, e corrigir depois exige backfill — nada registra a intenção.

### P1-4 — Não existe conta (ReceivingAccount) na compra
O modelo existe (`receiving.prisma:30`) mas só é alcançado por adquirente de
cartão. `FinancialTransaction` **não tem coluna de conta**. Uma compra no PIX
registra *que* foi PIX, não **de qual conta saiu**. Conciliação bancária é
impossível. É literalmente a queixa do dono.

### P1-5 — Trade-in fura o bloqueio legal do termo
`createPurchase` cria o item `BLOCKED` "para reduzir risco legal"
(`stock.ts:1169`), até o termo ser assinado. O trade-in do PDV cria o **mesmo
tipo de aparelho, do mesmo cliente**, como `AVAILABLE` na hora (`sale.ts:2217`),
sem IMEI validado e sem termo. Ou o controle é desnecessário, ou é um buraco.

Pior: o trade-in não grava `productId` no `DevicePurchase`, e `cancelPurchase`
reverte estoque dentro de `if (purchase.productId)` — então **cancelar uma compra
de trade-in nunca remove o StockItem**.

### P1-6 — Estorno total cancela a compra do trade-in mas deixa o aparelho vendável
`sale.ts:2531-2549` cancela o `DevicePurchase` e nunca soft-deleta o `StockItem`
criado em 2207. O aparelho que a loja devolveu ao cliente continua no estoque.

### P1-7 — NF-e credita o saldo errado em produto com variação
`nfe-import.ts:456` sempre faz `tx.product.update({ currentStock })`, mesmo
quando o item tem `variationId`. Mas o saldo vendável de um produto
`hasVariations` é a **soma das variações** (`stock-item.service.ts:47-51`).
A NF-e diz que entraram 50, o kardex diz 50, o saldo vendável diz **0**.

### P1-8 — Sem idempotência em nenhuma mutação de estoque
Zero ocorrências de `idempot`/`clientRequestId` no router. `stockEntryBatch` não
tem chave natural: duplo clique ou retry após o timeout de 20s da transação
commita duas vezes. Em `createPurchase`, a unique parcial de IMEI protege por
acidente — mas **não** para aparelhos sem IMEI (AirPods, iPad WiFi), que o código
permite explicitamente: aí saem duas compras, dois StockItems, **dois pagamentos**.
A venda foi endurecida com `finalize-idempotency.service.ts`; a compra não.

### P1-9 — Sem `CHECK (current_stock >= 0)` no banco
O invariante só se sustenta porque 7+ call sites lembram de escrever
`where: { currentStock: { gte: qty } }`. O módulo de fidelidade ganhou
exatamente essa constraint em 2026-07-27; estoque, que tem mais escritores, não.

### P1-10 — Kardex não reconstrói: `quantityBefore/After` nulos
`adjustStock` (`:748`), `stockExit` (`:2608`), `importCsv` (`:3751`) e o
finalize da venda (`sale.ts:1618`) gravam movimento sem antes/depois, enquanto
`applyNonSerializedEntry` preenche. A cadeia quebra num furo a cada ajuste.

### P1-11 — 11 caminhos de escrita, uma máquina de estados usada por 1
Não há helper canônico de movimentação. `changeItemStatus` é o único que valida
transição (`isValidTransition`) e é alcançável só pelo procedure manual — toda
venda e todo estorno passam por fora da máquina de estados.

### P1-12 — Zero teste no caminho de dinheiro da compra
`grep -rln "paymentMode" __tests__/` → **nada**. Toda a integração
compra↔financeiro↔caixa não tem cobertura.

---

## P2 — Menores, mas reais

- **Relatório vaza custo/lucro ao operador.** `reportVendasPeriodo`
  (`stock.ts:3077-3157`) devolve `costTotal`/`profit`/`lucroBruto` sem checar
  `isTenantAdmin`, enquanto os **cinco** relatórios irmãos gateiam. Vaza pela UI.
- **Data de vencimento sem validação.** `payableFirstDueDate` é `z.string()` cru;
  `"2026-02-30"` vira 02/03 silenciosamente, lixo aborta a transação com erro
  opaco, datas passadas nascem OVERDUE.
- **Parcela pode nascer NEGATIVA.** R$1,00 em 36x → última parcela = **-5
  centavos** (soma bate, mas a parcela é negativa e não pode ser quitada).
  Alcançável pela UI (mínimo 100 centavos, máximo 36 parcelas).
- **Vendedor nunca validado.** `createPurchase` não verifica se cliente/fornecedor
  existe ou está ativo; `findUnique` sem `deletedAt` e `?? "Fornecedor não
  identificado"` engole a falha. (Cross-tenant **não** é explorável — RLS cobre.)
- **`uncancel` de OS perde `variationId`** (`service-order.ts:1212`): cancelar e
  descancelar infla o saldo da variação permanentemente.
- **Peça de OS fica `RESERVE` para sempre** — nunca vira `EXIT` no pagamento, então
  qualquer relatório de CMV por `type='EXIT'` subconta.
- **NF-e ignora serializados em silêncio** e mesmo assim conta como importado.
- **Assinatura não checa `cancelledAt`** (`stock.ts:1613`, `:1804`): compra
  cancelada pode ser "assinada". O `deletedAt: null` do release segura o dano.
- **URL de foto aceita qualquer scheme** (`javascript:`, `file:`, `data:`) —
  mitigado por CSP e por exigir admin.
- **RLS sem `WITH CHECK`** em `product_variations` e mais 4 tabelas.
- **`unitCostCents` preenchido por 1 caminho e lido por nenhum** — kardex
  valorizado pela metade, pronto para dar número errado quando alguém plugar.
- **`canonicalMethodToken` não usado** no stock: grava `code` não normalizado.
- **`changePurchaseDate`** é capability morta (não guarda nada).

---

## Decisões boas, que devem ser preservadas

1. **Isolamento multi-tenant.** 126 tabelas com `ENABLE` **e** `FORCE` RLS,
   `SET LOCAL` (nunca `SET` de sessão), zero uso de prisma cru no router inteiro.
   Sólido de verdade.
2. **Fonte única do saldo serializado.** `resolveCurrentStockByProduct` +
   `EFFECTIVE_STOCK_SQL`, com todas as portas de escrita em `currentStock`
   fechadas para serializado. Evita o clássico contador-vs-contagem.
3. **CAS onde importa.** `cancelPurchase` (I7), `changeItemStatus`,
   `claimDraftSaleForFinalize`, e o `SELECT ... FOR UPDATE` do `adjustInventory`
   — com teste de concorrência real cobrindo.
4. **RBAC do estoque é decisão, não descuido.** ADR 0053 documenta
   "movimento ≠ perda"; a matriz publicada bate 1:1 com o código.
5. **Venda no PDV.** Uma transação, decrementos CAS, asserção de contagem,
   idempotência de replay. É o padrão que os outros caminhos deveriam copiar.

---

## Plano priorizado

**Quick wins (baixo risco, alto retorno)**
1. `paymentMode` obrigatório (refine no Zod + `required` na UI) — fecha P0-3.
2. Exigir caixa aberto para CASH/PIX na compra, espelhando `sale.ts:1736`; e
   filtrar a sessão por `userId` — fecha P1-1 e P1-2.
3. Linha negativa no ledger dentro do `cancelPurchase` — fecha P0-4.
4. `isTenantAdmin` no `reportVendasPeriodo` — fecha o vazamento de margem.
5. `categoryId` via `resolveCategoryId` nas duas FTs da compra.
6. Validar `payableFirstDueDate` e travar parcela mínima.

**Estruturais**
7. Corrigir `stock.update`: checar `currentStock`, trocar `deleteMany` por soft
   delete, e pôr `id` no schema para virar upsert — fecha P0-1.
8. Estorno de OS devolve peças (reusar `applyOsCancellation`) — fecha P0-2.
9. Corrigir o `continue` do `returnAsDefect` não-serializado — fecha P0-5.
10. NF-e creditar `productVariation` quando houver `variationId` — fecha P1-7.
11. Chave de idempotência em `createPurchase` e `stockEntryBatch`.
12. `CHECK (current_stock >= 0) NOT VALID` nas duas tabelas.
13. Teste de integração cobrindo compra→financeiro→caixa→cancelamento.

**Perigosas (exigem decisão do dono)**
14. **Conta bancária (ReceivingAccount) no financeiro.** Coluna nova em
    `FinancialTransaction` + backfill + UI em toda entrada/saída. É a correção de
    raiz da queixa original, mas atravessa venda, OS, despesa e compra.
15. **Unificar trade-in e compra de aparelho.** Hoje são dois fluxos com regras
    divergentes para o mesmo evento. Decidir se o termo é obrigatório e aplicar
    nos dois.
16. **Decidir se o kardex valorizado é real.** Ou preenche custo em todos os
    movimentos, ou remove as colunas. Meio preenchido é a pior opção.

## Baixa confiança / perguntas em aberto

- Não rodei o sistema nem consultei o banco de produção: os cenários são
  derivados do código, não observados. Vale medir quantas compras existem hoje
  com `paymentMode` nulo e quantas variações têm saldo em risco.
- Não auditei a fundo o iPhone Hunter nem o valuation (tangenciam estoque).
- O impacto financeiro real de P0-3/P0-4 depende de quanto os operadores usam o
  campo de pagamento — mensurável com uma query.
