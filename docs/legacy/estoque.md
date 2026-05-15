# Legacy: Estoque (Produtos, Movimentações, Compras, NF-e Import)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Estoque — Posição e Movimentações
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /estoque | EstoqueController@index | estoque.index |
| GET | /estoque/entrada | @entrada | estoque.entrada |
| POST | /estoque/entrada | @storeEntrada | estoque.entrada.store |
| GET | /estoque/ajuste | @ajuste | estoque.ajuste |
| POST | /estoque/ajuste | @storeAjuste | estoque.ajuste.store |
| GET | /estoque/baixa | @baixa | estoque.baixa |
| POST | /estoque/baixa | @storeBaixa | estoque.baixa.store |
| GET | /estoque/movimentacoes | @movimentacoes | estoque.movimentacoes |
| GET | /estoque/buscar-imei | @buscarImei | |
| GET | /estoque/verificar-imei-historico | @verificarImeiHistorico | |
| GET | /estoque/itens-disponiveis | @buscarItensDisponiveis | |
| GET | /estoque/clientes/buscar | @buscarClientes | |
| GET | /estoque/item/{item} | @show | estoque.item.show |
| PUT | /estoque/item/{item} | @update | estoque.item.update |
| POST | /estoque/item/{item}/status | @alterarStatus | estoque.item.status |

