# MIGRATION_NOTES — Engenharia Reversa do Laravel

> Gerado em 2026-05-08 por leitura completa de `/Users/luanferreira/Herd/intranetpdv`
> Referência para todas as fases da migração.

---

## 1. Arquitetura Geral do Sistema Laravel

**Stack:**
- PHP 8.2 + Laravel 11.x
- MySQL (banco central + bancos por tenant)
- Multi-tenancy via `stancl/tenancy ^3.9` — **banco separado por tenant**
- Rota central: `intranet.arenatechpi.com.br`
- Rotas de tenant: subdomínios (ex: `loja1.arenatechpi.com.br`)
- Autenticação: session-based (database driver), 30 min de expiração
- Frontend: Blade + Alpine.js + Livewire (partes), Vite

**Multi-tenancy (stancl/tenancy):**
- Identificação: `InitializeTenancyBySubdomain` middleware
- Bootstrappers ativos: `DatabaseTenancyBootstrapper`, `FilesystemTenancyBootstrapper`, `QueueTenancyBootstrapper`
- Cada tenant tem banco MySQL próprio (nome armazenado em `tenants.database`)
- Domínios centrais não ativam tenancy (intranet.arenatechpi.com.br, localhost, catalogo.arenatechpi.com.br)
- `central` connection = banco central; `tenant_template` connection = template do banco do tenant

**Diferença crítica para a migração:**
O Laravel usa banco separado por tenant. O Next.js vai usar **RLS num banco único** — diferença arquitetural fundamental.

---

## 2. Rotas — web.php (Sistema Central — intranet.arenatechpi.com.br)

### Auth
| Método | Path | Controller@Action |
|---|---|---|
| GET | /login | LoginController@showLoginForm |
| POST | /login | LoginController@login |
| GET/POST | /logout | LoginController@logout |
| GET | /alterar-senha | LoginController@showChangePasswordForm |
| POST | /alterar-senha | LoginController@changePassword |

### Públicas (sem auth)
| Método | Path | Controller@Action |
|---|---|---|
| GET | /rastreamento/{token} | RastreamentoController@show |
| GET | /documento/{link} | PdvController@documentoPublico |
| GET | /doc/{token} | DocumentoPublicoController@show |
| GET | /doc/{token}/download | DocumentoPublicoController@downloadRecibo |
| GET | /doc/nfe/{token} | DocumentoPublicoController@showNfe |
| GET | /orcamento/{linkAprovacao} | OrdemServicoController@paginaOrcamentoPublico |
| POST | /orcamento/{linkAprovacao}/aprovar | OrdemServicoController@aprovarOrcamentoPublico |
| POST | /orcamento/{linkAprovacao}/rejeitar | OrdemServicoController@rejeitarOrcamentoPublico |

### Ordens de Serviço
- CRUD completo via `Route::resource('ordens-servico', ...)`
- Ações extras: updateStatus, confirmarAssinaturaFisica, cancelar, estornar, descancelar
- PIX: gerarPixDepix, cancelarPixDepix
- Assinatura digital: enviarAssinatura, verificarAssinatura
- PDFs: pdf, pdf-view, termoEntrega, termoDevolucao, recibo
- Termos: enviarTermoEntrega, confirmarTermoEntregaFisico, verificarTermoEntrega, enviarTermoDevolucao
- Recibo/notificação: enviarRecibo, notificarConclusao
- Laboratório: enviarLaboratorio, confirmarRecebimentoLaboratorio, cancelarEnvioLaboratorio
- Entregador: notificarEntregador
- Orçamento adicional: criarOrcamento, enviarOrcamento, cancelarOrcamento, verificarOrcamento, aprovarOrcamentoManual
- Outros: resumo, atualizarInfoTecnicas, atualizarCusto, salvarMotivoCancelamento

### Clientes
- CRUD completo + consulta CPF (DirectD API) + consulta CNPJ

### Serviços (Catálogo)
- Listagem pública + gerenciamento admin
- Técnicos (CRUD inline na página de serviços)
- Observações de serviços (templates)
- Configuração da assistência (termos, validade de avaliação)

### Entregadores
- CRUD + toggle ativo

### Usuários
- CRUD exceto show + resetPassword + reativar

### Interesses
- CRUD + updateStatus + addInteracao + enviarLote (WhatsApp em massa)

### Avaliações (laudos pré-definidos / preços de aparelhos usados)
- Listagem + enviarWhatsApp
- Admin: gerenciar, store, ajusteMassa, duplicarModelo, configValidade

### Configurações
- Geral, Assistência, Fiscal, Pagamento

### Financeiro (Caixas)
- Abertura/fechamento com AJAX
- Sangria, suprimento
- Histórico e relatório PDF
- Status AJAX

