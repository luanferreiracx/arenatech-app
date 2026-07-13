# G — Concorrência e Consistência: `sale.ts` + `financial.ts`

Auditoria profunda de concorrência/consistência nos dois maiores arquivos de dinheiro:
`src/server/api/routers/sale.ts` (4306 linhas) e `src/server/api/routers/financial.ts` (1544 linhas).

**Contexto de isolamento (fato):** todas as mutations rodam via `withTenant` →
`prisma.$transaction(..., { timeout: 20_000, maxWait: 10_000 })` **sem `isolationLevel`**
(`src/server/db.ts:83-94`). Logo, tudo roda em **READ COMMITTED** (default do Postgres).
Nenhum `SELECT ... FOR UPDATE` implícito; a defesa contra corridas é sempre CAS via
`updateMany({ where: { ...status }, ... })` verificando `count`. Isso é adequado, mas cada
read-then-write de dinheiro **precisa** do CAS — os achados abaixo são onde ele falta.

**Volume atual em prod (2026-07-13):** 2307 vendas totais, 2286 COMPLETED, 114 no mês (máx.
por tenant no mês = 114). Baixo — reduz a severidade prática das corridas, mas não a corrige.

---

## G1 — Estorno parcial repetido sobre-saca dinheiro da gaveta (double-withdrawal)

**Severidade:** P1
**Arquivo:** `src/server/api/routers/sale.ts:2278-2321` (bloco de `CashMovement` do `refund`)
**Confiança:** ALTA (fato — lógica lida linha a linha; não é corrida, é erro determinístico
em estornos parciais sequenciais)

### Cenário passo-a-passo

Venda paga 100% em **dinheiro**, R$300, com 3 itens de R$100. `paymentDetails =
[{ method: "dinheiro", amount: 30000 }]`.

1. Admin faz **estorno parcial do item A** (R$100). `refundedCents = 10000`.
   - `cashPaidOriginallyCents` = 30000 (lê o leg de dinheiro **original inteiro** de
     `sale.paymentDetails`, linha 2282-2284).
   - `cashRefundCents = min(10000, 30000) = 10000` → `WITHDRAWAL dinheiro 10000`. ✓ correto.
2. Admin faz **estorno parcial do item B** (R$100). `refundedCents = 10000` de novo.
   - `sale.paymentDetails` **não muda** entre refunds (o refund nunca reescreve o leg de
     pagamento). Então `cashPaidOriginallyCents` continua **30000**.
   - `cashRefundCents = min(10000, 30000) = 10000` → outro `WITHDRAWAL dinheiro 10000`.
3. Item C idem.

Total sacado da gaveta em dinheiro: R$300 — **correto por coincidência** neste caso (100%
dinheiro). O bug aparece quando a venda é **mista**:

Venda R$300: R$100 dinheiro + R$200 cartão. `paymentDetails =
[{method:"dinheiro",amount:10000},{method:"cartao...",amount:20000}]`.

1. Estorno parcial item A (R$100): `cashRefundCents = min(10000, 10000) = 10000` → saca
   R$100 **em dinheiro** da gaveta. Mas o item A pode ter sido pago proporcionalmente por
   cartão — não há rastro item↔forma. Já aqui o dinheiro sacado (100) = todo o dinheiro
   recebido.
2. Estorno parcial item B (R$100): `cashPaidOriginallyCents` ainda = 10000,
   `cashRefundCents = min(10000, 10000) = 10000` → saca **outro R$100 em dinheiro**.
3. Item C: saca **mais R$100 em dinheiro**.

Total sacado em dinheiro: **R$300**, mas a loja só recebeu **R$100** em dinheiro. A gaveta
fica **R$200 negativa** e o restante (que deveria sair como `null`/cartão, estornado pela
adquirente) nunca é debitado corretamente. É exatamente a classe do bug M2 que a auditoria
anterior tentou fechar — mas o fix M2 não desconta o dinheiro **já estornado em refunds
anteriores**.

