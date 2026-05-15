# Legacy: Caixa (Abertura, Fechamento, Sangria, Suprimento)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /financeiro/caixas | CaixaController@index | financeiro.caixas.index |
| GET | /financeiro/caixas/abrir | @abrirForm | .abrir.form |
| POST | /financeiro/caixas/abrir | @abrir | .abrir |
| POST | /financeiro/caixas/abrir-ajax | @abrirAjax | .abrir.ajax |
| GET | /financeiro/caixas/status-ajax | @statusAjax | .status.ajax |
| GET | /financeiro/caixas/fechar | @fecharForm | .fechar.form |
| POST | /financeiro/caixas/fechar | @fechar | .fechar |
| GET | /financeiro/caixas/movimentacoes | @movimentacoes | .movimentacoes |
| POST | /financeiro/caixas/sangria | @sangria | .sangria |
| POST | /financeiro/caixas/suprimento | @suprimento | .suprimento |
| GET | /financeiro/caixas/historico | @historico | .historico (role:gerente,admin) |
| GET | /financeiro/caixas/abertos-ajax | @caixasAbertosAjax | (role:gerente,admin) |
| GET | /financeiro/caixas/conferencias-pendentes | @conferenciasPendentes | (role:gerente,admin) |
| GET | /financeiro/caixas/conferir/{abertura} | @conferirForm | (role:gerente,admin) |
| POST | /financeiro/caixas/conferir/{abertura} | @conferir | (role:gerente,admin) |
| GET | /financeiro/caixas/abertura/{id}/relatorio | @relatorio | |
| GET | /financeiro/caixas/abertura/{id}/relatorio/pdf | @relatorioPdf | |

## 2. Controllers

### CaixaController
**Arquivo:** app/Http/Controllers/CaixaController.php (e Tenant\CaixaController)

- `index()` — Painel do caixa: se aberto, mostra movimentações do dia. Se fechado, botão abrir. Cards com saldo, entradas, saídas.
- `abrirForm()` — Form com saldo inicial.
- `abrir(Request)` — Abre caixa via CaixaService. Valida: apenas 1 caixa aberto por usuário.
- `abrirAjax(Request)` — Versão AJAX para abrir caixa inline (usado pelo PDV).
- `statusAjax()` — Retorna JSON com status do caixa (aberto/fechado, saldo).
- `caixasAbertosAjax()` — Retorna JSON com todos os caixas abertos (gerente/admin).
- `fecharForm()` — Form de fechamento: mostra saldo calculado, pede conferência por forma de pagamento.
- `fechar(Request)` — Fecha caixa. Compara saldo informado vs calculado. Registra diferenças. Gera relatório.
- `movimentacoes()` — Lista movimentações do caixa aberto atual.
- `sangria(Request)` — Retira dinheiro do caixa (valor, motivo). Registra CaixaMovimentacao tipo sangria.
- `suprimento(Request)` — Adiciona dinheiro ao caixa (valor, motivo). Registra tipo suprimento.
- `historico(Request)` — Lista aberturas/fechamentos. role:gerente,admin.
- `relatorio(CaixaAbertura)` — Relatório detalhado de uma abertura: movimentações, resumo por forma, diferenças.
- `relatorioPdf(CaixaAbertura)` — PDF do relatório.
- `conferenciasPendentes()` — Caixas fechados automaticamente (job) que precisam de conferência manual.
- `conferirForm/conferir` — Gerente confere caixa fechado: informa valores reais por forma, registra divergências.

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### Caixa
**Tabela:** `caixas`
- id, nome, usuario_padrao_id, ativo
- **Relações:** aberturas (hasMany), usuarioPadrao, aberturaAtual (hasOne where fechado_em=null)
- **Accessors:** estaAberto, saldoAtual, status, statusCor
- **Método:** `abrir(usuarioId, saldoInicial, observacao)` — Cria CaixaAbertura dentro de transaction.

