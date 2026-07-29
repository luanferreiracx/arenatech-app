# Módulo 2 — PDV / Vendas

**Passada A (backend):** concluída em 2026-07-29.
**Passada B (frontend):** concluída em 2026-07-29.

## Superfície

| | |
|---|---|
| Router | `src/server/api/routers/sale.ts` (37 procedures, 4.5k linhas) |
| Bibliotecas | `src/lib/sales/` (`discount-cap`, `sale-discount`, `sale-revenue`) |
| Serviços | `finalize-idempotency.service.ts`, `card-payment-guard.ts`, `refund-coverage.service.ts` |
| Rotas REST | `/api/pdv/[id]/recibo`, `/termo-entrega`, `/termo-garantia` |
| SSE | `/api/sse/sale/[saleId]` |
| Página pública | `/receipt/[token]` |
| Telas | `/pdv`, `/pdv/[id]`, `/pdv/history` |

## Invariantes que o módulo promete

1. Uma venda finalizada não pode ser finalizada duas vezes, nem gerar estoque/caixa em dobro.
2. Estoque só sai se havia saldo — sem oversell sob concorrência.
3. Venda em dinheiro exige caixa aberto e entra na gaveta.
4. O desconto que um operador pode dar tem teto, e o teto vale para a venda inteira.
5. O que é público por link é só o que faz sentido ser público.
6. Toda venda concluída tem contrapartida financeira coerente (parcela, recebível de cartão ou caixa).

Quebraram a **4** e a **5**.

## Prova de dados (snapshot de produção, 2026-07-29)

| Medição | Valor |
|---|---|
| Vendas concluídas | 2.457 |
| Teto de desconto do operador (arena-tech) | **10%** |
| Desconto máximo alcançável empilhando override + carrinho | **19%** |
| Vendas com forma de pagamento gravada como UUID | **61** |
| …dessas, sem o rótulo legível gravado | **37** |
| Vendas em rascunho servidas pelo recibo público | **6** |
| Vendas feitas depois das 21h BRT (caíam no dia seguinte no filtro) | **8** (R$ 15.406,67) |

## Achados

### PDV-1 — o teto de desconto do operador podia ser somado duas vezes (P1)

O teto (`maxDiscountPercentNonAdmin`) é aplicado em dois lugares: no desconto do
carrinho (`applyDiscount`) e no override de preço do item (`updateItemPrice`). Um
comentário no código diz que a fonte é única "para que o operador não contorne o
teto baixando o preço do item" — e de fato as duas chamam o mesmo helper. Mas
**cada uma mede o próprio pedaço isoladamente**, e `applyDiscount` mede contra o
subtotal dos itens, que já vem **reduzido pelos overrides**.

Com teto de 10%: baixa cada item 10% → passa; aplica 10% no carrinho, medido
sobre o que sobrou → passa. Desconto real sobre a tabela: **19%**. Funciona nos
dois sentidos (carrinho primeiro, item depois).

**Correção.** `cartDiscountPercent` mede quanto o cliente deixa de pagar em
relação à **tabela**, somando override de item e desconto de carrinho, e o teto
decide uma vez sobre o carrinho inteiro. Markup (cobrar acima da tabela) não vira
crédito para descontar mais em outra linha.

### PDV-2 — o recibo público servia rascunho e mostrava telefone (P1)

`sale.byPublicLink` — o procedure — restringe a `COMPLETED/REFUNDED/
PARTIALLY_REFUNDED`, filtra soft delete, tem rate limit de 30/min por IP e
devolve uma lista branca de campos. O comentário explica o porquê: *"Vazaria
rascunho/cancelada via link enumeravel"*.

**Nenhuma tela chama esse procedure.** A página `/receipt/[token]` busca direto
no Prisma, **só pelo token**: sem filtro de status, sem `deletedAt`, sem rate
limit — e renderizando `customer.phone`, que a versão endurecida deliberadamente
não devolve. Produção tinha **6 rascunhos** alcançáveis como "Recibo de Compra".

É o mesmo padrão do relatório de caixa no Módulo 1: **duas implementações, o
endurecimento numa e os usuários na outra.** Vale registrar como sintoma
recorrente, não como coincidência.

**Correção.** A página passou a aplicar as mesmas regras e parou de mostrar o
telefone. *(Se você quiser o telefone de volta no recibo, é decisão sua — o
argumento para tirar é que o link, se vazar, leva o dado junto.)*