### Fix

Descontar o dinheiro já estornado em espécie nos refunds anteriores antes de aplicar o
`min`. Somar os `CashMovement` de `referenceType IN ('SALE_REFUND')` `paymentMethod='dinheiro'`
já existentes para esta venda e usar `cashRemaining = max(0, cashPaidOriginallyCents -
cashAlreadyRefundedInCash)` no lugar de `cashPaidOriginallyCents`:

```ts
const alreadyCashRefunded = await tx.cashMovement.aggregate({
  where: { referenceType: "SALE_REFUND", referenceId: sale.id, paymentMethod: "dinheiro" },
  _sum: { amount: true },
});
const cashRemaining = Math.max(0, cashPaidOriginallyCents - decimalToCents(alreadyCashRefunded._sum.amount));
const cashRefundCents = Math.max(0, Math.min(refundedCents, cashRemaining));
```

Adicionar teste: 3 estornos parciais de venda mista (dinheiro parcial) somam no máx. o
dinheiro recebido.

---

## G2 — Sale finalize/refund e payInstallment/reverseInstallment gravam CashMovement sem lock da sessão de caixa (K1 não coberto fora do cashier)

**Severidade:** P2
**Arquivos:**
- `src/server/api/routers/sale.ts:1498-1533` (finalize, INCOME), `:1568-1581` (downgrade OUTCOME), `:2278-2321` (refund OUTCOME)
- `src/server/api/routers/financial.ts:543-562` (payInstallment), `:695-711` (reverseInstallment)
**Confiança:** ALTA (fato: o helper `lockOpenCashSessionOrThrow` existe e é usado
**apenas** em `cashier.ts`; grep confirma 4 chamadas, todas em cashier.ts)

### Cenário passo-a-passo

O helper `lockOpenCashSessionOrThrow` (`cash-session.service.ts:36`) foi criado justamente
para a classe K1 ("gravar movimento em sessão recém-fechada"): pega `SELECT ... FOR UPDATE`
na linha da sessão e confirma `closed_at IS NULL`. **Só o cashier.ts o chama.** As demais
rotas que escrevem CashMovement fazem apenas `findFirst({ closedAt: null })` → `writeCashMovement`.

1. Operador clica **Finalizar venda** (dinheiro). A tx do finalize faz
   `findFirst(cashSession closedAt:null)` → acha a sessão S (linha 1498).
2. Em paralelo, o gerente clica **Fechar caixa** na sessão S. A tx do fechamento pega
   `FOR UPDATE` na sessão, calcula o esperado a partir dos movimentos **atuais** e commita
   `closed_at = now()`.
3. A tx do finalize (que **não** pegou o lock) segue e grava `CashMovement INCOME dinheiro`
   na sessão **já fechada**. Como o fechamento já calculou o esperado sem esse movimento, a
   gaveta fica **sub-reportada** — dinheiro entrou fisicamente mas não no fechamento.

READ COMMITTED permite exatamente isso: o finalize não vê o `closed_at` porque leu antes, e
não há lock que o serialize contra o fechamento.

### Fix

Após localizar `openSession` e **antes** de escrever qualquer CashMovement, chamar
`await lockOpenCashSessionOrThrow(tx, openSession.id)` em: sale.finalize, sale.refund,
financial.payInstallment, financial.reverseInstallment. Se o lock lançar CONFLICT, a tx
inteira faz rollback (a venda não finaliza, o operador reabre o caixa e refaz). Espelha
exatamente o padrão já aplicado no cashier.ts.

**Nota de severidade:** P2 (não P1) porque a janela é estreita (fechamento manual é raro e
deliberado) e o auto-close roda por cron fora de horário. Mas é a MESMA classe K1 que a
equipe já classificou como bug real e corrigiu no cashier — está inconsistente.

---

## G3 — `recalculateTransactionStatus` sobrescreve `paidAt`/`status` sem CAS (lost update com estorno concorrente)

