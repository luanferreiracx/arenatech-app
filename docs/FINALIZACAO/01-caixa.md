# Módulo 1 — Caixa

**Passada A (backend):** concluída em 2026-07-29.
**Passada B (frontend):** pendente.

## Superfície

| | |
|---|---|
| Router | `src/server/api/routers/cashier.ts` (16 procedures, era 18) |
| Serviço | `src/server/services/cash-session.service.ts` |
| Rotas REST | `GET /api/cashier/[id]/relatorio` (era 2 — ver CX-2) |
| Cron | `POST /api/cron/close-abandoned-cash-sessions` (03:00 BRT) |
| Tabelas | `cash_sessions`, `cash_movements` |
| Telas | `/cashier`, `/cashier/[id]`, `/cashier/close`, `/cashier/history`, `/cashier/reviews` |

## Invariantes que o módulo promete

1. Um caixa aberto por usuário/tenant. *(índice único parcial `cash_sessions_one_open_per_user`)*
2. O saldo esperado da gaveta conta **só** o que passa pela gaveta física: dinheiro em espécie e ajuste manual.
3. Nenhum movimento é gravado em sessão já fechada.
4. Fechamento é atômico e não acontece duas vezes.
5. Fechamento sem contagem física (automático/forçado) não fabrica saldo contado nem divergência.
6. Movimento é append-only; o par `type`↔`nature` é válido por construção.
7. O operador não vê nem imprime o caixa de um colega.
8. O que o relatório impresso mostra é o que o banco guarda.

Foram as invariantes **2**, **7** e **8** que quebraram.

## Prova de dados (snapshot de produção, 2026-07-29)

| Medição | Valor |
|---|---|
| Sessões fechadas | 339 |
| Sessões já conferidas | **0** |
| Sessões cujo relatório impresso diverge do banco | **44** |
| Pior divergência (fechamento manual) | **R$ 288.282,00** |
| Pior divergência (fechamento automático) | **−R$ 94.577,15** |
| Sessões sem saldo declarado que o relatório mostrava como R$ 0,00 | 6 |
| Movimentos com UUID no lugar da forma de pagamento | 50 |
| Tenants com "Dinheiro" cadastrado **sem** `code` | **5 de 6** |

## Achados

### CX-1 — "dinheiro" só era reconhecido pelo literal `dinheiro` (P0 latente)

A pergunta "esta forma é dinheiro?" tinha duas respostas que discordavam:

- `sale.ts:isCashMethod` normalizava acento/caixa/espaço — `"Dinheiro"`, `" dinheiro "`, `"cash"` e `"especie"` **exigiam caixa aberto**;
- `cash-session.service.ts:CASH_DRAWER_METHODS` comparava com o literal `"dinheiro"` — nada disso **entrava no saldo esperado da gaveta**.

Dinheiro que o sistema obrigava a receber no caixa e depois não contava na conferência: sobra fantasma no fechamento.

E nenhuma das duas resolvia o caso comum. O PDV manda `PaymentMethod.code ?? PaymentMethod.id` (`payment-dialog.tsx:190`), e a forma "Dinheiro" nasce **sem `code`** no cadastro padrão — o que chega é um UUID. Para esses tenants:

1. a venda em dinheiro **não exigia caixa aberto** (`hasCashPayment` falso) — o dinheiro entrava na gaveta e o sistema não registrava movimento nenhum;
2. o dinheiro **não entrava no saldo esperado** — o fechamento acusava sobra do valor de todas as vendas em dinheiro do dia e pedia justificativa;
3. **não dava para dar troco** — `cashPaidCents` dava zero e a venda era recusada com "não há como devolver troco de pagamento em cartão/PIX".

Hoje só o `arena-tech` vende, e ele é justamente o único com `code = 'dinheiro'`. **Está latente e dispara na primeira loja NO-KYC que abrir um caixa** — que é exatamente o caminho de crescimento do produto.

O sistema já sabia do problema pela metade: `enrichPaymentDetailsLabels` resolve o UUID para **exibir** o nome. A conta do dinheiro nunca recebeu o mesmo tratamento.

**Correção.** Fonte única em `src/lib/payments/cash-method.ts`, usada pelo PDV e pelo caixa. `writeCashMovement` canoniza a forma na escrita (id → `code` do tenant, ou token derivado do tipo), preservando o `paymentMethodId`. O `finalize` resolve os tokens antes de decidir sobre dinheiro — o dado gravado em `paymentDetails` segue sendo o que o PDV mandou, para não quebrar o contrato do rótulo. Migration normaliza os 50 movimentos históricos (dry-run em produção com `ROLLBACK`: 50 linhas, nenhuma delas dinheiro, nenhum saldo histórico alterado).

### CX-2 — o relatório impresso de fechamento calculava o saldo errado (P0)

Havia **duas** rotas de relatório de caixa. A UI usava a errada.

| | `/api/cashier/report?id=` (usada) | `/api/cashier/[id]/relatorio` (sem chamador) |
|---|---|---|
| Saldo esperado | recalculado com fórmula própria | lido do banco |
| Escapa HTML | não | parcialmente |
| Movimentos, logo, CNPJ | não | sim |

A fórmula da rota usada errava em três frentes:

1. **Dobrava o saldo de abertura.** O movimento "Abertura de caixa" é um `DEPOSIT`, e a rota somava todos os depósitos *além* do saldo inicial. A sessão de R$ 288.282,00 imprimia R$ 576.564,00.
2. **Subtraía sangria e despesa que não são em espécie.** Uma sessão com 33 sangrias em PIX (R$ 194.980) imprimia gaveta **negativa**.
3. **Tratava "não conferido" como R$ 0,00.** Fechamento automático e forçado deixam o declarado NULL de propósito; a rota imprimia "Saldo Informado: R$ 0,00" e uma **FALTA fabricada**.