### Financeiro (Contas)
- Contas a receber: CRUD + cancelar + baixarParcela
- Contas a pagar: CRUD + cancelar + baixarParcela
- Visões: recebimentos, pendentes, index

### Estoque
- Categorias, Atributos/Variações
- Produtos (CRUD + duplicar + variações + imagens)
- Fornecedores (CRUD + autocomplete + consulta CNPJ/CPF/RFB)
- Movimentações: entrada, saída, ajuste, baixa
- Dashboard de estoque
- Busca por IMEI + histórico de IMEI
- Relatórios: posição estoque, movimentações, curva ABC, estoque mínimo, vendas período, vendas produto, vendas vendedor, upgrades
- Importação NF-e (XML upload + vincular produtos + importar estoque)
- Importação CSV de produtos
- Compras de aparelhos (de clientes/fornecedores + termo Autentique)

### PDV (Ponto de Venda)
- Listagem + nova venda
- Busca de itens de estoque (AJAX)
- CRUD do carrinho (adicionar/remover item, desconto, preço customizado)
- Cliente: adicionar/remover
- Finalizar venda (split payment)
- Processar/remover upgrade (trade-in)
- Cancelar + estornar
- Recibo + enviarRecibo
- Verificar assinatura Autentique + assinatura física
- PIX Depix para PDV
- Status PIX (polling)
- Catálogo público: catalogo.arenatechpi.com.br (checkout completo + VendaBot)

### Fiscal (NF-e)
- Emissão NF-e: CRUD + enviar SEFAZ + cancelar + email + XML + DANFE
- Entrada de NF-e manual
- Inutilizar numeração
- Criar NF-e de venda PDV
- Importação NF-e (XML)

### Admin (SaaS Central)
- Tenants: CRUD + suspend + reactivate + resetarSenha + sincronizarAsaas + cancelarAssinatura + mudarPlano + criarAssinatura + destroyPermanent + gerarLinkPrecadastro
- Planos: CRUD + toggleStatus + reorder
- Addons: CRUD + toggleStatus + reorder + adicionarParaTenant
- Estornos: listar + processar + cancelar
- Pré-cadastros: listar + aprovar + rejeitar + destroy + gerarLink + reenviarLink
- Recompensas: configurações, campanhas (CRUD), relatórios, utilização/cashback

### Recompensas (Público)
- Cadastro público em /participe
- Busca de cliente

### Pré-cadastro (Público)
- Planos + iniciar + formulário por token

### Webhooks
- POST /webhook/asaas → AsaasWebhookController@handle
- POST /webhook/depix → DepixWebhookController@handle
- POST /webhook/evolution → EvolutionWebhookController@handle
- POST /webhook/chatwoot-bot → ChatbotController@handle
- GET/POST /webhook/instagram → InstagramWebhookController
- POST /webhook/chatwoot-instagram → InstagramOutboundController
- POST /webhook/pagbank → PagBankWebhookController

### Deploy
- POST /deploy/executar + GET /deploy/status (autenticado por token)

---

## 3. Rotas — tenant.php (Subdomínios de Tenants)

Mesmo conjunto de módulos do sistema central, porém rodando em namespace `App\Http\Controllers\Tenant\*` com acesso ao banco do tenant específico. Os módulos espelhados são:
- Auth (login CPF/senha)
- Dashboard
- Ordens de Serviço (idem central)
- Clientes
- Serviços + Técnicos
- Usuários
- Interesses
- Avaliações
- Configurações + Parcelamento + Assinatura
- Consultas (IMEI + NF-e)
- Financeiro (Caixas + Contas a receber + Contas a pagar)
- Estoque (Produtos, Categorias, Atributos, Fornecedores, Movimentações, NF-e import, CSV import, Relatórios)
- PDV
- Entregadores
- Comissões
- Compras de aparelhos
- Rastreamento público

---

## 4. Models e Relações (banco de tenant)

### `usuarios` — Autenticação dos usuários do tenant
- CPF único, senha bcrypt (rounds 12), role: admin|gerente|operador|user
- `eh_tecnico` boolean — se pode ser técnico responsável por OS
- `usa_caixa` boolean — se tem caixa vinculado
- Sem timestamps padrão (usa `criado_em`, sem `updated_at`)

### `tecnicos` — Técnicos responsáveis por OS
- Separado de usuarios (um técnico pode não ter login)
- nome, cpf, whatsapp, ativo

