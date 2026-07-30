# Módulo 5 — Financeiro

**Passada A (backend):** concluída em 2026-07-29.
**Passada B (frontend):** concluída em 2026-07-29.

## Superfície

| | |
|---|---|
| Routers | `financial.ts` (1.734), `receiving.ts` (810), `recurring-expense.ts` (148) |
| Serviços | `installment-ledger`, `installment-generator`, `card-receivable`, `card-receivable-writer`, `cash-flow-projection`, `financial-category`, `financial-supplier` |
| Rotas REST | `/api/financial/export` |
| Cron | `mark-overdue` (03:00), `generate-recurring-expenses` (05:00) |
| Telas | `/financial/*` (13) |

## Invariantes que o módulo promete

1. Todo pagamento passa pelo ledger (`installment_payments`) — regime de caixa por evento.
2. Estorno lança contrapartida, não apaga o original.
3. Card, DRE e fluxo de caixa contam a mesma história do mesmo dinheiro.
4. Filtro por período respeita o dia de quem opera.
5. Custo e conta a pagar não vazam para operador.

Quebrou a **4** — e de um jeito que a correção óbvia teria piorado.

## Prova de dados (snapshot de produção, 2026-07-29)

| Medição | Valor |
|---|---|
| Transações financeiras | 1.293 |
| `emission_date` gravada **exatamente à meia-noite** | **709** de 777 |
| `installments.due_date` à meia-noite / com hora | 1.218 / 954 |
| `installment_payments.paid_at` à meia-noite / com hora | 356 / **1.360** |
| Pagamentos **de verdade** feitos entre 21h e 24h BRT | **3** |
| `card_receivables.expected_settlement_date` com hora | **156 de 156** |
| Procedures sem tela | **0** |

## Achados

### FIN-1 — os filtros por período tratam duas semânticas de data como se fossem uma (P2)

O sistema guarda **data pura** e **instante** na mesma forma (`timestamp` sem
fuso), e os filtros aplicavam a mesma conta nas duas:

- **data pura** — `emissionDate`, `dueDate`: o app grava **meia-noite UTC** porque o que importa é o dia. 709 de 777 emissões estão em `00:00:00`.
- **instante** — `paidAt`, `expectedSettlementDate`: hora de verdade. 1.360 de 1.716 pagamentos têm hora; 156 de 156 previsões de liquidação têm hora.

A armadilha é contraintuitiva e vale registrar, porque **a correção óbvia teria
quebrado o módulo**: aplicar BRT numa data pura **exclui o próprio dia** —
meia-noite UTC (`00:00Z`) é anterior ao início do dia BRT (`03:00Z`). Eu ia
aplicar `startOfDayBrt` em tudo, como fiz nos módulos 1 a 3; medir a distribuição
das colunas antes é o que impediu a regressão.

Cada semântica ganhou sua faixa em `src/lib/utils/date-filter.ts`:

| | Faixa | Por quê |
|---|---|---|
| `pureDateRange` | `[dia 00:00Z, dia+1 00:00Z)` | meio-aberta, independe do fuso do processo — o `setHours(23,59,59)` anterior variava conforme o servidor |
| `instantRange` | `[00:00 BRT, 23:59:59 BRT]` | ancora no dia de quem operou |

Aplicado em: `financial.list` (emissão → pura), `financial.listPayments` e o
filtro aninhado de parcelas (pagamento → instante), `receiving` (previsão de
liquidação → instante).

**Impacto real, sem inflar:** apenas **3 pagamentos** em produção foram feitos
entre 21h e 24h BRT e caíam no dia seguinte. Os 356 pagamentos "à meia-noite"
que uma contagem ingênua somaria são legado da migração, não pagamentos
noturnos. O defeito é real e a correção é barata, mas a magnitude aqui é pequena
— diferente do estoque (531 movimentos) e do caixa.

## Verificado e descartado (não viraram achado)

Registrado para não ser re-investigado:

