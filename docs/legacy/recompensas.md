# Legacy: Recompensas (Cashback, Campanhas, Ações)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Admin — Validação de Ações
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /admin/recompensas | RecompensaController@index | admin.recompensas.index |
| GET | /admin/recompensas/{id} | @show | admin.recompensas.show |
| POST | /admin/recompensas/{id}/aprovar | @aprovar | admin.recompensas.aprovar |
| POST | /admin/recompensas/{id}/rejeitar | @rejeitar | admin.recompensas.rejeitar |
| POST | /admin/recompensas/{id}/cancelar | @cancelar | admin.recompensas.cancelar |
| GET | /admin/recompensas/link-compartilhamento | @linkCompartilhamento | admin.recompensas.link |

### Admin — Configurações
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /admin/recompensas/configuracoes | RecompensaConfiguracaoController@index | |
| PUT | /admin/recompensas/configuracoes | @update | |
| PUT | /admin/recompensas/configuracoes/tipo/{tipo} | @updateRegraTipo | |

### Admin — Campanhas
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET-POST-PUT-DELETE | /admin/recompensas/campanhas/* | RecompensaCampanhaController (resource) | |
| POST | /admin/recompensas/campanhas/{id}/ativar | @ativar | |
| POST | /admin/recompensas/campanhas/{id}/desativar | @desativar | |

### Admin — Utilização de Cashback
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /admin/recompensas/utilizar | RecompensaUtilizacaoController@index | |
| POST | /admin/recompensas/utilizar/buscar | @buscarCliente | |
| POST | /admin/recompensas/utilizar/debitar | @utilizar | |
| GET | /admin/recompensas/utilizar/historico/{clienteId} | @historico | |

### Admin — Relatórios
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /admin/recompensas/relatorios/dashboard | RecompensaRelatorioController@dashboard | |
| GET | /admin/recompensas/relatorios/financeiro | @financeiro | |
| GET | /admin/recompensas/relatorios/clientes | @clientes | |
| GET | /admin/recompensas/relatorios/efetividade | @efetividade | |

### Cadastro Público
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /participe | RecompensaCadastroController@index | recompensa.cadastro |
| POST | /participe | @store | recompensa.cadastro.store |
| GET | /participe/confirmacao | @confirmacao | |
| GET | /participe/buscar-cliente | @buscarCliente | |

## 2. Controllers

### RecompensaController (admin)
- `index(Request)` — Lista ações de recompensa pendentes de validação. Filtros: status, tipo, período.
- `show($id)` — Detalhe: cliente, tipo publicação (story/reels), link/evidência, valores.
- `aprovar(Request, $id)` — Aprova ação: credita cashback no saldo do cliente via RecompensaService.
- `rejeitar(Request, $id)` — Rejeita com motivo.
- `cancelar(Request, $id)` — Cancela ação aprovada (debita cashback).
- `linkCompartilhamento()` — Gera/exibe link público para clientes participarem.

### RecompensaConfiguracaoController
- `index()` — Configurações gerais: percentuais de cashback por tipo de publicação, validade, limites.
- `update(Request)` — Atualiza config global.
- `updateRegraTipo(Request, tipo)` — Atualiza regra por tipo (story vs reels vs story_os vs reels_os).

### RecompensaCampanhaController
- CRUD completo de campanhas: nome, descrição, regras, datas, multiplicadores, ativar/desativar.

### RecompensaUtilizacaoController
- `buscarCliente(Request)` — Busca cliente por CPF/telefone, retorna saldo e ações disponíveis.
- `utilizar(Request)` — Debita cashback do saldo para aplicar desconto em compra/OS.
- `historico(Request, clienteId)` — Histórico de movimentações do cliente.

### RecompensaRelatorioController
- `dashboard(Request)` — Dashboard: total creditado, utilizado, saldo ativo, ações por tipo.
- `financeiro(Request)` — Impacto financeiro: descontos aplicados, custo efetivo do programa.
- `clientes(Request)` — Top clientes por saldo/utilização.
- `efetividade()` — Métricas de efetividade: taxa de conversão, ROI.

### RecompensaCadastroController (público)
- `index()` — Página pública "Participe". Cliente busca cadastro por CPF ou faz novo.
- `buscarCliente(Request)` — AJAX: busca por CPF/telefone. Consulta Receita se novo.
- `store(Request)` — Registra ação (story/reels com link). Cria cliente se não existe. Valida duplicidade.
- `confirmacao()` — Página de confirmação pós-cadastro.

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### RecompensaAcao
**Tabela:** `recompensas_acoes`
- id, cliente_id, tipo_publicacao (story/reels/story_os/reels_os), link_publicacao, evidencia_path, status (pendente/aprovada/rejeitada/cancelada/expirada), valor_percentual, valor_desconto_maximo, data_validade, campanha_id, aprovado_por_id, aprovado_em, motivo_rejeicao

### RecompensaCampanha
**Tabela:** `recompensas_campanhas`
- id, nome, descricao, data_inicio, data_fim, multiplicador, regras_json, ativa

### RecompensaMovimentacao
**Tabela:** `recompensas_movimentacoes`
- id, cliente_id, acao_id, tipo (credito/debito/expiracao/estorno), valor, saldo_anterior, saldo_posterior, descricao, referencia_tipo, referencia_id

### RecompensaSaldo
**Tabela:** `recompensas_saldos`
- id, cliente_id (unique), saldo_disponivel, total_creditado, total_utilizado, total_expirado

### RecompensaRegraTipo
**Tabela:** `recompensas_regras_tipos`
- id, tipo_publicacao, percentual_desconto, valor_maximo_desconto, validade_dias, ativo, para_ordem_servico (boolean)

## 5. Services

### RecompensaService
- `criarAcao(clienteId, tipoPublicacao, link, evidencia, campanhaId)` — Cria ação pendente de validação.
- `aprovar(acaoId, aprovadorId)` — Aprova: calcula cashback baseado nas regras do tipo, credita saldo.
- `rejeitar/cancelar` — Rejeita ou cancela ação.
- `expirarRecompensasVencidas()` — Expira ações cuja data_validade passou.
- `utilizarCashback(clienteId, valor, referenciaId, referenciaTipo)` — Debita saldo para desconto.
- `consultarSaldo(clienteId)` — Retorna saldo e breakdown.
- `obterHistoricoMovimentacoes(clienteId, limite)` — Movimentações do cliente.
- `obterConfigRecompensa(tipoPublicacao, paraOs)` — Config de regras por tipo.
- `calcularRecompensaDisponivel(clienteId, valorTotal, isOs)` — Calcula desconto disponível para uma compra/OS.
- `utilizarDescontoEmOs(recompensaId, osId, valorOs, usuarioId)` — Aplica desconto em OS.
- `buscarDescontosDisponiveis(clienteId, valorOs)` — Lista descontos disponíveis.

## 6. Jobs

### ExpirarRecompensasJob
- Expira ações vencidas periodicamente.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

Nenhuma direta (usa CpfLookupService para cadastro público).

## 9. Migrations

- recompensas_acoes, recompensas_campanhas, recompensas_movimentacoes, recompensas_saldos, recompensas_regras_tipos

## 10. Views

- resources/views/recompensa-cadastro/ — Página pública "Participe"
- resources/views/admin/ (recompensas) — Validação, configuração, campanhas, utilização, relatórios

## 11. Policies

Admin apenas.

## 12. Comandos Artisan customizados

### ExpirarRecompensasCommand
- Expira recompensas vencidas (pode ser rodado via schedule ou manualmente).

## 13. Scheduled tasks

- ExpirarRecompensasJob — periódico

## 14. Dependências cruzadas

- **Usa Cliente** — Saldo vinculado ao cliente
- **Usado por OS** — Desconto de recompensa no pagamento
- **Usa CpfLookupService** — Cadastro público consulta Receita
- **Usado por PDV** (potencial) — Desconto em vendas

## 15. Configurações / .env vars

Configurações via tabela recompensas_regras_tipos.

## 16. Observações técnicas relevantes

1. **Fluxo completo de cashback** — Cliente publica story/reels → registra via página pública → admin valida → cashback creditado → usado como desconto em OS/compra.
2. **4 tipos de publicação** — story, reels, story_os (sobre OS específica), reels_os. Cada um com percentual e limites diferentes.
3. **Campanhas com multiplicador** — Campanhas temporárias podem multiplicar o cashback (ex: 2x em datas comemorativas).
4. **Expiração automática** — Cashback expira após N dias configuráveis. Job processa expiração.
5. **Saldo como model separado** — RecompensaSaldo é denormalizado (total_creditado, total_utilizado, total_expirado) para performance.
6. **Decisão pendente** — Recompensas será refeito do zero no Next.js. Este inventário é base para decisão de escopo.