### PDV-3 — o recibo do cliente imprimia o id da forma de pagamento (P2)

Quando a loja cadastra a própria forma de pagamento, o PDV grava o **id** dela em
`payment_details[].method`. O recibo faz `PAYMENT_LABELS[method] ?? method` — e
para um id não há entrada no mapa, então saía `a6b9e67e-9c9f-4e90-8eca-…` onde
deveria estar "PIX", num documento entregue ao cliente. **61 vendas** em produção.

O `methodLabel` legível já é gravado no finalize desde uma correção anterior — o
recibo simplesmente não o consultava. **Correção:** passa a preferir o rótulo, e
migration preenche os **37** históricos que não o têm (dry-run em produção com
`ROLLBACK`: 37 linhas, 0 restantes).

### PDV-4 — o filtro de data do histórico de vendas ignorava o fuso (P2)

`new Date("2026-07-01")` é meia-noite **UTC**; `setHours(23,59,59)` é hora do
processo. Venda feita depois das 21h BRT caía fora do dia filtrado: **8 vendas,
R$ 15.406,67**. Quarto lugar do sistema com o mesmo defeito — DRE, relatório de
NF, fluxo de caixa e caixa já tinham sido corrigidos.

## Achados da passada de frontend

### PDV-5 — o PDV não cabia na tela do celular (P1)

O cabeçalho (`PDV - Ponto de Venda` + badge de caixa + "Consultar Preço" +
"Nova Venda") era um `flex` sem `flex-wrap`. A 390px isso empurrava a **página
inteira** para o scroll horizontal: medido **546px de conteúdo numa viewport de
390**. Na prática, no celular a tela do PDV aparecia cortada — o botão "Nova
Venda" saía pela direita, a tabela do carrinho ficava truncada e o total sumia.

O mesmo em `/pdv/history`, pela faixa de abas (`w-fit`, sem wrap).

### PDV-6 — `shrink-0` no PageHeader anulava o `flex-wrap` de dentro (P1, transversal)

O componente compartilhado `PageHeader` embrulha as ações em
`flex flex-wrap items-center gap-2 **shrink-0**`. O `shrink-0` impede o bloco de
encolher, então ele cresce até caber tudo numa linha — e o `flex-wrap` de dentro
**nunca dispara**. Medido no detalhe da venda: o bloco de 7 botões (Recibo,
Garantia, Entrega, Enviar recibo, Enviar termo, Cancelar, Estornar) ocupava
**1063px** numa viewport de 390.

É a regra que a skill de React já documenta: `flex-wrap`/`truncate` em filho de
flex exige `min-w-0` na cadeia de ancestrais. Trocado `shrink-0` por `min-w-0` —
**vale para toda tela do app que tenha várias ações no cabeçalho**, não só o PDV.

### PDV-3, segunda superfície — o histórico também mostrava pedaço de UUID (P2)

A passada de backend corrigiu o **recibo**. O navegador mostrou o mesmo defeito
na **tabela do histórico**: a coluna "Pagamento" fazia
`paymentKey.toUpperCase().slice(0, 6)` no fallback e imprimia `A6B9E6` como se
fosse o nome da forma. Corrigido para preferir o `methodLabel`; verificado no
navegador (o badge passou a mostrar `PIX`).

> Vale registrar o método: a leitura de código encontrou **uma** superfície do
> defeito; o navegador encontrou a **segunda**. É exatamente a lacuna que esta
> passada existe para cobrir.

## Reconciliação tela × banco

Conferido no navegador contra a mesma consulta no banco:

| Tela | Banco | Bate? |
|---|---|---|
| 2457 Finalizadas | 2457 | ✅ |
| 18 Estornadas | 18 | ✅ |
| 284 vendas no mês | 284 | ✅ |

**Observação de qualidade de dado (não é defeito do código):** há 9 vendas
concluídas, não-OS, **sem nenhum item** — todas de fev/mar 2026, ou seja,
anteriores à migração do Laravel. As 36 restantes sem item são pagamentos de OS,
que por desenho não têm `sale_items`. Nenhuma foi produzida pelo código atual.

## Checklist de frontend

