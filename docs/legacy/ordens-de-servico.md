# Legacy: Ordens de Serviço (OS)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Rotas Públicas (sem auth)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /rastreamento/{token} | RastreamentoController@show | rastreamento.show |
| GET | /orcamento/{linkAprovacao} | OrdemServicoOrcamentoController@paginaOrcamentoPublico | orcamento.publico |
| POST | /orcamento/{linkAprovacao}/aprovar | OrdemServicoOrcamentoController@aprovarOrcamentoPublico | orcamento.aprovar |
| POST | /orcamento/{linkAprovacao}/rejeitar | OrdemServicoOrcamentoController@rejeitarOrcamentoPublico | orcamento.rejeitar |

### Rotas Protegidas (auth + password.change)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /ordens-servico | OrdemServicoController@index | ordens-servico.index |
| GET | /ordens-servico/create | OrdemServicoController@create | ordens-servico.create |
| GET | /ordens-servico/buscar-pecas | OrdemServicoController@buscarPecas | ordens-servico.buscar-pecas |
| POST | /ordens-servico | OrdemServicoController@store | ordens-servico.store |
| GET | /ordens-servico/{id} | OrdemServicoController@show | ordens-servico.show |
| GET | /ordens-servico/{id}/edit | OrdemServicoController@edit | ordens-servico.edit |
| PUT | /ordens-servico/{id} | OrdemServicoController@update | ordens-servico.update |
| DELETE | /ordens-servico/{id} | OrdemServicoController@destroy | ordens-servico.destroy |
| PATCH | /ordens-servico/{id}/status | OrdemServicoController@updateStatus | ordens-servico.update-status |
| POST | /ordens-servico/{id}/confirmar-assinatura-fisica | @confirmarAssinaturaFisica | |
| POST | /ordens-servico/{id}/cancelar | @cancelar | |
| POST | /ordens-servico/{id}/estornar | @estornar | |
| POST | /ordens-servico/{id}/descancelar | @descancelar | |
| POST | /ordens-servico/{id}/gerar-pix-depix | @gerarPixDepix | |
| DELETE | /ordens-servico/{id}/cancelar-pix-depix | @cancelarPixDepix | |
| POST | /ordens-servico/{id}/enviar-assinatura | @enviarAssinatura | |
| POST | /ordens-servico/{id}/verificar-assinatura | @verificarAssinatura | |
| GET | /ordens-servico/{id}/pdf | OrdemServicoPdfController@download | |
| GET | /ordens-servico/{id}/pdf/view | @view | |
| GET | /ordens-servico/{id}/termo-entrega | @termoEntrega | |
| GET | /ordens-servico/{id}/termo-devolucao | @termoDevolucao | |
| GET | /ordens-servico/{id}/recibo | @recibo | |
| POST | /ordens-servico/{id}/enviar-termo-entrega | @enviarTermoEntrega | |
| POST | /ordens-servico/{id}/confirmar-termo-entrega-fisico | @confirmarTermoEntregaFisico | |
| POST | /ordens-servico/{id}/verificar-termo-entrega | @verificarTermoEntrega | |
| POST | /ordens-servico/{id}/enviar-termo-devolucao | @enviarTermoDevolucao | |
| POST | /ordens-servico/{id}/confirmar-termo-devolucao-fisico | @confirmarTermoDevolucaoFisico | |
| POST | /ordens-servico/{id}/verificar-termo-devolucao | @verificarTermoDevolucao | |
| POST | /ordens-servico/{id}/salvar-motivo-cancelamento | @salvarMotivoCancelamento | |
| POST | /ordens-servico/{id}/enviar-recibo | @enviarRecibo | |
| POST | /ordens-servico/{id}/notificar-conclusao | @notificarConclusao | |
| POST | /ordens-servico/{id}/enviar-rastreamento | @enviarRastreamento | |
| POST | /ordens-servico/{id}/enviar-laboratorio | @enviarParaLaboratorio | |
| POST | /ordens-servico/{id}/confirmar-recebimento-lab | @confirmarRecebimentoLaboratorio | |
| POST | /ordens-servico/{id}/notificar-entregador | @notificarEntregador | |
| POST | /ordens-servico/{id}/cancelar-envio-laboratorio | @cancelarEnvioLaboratorio | |
| POST | /ordens-servico/{id}/orcamento | OrdemServicoOrcamentoController@criarOrcamento | |
| POST | /ordens-servico/{id}/orcamento/enviar | @enviarOrcamento | |
| POST | /ordens-servico/{id}/orcamento/cancelar | @cancelarOrcamento | |
| POST | /ordens-servico/{id}/orcamento/verificar | @verificarOrcamento | |
| POST | /ordens-servico/{id}/orcamento/aprovar-manual | @aprovarOrcamentoManual | |
| GET | /ordens-servico/{id}/resumo | @resumo | |
| POST | /ordens-servico/{id}/info-tecnicas | @atualizarInfoTecnicas | |
| POST | /ordens-servico/{id}/custo | @atualizarCusto | |
| POST | /ordens-servico/{id}/atualizar-tecnico | @atualizarTecnico | |
| POST | /ordens-servico/{id}/itens | @adicionarItem | |
| DELETE | /ordens-servico/{id}/itens/{item} | @removerItem | |
| GET | /ordens-servico/cliente/{cliente}/ordens | @ordensDoCliente | |
| GET | /ordens-servico/relatorio-tecnicos | @relatorioTecnicos | |