### `clientes`
- CPF (nullable), nome_completo, celular_whatsapp, celular_alternativo, email
- Endereço completo (cep, logradouro, numero, complemento, bairro, cidade, estado)
- `usuario_cadastro_id` → usuarios
- Sem soft delete explícito (usa `ativo` boolean)
- **Relações:** hasMany OrdemServico, hasMany Interesse, hasOne RecompensaSaldo

### `ordens_servico` — Core do sistema
- `numero_os` (string, único por tenant, formato não numérico puro)
- `cliente_id`, `tecnico_responsavel_id`, `servico_id` (principal)
- Checklist entrada (15 campos enum Sim/Não/N/A)
- Checklist saída (15 campos enum Sim/Não/N/A)
- Info adicionais (6 booleans sobre condições do aparelho)
- Valores: valor_servico, valor_pecas, desconto, valor_total, valor_pago, desconto_pagamento, custo_pecas, custo
- Status enum: iniciada, em_diagnostico, aprovada, aguardando_pecas, em_execucao, concluida, paga, aguardando_retirada, em_garantia, cancelada, estornada
- Histórico de status em JSON (`historico_status`)
- Assinatura Autentique (autentique_document_id, link, datas)
- Termo de entrega Autentique
- Termo de devolução Autentique
- Recibo
- Orçamento adicional pendente
- Depix (PIX): `depix_transacao_id`, `depix_pix_status`, etc.
- Laboratório externo: campos de envio/recebimento
- Entregador: `entregador_id`
- Garantia: `eh_garantia`, `tipo_garantia`, `os_original_id` (FK recursiva)
- **Relações:** belongsTo Cliente, belongsTo Tecnico, hasMany OrdemServicoItem, hasMany OrdemServicoHistorico, hasMany OrdemServicoOrcamento, hasMany OrdemServicoDocumento

### `ordens_servico_itens`
- `ordem_servico_id`, `servico_id` (nullable), `descricao`, `quantidade`, `valor`, `subtotal`

### `ordens_servico_historico`
- `ordem_servico_id`, `usuario_id`, `status_anterior`, `status_novo`, `observacao`

### `ordens_servico_orcamentos`
- Orçamento adicional durante execução da OS
- Valores anteriores vs. novos, status (pendente/aprovado/rejeitado)
- link_aprovacao público para cliente aprovar/rejeitar

### `servicos` — Catálogo de serviços
- tipo_servico, modelo_aparelho, valor, descricao, ativo
- **Nota:** estrutura simples com tipo+modelo como chave de agrupamento

### `avaliacoes` — Tabela de preços para aparelhos usados
- modelo, armazenamento, saude_bateria, valor (string formatada), validade_dias
- Usada para avaliação de trade-in e respostas automáticas via chatbot

### `produto_categorias`
- nome, descricao, cor_badge, ativo

### `produtos`
- codigo_interno (auto-gerado), nome, descricao, marca, modelo, cor, capacidade
- tipo: aparelho|acessorio|peca|outro → **migrar para enum separado**
- `controla_imei` boolean — para estoque unitário com IMEI
- `usa_variacoes` boolean
- preco_custo, preco_venda, preco_promocional, margem_lucro_padrao
- estoque_minimo, quantidade_estoque
- ncm, cest (para NF-e)
- codigo_barras
- eh_aparelho boolean
- imagem_url, imagem_public_id (Cloudinary)

### `produto_variacoes`
- `produto_id`, capacidade/cor/etc, preco_venda, preco_custo, quantidade_estoque, ativo, imagem

### `estoque_itens` — Itens individuais com IMEI
- `produto_id`, imei (único), numero_serie, codigo_barras
- `fornecedor_id`, nota_fiscal_entrada, data_entrada
- preco_custo_unitario, preco_venda_unitario
- condicao: novo|seminovo|usado|vitrine
- grau_conservacao: A|B|C|D
- bateria_saude, observacoes
- status: disponivel|reservado|vendido|defeito|devolvido
- `venda_id` (FK para pdv_vendas)
- garantia_meses

### `estoque_movimentacoes`
- `estoque_item_id`, `produto_id`, tipo (entrada|saida|ajuste|devolucao|upgrade_entrada)
- quantidade, motivo, referencia_tipo, referencia_id, `usuario_id`

### `fornecedores`
- tipo_pessoa (fisica|juridica), cpf_cnpj, nome_razao_social, nome_fantasia
- telefone, email, endereço completo, observacoes, ativo

### `pdv_vendas`
- numero_venda (único), `cliente_id`, `vendedor_id`
- tipo: venda|upgrade
- subtotal, desconto (valor|percentual), valor_total, forma_pagamento
- parcelas, valor_pago, troco, pagamento_detalhes (JSON)
- status: rascunho|finalizada|cancelada|estornada
- link_publico (64 chars), token_documento
- garantia, tipo_venda
- Integração Depix: campos de transação PIX

