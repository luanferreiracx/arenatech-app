# Investigação UI — Stock-B

> Data: 2026-05-17

## Rotas mapeadas

| Rota | Conteúdo | Form? | Submit redireciona? |
|------|----------|-------|---------------------|
| /stock | ProductsTable (Estoque-A) + dashboard cards | Não | — |
| /stock/entry | Form entrada: EntitySelector produto + qty + custo + fornecedor + motivo | Sim | → /stock |
| /stock/exit | Form baixa: EntitySelector produto + qty + motivo | Sim | → /stock |
| /stock/movements | Tabela de movimentações com filtros (tipo, período) | Não | — |
| /stock/purchases | Tabela de compras de aparelhos | Não | — |
| /stock/purchases/new | Form compra: brand, model, imei, serial, condition, battery, preço | Sim | → /stock/purchases |
| /stock/reports | Tabs de relatórios (posição, movimentações, ABC, etc) | Não | — |
| /stock/import | Form CSV import | Sim | — |

## Features confirmadas

- Entry form usa EntitySelector para produto (async search, Popover+Command)
- Exit form usa EntitySelector para produto
- Purchase form usa campos simples (Input com register) — NÃO precisa EntitySelector
- Movements tem filtro por tipo (select) e por período
- Reports tem tabs com diferentes relatórios
- Purchases listing mostra tabela de compras

## Features NÃO encontradas

- NÃO existe página dedicada /stock/inventory (itens individuais com IMEI)
- NÃO existe busca por IMEI na UI (procedure searchByImei existe mas sem página)
- NÃO existe página de histórico de IMEI
- NÃO existe UI de mudança de status de StockItem (máquina de estados sem UI)
- NÃO existe UI de reserva/liberação

## Bloqueio para Nível 2

Entry/Exit forms usam EntitySelector para selecionar produto — requer dados de seed (produtos no DB) para funcionar. Sem produtos, EntitySelector mostra "Nenhum resultado" e submit falha.

Purchase form é o mais acessível para Nível 2: todos campos são Input simples.

## Plano de cenários Nível 2

| # | Cenário | Mutation | Verificação |
|---|---------|----------|-------------|
| T-01 | Criar compra de aparelho com marca e modelo → aparece na listagem | submit purchase form | redirect /purchases + row visível |
| T-02 | Criar compra com IMEI → IMEI visível na listagem | submit purchase form | IMEI na listagem |
| T-03 | Entry form preenche motivo e tem submit | fillField reason | submit button enabled |
| T-04 | Exit form preenche motivo e tem submit | fillField reason | submit button visible |
| T-05 | Movimentações listagem renderiza ou vazio | gotoAndWait | table ou empty |
| T-06 | Movimentações tem filtro funcional | gotoAndWait | select/combobox visible |
| T-07 | Estoque listing mostra conteúdo | gotoAndWait | table ou empty |
| T-08 | Estoque dashboard cards visíveis | gotoAndWait | cards visible |
| T-09 | Form compra preenche IMEI e marca | fillField | values filled + submit enabled |
| T-10 | Compras listing renderiza conteúdo | gotoAndWait | table/button visible |
| T-11 | Relatórios tem tabs interativos | gotoAndWait | tabs/buttons visible |
| T-12 | Operator acessa listing (read OK) | gotoAndWait | content visible |
| T-13 | Operator acessa movimentações (read OK) | gotoAndWait | content visible |
| T-14 | Busca por termo inexistente mantém tabela | fillByPlaceholder | table visible |
| T-15 | Import CSV tem form funcional | gotoAndWait | input/button visible |

Nível 2 real possível: T-01, T-02 (purchase submit + redirect + verify in listing)
Nível 1.5: T-03, T-04, T-09 (fill without submit — EntitySelector blocks full flow)
Nível 1: T-05 a T-08, T-10 a T-15 (navigation + presence check)