**Obs:** As mesmas rotas existem tanto em `routes/web.php` (central domain) quanto em `routes/tenant.php` (subdomínio tenant). O controller `Tenant\OrdemServicoController` estende o controller base sem adicionar nada — mesma lógica, contextos diferentes.

## 2. Controllers

### OrdemServicoController
**Arquivo:** app/Http/Controllers/OrdemServicoController.php (~3100 linhas)

**Métodos principais:**
- `index(Request)` — Lista paginada (10/pág) com filtros: status, técnico, busca (número/IMEI/nome/CPF), data início/fim. Se user é técnico (não admin), filtra só suas OS. Exibe contadores por status.
- `create()` — Carrega clientes ativos, serviços ativos, técnicos, vendedores para o form.
- `store(StoreOrdemServicoRequest)` — Cria OS com status "iniciada", data_entrada=now. Processa itens de serviço (loop). Gera numero_os automático (OS{ano}{seq 5 dígitos}). Gera link_publico (Str::random 32). Se garantia, herda prazo da OS original. Envia notificação WhatsApp ao técnico se definido.
- `show(OrdemServico, RecompensaService)` — Carrega todas relações (cliente, técnico, criador, serviço, histórico, itens, documentos, orçamentos, transação DePix). Busca descontos de recompensa disponíveis para o cliente.
- `edit(OrdemServico)` — Verifica se OS foi assinada (bloqueia edição de equipamento) e se foi concluída (bloqueia edição de garantia).
- `update(Request, OrdemServico)` — Validação inline (não usa FormRequest). Processa NFS-e (upload arquivo, timestamp). Se OS assinada, remove campos de equipamento. Recalcula valor_total.
- `updateStatus(Request, OrdemServico, RecompensaService)` — **Método mais complexo.** Verifica: lab externo, orçamento pendente, OS sem valor pode pular PDV, caixa aberto para pagamento. Processa recompensa de desconto se selecionada. Gera conta a receber via FinanceiroService. Verifica termo entrega para status "entregue". Envia WhatsApp de conclusão.
- `destroy(OrdemServico)` — Apenas admin. Verifica OS vinculadas por garantia. Exclui cascata (itens, histórico, documentos, orçamentos, OS).
- `cancelar(Request, OrdemServico)` — Valida motivo. Verifica se OS assinada precisa de termo devolução. Libera peças reservadas no estoque. Admin pode forçar sem termo.
- `descancelar(Request, OrdemServico)` — Apenas admin. Reverte cancelamento para "em_diagnostico".
- `estornar(Request, OrdemServico)` — Apenas admin. Apenas OS entregue. Marca estornada=true, status="estornada".
- `confirmarAssinaturaFisica` — Marca assinatura_fisica=true, data_assinatura_entrada=now.
- `enviarAssinatura` — Gera PDF via OrdemServicoPdfController, cria doc no Autentique, envia link via WhatsApp (MetaWhatsAppService). Usa template com fallback.
- `enviarTermoEntrega` — Similar ao enviarAssinatura, mas gera PDF do termo de entrega. Só após pagamento.
- `confirmarTermoEntregaFisico` — Marca termo assinado E muda status para "entregue" automaticamente.
- `enviarTermoDevolucao` — PDF do termo de devolução para cancelamento.
- `confirmarTermoDevolucaoFisico` — Marca termo devolução assinado.
- `verificarAssinatura` — Consulta status no Autentique via API. Se assinado, baixa documento e atualiza OS.
- `verificarTermoEntrega` — Consulta Autentique para termo de entrega.
- `verificarTermoDevolucao` — Consulta Autentique para termo de devolução.
- `notificarConclusao` — Envia mensagem WhatsApp "aparelho pronto" via MetaWhatsAppService.
- `enviarRastreamento` — Envia link público da OS por WhatsApp.
- `enviarRecibo` — Gera PDF recibo e envia por WhatsApp.
- `criarOrcamento` — Cria orçamento adicional com valores novos vs anteriores.
- `enviarOrcamento` — Envia orçamento via Autentique para assinatura digital.
- `cancelarOrcamento` — Cancela orçamento pendente.
- `verificarOrcamento` — Consulta status de assinatura do orçamento no Autentique.
- `aprovarOrcamentoManual` — Admin aprova orçamento sem assinatura digital.
- `paginaOrcamentoPublico` — Renderiza página pública de aprovação de orçamento.
- `aprovarOrcamentoPublico` / `rejeitarOrcamentoPublico` — Ações públicas do cliente.
- `ordensDoCliente(Cliente)` — Retorna JSON com OS do cliente (para modal de garantia).
- `resumo(OrdemServico)` — Retorna JSON resumido da OS (para modal).
- `atualizarInfoTecnicas` — Atualiza defeito_constatado e observacoes_internas.
- `atualizarCusto` — Atualiza custo_pecas e custo.
- `atualizarTecnico` — Apenas admin. Muda técnico responsável.
- `gerarPixDepix` — Gera cobrança PIX via DePix/PixPay.
- `cancelarPixDepix` — Cancela PIX pendente.
- `relatorioTecnicos` — Relatório de OS por técnico com filtro de período.
- `enviarParaLaboratorio` — Marca OS como enviada para lab externo, notifica entregador via WhatsApp.
- `confirmarRecebimentoLaboratorio` — Marca lab como recebido.
- `notificarEntregador` — Envia notificação de coleta ao entregador via WhatsApp.
- `cancelarEnvioLaboratorio` — Reverte envio ao lab.
- `buscarPecas(Request)` — Autocomplete de produtos para adicionar como peça na OS.
- `adicionarItem(Request, OrdemServico)` — Adiciona item (serviço ou produto) à OS existente. Se produto, reserva estoque.
- `removerItem(Request, OrdemServico, item)` — Remove item, libera estoque se reservado.

