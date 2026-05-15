# Legacy: PDV (Ponto de Venda)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Rotas Públicas
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /documento/{link} | PdvController@documentoPublico | pdv.documento.publico |

### Rotas Protegidas (auth + password.change)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /pdv | PdvController@index | pdv.index |
| GET | /pdv/nova | PdvController@nova | pdv.nova |
| POST | /pdv/cancelar-modo-os | @cancelarModoOs | pdv.cancelar-modo-os |
| POST | /pdv/iniciar-da-os/{ordem} | @iniciarDaOS | pdv.iniciar-da-os |
| POST | /pdv/adicionar-item | @adicionarItem | pdv.adicionar-item |
| POST | /pdv/remover-item | @removerItem | pdv.remover-item |
| POST | /pdv/adicionar-cliente | @adicionarCliente | pdv.adicionar-cliente |
| POST | /pdv/remover-cliente | @removerCliente | pdv.remover-cliente |
| POST | /pdv/aplicar-desconto | @aplicarDesconto | pdv.aplicar-desconto |
| POST | /pdv/atualizar-preco-item | @atualizarPrecoItem | pdv.atualizar-preco-item |
| POST | /pdv/processar-upgrade | @processarUpgrade | pdv.processar-upgrade |
| POST | /pdv/remover-upgrade | @removerUpgrade | pdv.remover-upgrade |
| GET | /pdv/buscar-itens-estoque | @buscarItensEstoque | pdv.buscar-itens-estoque |
| POST | /pdv/gerar-pix-depix | @gerarPixPdv | pdv.gerar-pix-depix |
| GET | /pdv/depix-status/{transacao} | @consultarStatusPix | pdv.depix-status |
| GET | /pdv/{venda} | @show | pdv.show |
| POST | /pdv/finalizar | @finalizar | pdv.finalizar |
| POST | /pdv/{venda}/cancelar | @cancelar | pdv.cancelar (role:gerente,admin) |
| POST | /pdv/{venda}/estornar | @estornar | pdv.estornar (role:gerente,admin) |
| POST | /pdv/{venda}/confirmar-assinatura-fisica | @confirmarAssinaturaFisica | (role:gerente,admin) |
| POST | /pdv/{venda}/atualizar-data | @atualizarData | (role:gerente,admin) |
| GET | /pdv/{venda}/recibo | @recibo | pdv.recibo |
| POST | /pdv/{venda}/enviar-recibo | @enviarRecibo | pdv.enviar-recibo |
| GET | /pdv/{venda}/verificar-assinatura | @verificarAssinaturaDocumento | |
| POST | /pdv/{venda}/vincular-cliente | @vincularCliente | |
| GET | /pdv/{venda}/documento-assinado | @downloadDocumentoAssinado | |

## 2. Controllers

### PdvController
**Arquivo:** app/Http/Controllers/PdvController.php (root) e Tenant\PdvController.php (estende)

**Construtor:** Injeta PdvCarrinhoService, PdvService, CaixaService, EstoqueService.

**Métodos:**
- `index(Request)` — Lista paginada de vendas com filtros (busca, status, vendedor, período). Exibe cards: total vendido hoje, quantidade vendas, ticket médio. Verifica se caixa está aberto.
- `nova(Request)` — Tela do PDV (fullscreen). Inicia carrinho na session. Carrega formas de pagamento ativas. Verifica caixa aberto (obrigatório).
- `iniciarDaOS(OrdemServico)` — Carrega itens da OS no carrinho via PdvCarrinhoService. Usado para pagamento de OS via PDV.
- `cancelarModoOs()` — Limpa carrinho de modo OS e volta ao PDV normal.
- `adicionarItem(Request)` — AJAX. Valida produto/estoque_item_id, quantidade, preço. Adiciona ao carrinho via PdvCarrinhoService. Se aparelho com IMEI, valida unicidade.
- `removerItem(Request)` — AJAX. Remove do carrinho, libera reserva se houver.
- `adicionarCliente(Request)` — AJAX. Associa cliente ao carrinho.
- `removerCliente()` — AJAX. Remove cliente do carrinho.
- `aplicarDesconto(Request)` — AJAX. Desconto fixo ou percentual com motivo.
- `atualizarPrecoItem(Request)` — AJAX. Permite alterar preço unitário de item no carrinho.
- `processarUpgrade(Request)` — AJAX. Processa upgrade de aparelho (cliente troca aparelho usado por novo com abatimento).
- `removerUpgrade(Request)` — AJAX. Remove upgrade do carrinho.
- `finalizar(Request)` — **Método principal.** Valida caixa aberto, carrinho com itens. Chama PdvService.finalizarVenda() que faz: cria PdvVenda + itens, decrementa estoque, registra movimentação caixa, gera conta a receber se parcelado, gera documentos (recibo, termo). Se pagamento de OS, atualiza status da OS para "paga".
- `show(PdvVenda)` — Detalhe da venda com itens, pagamento, documentos.
- `cancelar(Request, PdvVenda)` — role:gerente,admin. Cancela venda via PdvService, devolve estoque.
- `estornar(Request, PdvVenda)` — role:gerente,admin. Estorna (total ou parcial) via PdvService.
- `recibo(PdvVenda)` — Gera HTML/PDF do recibo.
- `enviarRecibo(Request, PdvVenda)` — Envia recibo por WhatsApp (MetaWhatsAppService + Autentique para assinatura).
- `verificarAssinaturaDocumento` — Consulta status de assinatura do documento no Autentique.
- `confirmarAssinaturaFisica` — Marca documento como assinado fisicamente.
- `vincularCliente` — Vincula cliente a venda já finalizada (venda sem cliente).
- `documentoPublico(string link)` — Página pública de documento da venda (via token).
- `downloadDocumentoAssinado` — Download do documento assinado pelo Autentique.
- `atualizarData` — Gerente/admin pode alterar data da venda.
- `buscarItensEstoque(Request)` — AJAX autocomplete de produtos/itens de estoque.
- `gerarPixPdv(Request)` — Gera cobrança PIX DePix para pagamento da venda.
- `consultarStatusPix(transacaoId)` — Consulta status da transação PIX.

