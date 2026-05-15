# Legacy: Catálogo (Serviços, Aparelhos, Avaliações, Simulador, Checklist)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Serviços
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /servicos | ServicoController@index | servicos.index |
| GET | /servicos/gerenciar | @gerenciar | servicos.gerenciar |
| POST | /servicos | @store | servicos.store |
| POST | /servicos/duplicar-tipo | @duplicarTipo | servicos.duplicar-tipo |
| POST | /servicos/renomear-tipo | @renomearTipo | servicos.renomear-tipo |
| POST | /servicos/ajuste-massa | @ajusteMassa | servicos.ajuste-massa |
| DELETE | /servicos/excluir-tipo | @destroyTipo | servicos.destroy-tipo |
| PUT | /servicos/{servico} | @update | servicos.update |
| DELETE | /servicos/{servico} | @destroy | servicos.destroy |
| POST | /servicos/config-assistencia | @atualizarConfigAssistencia | servicos.config-assistencia |
| POST | /servicos/termos | @salvarTermos | servicos.termos |
| POST | /servicos/observacoes | @storeObservacao | servicos.observacoes.store |
| PUT | /servicos/observacoes/{id} | @updateObservacao | |
| POST | /servicos/observacoes/{id}/toggle | @toggleObservacao | |
| DELETE | /servicos/observacoes/{id} | @destroyObservacao | |

### Avaliações (tabela de preços)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /avaliacoes | AvaliacaoController@index | avaliacoes.index |
| GET | /avaliacoes/sugestoes-central | @sugestoesCentral | |
| GET | /avaliacoes/{id} | @show | avaliacoes.show |
| POST | /avaliacoes/{id}/responder | @responder | avaliacoes.responder |
| POST | /avaliacoes/enviar-whatsapp | @enviarWhatsApp | |
| GET | /admin/avaliacoes | @gerenciar | admin.avaliacoes.index |
| POST | /admin/avaliacoes | @store | admin.avaliacoes.store |
| POST | /admin/avaliacoes/ajuste-massa | @ajusteMassa | |
| POST | /admin/avaliacoes/duplicar-modelo | @duplicarModelo | |
| DELETE | /admin/avaliacoes/excluir-modelo | @destroyModelo | |
| POST | /admin/avaliacoes/config-validade | @configValidade | |
| PUT | /admin/avaliacoes/{id} | @update | |
| DELETE | /admin/avaliacoes/{id} | @destroy | |

### Simulador de Parcelamento
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /simulador | SimuladorController@index | simulador.index |
| POST | /simulador/enviar-whatsapp | @enviarWhatsApp | simulador.enviar-whatsapp |

### Aparelhos Catálogo (admin, para chatbot Lia)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /aparelhos-catalogo | AparelhoCatalogoController@index | aparelhos-catalogo.index |
| POST | /aparelhos-catalogo | @store | |
| PUT | /aparelhos-catalogo/{id} | @update | |
| DELETE | /aparelhos-catalogo/{id} | @destroy | |
| POST | /aparelhos-catalogo/{id}/duplicar | @duplicar | |
| POST | /aparelhos-catalogo/categorias | @storeCategoria | |
| PUT | /aparelhos-catalogo/categorias/{slug} | @renomearCategoria | |
| POST | /aparelhos-catalogo/categorias/{slug}/duplicar | @duplicarCategoria | |
| DELETE | /aparelhos-catalogo/categorias/{slug} | @destroyCategoria | |

### Checklist
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /checklist | ChecklistController@index | checklist.index |
| GET | /checklist/novo | @create | checklist.create |
| POST | /checklist | @store | checklist.store |
| GET | /checklist/preencher | @fill | checklist.fill |
| POST | /checklist/salvar | @saveChecklist | checklist.save |
| GET | /checklist/laudo | @laudo | checklist.laudo |
| POST | /checklist/finalizar | @finalizarLaudo | checklist.finalizar |
| POST | /checklist/cancelar | @cancelar | checklist.cancelar |

### Catálogo Público (catalogo.arenatechpi.com.br)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | / | CatalogoController@index | catalogo.index |
| GET | /produto/{produto} | @show | catalogo.show |
| GET | /api/produtos | @apiBuscar | catalogo.api.buscar |
| GET | /carrinho | @carrinho | catalogo.carrinho |
| POST | /checkout-enviar-codigo | @enviarCodigoVerificacao | |
| POST | /checkout-multi | @checkoutMulti | |
| POST | /estimar-frete | @estimarFrete | |
| GET | /pedido/{numero} | @pedidoStatus | |
| POST | /checkout | @checkout | catalogo.checkout (legado) |
| POST | /verificar-pagamento | @verificarPagamento | |