### OrdemServicoPdfController
**Arquivo:** app/Http/Controllers/OrdemServicoPdfController.php

**Métodos:**
- `download(OrdemServico)` — Gera PDF (DomPDF) e retorna como download.
- `view(OrdemServico)` — Gera PDF e retorna inline (para visualização no navegador).
- `gerarPdfContent(OrdemServico)` — Gera conteúdo PDF binário (usado internamente e pelo enviarAssinatura).
- `termoEntrega(OrdemServico)` — PDF do termo de entrega.
- `termoDevolucao(OrdemServico)` — PDF do termo de devolução.
- `recibo(OrdemServico)` — PDF do recibo de pagamento.
- `gerarPdfTermoEntrega` / `gerarPdfTermoDevolucao` / `gerarPdfRecibo` — Conteúdo PDF binário.
- `gerarPdfOrcamento(OrdemServico, OrdemServicoOrcamento)` — PDF do orçamento adicional.

### OrdemServicoOrcamentoController
**Arquivo:** app/Http/Controllers/OrdemServicoOrcamentoController.php

Possui os mesmos métodos de orçamento que existem no OrdemServicoController central (criarOrcamento, enviarOrcamento, etc). Usado na rota central (web.php).

## 3. Form Requests / Validations

### StoreOrdemServicoRequest
**Arquivo:** app/Http/Requests/OrdemServico/StoreOrdemServicoRequest.php
- `cliente_id` — required, exists:clientes
- `tipo_equipamento` — nullable, string, max:100
- `modelo` — nullable, string, max:100
- `serie` — nullable, string, max:100
- `imei` — nullable, string, max:50
- `senha_equipamento` — nullable, string, max:50
- `acessorios` — nullable, string
- `problema_relatado` — required, string
- `servico_id` — nullable, exists:servicos
- `tecnico_responsavel_usuario_id` — nullable, exists:usuarios
- `vendedor_intermediador_id` — nullable, exists:usuarios
- `valor_servico` — nullable, numeric, min:0
- `observacoes_internas` — nullable, string
- `itens_servico` — nullable, array (com servico_id, descricao, quantidade, valor)
- `eh_garantia` — nullable, boolean
- `tipo_garantia` — nullable, in:retorno_servico,produto_vendido,fabricante
- `os_original_id` — nullable, exists:ordens_servico
- `prazo_garantia_meses` — nullable, integer, 0-120
- 15 campos check_entrada_* — nullable, string
- 6 campos info_* — nullable, boolean