## 3. Form Requests / Validations

**Diretório:** app/Http/Requests/Pdv/ (existe mas vazio ou com requests genéricos)

A maior parte da validação é inline no controller.

## 4. Models

### PdvVenda
**Arquivo:** app/Models/PdvVenda.php
**Tabela:** `pdv_vendas`

**Colunas:**
| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| id | bigint PK | não | |
| numero_venda | string unique | não | VND{ano}{5 dígitos} |
| token_documento | string | não | Str::random(64) |
| cliente_id | FK→clientes | sim | |
| cliente_nome | string | sim | snapshot |
| cliente_telefone | string | sim | snapshot |
| ordem_servico_origem_id | FK→ordens_servico | sim | quando venda é pagamento de OS |
| vendedor_id | FK→users | sim | |
| tipo | string | não | venda/upgrade |
| subtotal | decimal | sim | |
| desconto | decimal | sim | |
| desconto_tipo | string | sim | fixo/percentual |
| desconto_motivo | string | sim | |
| valor_total | decimal | sim | subtotal - desconto - upgrades |
| valor_mercadoria | decimal | sim | |
| valor_devolvido_cliente | decimal | sim | troco em upgrade |
| forma_devolucao | string | sim | |
| acrescimo_pagamento | decimal | sim | taxa para cartão |
| taxa_operadora_valor | decimal | sim | |
| receita_liquida_loja | decimal | sim | |
| politica_taxa_aplicada | string | sim | |
| forma_pagamento | string | sim | dinheiro/pix/depix/cartao_credito/cartao_debito/parcelado/crediario/misto |
| parcelas | integer | sim | |
| valor_pago | decimal | sim | |
| troco | decimal | sim | |
| pagamento_detalhes | JSON | sim | array de formas quando misto |
| status | string | não | finalizada/cancelada/estornada/parcialmente_estornada |
| observacoes | text | sim | |
| observacoes_internas | text | sim | |
| data_venda | datetime | sim | |
| data_cancelamento | datetime | sim | |
| motivo_cancelamento | text | sim | |
| usuario_cancelamento_id | FK→users | sim | |
| link_publico | string | sim | Str::random(32) |
| criado_em / atualizado_em | datetime | sim | |

**Relações:** cliente, vendedor, usuarioCancelamento, itens (hasMany PdvVendaItem), contasReceber, upgrades, termosRecibos, estoqueItens, ordemServicoOrigem, nfeEmitida

**Scopes:** status, finalizadas, periodo, hoje, doVendedor, busca
**Boot (creating):** Gera numero_venda (com lockForUpdate e retry), link_publico, token_documento
**Métodos:** calcularTotais, finalizar, cancelar, estornar
**Accessors:** statusFormatado, statusCor, tipoFormatado, formaPagamentoFormatada, valorFinalPago (total + acréscimo), valorCustoTotal, lucroBruto, margemBruta, podeCancelar, podeEstornar

### PdvVendaItem
**Arquivo:** app/Models/PdvVendaItem.php
**Tabela:** `pdv_venda_itens`