### `pdv_venda_itens`
- `venda_id`, `produto_id`, `estoque_item_id` (nullable)
- quantidade, preco_unitario, preco_custo_unitario, desconto_item, subtotal
- `eh_upgrade` boolean, `upgrade_aparelho_entrada_id`

### `pdv_upgrades` — Trade-in
- `venda_id`, `venda_item_id`
- aparelho_entrada (marca, modelo, imei, condicao, bateria_saude)
- valor_avaliado, valor_abatido
- `estoque_item_gerado_id` (item criado no estoque)

### `caixas`
- nome, usuario_padrao_id, saldo_inicial_padrao, ativo

### `caixa_aberturas`
- `caixa_id`, `usuario_id`, saldo_inicial, status (aberto|fechado|conferido)
- saldo_sistema, saldo_informado, diferença, `fechado_por_id`

### `caixa_movimentacoes`
- `abertura_id`, `usuario_id`, tipo (abertura|venda|sangria|suprimento|despesa|estorno|ajuste|fechamento)
- valor, natureza (entrada|saida), forma_pagamento
- referencia_tipo, referencia_id, saldo_anterior, saldo_atual

### `categorias_financeiras`
- nome, tipo (receita|despesa), cor

### `contas_receber` + `contas_receber_parcelas`
- descricao, categoria_id, origem_tipo, origem_id (polymorphic)
- cliente_id, valor_total, valor_pago, valor_restante
- status: pendente|parcial|paga|vencida|cancelada
- Parcelas: numero, valor, data_vencimento, data_pagamento, status

### `contas_pagar` + `contas_pagar_parcelas`
- Similar a contas_receber mas com fornecedor (string, não FK)

### `compras_aparelhos` — Compras de aparelhos de clientes/fornecedores
- codigo (único), tipo_vendedor (cliente|fornecedor)
- `cliente_id` ou `fornecedor_id`
- forma_pagamento, parcelas, valor_total
- Assinatura: termo_assinado, Autentique

### `compra_aparelho_itens`
- `compra_id`, `produto_id`, `variacao_id`, imei, numero_serie
- condicao, grau_conservacao, bateria_saude
- preco_compra, preco_venda_sugerido
- `estoque_item_id` (item criado no estoque)

### NF-e
**`nfe_importacoes`** — NF-e de entrada (XML de fornecedores)
- chave_acesso, numero, serie, emitente (nome/cnpj), data_emissao, valor_total
- xml_conteudo, status, `usuario_id`

**`nfe_itens`** — Itens da NF-e importada
- `nfe_id`, codigo_produto, descricao, ncm, unidade, quantidade, valor_unitario, valor_total
- `produto_id`, `variacao_id` (vínculo após importação), valor_unitario_custom, custos_alocados

**`nfe_emitidas`** — NF-e emitidas
- numero_nf, serie, modelo (55=NF-e, 65=NFC-e), tipo_operacao, finalidade
- status: rascunho|aguardando_envio|em_processamento|autorizada|cancelada|denegada|rejeitada
- emit_cnpj, emit_razao_social, emit_ie
- dest_cpf_cnpj, dest_nome, dest_email, dest_telefone, dest_endereco completo
- chave_acesso (44 dígitos), protocolo, xml_enviado, xml_retorno, xml_cancelamento
- `cliente_id`, `venda_id`

**`nfe_emitidas_itens`** — Itens da NF-e emitida
- `nfe_emitida_id`, numero_item, codigo, descricao, ncm, cfop, unidade
- quantidade, valor_unitario, valor_total, base_calculo
- icms_cst, icms_aliquota, pis_cst, cofins_cst, ipi_cst
- `produto_id`, `estoque_item_id`

### `interesses_clientes` — Pipeline de vendas/oportunidades
- nome_cliente, telefone, cpf, email
- tipo_interesse: Compra|Venda|Troca|Reparo
- modelo_desejado, observacoes
- status: Em espera|Contatado|Finalizado|Cancelado

### `interacoes_interesses`
- `interesse_id`, `usuario_id`, tipo_interacao, descricao

### `configuracoes_assistencia`
- Dados da loja, termos personalizáveis, política de garantia
- parcelas_sem_juros, desconto_pix
- termo_entrada, termo_saida, termo_recusado (templates)

### `configuracoes`
- Chave-valor genérico: chave, valor (text), tipo (string|integer|boolean|json)

### `configuracoes_parcelamento`
- 36 campos de taxa (juros_2x..juros_36x), taxa_credito_avista, taxa_debito, max_parcelas

### `logs_atividade`
- Audit log: usuario_id, acao, modulo, morphs(relacionado), dados_anteriores, dados_novos, ip