**Obs:** O update NÃO usa FormRequest — validação inline no controller.

## 4. Models

### OrdemServico
**Arquivo:** app/Models/OrdemServico.php
**Tabela:** `ordens_servico`

**Colunas (principais):**
| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| id | bigint PK | não | auto-increment |
| numero_os | string | não | formato OS{ano}{5 dígitos}, unique |
| cliente_id | FK→clientes | não | |
| tipo_equipamento | string | sim | ex: iPhone, Android, MacBook |
| modelo | string | sim | |
| serie | string | sim | |
| imei | string | sim | |
| senha_equipamento | string | sim | |
| acessorios | text | sim | |
| eh_garantia | boolean | não | default false |
| tipo_garantia | string | sim | retorno_servico/produto_vendido/fabricante |
| os_original_id | FK→ordens_servico | sim | auto-referência para garantia |
| problema_relatado | text | não | |
| defeito_constatado | text | sim | |
| servico_id | FK→servicos | sim | serviço principal |
| servico_manual | string | sim | |
| check_entrada_* (15 campos) | string/nullable | sim | checklist 3 estados |
| check_saida_* (15 campos) | string/nullable | sim | checklist 3 estados |
| info_* (6 campos) | boolean | sim | informações adicionais do aparelho |
| valor_servico | decimal(10,2) | sim | |
| valor_pecas | decimal(10,2) | sim | |
| custo_pecas | decimal(10,2) | sim | |
| custo | decimal(10,2) | sim | custo extra |
| desconto | decimal(10,2) | sim | |
| valor_total | decimal(10,2) | sim | servico + pecas - desconto |
| valor_pago | decimal(10,2) | sim | |
| desconto_pagamento | decimal(10,2) | sim | |
| forma_pagamento | string | sim | |
| pdv_venda_id | FK→pdv_vendas | sim | venda que pagou esta OS |
| observacao_pagamento | text | sim | |
| prazo_garantia_meses | int | sim | |
| status | string | não | 12 estados (ver abaixo) |
| historico_status | JSON | sim | array legado |
| data_entrada | datetime | sim | auto-preenchido |
| data_previsao | datetime | sim | |
| data_conclusao | datetime | sim | auto quando status=concluida |
| data_entrega | datetime | sim | auto quando status=entregue |
| data_pagamento | datetime | sim | auto quando status=paga |
| tecnico_responsavel_usuario_id | FK→usuarios | sim | |
| vendedor_intermediador_id | FK→usuarios | sim | |
| nfse_emitida | boolean | sim | |
| nfse_numero | string | sim | |
| nfse_anexo_path | string | sim | |
| nfse_emitida_em | datetime | sim | |
| usuario_criacao_id | FK→users | sim | |
| observacoes_internas | text | sim | |
| observacoes_cliente | text | sim | |
| documento_assinado_url | string | sim | |
| link_publico | string | sim | Str::random(32) |
| autentique_document_id | string | sim | |
| assinadoc_document_key | string | sim | |
| documento_enviado_assinatura | boolean | sim | |
| data_envio_assinatura | datetime | sim | |
| documento_assinado_id | string | sim | |
| assinatura_entrada_* | strings | sim | |
| assinatura_saida_* | strings | sim | |
| assinatura_fisica | boolean | sim | |
| assinatura_enviada | boolean | sim | |
| termo_entrega_* (7 campos) | vários | sim | controle de assinatura do termo de entrega |
| termo_devolucao_* (7 campos) | vários | sim | controle do termo de devolução |
| recibo_enviado | boolean | sim | |
| recibo_data_envio | datetime | sim | |
| recibo_autentique_id | string | sim | |
| recibo_link | string | sim | |
| ativo | boolean | sim | soft delete manual |
| orcamento_pendente_id | FK→ordens_servico_orcamentos | sim | |
| orcamento_aguardando_aprovacao | boolean | sim | |
| motivo_cancelamento | text | sim | |
| estornada | boolean | sim | |
| motivo_estorno | text | sim | |
| data_estorno | datetime | sim | |
| usuario_estorno_id | FK→users | sim | |
| depix_transacao_id | FK→depix_transacoes | sim | |
| depix_status | string | sim | |
| depix_pago_em | datetime | sim | |
| enviado_laboratorio | boolean | sim | |
| laboratorio_recebido | boolean | sim | |
| entregador_id | FK→entregadores | sim | |
| criado_em | datetime | sim | CREATED_AT customizado |
| atualizado_em | datetime | sim | UPDATED_AT customizado |