| Coluna | Tipo | Observação |
|--------|------|------------|
| id | bigint PK | |
| venda_id | FK→pdv_vendas | |
| produto_id | FK→produtos | nullable |
| variacao_id | FK | nullable |
| estoque_item_id | FK→estoque_itens | nullable (aparelhos com IMEI) |
| descricao_avulsa | string | nullable (item sem produto cadastrado) |
| tipo_item | string | |
| quantidade | integer | |
| preco_unitario | decimal | |
| preco_custo_unitario | decimal | snapshot do custo |
| desconto_item | decimal | |
| subtotal | decimal | auto-calculado no saving |
| eh_upgrade | boolean | |
| upgrade_aparelho_entrada_id | FK→estoque_itens | nullable |
| valor_upgrade_abatido | decimal | |
| garantia_meses | integer | nullable |

**Boot:** saving → calcula subtotal. saved/deleted → recalcula totais da venda.
**Relações:** venda, produto, estoqueItem, upgradeAparelhoEntrada, upgrade (hasOne PdvUpgrade)

### PdvUpgrade
**Arquivo:** app/Models/PdvUpgrade.php
- Registra detalhes de upgrade: aparelho de entrada, avaliação, valor abatido.

### PdvTermoRecibo
**Arquivo:** app/Models/PdvTermoRecibo.php
- Documentos gerados (recibo, termo garantia, termo troca, termo responsabilidade, termo entrega).

### PdvVendaAuditoria
**Arquivo:** app/Models/PdvVendaAuditoria.php
- Log de auditoria de alterações na venda.

### VendaAvulsaDepix
**Arquivo:** app/Models/VendaAvulsaDepix.php
- Vendas avulsas via DePix (PIX sem venda no PDV formal). Separado do fluxo PDV principal.

## 5. Services

### PdvService
**Arquivo:** app/Services/PdvService.php

- `finalizarVenda(carrinho, formaPagamento, valorPago, detalhes, vendedorId, caixaId)` — **Método central (~450 linhas).** Dentro de DB::transaction: cria PdvVenda, cria itens, decrementa estoque (Produto), cria EstoqueMovimentacao, registra CaixaMovimentacao (uma por forma de pagamento em split), gera ContaReceber se cartão crédito parcelado, gera documentos via PdvDocumentoService. Se pagamento de OS: atualiza OS (status=paga, pdv_venda_id), baixa peças reservadas, gera recebiveis via FinanceiroService.
- `cancelarVenda(PdvVenda, motivo, usuarioId)` — Devolve estoque, estorna caixa, cancela contas a receber.
- `estornarVenda(PdvVenda, motivo, usuarioId, itensEstornar, statusFinal)` — Estorno total ou parcial. Devolve estoque parcialmente, estorna caixa proporcional.
- `vendasHoje(?vendedorId)` — Query vendas finalizadas de hoje.
- `totalVendidoHoje(?vendedorId)` — Soma valor_total de hoje.
- `relatorioVendas(filtros)` — Relatório com agrupamentos.

### PdvCarrinhoService
**Arquivo:** app/Services/PdvCarrinhoService.php
- Carrinho em **session** PHP.
- `iniciarCarrinho()` — Cria estrutura: itens[], cliente, desconto, tipo, os_origem_id.
- `carregarDaOrdemServico(OS)` — Popula carrinho com itens da OS (serviços + peças reservadas). Marca tipo="pagamento_os".
- `adicionarItem(produto, quantidade, preco, ...)` — Adiciona ao session. Se aparelho, valida IMEI único no carrinho. Calcula garantia por condição.
- `removerItem(tempId)` — Remove, libera reserva de estoque se necessário.
- `setCliente(clienteId, nome, telefone)` — Associa cliente ao carrinho.
- `aplicarDesconto(valor, tipo, motivo)` — Fixo ou percentual.
- `adicionarUpgrade(dados)` — Adiciona upgrade com aparelho de entrada e valor abatido.
- `atualizarPrecoItem(tempId, novoPreco)` — Altera preço.
- `calcularTotais()` — Retorna: subtotal, desconto, valorUpgrades, valorTotal, quantidadeItens.
- `limparCarrinho()` — Limpa session.
- `limparCarrinhoComLiberacao()` — Limpa + libera estoque reservado.

### PdvDocumentoService
**Arquivo:** app/Services/PdvDocumentoService.php
- `gerarRecibo(PdvVenda)` — Cria PdvTermoRecibo tipo recibo.
- `gerarTermoGarantia(PdvVenda, dias)` — Termo de garantia com prazo.
- `gerarTermoTroca(PdvVenda)` — Termo de troca.
- `gerarTermoResponsabilidade(PdvVenda)` — Termo de responsabilidade.
- `gerarTermoEntrega(PdvVenda)` — Termo de entrega.
- `enviarViaWhatsApp(PdvTermoRecibo)` — Envia documento via WhatsApp.
- `enviarViaAutentique(PdvTermoRecibo)` — Envia para assinatura digital.
- `gerarLinkPublico(PdvTermoRecibo)` — Gera link público para acesso ao documento.