### Produtos CRUD
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /estoque/produtos | ProdutoController@index | estoque.produtos.index |
| GET | /estoque/produtos/create | @create | |
| POST | /estoque/produtos | @store | |
| GET | /estoque/produtos/{id} | @show | |
| GET | /estoque/produtos/{id}/edit | @edit | |
| PUT | /estoque/produtos/{id} | @update | |
| DELETE | /estoque/produtos/{id} | @destroy | |
| GET | /estoque/produtos/buscar | @buscarAutocomplete | |
| GET | /estoque/produtos/ncm/* | @buscarNcm/sugerirNcm/buscarNcmApi | |
| GET | /estoque/produtos/{id}/duplicar | @duplicar | |
| GET | /estoque/produtos/{id}/variacoes | @variacoes | |
| POST | /estoque/produtos/{id}/variacao/{var}/imagem | @uploadImagemVariacao | |

### Categorias, Atributos, Fornecedores
Rotas resource completas para categorias (ProdutoCategoriaController), atributos (ProdutoAtributoController), fornecedores (FornecedorController).

### NF-e Import
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /estoque/nfe | NfeImportController@index | estoque.nfe.index |
| GET | /estoque/nfe/upload | @upload | |
| POST | /estoque/nfe/upload | @processUpload | |
| GET | /estoque/nfe/{nfe} | @show | |
| GET | /estoque/nfe/{nfe}/vincular | @vincular | |
| POST | /estoque/nfe/{nfe}/vincular | @salvarVinculacoes | |
| POST | /estoque/nfe/{nfe}/importar | @importar | |
| POST | /estoque/nfe/{nfe}/cancelar | @cancelar | |

### Importação CSV, Relatórios, Compras de Aparelhos, Dashboard
Rotas completas conforme routes/web.php (ver seção Estoque).

## 2. Controllers

### EstoqueController
- `index(Request)` — Lista itens de estoque com filtros: produto, status (disponivel/reservado/defeito/vendido), busca IMEI/serie. Paginado.
- `entrada()` — Form de entrada: produto, quantidade, IMEI (individual para aparelhos), fornecedor, preço custo, condição.
- `storeEntrada(Request)` — Processa entrada. Se aparelho (eh_aparelho=true), cria EstoqueItem individual por IMEI. Se produto genérico, incrementa quantidade_estoque.
- `ajuste()` / `storeAjuste()` — Ajuste de estoque (inventário): seleciona produto, informa nova quantidade. Gera movimentação de ajuste.
- `baixa()` / `storeBaixa()` — Baixa de estoque: seleciona item, informa motivo (venda, defeito, perda). Cria movimentação de saída.
- `movimentacoes(Request)` — Histórico de movimentações com filtros: tipo, período, produto.
- `show(EstoqueItem)` — Detalhe do item: histórico de movimentações, dados do produto.
- `update(Request, EstoqueItem)` — Atualiza dados do item (preço, condição, observações).
- `alterarStatus(Request, EstoqueItem)` — Muda status do item (disponivel↔defeito↔reservado).
- `buscarImei(Request)` — AJAX: busca item por IMEI.
- `verificarImeiHistorico(Request)` — Verifica histórico de um IMEI (se já foi vendido, devolvido, etc).
- `buscarItensDisponiveis(Request)` — AJAX: itens disponíveis de um produto para seleção no PDV.
- `buscarClientes(Request)` — AJAX: busca clientes para vincular em compra de aparelho.

### ProdutoController
- CRUD completo de produtos com: nome, SKU, código de barras, marca, NCM, categorias, preço venda, preço custo, preço promocional, eh_aparelho (boolean), imagem_url, variações.
- `buscarAutocomplete(Request)` — Autocomplete para PDV e OS.
- `buscarNcm/sugerirNcm/buscarNcmApi` — Busca NCM por descrição/código.
- `duplicar(Produto)` — Duplica produto com novo nome.
- `variacoes(Produto)` — Lista variações (cor, armazenamento).

### CompraAparelhoController
- CRUD de compras de aparelhos usados de clientes.
- Fluxo: criar compra → gerar termo de responsabilidade → assinatura (Autentique/física) → finalizar.
- Gera entrada no estoque ao finalizar.

### NfeImportController
- Upload de XML de NF-e → parse → vinculação de itens da NF-e com produtos do estoque → importação (cria entrada no estoque com custos).

### DashboardEstoqueController
- Dashboard com cards: total produtos, valor total estoque, produtos em baixa, vendas período.

### RelatorioController (estoque)
- posicaoEstoque, movimentacoes, curvaAbc, estoqueMinimo, vendasPeriodo, vendasProduto, vendasVendedor, upgrades, clientes, ordensServico.

## 3. Form Requests / Validations

Validação inline nos controllers.

## 4. Models

### Produto
**Tabela:** `produtos`
- id, nome, sku, codigo_barras, marca, ncm, descricao, preco_venda, preco_custo, preco_promocional, eh_aparelho (boolean), imagem_url, quantidade_estoque, estoque_minimo, ativo
- **Relações:** categoria (belongsTo), categorias (belongsToMany), estoqueItens, movimentacoes, vendaItens, variacoes, fotos

### EstoqueItem
**Tabela:** `estoque_itens`
- id, produto_id, variacao_id, fornecedor_id, imei, serie, condicao, preco_custo, preco_venda_sugerido, status (disponivel/reservado/vendido/defeito/devolvido), venda_id, observacoes, data_entrada
- **Relações:** produto, variacao, fornecedor, venda, movimentacoes, vendaItens

### EstoqueMovimentacao
**Tabela:** `estoque_movimentacoes`
- id, estoque_item_id, produto_id, tipo (entrada/saida/ajuste/reserva/liberacao), quantidade, quantidade_anterior, quantidade_posterior, usuario_id, referencia_tipo, referencia_id, motivo
- Métodos estáticos: `registrarEntrada()`, `registrarSaida()`, `registrarAjuste()`

### Fornecedor
**Tabela:** `fornecedores`
- id, tipo_pessoa (PF/PJ), nome, razao_social, cpf_cnpj, inscricao_estadual, telefone, email, endereço completo, observacoes, ativo

### ProdutoCategoria
**Tabela:** `produto_categorias` — CRUD simples (nome, slug)

### ProdutoAtributo / ProdutoAtributoValor
- Atributos de variação (cor, armazenamento) com valores.

### ProdutoVariacao
- Variação de produto com atributos, SKU próprio, preço, estoque.

### ProdutoFoto
- Fotos do produto com flag principal.

### CompraAparelho / CompraAparelhoItem / CompraAparelhoPagamento
- Compra de aparelho de cliente com itens, pagamento, termo de responsabilidade.

### NfeImportacao / NfeItem
- Import de NF-e com itens para vinculação.

## 5. Services

### EstoqueService
- `entradaEstoque(produto, quantidade, imei, fornecedor, preco, condicao)` — Cria EstoqueItem + incrementa Produto.quantidade_estoque.
- `entradaLote(produto, quantidade)` — Entrada em lote sem IMEI.
- `entradaQuantidade/saidaQuantidade` — Operações sobre Produto.quantidade_estoque.
- `reservarItem/liberarReserva(EstoqueItem)` — Muda status para reservado/disponível.
- `ajusteManual(produto, novaQuantidade, motivo)` — Ajuste de inventário.
- `marcarDefeito/devolverItemComoDefeito/devolverItem` — Fluxos de devolução.
- `baixaEstoque(estoqueItem, vendaId, valor)` — Marca como vendido.
- `consultarDisponibilidade(Produto)` — Conta itens disponíveis.
- `buscarPorImei/buscarPorSerie` — Busca item individual.
- `itensDisponiveis(Produto)` — Lista itens disponíveis.
- `relatorioPosicaoEstoque/relatorioMovimentacoes/produtosEstoqueBaixo/valorTotalEstoque` — Relatórios.

### ImportacaoProdutoService
**Arquivo:** app/Services/ImportacaoProdutoService.php
- Importação de produtos via CSV (template + preview + processamento).

## 6. Jobs

Nenhum específico.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

### Cloudinary
- Upload de imagens de produtos (via CloudinaryService).

### APIs de NCM
- Busca de código NCM por descrição.

## 9. Migrations

~20 migrations para: produtos, estoque_itens, estoque_movimentacoes, fornecedores, produto_categorias, produto_atributos, produto_variacoes, produto_fotos, compras_aparelhos, nfe_importacoes.

## 10. Views

- resources/views/estoque/relatorios/ — 11 relatórios (posição, movimentações, curva ABC, estoque mínimo, vendas por período/produto/vendedor, upgrades, clientes, OS)
- Views de produtos, fornecedores, categorias, atributos, NF-e import, compras — nos respectivos diretórios

## 11. Policies

Sem policies formais.

## 12. Comandos Artisan customizados

- `PopularNcmProdutos` — Popula NCM em produtos sem NCM.
- `PopularProdutosAppleCommand` — Popula produtos Apple no catálogo.
- `MigrarProdutosVariacoesCommand` — Migra dados de variações.
- `LimparAtributosCapacidadeCommand` — Limpa atributos duplicados.
- `ImportarVendasCsvCommand` — Importa vendas de CSV.

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Usado por PDV** — PdvVendaItem.produto_id, estoque_item_id
- **Usado por OS** — OrdemServicoItem.produto_id (peças)
- **Usado por NF-e Emissão** — itens de NF-e referenciam produtos
- **Usa Fornecedor** — entrada de estoque com fornecedor
- **Usa Cliente** — compra de aparelho de cliente

## 15. Configurações / .env vars

- `CLOUDINARY_*` — Upload de imagens

## 16. Observações técnicas relevantes

1. **Dual model de estoque** — Produto.quantidade_estoque (counter) + EstoqueItem (registro individual). Aparelhos usam ambos, genéricos só o counter.
2. **IMEI como rastreio individual** — Cada aparelho é um EstoqueItem com IMEI único. Permite rastrear histórico completo.
3. **NF-e Import** — Parse de XML de NF-e de entrada para popular estoque com custos reais.
4. **Compra de aparelhos** — Fluxo completo de compra de usado: avaliação, termo de responsabilidade (Autentique), entrada no estoque.
5. **11 relatórios** — Módulo de relatórios extenso: curva ABC, estoque mínimo, vendas cruzadas por produto/vendedor/período.