**Status disponíveis (12):**
- iniciada, em_diagnostico, aprovada, aguardando_pecas, em_execucao, concluida, paga, aguardando_retirada, entregue, em_garantia, cancelada, estornada

**Relações:**
- `cliente()` belongsTo Cliente
- `tecnicoResponsavel()` belongsTo Usuario
- `usuarioCriacao()` belongsTo User
- `servico()` belongsTo Servico
- `osOriginal()` belongsTo OrdemServico (auto-referência)
- `itens()` hasMany OrdemServicoItem
- `pdvVenda()` belongsTo PdvVenda
- `historico()` hasMany OrdemServicoHistorico
- `documentos()` hasMany OrdemServicoDocumento
- `orcamentos()` hasMany OrdemServicoOrcamento
- `orcamentoPendente()` belongsTo OrdemServicoOrcamento
- `transacaoDepix()` belongsTo DepixTransacao

**Scopes:** ativas, status, emAberto, doTecnico, busca (numero_os/imei/cliente.nome/cpf)

**Boot (creating):** Gera numero_os, link_publico, data_entrada.

**Método atualizarStatus():** Cria registro em OrdemServicoHistorico. Atualiza datas automáticas (data_conclusao, data_entrega, data_pagamento) conforme status.

**Método calcularValorTotal():** valor_servico + valor_pecas - desconto.

**Accessors:** statusFormatado, statusCor, valorTotalFormatado, lucro (total - custo_pecas - custo), equipamento, dataEntradaFormatada.

**SoftDeletes?** Não (usa campo `ativo` boolean)
**Timestamps?** Sim (customizados: criado_em/atualizado_em)
**Tenant-scoped?** Sim (stancl/tenancy via banco separado)