### `entregadores`
- nome, telefone, whatsapp, ativo

### Recompensas
**`recompensas_regras_tipo`** — Regras por tipo de transação
- tipo (os_servico|os_peca|pdv_produto|pdv_aparelho|indicacao|aniversario|primeira_compra)
- percentual_cashback, percentual_desconto_os, ativo, descricao
- campos de OS: habilitar recompensa em OS, percentuais por subtipo

**`recompensas_campanhas`** — Campanhas especiais
- nome, tipo_bonus, bonus_percentual, data_inicio, data_fim, ativo

**`recompensas_saldos`** — Saldo por cliente
- `cliente_id`, saldo_disponivel, saldo_pendente, total_ganho, total_utilizado

**`recompensas_movimentacoes`** — Histórico de movimentações
- `cliente_id`, tipo (ganho|utilizacao|expirado|cancelado), valor
- origem_tipo, origem_id, status, data_expiracao, descricao

### VendaBot
**`vendas_bot`** — Pedidos via WhatsApp chatbot
- chatwoot_conversation_id, cliente_telefone, cliente_nome, cliente_cpf
- status, subtotal, desconto, valor_total, forma_pagamento
- endereco_entrega, frete, checkout_token
- Integração Depix para pagamento

**`venda_bot_itens`** — Itens do pedido
- `venda_bot_id`, `produto_id`, `variacao_id`, quantidade, preco_unitario, subtotal

### Chatbot
**`chatbot_conversas`** (banco central)
- chatwoot_conversation_id, cliente_id (FK cross-banco), telefone, canal, status
- contexto_ia (JSON — histórico de contexto para Claude AI)

**`chatbot_mensagens`**
- `chatbot_conversa_id`, remetente (cliente|bot|atendente), conteudo, tool_calls, tokens

---

## 5. Banco Central — Tabelas (não por tenant)

### `tenants` (stancl base + custom)
- id (auto-increment), tenancy_db_name → renomeada para `database`
- nome, slug (único), email, telefone, razao_social, cnpj, cpf
- status: pendente|ativo|inativo|suspenso|trial|trial_expirado
- `plano_id` → planos
- data_inicio_trial, data_fim_trial, trial_dias, trial_consultas_imei
- consultas_imei_usadas, consultas_imei_mes_atual, mes_consultas, consultas_mensais
- asaas_customer_id, asaas_subscription_id, data_inicio_assinatura
- aprovado_por, data_aprovacao, motivo_rejeicao
- endereco (cep, logradouro, numero, complemento, bairro, cidade, uf)

### `domains` (stancl base)
- tenant_id, domain (ex: loja1.arenatechpi.com.br)

### `planos`
- nome, slug, valor_mensal, limite_usuarios, limite_consultas_imei
- descricao, features (JSON), ordem, destaque, personalizavel, ativo

### `addons_consultas` (para consultas IMEI extras)
- nome, quantidade, preco, ativo

### `tenant_addon_compras`
- `tenant_id`, `addon_id`, quantidade, preco_total, status

### `tenant_assinaturas`
- `tenant_id`, asaas_subscription_id, plano (nome), valor_mensal
- status, data_inicio, data_proximo_vencimento

### `tenant_cobrancas`
- `tenant_id`, asaas_payment_id, tipo, valor, status, data_vencimento

### `tenant_estornos`
- `tenant_id`, tipo, valor, motivo, status, processado_em

### `tenant_consultas_imei`
- `tenant_id`, imei, resultado (JSON), data_consulta

### `precadastros`
- nome, email, telefone, cnpj, plano_id, token, status, senha
- formulario_completo (JSON), ip

### `recompensas_regras_tipo` (central — configuração global)
### `recompensas_campanhas` (central)

### Depix (central)
**`vendas_avulsas_depix`** — Vendas avulsas via PIX
- numero_venda, nome_comprador, cpf_cnpj, telefone, email
- descricao_produto, valor_total, status
- `ordem_servico_id` (cross-banco FK — problemático para migração)

**`depix_transacoes`**
- depix_pix_id, tipo (ordem_servico|pdv|venda_avulsa|venda_bot), valor
- status, qr_code, qr_code_texto, expires_at
- `ordem_servico_id`, `venda_id`, `venda_avulsa_id`, `venda_bot_id`
- tax_number (CPF/CNPJ), cliente_nome

**`depix_limites_diarios`**
- data, total_transacoes, total_aprovadas, total_valor_aprovado

**`depix_eventos_webhook`**
- Raw log de todos os eventos do webhook Depix