| Eixo | Situação |
|---|---|
| 1. Erro visível | ✅ (herda a correção transversal do Módulo 1) |
| 2. Carregando / disabled | ✅ `payment-dialog` tem guard de reentrância — decisão a preservar |
| 3. Invalidação após mutação | ✅ badge de caixa revalida (corrigido em auditoria anterior) |
| 4. Estado vazio | ✅ |
| 5. Permissão | ✅ custo/margem removidos para não-admin no `getById` |
| 6. Formatação pt-BR | ✅ `MoneyInput` em todo campo de dinheiro |
| 7. Mobile 390px | ✅ corrigido (PDV-5, PDV-6) — 12 combinações limpas |
| 8. Acessibilidade | ✅ sem `aria-hidden` indevido; foco preservado |
| 9. Reconciliação | ✅ 3 de 3 números batem |
| 10. Console e rede | ✅ 0 erro, 0 4xx/5xx não tratado |
| 11. Fluxo incompleto | ⚠️ `sale.byPublicLink` segue sem chamador — a página pública agora aplica as mesmas regras; unificar as duas fica como dívida registrada |

## Nota de método — um falso P0 que não virou achado

A primeira varredura acusou `/pdv/[id]` **quebrada** nas 4 combinações, com
"Venda não encontrada" e o cliente tRPC recebendo HTML (`Unexpected token '<'`).
Parecia grave. Era **artefato do próprio ambiente**: eu havia apagado
`.next/dev/types` com o servidor de desenvolvimento no ar, e o Next passou a
responder 404 em rota de API. Com `.next` limpo e o servidor reiniciado, 0
quebradas.

Registrado porque a regra vale para o programa inteiro: **achado de varredura é
hipótese até reproduzir em ambiente limpo.**

## Checklist de backend

| Eixo | Situação |
|---|---|
| 1. RBAC | ✅ `refund`, `updateSaleDate` e `updateSaleSeller` são admin; `cancel` só aceita DRAFT; custo removido para não-admin no `getById` |
| 2. Gating de módulo | ⚠️ rotas REST fora do tRPC sem gate de módulo — cross-cutting, Módulo 10 |
| 3. Validação de entrada | ✅ |
| 4. Tenant/RLS | ✅ tudo via `withTenant`; `withAdmin` só no que é público por design |
| 5. Concorrência | ✅ `claimDraftSaleForFinalize`, CAS de estoque, claim do estorno, claim da recompensa, idempotência de replay |
| 6. Dinheiro | ✅ corrigido (PDV-1); `recalculateSale` como fonte única já estava |
| 7. Estoque | ✅ CAS com `currentStock >= qty` e `StockItem` por `updateMany` |
| 8. Tempo (BRT) | ✅ corrigido (PDV-4) |
| 9. Soft delete | ✅ corrigido no recibo público (PDV-2); demais leituras já filtravam |
| 10. Performance | ✅ listas paginadas; sem N+1 evidente nos caminhos lidos |
| 11. Erro e observabilidade | ✅ divergência de valor DePix é fail-open **com** log e audit — decisão do dono, registrada |
| 12. Transação | ✅ revalidação DePix (HTTP) roda FORA da transação de finalização, de propósito |
| 13. Superfície morta | ⚠️ `sale.byPublicLink` não tem chamador. **Mantido** — é a versão correta; o certo é a página passar a usá-la (proposta para a passada de frontend) |

## Decisões a preservar (Chesterton's Fence)

1. **A revalidação DePix acontece antes de abrir a transação** — HTTP dentro da transação seguraria os locks de estoque no hot-path do PDV.
2. **Replay idempotente do finalize** devolve a venda já concluída quando o request é o mesmo, em vez de um erro que faria o operador refazer a venda.
3. **Divergência de valor DePix é fail-open com registro** — decisão do dono: não travar o balcão, mas deixar rastro para conciliação.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit      # 2007 verdes
pnpm test:integration                               # 86 arquivos, 273 testes verdes (2 execuções seguidas)
```

Testes que **falham antes** da correção:
- `__tests__/integration/sale-discount-cap-stacking.test.ts` (PDV-1 — 2 dos 3; o terceiro é o controle de que desconto legítimo continua passando)
- `__tests__/integration/sale-public-receipt-guard.test.ts` (PDV-2)

## Lição de teste registrada

O teste do teto criava a linha de `tenant_receiving_settings` quando ela não
existia — e criar do zero traz os **defaults** junto (`minInstallmentValue` =
R$ 50), o que reprovava outro arquivo da suíte que finaliza venda parcelada.
Restaurar um campo não basta: **se o teste criou a linha, tem que apagá-la**.