### OrdemServicoItem
**Arquivo:** app/Models/OrdemServicoItem.php
**Tabela:** `ordens_servico_itens`

| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| id | bigint PK | não | |
| ordem_servico_id | FK→ordens_servico | não | |
| servico_id | FK→servicos | sim | |
| tipo_item | string | não | servico/produto/misto (default: misto) |
| produto_id | FK→produtos | sim | |
| descricao | string | sim | |
| quantidade | integer | não | |
| valor | decimal(10,2) | sim | preço unitário |
| custo_unitario | decimal(10,2) | sim | snapshot do custo no momento |
| subtotal | decimal(10,2) | sim | quantidade * valor |
| estoque_status | string | não | nao_aplicavel/reservado/baixado/liberado |
| quantidade_reservada | integer | sim | |
| quantidade_baixada | integer | sim | |

**Timestamps?** Não
**Relações:** ordemServico, servico, produto

### OrdemServicoHistorico
**Arquivo:** app/Models/OrdemServicoHistorico.php
**Tabela:** `ordens_servico_historico`

| Coluna | Tipo | Observação |
|--------|------|------------|
| id | bigint PK | |
| ordem_servico_id | FK→ordens_servico | |
| usuario_id | FK→users | nullable |
| status_anterior | string | |
| status_novo | string | |
| observacao | text | nullable |
| criado_em | datetime | CREATED_AT only, no UPDATED_AT |

### OrdemServicoDocumento
**Arquivo:** app/Models/OrdemServicoDocumento.php
**Tabela:** `ordens_servico_documentos`

| Coluna | Tipo | Observação |
|--------|------|------------|
| id | bigint PK | |
| ordem_servico_id | FK | |
| tipo | string | |
| nome | string | |
| caminho | string | path no storage |
| mime_type | string | |
| tamanho | integer | bytes |
| usuario_id | FK→users | |

### OrdemServicoOrcamento
**Arquivo:** app/Models/OrdemServicoOrcamento.php
**Tabela:** `ordens_servico_orcamentos`

| Coluna | Tipo | Observação |
|--------|------|------------|
| id | bigint PK | |
| ordem_servico_id | FK | |
| usuario_id | FK→users | criador |
| valor_servico_anterior | decimal | |
| valor_pecas_anterior | decimal | |
| desconto_anterior | decimal | |
| valor_total_anterior | decimal | |
| valor_servico_novo | decimal | |
| valor_pecas_novo | decimal | |
| desconto_novo | decimal | |
| valor_total_novo | decimal | |
| motivo | text | |
| servicos_adicionais | text | |
| status | string | pendente/aprovado/rejeitado |
| data_aprovacao | datetime | |
| observacao_cliente | text | |
| enviado_cliente | boolean | |
| data_envio | datetime | |
| link_aprovacao | string | Str::random(32), unique |
| autentique_documento_id | string | |
| autentique_link_assinatura | string | |
| autentique_assinado | boolean | |
| autentique_data_assinatura | datetime | |

**Boot (creating):** Gera link_aprovacao.
**Método aprovar():** Atualiza valores na OS, cancela PIX DePix se valor mudou, registra histórico.
**Método rejeitar():** Restaura OS sem orçamento pendente, registra histórico.

## 5. Services

### OrdemServicoEstoqueService
**Arquivo:** app/Services/OrdemServicoEstoqueService.php

- `reservar(OrdemServicoItem, usuarioId)` — Decrementa quantidade_estoque do Produto (lockForUpdate). Marca item como RESERVADO. Fixa custo_unitario. Registra EstoqueMovimentacao saída.
- `liberar(OrdemServicoItem, usuarioId, ?motivo)` — Incrementa estoque de volta. Registra entrada. Usado em cancelamento/remoção de item.
- `baixar(OrdemServicoItem, usuarioId, vendaId)` — Muda status para BAIXADO. Estoque já saiu na reserva. Registra ajuste para trilha de auditoria.