- **Superfície morta: zero.** Nenhuma das procedures dos três routers está sem chamador — o primeiro módulo do programa em que isso acontece.
- **`/api/financial/export`** tem `isTenantAdmin` e força `RECEIVABLE` para não-admin (corrigido em #575). Confirmado presente.
- **DRE e fluxo de caixa** já leem do ledger e já usam BRT (#581, #714). Não foram tocados.
- **Ledger como ponto único** (`recordCashPaidTransaction` / `recordInstallmentPayment`) segue íntegro.

## Achados da passada de frontend

Varredura das 13 telas × admin/operador × desktop/mobile = 52 combinações.

### FIN-2 — o campo "Forma de Pagamento" não renderizava (P1)

`/financial/new` tinha `<SelectItem value="">Nenhuma</SelectItem>`. O Radix
**lança exceção** nesse caso — string vazia é reservada para limpar a seleção.
O `ErrorBoundary` engolia a exceção e o campo simplesmente **não aparecia**, nas
quatro combinações de papel e viewport.

Ninguém reclamou porque o campo é opcional: quem cria conta a pagar/receber
manualmente só não conseguia informar a forma. Mas o log do console gritava em
toda visita — e ninguém lê console em produção.

Corrigido com sentinela (`__sem_forma__`), como a tela de recebíveis de cartão já
fazia. Varri o app: **era o único caso**.

### FIN-3 — a tela financeira imprimia o id da forma de pagamento (P2)

A coluna "Forma Pgto" das contas a receber mostrava
`a6b9e67e-9c9f-4e90-8eca-4aa3fc10397a` no lugar de "PIX".

**Terceira superfície do mesmo defeito.** O recibo do cliente foi corrigido no
Módulo 2 (backend) e a tabela do histórico de vendas no Módulo 2 (frontend) — e
nenhuma leitura de código desses dois módulos levaria a esta tela. Só o navegador
levou.

Medido: **53 transações** em produção, todas da forma "PIX" do arena-tech, entre
23/06 e 28/07. Duas frentes:

- **para frente:** o `finalize` passou a gravar o token canônico em
  `financialTransaction`/`serviceOrder.paymentMethod` (já tinha os tokens
  resolvidos em mãos desde o Módulo 2, só não os usava aqui);
- **para trás:** migration normaliza as 53 (dry-run em produção com `ROLLBACK`,
  0 restantes).

> Vale a lição de método: um defeito de rótulo apareceu em **três telas
> diferentes**, em três passadas diferentes. Quando um valor cru vaza para a
> interface, convém procurar todas as saídas dele de uma vez — foi o que passei a
> fazer com `grep` de `SelectItem value=""` e do padrão de UUID.

## Reconciliação tela × banco

| Tela (`/financial`) | Banco | |
|---|---|---|
| 15 contas pendentes a receber | 15 | ✅ |
| 164 contas recebidas no mês | — conferido pelo mesmo recorte | ✅ |
| A Pagar: 141 contas, 135 pagas | 141 / 135 | ✅ |

## Checklist de frontend

| Eixo | Situação |
|---|---|
| 1. Erro visível | ⚠️ o `ErrorBoundary` esconde crash de componente sem avisar o usuário — ver nota |
| 2. Carregando / disabled | ✅ input de liquidação já usa `MoneyInput` (#720) |
| 3. Invalidação após mutação | ✅ |
| 4. Estado vazio | ✅ |
| 5. Permissão | ✅ operador não vê A Pagar |
| 6. Formatação pt-BR | ✅ `tabular-nums` nas colunas de valor |
| 7. Mobile 390px | ✅ 52 combinações limpas (herda as correções de primitivo dos M2–M4) |
| 8. Acessibilidade | ✅ |
| 9. Reconciliação | ✅ 3 de 3 |
| 10. Console e rede | ✅ corrigido (FIN-2) |
| 11. Fluxo incompleto | ✅ nada pendente |

### Nota para o Módulo 10 — o ErrorBoundary esconde crash de componente

O FIN-2 mostrou que um componente pode lançar, ser capturado pelo
`ErrorBoundaryHandler` e **desaparecer silenciosamente**: nenhuma mensagem para o
usuário, nenhum sinal na tela, só console. Isso é uma decisão de arquitetura de
frontend (fallback por região), não um bug desta tela — vai para a passada do
Módulo 10, junto com o gating de rotas REST e o trade-off de lockout no login.

## Checklist de backend

| Eixo | Situação |
|---|---|
| 1. RBAC | ✅ export gateado; PAYABLE fora do alcance do operador |
| 2. Gating de módulo | ✅ `financial`/`receiving`/`recurringExpense` mapeados |
| 3. Validação de entrada | ✅ |
| 4. Tenant/RLS | ✅ |
| 5. Concorrência | ✅ CAS no `cancel` e lock de caixa no `payInstallment`/`reverseInstallment` (#711) |
| 6. Dinheiro | ✅ ledger como ponto único |
| 7. Estoque | n/a |
| 8. Tempo (BRT) | ✅ corrigido (FIN-1), com a distinção que faltava |
| 9. Soft delete | ✅ |
| 10. Performance | ✅ |
| 11. Erro e observabilidade | ✅ |
| 12. Transação | ✅ |
| 13. Superfície morta | ✅ nada a remover |

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit    # 2013 verdes
pnpm test:integration                             # 88 arquivos, 279 testes verdes
```

`__tests__/unit/date-filter.test.ts` trava as duas semânticas — inclusive o caso
que a correção ingênua quebraria (data pura sumindo do próprio dia).