### Saques Depix (central)
**`saques_depix`**
- tenant_id (cross-banco), tipo_destinatario (chave_pix|banco), dados_bancarios (JSON)
- valor, valor_liquido, taxa, status, depix_transfer_id

### Chatbot (central)
- chatbot_conversas + chatbot_mensagens (já descritos acima)

---

## 6. Jobs (central)

| Job | Função |
|---|---|
| `CriarAssinaturaTrialExpirado` | Cria assinatura Asaas ao expirar trial |
| `EnviarFollowUpsBotJob` | Envia follow-ups do chatbot pendentes |
| `ExpirarAddonsVencidos` | Expira addons de IMEI vencidos |
| `ExpirarRecompensasJob` | Expira recompensas com prazo vencido |
| `FecharCaixasAbertos` | Fecha caixas que ficaram abertos |
| `MonitorarConversasPendentesJob` | Monitora conversas Chatwoot sem resposta |
| `NotificarTrialExpirando` | Notifica tenants com trial expirando |
| `ProcessarInadimplencia` | Processa tenants inadimplentes |
| `ProcessarMensagemBotJob` | Processa mensagem recebida pelo chatbot |
| `ResetConsultasMensais` | Zera contador mensal de consultas IMEI |
| `SincronizarAsaas` | Sincroniza dados com Asaas |
| `VerificarPixsExpirados` | Cancela PIXs expirados (Depix) |
| `VerificarTrialsExpirados` | Suspende tenants com trial expirado |

---

## 7. Middlewares

| Middleware | Função |
|---|---|
| `CheckPasswordChange` | Força troca de senha no primeiro acesso |
| `InitializeTenancyBySubdomain` | Identifica tenant pelo subdomínio e inicializa DB |
| `VerifyTenantStatus` | Verifica se tenant está ativo (não suspenso/trial expirado) |

---

## 8. Integrações Externas

### Autentique (assinatura digital)
- **API:** GraphQL em `https://api.autentique.com.br/v2/graphql`
- **Autenticação:** Bearer token (`AUTENTIQUE_API_KEY`)
- **Uso:** Envio de OS para assinatura digital (PDF gerado em memória), webhook recebe evento de assinatura
- **Modo sandbox:** sim (AUTENTIQUE_SANDBOX=true)
- **Documentos criados:** OS (entrada+saída), Termo de Entrega, Termo de Devolução, Recibo, Compra de Aparelhos, PDV Recibo

### Depix / PixPay (gateway PIX)
- **API:** REST em `https://api.pixpay.space/v1/`
- **Autenticação:** Bearer token (`DEPIX_API_KEY`)
- **Endpoints:** `/deposit` (criar PIX), `/deposit-status` (verificar)
- **Uso:** Pagamento de OS, PDV, Vendas Avulsas, VendaBot
- **Saques:** webhook n8n para saques
- **Expiração:** 30 min por transação

### Evolution API (WhatsApp)
- **URL:** `https://evolutionapi.arenatechpi.com.br`
- **Autenticação:** API Key no header
- **Instância:** `arena-intranet`
- **Uso:** Envio de mensagens de texto, PDF (media base64), templates de OS
- **Não usa:** Meta Cloud API diretamente — usa Evolution API como wrapper

### Chatwoot (atendimento)
- **URL:** `https://atendimento.arenatechpi.com.br`
- **Account ID:** 1
- **Uso:** Listagem de conversas, envio de mensagens, resolução, leitura
- **Chatbot:** webhook em /webhook/chatwoot-bot recebe mensagens e responde via Claude AI

### Claude AI (Anthropic)
- **Modelo:** claude-sonnet-4-5-20241022 (modelo legado)
- **Uso:** Chatbot de atendimento ao cliente (contexto de OS, produtos, preços)
- **Features:** Tool use para consultas de dados, histórico de conversa em JSON

### NF-e — Dual Provider (FiscalApiInterface)
- **Nuvem Fiscal:** `NuvemFiscalService` (homologação/produção)
- **Focus NFe:** `FocusNfeService` (homologação/produção)
- Provider ativo configurável (não há env FISCAL_PROVIDER atualmente — usa binding no ServiceContainer)
- **MeuDANFE:** Consulta XML de NF-e na SEFAZ (chave de acesso)

### Asaas (billing SaaS)
- **URL sandbox:** `https://sandbox.asaas.com/api/v3`
- **Uso:** Gerenciamento de assinaturas dos tenants, cobranças mensais, webhook de pagamento
- **Fluxo:** Tenant criado → assinatura Asaas → cobrança mensal → webhook atualiza status