### AutentiqueService (usado extensivamente)
**Arquivo:** app/Services/AutentiqueService.php
- `criarDocumentoComLink(nome, signatários, pdfContent)` — Cria documento no Autentique com link de assinatura.
- `verificarDocumento(documentId)` — Consulta status de assinatura.
- `formatarWhatsApp(telefone)` — Formata telefone para padrão +55.
- `extrairTokenShortlink(link)` — Extrai token do shortlink Autentique.

### MetaWhatsAppService (usado para envios)
**Arquivo:** app/Services/MetaWhatsAppService.php
- `enviarPdfComFallbackTemplate(telefone, pdfUrl, filename, caption, contexto, params, metadata, tokenLink)` — Envia PDF com fallback para template Meta quando fora da janela 24h.

## 6. Jobs

### LimparPdfTemporarioJob
**Arquivo:** app/Jobs/LimparPdfTemporarioJob.php
- Disparado após envio de PDF via WhatsApp com delay de 1 hora.
- Remove arquivo temporário do storage público.

## 7. Events / Listeners

Nenhum evento/listener específico de OS encontrado. Toda lógica é procedural no controller.

## 8. Integrações externas

### Autentique (assinatura digital)
- **Endpoint:** API GraphQL do Autentique
- **Auth:** Token bearer via env var
- **Uso:** Criar documentos com link de assinatura, verificar status, baixar documentos assinados
- **Cenários:** Assinatura de entrada da OS, termo de entrega, termo de devolução, orçamento adicional

### DePix/PixPay (pagamento PIX)
- **Endpoint:** api.pixpay.space
- **Auth:** Token via env var
- **Uso:** Gerar cobrança PIX para OS, consultar status, cancelar cobrança

### Evolution API / MetaWhatsAppService (WhatsApp)
- **Uso:** Enviar PDFs, links de assinatura, notificações de conclusão, rastreamento, recibos
- **Templates Meta:** os_termo_pdf, os_termo_pdf_link (para envio fora da janela 24h)

## 9. Migrations

Migrations relacionadas:
- Criação inicial da tabela ordens_servico (não listada — provável migration muito antiga)
- `2026_01_10_163539_add_estornada_to_ordens_servico_table.php` — campos estornada, motivo_estorno, data_estorno, usuario_estorno_id
- `2026_01_10_170558_update_aguardando_retirada_to_entregue_in_ordens_servico.php` — atualiza registros com status incorreto
- `2026_01_10_173540_update_estornada_status_from_cancelada.php` — data fix
- `2026_01_15_085340_add_depix_fields_to_ordens_servico_table.php` — depix_transacao_id, depix_status, depix_pago_em
- `2026_02_21_000000_add_custo_pecas_to_ordens_servico.php` — custo_pecas
- `2026_02_21_010000_rename_custo_pecas_to_custo_on_ordens_servico.php` — renomeia para custo
- `2026_04_20_130000_expand_ordens_servico_itens.php` — adiciona tipo_item, produto_id, custo_unitario, estoque_status, quantidade_reservada, quantidade_baixada aos itens
- `2026_04_22_150001_backfill_os_data_pagamento.php` — preenche data_pagamento de OS pagas sem data

## 10. Views (telas)

