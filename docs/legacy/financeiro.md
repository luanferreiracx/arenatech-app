# Legacy: Financeiro (Contas a Pagar, Contas a Receber, Relatórios)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Financeiro Geral (role:gerente,admin)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /financeiro | FinanceiroController@index | financeiro.index |
| GET | /financeiro/recebimentos | @recebimentos | financeiro.recebimentos |
| GET | /financeiro/pendentes | @pendentes | financeiro.pendentes |
| GET | /financeiro/dre | @dre | financeiro.dre |
| GET | /financeiro/fluxo-caixa | @fluxoCaixa | financeiro.fluxo-caixa |

### Contas a Receber
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /financeiro/contas-receber | ContaReceberController@index | |
| GET | /financeiro/contas-receber/criar | @create | |
| POST | /financeiro/contas-receber | @store | |
| GET | /financeiro/contas-receber/{id} | @show | |
| PUT | /financeiro/contas-receber/{id} | @update | |
| POST | /financeiro/contas-receber/{id}/cancelar | @cancelar | |
| POST | /financeiro/contas-receber/parcelas/{id}/baixar | @baixarParcela | |
| POST | /financeiro/contas-receber/parcelas/{id}/estornar | @estornarParcela | |

### Contas a Pagar (mesma estrutura)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /financeiro/contas-pagar | ContaPagarController@index | |
| ... | (mesma estrutura de CR) | | |

### Formas de Pagamento (gerente/admin)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /financeiro/formas-pagamento | FormaPagamentoController@index | |
| GET | /financeiro/formas-pagamento/{forma} | @show | |
| PUT | /financeiro/formas-pagamento/{forma}/taxas | @atualizarTaxas | |
| PUT | /financeiro/formas-pagamento/configuracao | @atualizarConfiguracao | |

### APIs públicas (qualquer auth)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /api/formas-pagamento/lista | FormaPagamentoController@lista | |
| GET | /api/formas-pagamento/calcular | @calcular | |
| GET | /api/formas-pagamento/tabela | @tabela | |

## 2. Controllers

### FinanceiroController
- `index(Request)` — Dashboard financeiro: receitas, despesas, saldo, gráficos por período.
- `recebimentos(Request)` — Lista de recebimentos com filtros: período, forma pagamento, status. Agrupa por origem (PDV, OS, manual).
- `pendentes(Request)` — Lista de parcelas vencidas/a vencer.
- `dre(Request)` — DRE (Demonstrativo de Resultado): receitas - despesas = resultado. Por período.
- `fluxoCaixa(Request)` — Fluxo de caixa: entradas e saídas agrupadas por dia/semana/mês.

### ContaReceberController
- `index(Request)` — Lista com filtros: status, período, origem, cliente.
- `create()` — Form de criação manual (cliente, valor, forma pagamento, parcelas, vencimento, categoria, observações).
- `store(Request)` — Cria ContaReceber + gera parcelas automaticamente. Divisão proporcional (última recebe resto).
- `show($id)` — Detalhe: dados, parcelas com status, pagamentos.
- `update(Request, $id)` — Atualiza (apenas se nenhuma parcela paga).
- `cancelar($id)` — Cancela conta e todas parcelas pendentes.
- `baixarParcela(Request, $id)` — Paga parcela: valor_pago, forma_pagamento, data_pagamento. Registra CaixaMovimentacao se caixa aberto.
- `estornarParcela(Request, $id)` — Estorna parcela paga. Registra estorno no caixa.

### ContaPagarController
- Mesma estrutura do ContaReceberController mas para despesas.

### FormaPagamentoController
- CRUD de formas de pagamento ativas.
- Configuração de taxas por forma e por parcela.
- APIs para PDV consultar formas disponíveis e calcular valores com taxa.

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### ContaReceber
**Tabela:** `contas_receber`
- id, descricao, valor_total, valor_pago, status (pendente/parcialmente_pago/pago/cancelado/vencido), origem_tipo (pdv_venda/ordem_servico/manual), origem_id, cliente_id, categoria_id, forma_pagamento, parcelas_total, data_vencimento_primeira, observacoes, usuario_id
- **Relações:** parcelas (hasMany), categoria, cliente, usuario, origem (morphTo-like via tipo+id)
- **Método recalcularStatus()** — Recalcula status baseado nas parcelas: se todas pagas → pago, se alguma → parcialmente_pago, se vencida → vencido.