## 2. Controllers

### ServicoController
**Arquivo:** app/Http/Controllers/ServicoController.php (e Tenant\ServicoController)

- `index(Request)` — Lista de serviços agrupados por tipo_servico. Filtro por tipo, modelo, busca.
- `gerenciar()` — Tela admin para gerenciar tabela de serviços. Agrupados por tipo.
- `store(Request)` — Cria serviço (tipo_servico, modelo_aparelho, valor, descricao).
- `update(Request, Servico)` — Atualiza serviço.
- `destroy(Servico)` — Remove serviço (verifica se está em uso em OS).
- `duplicarTipo(Request)` — Duplica todos serviços de um tipo para outro nome.
- `renomearTipo(Request)` — Renomeia tipo_servico em massa.
- `ajusteMassa(Request)` — Ajuste percentual no valor de serviços filtrados.
- `destroyTipo(Request)` — Exclui todos serviços de um tipo.
- `atualizarConfigAssistencia(Request)` — Atualiza configurações de assistência.
- `salvarTermos(Request)` — Salva termos e condições dos serviços.
- `storeObservacao/updateObservacao/toggleObservacao/destroyObservacao` — CRUD de observações de serviço (por tipo e modelo).

### AvaliacaoController
**Arquivo:** app/Http/Controllers/AvaliacaoController.php (e Tenant\AvaliacaoController)

- `index()` — Tabela de preços de avaliação (compra de aparelhos usados). Agrupada por modelo.
- `gerenciar()` — Admin: gerenciar tabela de avaliações.
- `store(Request)` — Cria avaliação (modelo, armazenamento, bateria, valor).
- `update(Request, Avaliacao)` — Atualiza valor.
- `destroy(Avaliacao)` — Remove.
- `ajusteMassa(Request)` — Ajuste percentual em massa nos valores.
- `duplicarModelo(Request)` — Duplica tabela de um modelo para outro.
- `destroyModelo(Request)` — Exclui todas avaliações de um modelo.
- `configValidade(Request)` — Configura validade das avaliações.
- `enviarWhatsApp(Request)` — Formata tabela de preços e envia por WhatsApp.
- `show(Avaliacao)` — Detalhe individual.
- `responder(Request, Avaliacao)` — Responde a avaliação (feedback).
- `sugestoesCentral()` — Sugestões de preços da central.

### SimuladorController
- `index()` — Simulador de parcelamento: mostra tabela com todas parcelas (PIX/Dinheiro 0%, Débito, Crédito 1x-36x) baseado nas regras de parcelamento configuradas.
- `enviarWhatsApp(Request)` — Envia simulação formatada por WhatsApp.

### AparelhoCatalogoController
- CRUD de aparelhos para o catálogo do chatbot Lia (e-commerce). Admin only.
- Categorias gerenciáveis por slug.

### ChecklistController
- `index()` — Lista checklists pendentes/finalizados.
- `create()` — Novo checklist (seleciona aparelho).
- `fill()` — Preencher checklist (15 itens com 3 estados).
- `laudo()` — Tela de laudo técnico.
- `finalizarLaudo()` — Finaliza laudo.

### CatalogoController (público)
- E-commerce público em catalogo.arenatechpi.com.br.
- Listagem de produtos, detalhe, carrinho, checkout com verificação por código, estimativa de frete, pedido com status.

## 3. Form Requests / Validations

Validação inline nos controllers para a maioria. Sem FormRequests dedicados encontrados.

## 4. Models

### Servico
**Arquivo:** app/Models/Servico.php
**Tabela:** `servicos`

| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| id | bigint PK | não | |
| tipo_servico | string | não | ex: "Troca de Tela" |
| modelo_aparelho | string | não | ex: "iPhone 15 Pro" |
| valor | decimal(10,2) | não | |
| descricao | text | sim | |
| ativo | boolean | não | |
| criado_em / atualizado_em | datetime | sim | |

**Relações:** itensOrdemServico (hasMany OrdemServicoItem)
**Scopes:** ativos, busca (tipo/modelo/descricao, multi-palavra), tipo, modelo

### ServicoObservacao
**Arquivo:** app/Models/ServicoObservacao.php
**Tabela:** `servico_observacoes`

- id, servico_tipos (JSON array de tipos), modelo_aparelhos (JSON array de modelos), texto, ativo

### Avaliacao
**Arquivo:** app/Models/Avaliacao.php
**Tabela:** `avaliacoes`

| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| id | bigint PK | não | |
| modelo | string | não | ex: "iPhone 14" |
| armazenamento | string | sim | ex: "128GB" |
| bateria | string | sim | faixa de saúde da bateria |
| valor | string/decimal | não | NOTA: tipo string no model, não decimal |
| ativo | boolean | não | |

**Obs:** O campo `valor` é cast como string, não decimal. Identificado como lacuna.

### AparelhoCatalogo
**Arquivo:** app/Models/AparelhoCatalogo.php
**Tabela:** `aparelhos_catalogo`

- Aparelhos para o catálogo público e chatbot. Campos: nome, categoria, preco, preco_promocional, descricao, imagem_url, disponivel, destaque.

### AparelhoCategoria
**Arquivo:** app/Models/AparelhoCategoria.php
- Categorias do catálogo de aparelhos (slug, nome, ordem).

### Modelo / Armazenamento
**Arquivo:** app/Models/Modelo.php, Armazenamento.php
- Tabelas auxiliares para o catálogo de avaliações.

## 5. Services

### SimuladorParcelamentoService
**Arquivo:** app/Services/SimuladorParcelamentoService.php
- Calcula tabela de parcelas com base nas ConfiguracaoParcelamento (juros por parcela 2x-36x).
- Retorna array: parcela, valor_parcela, valor_total, taxa.

## 6. Jobs

Nenhum.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

### Cloudinary (catálogo público)
- Upload de imagens de produtos para o catálogo e-commerce.

## 9. Migrations

- Criação de servicos
- Criação de avaliacoes
- Criação de aparelhos_catalogo, aparelhos_categorias
- Criação de servico_observacoes
- Criação de modelos, armazenamentos

## 10. Views

### Serviços
- **index.blade.php** — Tabela de serviços agrupada por tipo, com preços
- **gerenciar.blade.php** — Admin: CRUD de serviços com edição inline, ajuste em massa
- **create.blade.php** / **edit.blade.php** — Forms
- **pdf-orcamento.blade.php** — PDF de orçamento de serviços

### Avaliações
- **index.blade.php** — Tabela de preços por modelo/armazenamento/bateria
- **show.blade.php** — Detalhe de avaliação
- **sugestoes-central.blade.php** — Sugestões de preços

### Simulador
- resources/views/simulador/ — Tabela de parcelamento

### Checklist
- resources/views/checklist/ — Formulário com 15 itens de verificação

### Catálogo Público
- resources/views/catalogo/ — Layout e-commerce: index (listagem), show (produto), carrinho, pedido-status

## 11. Policies

Serviços gerenciar: implicitamente admin (verificação no controller ou middleware).
Aparelhos catálogo: middleware role:admin.

## 12. Comandos Artisan customizados

Nenhum específico do catálogo.

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Servico usado por OrdemServico** — servico_id FK, OrdemServicoItem.servico_id
- **Avaliacao usado por PdvUpgrade** — para calcular valor do aparelho de entrada
- **ConfiguracaoParcelamento usado pelo Simulador** — taxas de juros por parcela
- **AparelhoCatalogo usado pelo Chatbot Lia** — catálogo para vendas via WhatsApp
- **ServicoObservacao** — exibida na criação de OS como observação por tipo/modelo

## 15. Configurações / .env vars

- ConfiguracaoAssistencia — termos, condições, prazo padrão de garantia
- ConfiguracaoParcelamento — 36 colunas (juros_2x...juros_36x) — um dos redesigns necessários
- `CLOUDINARY_*` — Credenciais Cloudinary para imagens do catálogo

## 16. Observações técnicas relevantes

1. **Avaliacao.valor como string** — Já identificado como lacuna. Deveria ser decimal.
2. **ConfiguracaoParcelamento com 36 colunas** — juros_2x até juros_36x em colunas individuais. Já identificado para redesign como tabela relacional.
3. **Serviços agrupados por tipo_servico** — Não há entidade "TipoServico" separada. O tipo é uma string livre na tabela servicos. Operações em massa (duplicar, renomear, ajustar) operam sobre essa string.
4. **Catálogo público é e-commerce completo** — catalogo.arenatechpi.com.br com carrinho, checkout, estimativa de frete, verificação por código. Decisão pendente se entra no escopo da migração.
5. **Checklist desacoplado da OS** — O checklist no ChecklistController aparenta ser um fluxo independente (laudo técnico), diferente do checklist de entrada/saída que está inline na OS.
6. **Observações de serviço** — Filtradas por tipo_servico e modelo_aparelho (arrays JSON), exibidas durante criação de OS como alertas para o técnico.
7. **Duplicar modelo de avaliação** — Duplica todos os registros de um modelo (todas variações de armazenamento/bateria) para outro modelo. Útil para novos lançamentos.