**Severidade:** P2
**Arquivo:** `src/server/api/routers/financial.ts:128-169` (helper) chamado por
`payInstallment:539` e `reverseInstallment:689`
**Confiança:** MÉDIA-ALTA (a proteção CAS existe na parcela individual, mas o rollup da FT é
read-then-write sem guarda; a corrida exige 2 parcelas da mesma FT em voo)

### Cenário passo-a-passo

O `payInstallment` protege a **parcela** com CAS forte (`where: { paidAmount: installment.paidAmount }`,
linha 499-504) — isso está correto e fecha o lost-update por-parcela (P1 anterior). Mas
depois chama `recalculateTransactionStatus`, que faz `installment.findMany` → decide status
→ `financialTransaction.update` **sem** condição de versão (linha 159-166).

1. FT com 2 parcelas PENDING. Operador A baixa a parcela 1; Operador B baixa a parcela 2
   (concorrente, transações distintas).
2. Ambas passam o CAS da própria parcela (parcelas diferentes → sem conflito).
3. A chama `recalculateTransactionStatus`: lê parcelas → vê P1=PAID, P2=PENDING (ainda não
   commitado por B) → grava FT `PARTIALLY_PAID`, `paidAmount = valor de P1`.
4. B chama `recalculateTransactionStatus`: sob READ COMMITTED, se B leu antes do commit de A,
   vê P2=PAID, P1=PENDING → grava FT `PARTIALLY_PAID`, `paidAmount = valor de P2`.
5. Resultado: FT fica `PARTIALLY_PAID` com `paidAmount` de apenas **uma** parcela, embora as
   duas estejam PAID. A FT deveria ser `PAID`. O "recebido" da FT fica subestimado.

O `paidAmount` da FT diverge das parcelas. Não corrompe o razão de caixa (o CashMovement e o
`installmentPayment` ledger já foram gravados por cada operador), mas a **FT** (usada em
`pending`/`receivables`/stats) fica inconsistente até o próximo recalc.

### Fix

`recalculateTransactionStatus` deveria recalcular `paidAmount` **por agregação no banco**
(`installment.aggregate`) em vez de somar em memória a partir de um snapshot possivelmente
stale — o que já reduz a janela — e/ou reexecutar o rollup ao final com os dados commitados.
Alternativa robusta: um lock de intenção na FT (`SELECT ... FOR UPDATE` na FT no início de
pay/reverse) serializa os dois pagamentos da mesma FT. Dado o baixo volume, a agregação no
banco já mitiga na prática; o lock é o correto.

**Mitigante existente:** o ledger `installmentPayment` (FIN-B2) é a fonte de verdade do
"recebido no mês" nos relatórios (stats/dre usam o ledger, não `FT.paidAmount`). Então o
impacto é sobre o **status/paidAmount da FT** (telas de listagem), não sobre o DRE. Por isso
P2 e não P1.

---

## G4 — `sale.stats` e `sale.list`/`byPublicLink` sem `take`/agregação (findMany ilimitado em hot path de dashboard)

**Severidade:** P3
**Arquivo:** `src/server/api/routers/sale.ts:2809-2833` (`stats`)
**Confiança:** ALTA (fato — `findMany` sem `take`, materializa todas as linhas do
mês/dia/histórico e soma em JS)

### Cenário

`stats` faz `findMany` de **todas** as vendas COMPLETED do dia e do mês (linhas 2810-2823)
só para somar `totalAmount` em JS (2836-2845). Hoje são 114/mês (irrelevante), mas cresce
linearmente com o volume e roda a cada abertura do dashboard. É o mesmo antipadrão que a
equipe já corrigiu no financeiro (agregações no banco).

### Fix

Trocar por `tx.sale.aggregate({ _sum: { totalAmount: true }, _count: true, where })` para
dia e mês. Elimina a materialização e o loop de soma.

**Não é P-alto hoje** — registrado como dívida de performance previsível.

---