### IMEI Check (imeicheck.com)
- **URL:** `https://alpha.imeicheck.com/api/php-api/create`
- **API Key:** HARDCODED no código (`gTMjJ-uXUeS-SWWfK-5rKJ4-l5CK0-s22bA`) ⚠️ LACUNA DE SEGURANÇA
- **Service ID:** 39 (APPLE FULL INFO - WITH CARRIER)
- **Uso:** Consulta de IMEI para aparelhos Apple — verificação de blacklist/carrier lock/ativação

### DirectD (consulta CPF/CNPJ na Receita Federal)
- `DIRECTD_TOKEN` para consulta de CPF via Receita Federal

### PagBank (webhook apenas)
- Webhook em /webhook/pagbank — provavelmente não está em uso ativo
- Sem credenciais no .env

### Instagram <-> Chatwoot Bridge
- Bridge para encaminhar mensagens do Instagram para o Chatwoot
- IG_APP_ID, IG_APP_SECRET, IG_VERIFY_TOKEN, IG_ACCESS_TOKEN

### 99 Corridas (Corrida99Service)
- Serviço de corridas — provavelmente para entregadores
- Não há env configurado

### Cloudinary
- Armazenamento de imagens de produtos (`CloudinaryService`)
- Não há env configurado — imagem_public_id nos produtos

---

## 9. Bibliotecas PHP relevantes

| Biblioteca | Versão | Uso |
|---|---|---|
| `laravel/framework` | ^11.31 | Framework base |
| `stancl/tenancy` | ^3.9 | Multi-tenancy por banco separado |
| `barryvdh/laravel-dompdf` | ^3.1 | Geração de PDF (OS, recibos, etc.) |
| `dompdf/dompdf` | ^3.1 | Base do dompdf |
| `phpoffice/phpspreadsheet` | ^5.5 | Importação CSV/Excel de produtos |
| `smalot/pdfparser` | ^2.12 | Parser de PDF (para importação NF-e?) |

---

## 10. Uso de stancl/tenancy — Arquitetura detalhada

### Identificação de tenant
1. Requisição chega com subdomínio (ex: `loja1.arenatechpi.com.br`)
2. Middleware `InitializeTenancyBySubdomain` extrai `loja1`
3. Busca tenant por slug no banco central
4. `DatabaseTenancyBootstrapper` troca a conexão de DB para o banco do tenant
5. A partir daí, todos os Models Eloquent usam o banco do tenant

### Banco por tenant
- Cada tenant tem um banco MySQL próprio (ex: `arenatech_loja1`)
- Nome do banco armazenado em `tenants.database`
- Migrations de tenant rodam separadamente com `artisan tenants:migrate`

### Central vs Tenant
- Banco central: tenants, domains, planos, addons, precadastros, depix_*, chatbot, recompensas (config global)
- Banco tenant: tudo de negócio (OS, clientes, produtos, estoque, financeiro, PDV, etc.)

### Implicação para migração Next.js
**Decisão arquitetural crítica:** Em vez de banco separado, usaremos `tenant_id UUID` + RLS no PostgreSQL. Isso:
- Elimina complexidade de gerenciar N conexões de banco
- Permite queries cross-tenant apenas para super admin
- Requer atenção especial nas FKs cross-banco existentes (ex: `depix_transacoes.ordem_servico_id`)

---

## 11. Lacunas identificadas (TODOs/FIXMEs/Hacks)

1. **IMEI API key hardcoded** em `IMEICheckService.php` — nunca foi migrada para env var
2. **Cross-banco FKs impossíveis no MySQL:** `depix_transacoes.ordem_servico_id` referencia tabela em banco diferente — não há FK real, é uma referência lógica. No Postgres unificado isso resolve naturalmente.
3. **Timestamps inconsistentes:** Algumas tabelas usam `criado_em/atualizado_em`, outras `created_at/updated_at`. Migração deve padronizar para `created_at/updated_at`.
4. **`configuracoes_parcelamento`** tem 36 colunas de juros (juros_2x...juros_36x) — design de schema ruim. Migrar para tabela `parcelamento_taxas(parcela INT, taxa DECIMAL)`.
5. **`avaliacoes.valor` é string** ("R$ 1.500,00") em vez de decimal — lacuna de type safety.
6. **Checklist entrada/saída da OS:** 30 colunas enum individuais — migrar para JSONB `checklist_entrada` e `checklist_saida`.
7. **Status da OS** mistura estados de processo com estados financeiros (paga, valor_pago). Redesenhar com separação de concerns.
8. **`servicos`** usa `tipo_servico + modelo_aparelho` como agrupamento lógico sem estrutura formal — sem category/type entity separada.
9. **Cloudinary** — sistema usa Cloudinary para imagens mas nunca foi documentado. Sem configuração no .env de dev.
10. **PagBank** — webhook configurado mas sem credenciais. Possível feature abandonada.
11. **Corrida99Service** — integração com 99 para entrega, sem credenciais, provavelmente não ativa.
12. **`chatbot_conversas.cliente_id`** aponta para tabela `clientes` em banco de tenant mas a tabela está no banco central — inconsistência de dados que não tem como ter FK real.
13. **`pdv_vendas.link_publico`** e `token_documento` duplicados em funcionalidade (dois campos para o mesmo propósito).
14. **`ordens_servico.numero_os`** é string mas o sistema gera sequencialmente por tenant — no novo sistema usar `numero INT` por tenant conforme plano.
15. **Sem soft delete padronizado** — alguns usam `ativo` boolean, alguns sem remoção. Padronizar para `deleted_at` nullable.
16. **Depix/VendaAvulsaDepix acoplados** — toda transação PIX cria uma VendaAvulsa, mesmo para OS. Redesenhar como Payment genérico vinculado a qualquer origem.