44 das 339 sessões fechadas imprimiam número diferente do que o banco guarda — no documento que é impresso e assinado.

**Correção.** A rota duplicada saiu; a UI aponta para a que lê do banco, que ganhou o botão de imprimir e a área de assinatura da antiga e passou a dizer "nao conferido / pendente de conferencia" quando ninguém contou a gaveta.

### CX-3 — qualquer operador imprimia o caixa de qualquer colega (P1)

`cashier.byId` recusa (`FORBIDDEN`) o caixa de outro usuário para quem não é gerência. As rotas REST de relatório autenticavam só sessão + tenant: bastava trocar o id na URL para imprimir a gaveta de um colega — todos os movimentos, valores e a divergência. Mesma classe do furo de RBAC que a exportação financeira teve (G-P0-3). **Correção:** mesma regra do tRPC na rota.

### CX-4 — XSS armazenado no relatório (P1)

`closingNote` é texto livre do operador (500 chars) e ia cru para dentro de HTML servido como `text/html` — junto com o nome do usuário e a forma de pagamento. Quem imprimia o caixa executava o script de quem o fechou. `escapeHtml` já existia em `src/lib/utils/html.ts` e não era usado. **Correção:** a rota que sobrou usa o helper compartilhado (o `esc` local dela não escapava aspas, e o `logoUrl` entra dentro de um atributo).

### CX-5 — o filtro de data do histórico misturava dois fusos (P1)

`new Date("2026-07-01")` é meia-noite **UTC** (21h BRT do dia anterior); `setHours(23,59,59)` é hora **do processo**. O dia pedido começava 3h cedo e terminava 3h cedo — caixa aberto depois das 21h caía no dia seguinte. Mesma correção que o DRE, o relatório de NF e o fluxo de caixa já receberam. **Correção:** `startOfDayBrt`/`endOfDayBrt`.

### CX-6 — a conferência apagava a contagem do operador (P2)

`review` gravava o valor contado pelo gerente **por cima** de `declaredBalance`, que é o que o operador declarou no fechamento. "O operador disse R$ 500, o gerente achou R$ 450" virava só R$ 450 — some a evidência que dá sentido à conferência. E o guard `session.verified` lia antes de escrever, sem CAS: duas conferências concorrentes passavam as duas.

**Decisão do dono:** guardar os dois. **Correção:** colunas `reviewed_balance` / `review_difference` e CAS no claim.

> Vale registrar o que a medição mostrou: **339 caixas fechados, 0 conferidos**. O fluxo de conferência nunca foi usado em produção. A passada de frontend vai exercitá-lo de verdade — o crawler já mostrou `/cashier/reviews` preso em esqueleto eterno para o operador (403 sem tratamento).

### CX-7 — duas procedures sem nenhum chamador (P2)

`getOpenSession` (cujo docstring dizia "@public-api Consumed by PDV module" — o PDV não usa) e `periodStats`. **Decisão do dono:** apagar as duas.

### Fora do módulo, encontrado no caminho

`cashflow-uses-ledger.test.ts` falhava de forma determinística ao rodar duas vezes seguidas: afiava o valor **absoluto** do dia, que agrega todos os recebíveis do tenant. Passou a aferir o **delta** que ele mesmo provoca. Verificado com duas execuções seguidas.

## Checklist de backend

| Eixo | Situação |
|---|---|
| 1. RBAC | ✅ corrigido (CX-3) |
| 2. Gating de módulo | ⚠️ rotas REST fora do tRPC não têm gate de módulo (o proxy isenta `/api/*` de propósito, ADR do incidente 307). Cross-cutting — vai para o Módulo 10 |
| 3. Validação de entrada | ✅ (`expense.paymentMethod` deixou de ser string sem sentido semântico via CX-1) |
| 4. Tenant/RLS | ✅ tudo via `withTenant`; `byId` ainda repete o `tenantId` como rede |
| 5. Concorrência | ✅ corrigido (CX-6); lock e CAS já cobriam abertura, fechamento, sangria, suprimento, despesa e ajuste |
| 6. Dinheiro | ✅ corrigido (CX-1, CX-2) |
| 7. Estoque | n/a |
| 8. Tempo (BRT) | ✅ corrigido (CX-5) |
| 9. Soft delete | n/a — `cash_sessions` não tem `deletedAt` |
| 10. Performance | ✅ 4 índices, incluindo o de `pendingReviews`; listas com `take` |
| 11. Erro e observabilidade | ✅ `logAudit` em `forceClose` e `manualAdjustment` |
| 12. Transação | ✅ sem HTTP externo |
| 13. Superfície morta | ✅ corrigido (CX-2, CX-7) |

## Decisões a preservar (Chesterton's Fence)

1. **`declaredBalance`/`difference` NULL em fechamento automático e forçado** é honestidade, não campo esquecido: ninguém contou a gaveta. Qualquer código que trate esse NULL como zero fabrica divergência — foi exatamente o que o relatório impresso fazia.
2. **`computeCashDrawerCents` é a fonte única** do esperado (manual, forçado e automático). Já divergiram; não voltem a calcular por fora.
3. **`writeCashMovement` é o escritor único** — o par `type`↔`nature` e agora a forma canônica são validados num lugar só.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit          # 2007 unit verdes
pnpm test:integration                                   # 84 arquivos, 266 testes verdes
```

Testes que **falham antes** da correção:
- `__tests__/integration/cashier-cash-method-uuid.test.ts` (CX-1, lado caixa)
- `__tests__/integration/sale-cash-method-uuid.test.ts` (CX-1, lado PDV)
- `__tests__/integration/cashier-review-keeps-operator-count.test.ts` (CX-6)