### CaixaAbertura
**Tabela:** `caixa_aberturas`
- id, caixa_id, usuario_id, saldo_inicial, saldo_final, saldo_informado, saldo_diferenca, observacoes, aberto_em, fechado_em, fechado_por_id, tipo_fechamento (manual/automatico), conferido, conferido_em, conferido_por_id
- **Relações:** caixa, usuario, fechadoPor, movimentacoes (hasMany)
- **Accessors:** saldoCalculado (saldo_inicial + entradas - saídas), totalEntradas, totalSaidas

### CaixaMovimentacao
**Tabela:** `caixa_movimentacoes`
- id, abertura_id, tipo (venda/sangria/suprimento/estorno/despesa/ajuste), natureza (entrada/saida), valor, forma_pagamento, referencia_tipo, referencia_id, descricao, usuario_id, criado_em
- **Relações:** abertura, usuario

## 5. Services

### CaixaService
- `getOuCriarCaixaDoUsuario(usuarioId)` — Cria caixa se não existe.
- `abrir(Caixa, usuarioId, saldoInicial, observacao)` — Valida caixa não aberto. Cria CaixaAbertura.
- `getCaixaAbertoDoUsuario(usuarioId)` — Retorna CaixaAbertura ativa ou null.
- `registrarVenda(CaixaAbertura, PdvVenda)` — Cria movimentação(ões) de venda. Se pagamento misto, uma movimentação por forma.
- `registrarSangria(abertura, valor, motivo, usuarioId)` — Movimentação de sangria (saída).
- `registrarSuprimento(abertura, valor, motivo, usuarioId)` — Movimentação de suprimento (entrada).
- `registrarDespesa/registrarEstorno/registrarAjuste` — Outras movimentações.
- `calcularSaldo(abertura)` — saldo_inicial + entradas - saídas.
- `fechar(abertura, saldoInformado, observacoes, fechadoPorId)` — Fecha caixa, calcula diferenças, registra.
- `gerarRelatorioFechamento(abertura)` — Dados para relatório.
- `resumoPorFormaPagamento(abertura)` — Agrupa movimentações por forma de pagamento.
- `verificarSangriaAutomatica(abertura)` — Verifica se saldo excede limite configurado.

## 6. Jobs

### FecharCaixasAbertos
**Arquivo:** app/Jobs/FecharCaixasAbertos.php
- Fecha caixas que ficaram abertos por mais de X horas. Tipo_fechamento = "automatico". Gera conferência pendente.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

Nenhuma.

## 9. Migrations

- caixas, caixa_aberturas, caixa_movimentacoes

## 10. Views

- resources/views/financeiro/caixas/ — index, abrir, fechar, movimentacoes, historico, relatorio, conferir

## 11. Policies

- Operacional (qualquer user com permissão usa_caixa=true): abrir, fechar, sangria, suprimento, relatório próprio
- Gerencial (gerente/admin): histórico, caixas abertos, conferências pendentes, conferir

## 12. Comandos Artisan customizados

Nenhum.

## 13. Scheduled tasks

- FecharCaixasAbertos — fecha caixas abertos há mais de X horas.

## 14. Dependências cruzadas

- **Usado por PDV** — PdvService.finalizarVenda cria CaixaMovimentacao
- **Usado por OS** — Pagamento de OS verifica caixa aberto
- **Usa Model PdvVenda** — referência na movimentação

## 15. Configurações / .env vars

Nenhuma específica.

## 16. Observações técnicas relevantes

1. **1 caixa aberto por usuário** — Validação server-side. Não permite múltiplos caixas abertos.
2. **Conferência de caixas fechados automaticamente** — Job fecha caixas esquecidos abertos. Gerente precisa conferir depois.
3. **Resumo por forma de pagamento** — No fechamento, mostra totais por forma (dinheiro, PIX, cartão) para conferência.
4. **Saldo com diferenças** — Calcula diferença entre saldo informado e calculado. Registra para auditoria.
5. **AJAX para PDV** — abrirAjax e statusAjax são usados pelo PDV para verificar/abrir caixa sem recarregar página.
