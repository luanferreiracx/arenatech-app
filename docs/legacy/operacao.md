# Legacy: Operação (Entregadores, Laboratórios Externos, Rastreamento)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Entregadores
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /entregadores | EntregadorController@index | entregadores.index |
| POST | /entregadores | @store | entregadores.store |
| PUT | /entregadores/{id} | @update | entregadores.update |
| POST | /entregadores/{id}/toggle | @toggle | entregadores.toggle |
| DELETE | /entregadores/{id} | @destroy | entregadores.destroy |

### Rastreamento (público)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /rastreamento/{token} | RastreamentoController@show | rastreamento.show |

**Obs:** Laboratórios externos não têm rotas próprias. O fluxo de envio/recebimento é gerenciado dentro do OrdemServicoController.

## 2. Controllers

### EntregadorController
- `index()` — Lista entregadores ativos/inativos.
- `store(Request)` — Cria entregador (nome, telefone, veículo, ativo).
- `update(Request, $id)` — Atualiza.
- `toggle($id)` — Ativa/desativa entregador.
- `destroy($id)` — Remove.

### RastreamentoController
- `show(string $token)` — Exibe status da OS publicamente via link_publico. Mostra: número OS, status, equipamento, histórico de status.

### Fluxo de laboratório externo (em OrdemServicoController)
- `enviarParaLaboratorio` — Marca OS como enviada para lab, seleciona entregador.
- `confirmarRecebimentoLaboratorio` — Marca lab como recebido.
- `notificarEntregador` — Envia WhatsApp ao entregador com dados da coleta.
- `cancelarEnvioLaboratorio` — Reverte envio.

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### Entregador
**Tabela:** `entregadores`
- id, nome, telefone, veiculo, observacoes, ativo
- **Scopes:** ativos
- **Usado por:** OrdemServico.entregador_id

## 5. Services

Nenhum service dedicado. Lógica no controller.

## 6. Jobs

Nenhum.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

### WhatsApp (via MetaWhatsAppService)
- Notificação ao entregador com dados da coleta (endereço, OS, telefone cliente).

## 9. Migrations

- entregadores

## 10. Views

- resources/views/entregadores/ (gerenciado dentro de /servicos/ nas views)
- resources/views/rastreamento/ — Página pública de status da OS

## 11. Policies

Sem policies formais.

## 12. Comandos Artisan customizados

Nenhum.

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Usado por OrdemServico** — entregador_id, enviado_laboratorio, laboratorio_recebido
- **Usa WhatsApp** — Notificação ao entregador

## 15. Configurações / .env vars

Nenhuma específica.

## 16. Observações técnicas relevantes

1. **Laboratório externo sem entidade própria** — Não existe model "LaboratorioExterno". O fluxo é controlado por flags na OS (enviado_laboratorio, laboratorio_recebido, entregador_id). Decisão: Next.js criou model ExternalLab na Fase 11.
2. **Rastreamento público** — Link público para cliente acompanhar status da OS. Simples, sem autenticação.
3. **Entregadores são simples** — CRUD básico sem lógica complexa. Apenas nome, telefone, veículo.