---

## 12. Funcionalidades não documentadas descobertas

1. **Catálogo público** (`catalogo.arenatechpi.com.br`) — e-commerce completo com carrinho, checkout, verificação por código via WhatsApp, estimativa de frete (Correios), pedido com status
2. **VendaBot** — chatbot que recebe pedidos via WhatsApp, gera PIX e processa vendas automaticamente (sem intervenção humana)
3. **Checklist de entrada e saída da OS** — sistema de checklist detalhado com 15+ pontos de verificação (não documentado no plano)
4. **Orçamento adicional na OS** — durante a execução o técnico pode criar um orçamento adicional que o cliente aprova/rejeita via link público (com assinatura Autentique opcional)
5. **Garantia de OS** — sistema de garantia que vincula uma nova OS a uma OS original (eh_garantia + os_original_id)
6. **Laboratório externo** — OS pode ser enviada para laboratório externo com controle de envio/recebimento
7. **Trade-in / Upgrade PDV** — sistema de upgrade com avaliação do aparelho antigo, geração automática de item no estoque
8. **Rastreamento público** — link público que o cliente acessa para ver status da OS sem login
9. **Simulador de parcelamento** — ferramenta para simular parcelamento e enviar resultado por WhatsApp
10. **Deploy automático por webhook** — `/deploy/executar` recebe POST com token e executa deploy via shell
11. **Comissões** — sistema de cálculo de comissões por técnico/vendedor (controller existe mas sem model mapeado)
12. **Pré-cadastro de tenants** — fluxo de auto-serviço para novos clientes se cadastrarem (com seleção de plano)
13. **Dashboard customizável** — links e categorias do dashboard são gerenciáveis pelo admin
14. **Chatbot com follow-ups** — após conversa o bot pode agendar follow-ups automáticos
15. **Conferência detalhada de caixa** — ao fechar o caixa, detalha por forma de pagamento

---

## 13. Mapeamento .env Laravel → Next.js

| Laravel | Next.js | Observação |
|---|---|---|
| DB_CONNECTION=mysql | DATABASE_URL=postgresql://... | Mudança de banco |
| SESSION_DRIVER=database | NEXTAUTH_SECRET | NextAuth usa JWT |
| REDIS_HOST/PORT | REDIS_URL | Formato URL |
| MAIL_* | SMTP_HOST/PORT | Mailhog dev |
| AUTENTIQUE_API_KEY | AUTENTIQUE_API_KEY | Mesmo |
| AUTENTIQUE_SANDBOX | AUTENTIQUE_SANDBOX | Mesmo |
| EVOLUTION_API_URL | EVOLUTION_API_URL | Mesmo |
| EVOLUTION_API_KEY | EVOLUTION_API_KEY | Mesmo |
| EVOLUTION_INSTANCE_NAME | EVOLUTION_INSTANCE_NAME | Mesmo |
| CHATWOOT_URL | CHATWOOT_URL | Mesmo |
| CHATWOOT_API_TOKEN | CHATWOOT_API_TOKEN | Mesmo |
| CHATWOOT_ACCOUNT_ID | CHATWOOT_ACCOUNT_ID | Mesmo |
| DEPIX_API_KEY (no .env) | DEPIX_API_KEY | Adicionar ao .env |
| MEUDANFE_API_KEY | MEUDANFE_API_KEY | Mesmo |
| ANTHROPIC_API_KEY | ANTHROPIC_API_KEY | Mesmo |
| DIRECTD_TOKEN | DIRECTD_TOKEN | Mesmo |
| AWS_* (para Cloudinary) | S3_* | Migrar para MinIO |
| ASAAS_* (não está no .env dev) | ASAAS_* | Adicionar |