- **index.blade.php** — Lista paginada com cards de contadores por status, filtros (busca, status, técnico, datas), tabela com número, cliente, equipamento, técnico, status, valor, data
- **create.blade.php** — Formulário multi-seção: cliente (select com busca), equipamento, checklist de entrada (15 itens com 3 estados), informações adicionais, itens de serviço (dinâmico), garantia, observações
- **edit.blade.php** — Similar ao create, com bloqueios se OS assinada ou concluída
- **show.blade.php** — Detalhe completo: dados do equipamento, checklist, itens, valores, histórico, documentos, botões de ação contextuais por status (enviar assinatura, alterar status, gerar PIX, enviar para lab, orçamento, termos, etc.)
- **orcamento-publico.blade.php** — Página pública para cliente aprovar/rejeitar orçamento
- **relatorio-tecnicos.blade.php** — Relatório de OS por técnico com filtros de período
- **pdf/** — Templates Blade para geração de PDF (OS, termos, recibo, orçamento)
- **partials/** — Componentes parciais reutilizados nas views

## 11. Policies

Nenhuma Policy formal. Autorização é feita inline nos controllers:
- `destroy` — verifica `role !== 'admin'`
- `descancelar` — verifica `role !== 'admin'`
- `estornar` — verifica `role !== 'admin'`
- `atualizarTecnico` — verifica `role !== 'admin'`
- Técnicos veem apenas suas OS (filtro no index)

## 12. Comandos Artisan customizados

Nenhum comando específico de OS.

## 13. Scheduled tasks

Nenhum schedule específico de OS (LimparPdfTemporarioJob é dispatch manual com delay).

## 14. Dependências cruzadas

- **Usa Model Cliente** — para dados do cliente na OS
- **Usa Model Servico** — para serviço principal e itens
- **Usa Model Produto** — para itens-peça com controle de estoque
- **Usa Model PdvVenda** — pagamento de OS cria venda no PDV
- **Usa Model DepixTransacao** — para PIX DePix
- **Usa Model Entregador** — para envio a laboratório externo
- **Usa Model Usuario** — para técnicos e vendedores
- **Usa Service CaixaService** — verifica caixa aberto para recebimento
- **Usa Service FinanceiroService** — gera conta a receber ao pagar OS
- **Usa Service RecompensaService** — desconto de recompensa/cashback no pagamento
- **Usa Service OrdemServicoEstoqueService** — reserva/libera/baixa peças no estoque
- **Usa Service AutentiqueService** — assinatura digital de documentos
- **Usa Service MetaWhatsAppService** — envio de PDFs e notificações via WhatsApp
- **Usa Service DepixService** (implícito) — geração de PIX

## 15. Configurações / .env vars

- `AUTENTIQUE_TOKEN` — Token da API Autentique
- `DEPIX_*` — Credenciais DePix/PixPay
- `EVOLUTION_*` — Credenciais Evolution API
- `META_*` — Credenciais Meta WhatsApp Business

## 16. Observações técnicas relevantes

1. **Controller monolítico de 3100+ linhas** — Todo o fluxo de OS está num único controller. Não há separation of concerns entre lógica de negócio e HTTP. Service classes existem apenas para estoque.
2. **Checklist com 30 colunas individuais** (15 entrada + 15 saída) — Já identificado como problema. Next.js usa JSONB.
3. **Soft delete manual** via campo `ativo` boolean, não usa SoftDeletes do Eloquent.
4. **Timestamps customizados** — `criado_em`/`atualizado_em` em vez de `created_at`/`updated_at`.
5. **Dois guards de autenticação** — `tenant` e `web`. Controller detecta contexto via `tenant()` helper.
6. **Status "cancelado" e "cancelada" coexistem** — O código trata ambos em vários locais (inconsistência).
7. **Pagamento via PDV obrigatório** — OS com valor > 0 que não são garantia devem ser pagas via PDV (cria PdvVenda). Admin pode forçar bypass com `?forcar_paga=1`.
8. **Fluxo de assinatura complexo** — Três documentos assinados digitalmente: OS de entrada, termo de entrega, termo de devolução. Cada um com fluxo Autentique + WhatsApp + verificação + alternativa física.
9. **Orçamento adicional** — Fluxo completo com link público para cliente aprovar/rejeitar. Se valor mudar, cancela PIX DePix pendente automaticamente.
10. **Campo `historico_status` JSON** — Legado paralelo ao model OrdemServicoHistorico. Ambos são escritos em momentos diferentes.
11. **Busca de peças** — `buscarPecas` pesquisa em Produto com LIKE, retorna JSON para autocomplete.
12. **Reserva de estoque** — Peças adicionadas à OS reservam estoque imediatamente (decrementam). Cancelamento libera. Pagamento via PDV "baixa" formalmente.