## G5 — `checkTransactionStatus` (HTTP + persiste) roda antes da tx, mas a revalidação DePix não é re-conferida DENTRO da tx (janela finalize-vs-webhook)

**Severidade:** P3
**Arquivo:** `src/server/api/routers/sale.ts:965-1005` (loop de revalidação pré-tx) vs.
`:1008+` (tx de finalize)
**Confiança:** MÉDIA (a decisão de rodar HTTP fora da tx é correta e documentada; o gap é
que o estado liquidado **não é re-lido** dentro da tx — mas o efeito prático é limitado)

### Cenário passo-a-passo

1. Loop pré-tx (linha 965) chama `checkTransactionStatus`, confirma `isSettledForSaleDepixStatus`
   e que `sourceId === saleId`. OK.
2. Abre a tx de finalize. Entre o passo 1 e a abertura da tx, nada re-verifica que a DePix tx
   **continua** liquidada (ex.: um webhook de FAILED/CANCELLED chegando nesse intervalo, ou
   um estorno on-chain).
3. O finalize prossegue e grava a venda COMPLETED + recebível/caixa com base num status que
   pode ter mudado no micro-intervalo.

Na prática a liquidação DePix é terminal (uma vez COMPLETED/PROCESSING-settled não volta),
então o risco real é baixo — por isso P3. Mas a **garantia** de que o valor cobrado casa com
o liquidado é apenas fail-open (grava audit `payment_value_mismatch`, não bloqueia — decisão
explícita do dono, linhas 957-963). Registrado como risco aceito, não como bug a corrigir.

### Fix (se quiser endurecer)

Dentro da tx, re-ler o status persistido da `depixTransaction` (sem HTTP) e abortar se não
estiver mais liquidado. Barato (é read local) e fecha a janela sem reintroduzir HTTP na tx.

---

## G6 — `applyDiscount`/`recalculateSale` recalculam `subtotal`/`totalAmount` a partir de leitura não-serializada (write skew possível com addItem concorrente no mesmo draft)

**Severidade:** P3
**Arquivo:** `src/server/api/routers/sale.ts:866-939` (`applyDiscount`), `:4237-4306`
(`recalculateSale`)
**Confiança:** MÉDIA (corrida exige duas mutations concorrentes no MESMO draft — improvável
na prática: um draft pertence a um vendedor e a UI é single-flight, mas React Strict Mode /
duplo-clique podem disparar)

### Cenário passo-a-passo

Draft de um vendedor. Dois requests concorrentes: `addItem` (item novo) e `applyDiscount`.

1. `addItem` lê itens `[A]`, cria item B, chama `recalculateSale` → subtotal = A+B.
2. `applyDiscount` (iniciado quase junto) leu itens `[A]` antes de B existir → calcula
   subtotal = A, grava `discountAmount` sobre base A e `totalAmount = A - desc`.
3. Dependendo da ordem de commit, o `totalAmount` final pode refletir uma base
   desatualizada (só A) enquanto os itens no banco são [A,B]. O próximo `recalculateSale`
   (qualquer mutação de carrinho) conserta, mas se o operador **finalizar** exatamente nesse
   estado, cobra sobre a base errada.

**Mitigante forte:** o draft é escopado por `sellerId` (um vendedor, uma aba) e o finalize
recomputa `totalCents = decimalToCents(sale.totalAmount)` a partir da linha persistida — mas
**não** rechama `recalculateSale` no finalize, então confia no último valor gravado. Baixa
probabilidade → P3.

### Fix (defensivo)

No início do `finalize`, após o claim DRAFT→COMPLETED, rodar uma checagem de consistência:
recomputar subtotal a partir de `saleItem` e comparar com `sale.subtotal`; divergência →
`recalculateSale` ou abortar. Alternativamente, aceitar como risco (a UI já serializa).

---

## Invariantes verificados OK (não são bugs)