### ContaReceberParcela
**Tabela:** `contas_receber_parcelas`
- id, conta_receber_id, numero_parcela, valor, valor_pago, status (pendente/pago/vencido/cancelado), data_vencimento, data_pagamento, forma_pagamento_efetiva, observacoes
- **Método baixar(valorPago, formaPagamento, observacoes)** — Transaction: atualiza parcela, registra CaixaMovimentacao, recalcula status da conta.

### ContaPagar / ContaPagarParcela
- Estrutura espelhada do ContaReceber/Parcela.
- Campos adicionais: fornecedor_id (opcional), categoria_financeira_id.

### FormaPagamento
**Tabela:** `formas_pagamento`
- id, nome, slug, tipo (dinheiro/pix/cartao_credito/cartao_debito/crediario), ativo, ordem

### FormaPagamentoTaxa
**Tabela:** `formas_pagamento_taxas`
- forma_pagamento_id, parcelas, taxa_percentual, taxa_fixa

### CategoriaFinanceira
**Tabela:** `categorias_financeiras`
- id, nome, tipo (receita/despesa), ativo

## 5. Services

### FinanceiroService
- `gerarRecebiveisVenda(PdvVenda)` — Cria ContaReceber + parcelas para venda. Se cartão crédito parcelado, gera parcelas com vencimentos mensais.
- `gerarPagavelDowngrade(PdvVenda, valorDevolver, clienteNome)` — Gera ContaPagar quando upgrade resulta em valor a devolver ao cliente.
- `gerarRecebiveisOS(OrdemServico)` — Cria ContaReceber para pagamento de OS (forma_pagamento, parcelas da OS).
- `cancelarRecebiveisVenda(PdvVenda)` — Cancela contas a receber de uma venda cancelada.

## 6. Jobs

Nenhum específico.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

Nenhuma direta. DePix é tratado em módulo separado.

## 9. Migrations

- contas_receber, contas_receber_parcelas, contas_pagar, contas_pagar_parcelas, formas_pagamento, formas_pagamento_taxas, categorias_financeiras

## 10. Views

- **financeiro/index.blade.php** — Dashboard financeiro
- **financeiro/recebimentos.blade.php** — Listagem de recebimentos
- **financeiro/pendentes.blade.php** — Parcelas pendentes/vencidas
- **financeiro/dre.blade.php** — DRE
- **financeiro/fluxo-caixa.blade.php** — Fluxo de caixa
- **financeiro/formas-pagamento/** — Configuração de formas e taxas

## 11. Policies

Financeiro restrito a role:gerente,admin via middleware.

## 12. Comandos Artisan customizados

Nenhum.

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Chamado pelo PDV** — PdvService cria ContaReceber via FinanceiroService
- **Chamado pela OS** — Pagamento de OS gera recebiveis
- **Usa Caixa** — Baixa de parcela registra no caixa
- **Usa Cliente/Fornecedor** — Vínculos nas contas

## 15. Configurações / .env vars

Nenhuma específica.

## 16. Observações técnicas relevantes

1. **Origem polimórfica** — ContaReceber.origem_tipo + origem_id funciona como morphTo manual (pdv_venda, ordem_servico, manual).
2. **DRE** — Demonstrativo simplificado: receitas (contas recebidas) - despesas (contas pagas) por período.
3. **Fluxo de caixa projetado** — Inclui parcelas futuras (a vencer) para projeção.
4. **Formas de pagamento configuráveis** — Admin define formas ativas, taxas por parcela. PDV consome via API.
5. **Categorias financeiras** — Classificação de receitas/despesas por categoria (aluguel, salários, serviços, etc.).