### CalculadoraPagamentoService
**Arquivo:** app/Services/CalculadoraPagamentoService.php
- Calcula acréscimo por forma de pagamento (taxas configuráveis).

## 6. Jobs

### GerarDocumentosVendaJob
**Arquivo:** app/Jobs/GerarDocumentosVendaJob.php
- Gera documentos (recibo, termos) assincronamente após finalizar venda.

## 7. Events / Listeners

Nenhum evento/listener específico.

## 8. Integrações externas

### DePix/PixPay — Pagamento PIX no PDV
- Gerar cobrança PIX, consultar status, cancelar

### Autentique — Assinatura digital de documentos
- Recibo, termos de garantia/troca/responsabilidade/entrega

### MetaWhatsApp/Evolution — Envio de recibos e documentos

## 9. Migrations

- Criação de pdv_vendas (inicial, não listada)
- Criação de pdv_venda_itens
- `2026_04_20_120000_add_ordem_servico_origem_to_pdv_vendas.php` — ordem_servico_origem_id
- Migrations de pdv_upgrades, pdv_termos_recibos, pdv_venda_auditorias

## 10. Views

- **index.blade.php** — Lista de vendas com DataTable, cards resumo (vendas hoje, total, ticket médio), filtros
- **nova.blade.php** — Tela PDV fullscreen: 2 colunas (busca produtos + carrinho), footer com totais e botão finalizar. Ações AJAX. Modal de pagamento com split payment.
- **show.blade.php** — Detalhe da venda: itens, pagamento, documentos, ações (cancelar, estornar, enviar recibo)
- **documentos/** — Templates de documentos (recibo, termos)
- **partials/** — Componentes parciais (item carrinho, modal pagamento, etc.)

## 11. Policies

Sem Policy formal. Controle por middleware `role:gerente,admin` nas rotas sensíveis (cancelar, estornar, atualizar data).

## 12. Comandos Artisan customizados

Nenhum.

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Usa Model Produto** — para itens do carrinho e estoque
- **Usa Model EstoqueItem** — para aparelhos com IMEI
- **Usa Model Cliente** — associação de cliente à venda
- **Usa Model OrdemServico** — pagamento de OS cria venda no PDV
- **Usa Model CaixaAbertura/CaixaMovimentacao** — registra movimentação no caixa
- **Usa Model ContaReceber** — gera parcelas para cartão crédito
- **Usa Model NfeEmitida** — vínculo com NF-e emitida
- **Usa Service CaixaService** — verifica caixa aberto
- **Usa Service EstoqueService** — decrementa estoque
- **Usa Service FinanceiroService** — gera recebíveis
- **Usa Service AutentiqueService** — assinatura digital de documentos
- **Usa Service MetaWhatsAppService** — envio de recibos

## 15. Configurações / .env vars

- Formas de pagamento ativas — configurável via Configuracao model
- DePix exclusivo da intranet central (não disponível em tenant)
- Taxas de operadora por forma de pagamento — configurável

## 16. Observações técnicas relevantes

1. **Carrinho em session PHP** — Sem persistência em banco. Se sessão expirar, carrinho perde.
2. **Split payment** — Suporta múltiplas formas de pagamento (pagamento_detalhes JSON).
3. **Upgrade de aparelhos** — Fluxo complexo: cliente entrega aparelho usado, valor avaliado é abatido do preço do novo. Aparelho de entrada vai para estoque.
4. **DePix não disponível em tenant** — Apenas no domínio central (intranet).
5. **Pagamento de OS via PDV** — Quando OS precisa ser paga, abre o PDV com itens da OS pré-carregados. Finalizar atualiza status da OS.
6. **Estoque com IMEI** — Aparelhos são rastreados individualmente por IMEI via estoque_item_id.
7. **Acréscimo de pagamento** — Cartão pode ter acréscimo (taxa repassada ao cliente). Configurável por forma de pagamento.
8. **Documentos assíncronos** — GerarDocumentosVendaJob cria documentos após finalização.
9. **Número de venda com retry** — gerarNumeroVenda usa lockForUpdate com até 5 tentativas para evitar duplicatas.
10. **Venda avulsa DePix** — Fluxo separado (VendaAvulsaDepixController) para vendas PIX sem PDV formal.