1. **Double-sell / double-finalize — COBERTO.** `claimDraftSaleForFinalize`
   (`finalize-idempotency.service.ts:121`) faz CAS `DRAFT→COMPLETED` (`sale.ts:1064`) antes
   de qualquer write de dinheiro/estoque. O perdedor da corrida vê `count!==1` → CONFLICT →
   rollback. O replay idêntico (mesma assinatura de pagamento) retorna a venda existente
   (`sale.ts:1029-1052`) — idempotência correta. **Ordem verificada:** o check de
   `status===COMPLETED` (replay) precede o claim; o claim só roda para DRAFT. Sem furo.

2. **Oversell de estoque — COBERTO.** Decremento via `updateMany({ where: { currentStock:
   { gte: qty } }})` (`sale.ts:1417-1444`) é CAS atômico. Serializados via `updateMany` com
   `status/reservedForId` no where + verificação `count === stockItemIds.length`
   (`sale.ts:1454-1483`). Reserva no carrinho idem (`sale.ts:583-603`).

3. **Double-cancel / double-refund — COBERTO.** `refund` usa CAS no status final
   (`sale.ts:2456-2465` e `:2473-2484`: `updateMany where status IN [COMPLETED,
   PARTIALLY_REFUNDED]`, verifica `count!==1`). Dois estornos concorrentes: o perdedor
   reverte tudo (estoque, caixa, recebível) via rollback. `cancel` só age em DRAFT.

4. **Estado terminal reabrível — NÃO OCORRE.** Nenhum caminho leva CANCELLED/REFUNDED de
   volta a COMPLETED. `setCustomer` restrito a DRAFT (`sale.ts:842`); `linkCustomer` só
   COMPLETED→COMPLETED. `refund` exige `COMPLETED|PARTIALLY_REFUNDED` de entrada.

5. **Idempotência do estorno de recebível de cartão vs. settle concorrente — COBERTO.**
   `refund` cancela `cardReceivable` com `where status:"PENDING"` (`sale.ts:2355-2358`,
   `:2440-2443`); o settle (`receiving.ts:584-587`) marca SETTLED com `where status:"PENDING"`.
   Ambos CAS na mesma coluna → exatamente um vence por linha. Sem double-count.

6. **Lost-update em parcela (pagamento parcial) — COBERTO.** `payInstallment` e
   `reverseInstallment` usam CAS `where: { paidAmount: installment.paidAmount, status IN [...] }`
   (`financial.ts:499-504`, `:653-657`) → dois pagamentos parciais concorrentes na MESMA
   parcela: o perdedor recebe CONFLICT. (O gap residual é o rollup da FT — ver G3.)

7. **Dedup do dinheiro de cartão (DRE/cashFlow/projected) — COBERTO e correto.** Cartão vive
   só em `CardReceivable` (não gera FT, `sale.ts:1590`). `cashFlow`/`projectedCashFlow`
   pulam a parcela de venda que tem CardReceivable **vivo** (PENDING/SETTLED), preservando
   crediário de venda mista (`financial.ts:917-927`, `:1270-1282`). Cancelado não deduplica.

8. **Arredondamento de centavos em parcelas — CORRETO.** Split de FT parcelada usa
   `perInstallment = floor(total/n)` e a **última parcela absorve o remainder**
   (`sale.ts:1645-1669`); `generateInstallments` idem (`financial.ts:281-287`, comentado
   linha 313). Soma das parcelas === total, sem drift. Tolerância de 1 cent no fechamento de
   parcela força `paidAmount = amount` (`financial.ts:484-490`) evitando drift acumulado.

9. **Número da venda atômico — COBERTO.** `nextTenantNumber` via sequência tenant-scoped
   (`sale.ts:1380-1387`), substituindo o antigo `max()+parseInt` sujeito a corrida.

10. **`overdue` como query pura — CORRETO.** Não faz mais `updateMany` dentro de um `query`
    (marca OVERDUE só virtual, `financial.ts:1060-1072`); a persistência fica no cron
    `mark-overdue`. Sem race de escrita em leitura.
