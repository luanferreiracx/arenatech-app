# Legacy: Comunicação (WhatsApp, Chatwoot, Chatbot Lia, VendaBot)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### WhatsApp
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| POST | /whatsapp/enviar-texto | WhatsAppController@enviarTexto | whatsapp.enviar-texto |

### Chatwoot (atendimento)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /atendimento | ChatwootController@index | atendimento.index |
| GET | /api/chatwoot/conversations | @conversations | |
| GET | /api/chatwoot/conversations/{id}/messages | @messages | |
| POST | /api/chatwoot/conversations/{id}/reply | @reply | |
| POST | /api/chatwoot/conversations/{id}/attachment | @replyWithAttachment | |
| POST | /api/chatwoot/conversations/{id}/read | @markAsRead | |
| POST | /api/chatwoot/conversations/{id}/resolve | @resolve | |

### Chatbot Follow-ups
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /chatbot/follow-ups | ChatbotFollowUpController@index | chatbot.follow-ups |
| POST | /chatbot/follow-ups/{conversa}/cancelar | @cancelar | |
| POST | /chatbot/follow-ups/{conversa}/reagendar | @reagendar | |
| POST | /chatbot/follow-ups/item/{followUp}/cancelar | @cancelarItem | |

### Webhooks
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| POST | /webhook/chatwoot-bot | ChatbotController@handle | webhook.chatwoot-bot |
| GET | /webhook/instagram | InstagramWebhookController@verify | webhook.instagram.verify |
| POST | /webhook/instagram | @handle | webhook.instagram.incoming |
| POST | /webhook/chatwoot-instagram | InstagramOutboundController@handle | webhook.chatwoot-instagram |

### WhatsApp Media (público, para Meta)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /whatsapp-media/pdv/recibo/{token} | WhatsappMediaController@pdvRecibo | |
| GET | /whatsapp-media/pdv/termo/{token}/{tipo} | @pdvTermo | |
| GET | /whatsapp-media/os/recibo/{token} | @osRecibo | |
| GET | /whatsapp-media/os/orcamento/{token} | @osOrcamento | |
| GET | /whatsapp-media/os/termo/{token}/{tipo} | @osTermo | |

### Admin WhatsApp Logs
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /admin/whatsapp-logs | Admin\WhatsappLogController@index | admin.whatsapp-logs.index |
| GET | /admin/whatsapp-logs/conversas | @conversations | |

### Lia Dashboard (chatbot AI)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /lia-dashboard | LiaDashboardController@index | lia-dashboard.index |

## 2. Controllers

### WhatsAppController
- `enviarTexto(Request)` — Envia texto simples via Evolution API. Usado como endpoint genérico de envio.

### ChatwootController
- `index()` — Embed do Chatwoot na interface da intranet. Com SSO para agents.
- `conversations(Request)` — Proxy para API Chatwoot: lista conversas (open/resolved/pending).
- `messages(Request, conversationId)` — Lista mensagens de uma conversa.
- `reply(Request, conversationId)` — Envia resposta como agent.
- `replyWithAttachment(Request, conversationId)` — Envia resposta com anexo.
- `markAsRead(conversationId)` — Marca conversa como lida.
- `resolve(conversationId)` — Resolve conversa.

### ChatbotController (Lia — chatbot AI)
**Arquivo:** app/Http/Controllers/ChatbotController.php (~700 linhas)
- `handle(Request)` — **Webhook do Chatwoot.** Processa mensagens recebidas. Se a conversa está em modo bot, processa via Claude (AnthropicService). Fluxos: atendimento genérico, consulta catálogo, VendaBot (venda via WhatsApp), follow-ups automáticos.
- `chamarClaudeInterno(conversationId)` — Chama Claude internamente para responder sem webhook.

**Fluxo do Chatbot Lia:**
1. Mensagem chega via webhook Chatwoot
2. Controller verifica se conversa está em modo bot (label "bot")
3. Monta contexto com histórico da conversa
4. Chama Claude (AnthropicService) com system prompt especializado
5. Claude responde e pode executar tool calls:
   - Consultar catálogo de aparelhos
   - Verificar disponibilidade de produtos
   - Criar orçamento/pedido (VendaBot)
   - Agendar follow-up
   - Transferir para humano
6. Resposta enviada ao cliente via Chatwoot

### ChatbotFollowUpController
- `index(Request)` — Lista follow-ups pendentes/agendados.
- `cancelar(conversaId)` — Cancela follow-ups de uma conversa.
- `reagendar(conversaId)` — Reagenda follow-ups.
- `cancelarItem(followUpId)` — Cancela follow-up individual.

### WhatsappMediaController
- Serve PDFs publicamente para que a Meta possa baixar e anexar em templates de mensagem. URLs temporárias com tokens.

### Admin\WhatsappLogController
- Logs de mensagens WhatsApp enviadas. Status de entregas. Conversas com janela 24h.

### LiaDashboardController
- Dashboard do chatbot: conversas processadas, taxa de resolução, vendas via bot.

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### WhatsappConversation
**Tabela:** `whatsapp_conversations`
- Conversa do WhatsApp com status, telefone, chatwoot_conversation_id, último contato.

### WhatsappMensagemEnviada
**Tabela:** `whatsapp_mensagens_enviadas`
- Registro de mensagens enviadas: telefone, tipo (texto/media/template), conteudo, status (sent/delivered/read/failed), metadados.

### ChatbotConversa
**Tabela:** `chatbot_conversas`
- Conversa do chatbot: chatwoot_conversation_id, telefone, modo (bot/humano), contexto_json, venda_bot_id.

### ChatbotMensagem
**Tabela:** `chatbot_mensagens`
- Mensagens processadas pelo chatbot: role (user/assistant/tool), conteudo, tokens_usados.

### ChatbotFollowUp
- Follow-ups agendados: conversa_id, tipo, data_agendada, status, mensagem.

### VendaBot / VendaBotItem
**Tabelas:** `vendas_bot`, `venda_bot_itens`
- Vendas iniciadas pelo chatbot Lia: itens, cliente (telefone), endereço entrega, status, método pagamento.

## 5. Services

### MetaWhatsAppService (principal)
- `sendText(phone, message)` — Envia texto via Meta WhatsApp Cloud API.
- `enviarComFallbackTemplate(phone, texto, contexto, params, metadata)` — Tenta enviar texto simples. Se fora da janela 24h (erro), faz fallback para template Meta.
- `enviarPdfComFallbackTemplate(phone, pdfUrl, filename, caption, contexto, params, metadata, tokenLink)` — Envia PDF. Fallback para template com header document.
- `sendMedia(phone, mediaUrl, caption, mediaType, fileName)` — Envia mídia.
- `isConnected()` — Verifica status da conexão.
- `formatPhone(phone)` — Formata telefone para 55XXXXXXXXXXX.

### MetaTemplateService
- `sendTemplate(phone, templateName, language, components)` — Envia template Meta pré-aprovado.
- `sendTemplatePorContexto(phone, contexto, params, metadata, tokenLink)` — Seleciona template automaticamente por contexto (os_termo_pdf, pdv_recibo, etc.).

### EvolutionService (legado)
- `notificarGrupo(texto)` — Envia mensagem para grupo de notificações interno.
- **NOTA:** Parcialmente substituído pelo MetaWhatsAppService. Evolution ainda usado para grupo interno.

### ChatwootService
- `sendBotMessage/sendMessage(conversationId, message)` — Envia mensagem como bot/agent.
- `toggleTyping(conversationId, status)` — Indicador de digitação.
- `sendPrivateNote(conversationId, message)` — Nota interna.
- `toggleStatus/resolveQuietly(conversationId)` — Muda status da conversa.
- `assignAgent/assignTeam(conversationId, id)` — Atribui agent/equipe.
- `addLabels(conversationId, labels)` — Adiciona labels.
- `getConversation/getConversations/getMessages` — Leitura de dados.
- `searchContact(phone)` — Busca contato por telefone.
- `getSsoUrl(chatwootUserId)` — Gera URL SSO para login automático.
- `sendAgentMessage/sendAgentAttachment` — Envio como agent.
- `registrarMensagemTemplate(phone, content, contactInfo, sourceId)` — Registra envio de template no Chatwoot.

### AnthropicService
**Arquivo:** app/Services/AnthropicService.php
- Integração com Claude API para o chatbot Lia. System prompts especializados, tool calls.

### IMEICheckService (usado pelo chatbot para consulta)

## 6. Jobs

### EnviarMensagemWhatsAppJob
- Envia mensagem WhatsApp de forma assíncrona (evita timeout no request).

### EnviarComFallbackTemplateJob
- Envia mensagem com fallback para template de forma assíncrona.

### EnviarFollowUpsBotJob
- Processa follow-ups agendados: envia mensagens de retorno ao cliente.

### ProcessarMensagemBotJob
- Processa mensagem do chatbot de forma assíncrona (útil quando Claude demora).

### MonitorarConversasPendentesJob
- Monitora conversas pendentes no Chatwoot e notifica equipe.

### LimparPdfTemporarioJob
- Limpa PDFs temporários do storage após 1 hora.

## 7. Events / Listeners

Nenhum formal. Webhooks fazem papel de eventos.

## 8. Integrações externas

### Meta WhatsApp Cloud API (via MetaWhatsAppService)
- **Endpoint:** graph.facebook.com
- **Auth:** Bearer token (WHATSAPP_TOKEN)
- **Uso:** Envio de texto, mídia, templates. Verificação de conexão.

### Evolution API (via EvolutionService)
- **Endpoint:** Configurável (EVOLUTION_URL)
- **Auth:** API Key (EVOLUTION_API_KEY)
- **Uso:** Notificação de grupo interno.

### Chatwoot (via ChatwootService)
- **Endpoint:** Configurável (CHATWOOT_URL)
- **Auth:** API token (CHATWOOT_API_TOKEN) + bot token
- **Uso:** CRM de atendimento. Proxy de conversas, envio de mensagens, SSO.

### Anthropic Claude (via AnthropicService)
- **Endpoint:** api.anthropic.com
- **Auth:** API Key
- **Uso:** Chatbot Lia — processamento de linguagem natural, tool calls.

### Instagram (webhook bridge)
- Instagram DM ↔ Chatwoot bridge via webhooks.

## 9. Migrations

- whatsapp_conversations, whatsapp_mensagens_enviadas
- chatbot_conversas, chatbot_mensagens, chatbot_follow_ups
- vendas_bot, venda_bot_itens

## 10. Views

- resources/views/atendimento/ — Embed do Chatwoot
- resources/views/chatbot/ — Dashboard follow-ups
- resources/views/lia-dashboard/ — Dashboard do chatbot

## 11. Policies

Lia Dashboard: role:gerente,admin.

## 12. Comandos Artisan customizados

### RefreshInstagramTokenCommand
- Renova token de acesso do Instagram (expira periodicamente).

## 13. Scheduled tasks

- EnviarFollowUpsBotJob — Processa follow-ups pendentes (periódico).
- MonitorarConversasPendentesJob — Monitora conversas sem resposta.
- VerificarPixsExpirados — Verifica PIX expirados (cross-module).

## 14. Dependências cruzadas

- **Usado por OS** — Envio de assinatura, termos, recibos, notificações via WhatsApp
- **Usado por PDV** — Envio de recibos, termos
- **Usado por Catálogo** — VendaBot (vendas via chatbot)
- **Usa AparelhoCatalogo** — Chatbot consulta catálogo
- **Usa Produto/EstoqueItem** — Chatbot verifica disponibilidade
- **Usa Anthropic Claude** — IA do chatbot

## 15. Configurações / .env vars

- `WHATSAPP_TOKEN` — Token Meta WhatsApp
- `WHATSAPP_PHONE_ID` — Phone ID Meta
- `WHATSAPP_BUSINESS_ID` — Business Account ID
- `EVOLUTION_URL` / `EVOLUTION_API_KEY` — Evolution API
- `CHATWOOT_URL` / `CHATWOOT_API_TOKEN` / `CHATWOOT_BOT_TOKEN` — Chatwoot
- `ANTHROPIC_API_KEY` — Claude API
- `INSTAGRAM_*` — Credenciais Instagram

## 16. Observações técnicas relevantes

1. **Dois provedores WhatsApp** — MetaWhatsAppService (principal, Cloud API) e EvolutionService (grupo interno). Não são redundantes — funções diferentes.
2. **Chatbot Lia é complexo** — ~700 linhas no controller, integra Claude, Chatwoot, catálogo, VendaBot. É um mini-sistema dentro do sistema.
3. **VendaBot separado do PDV** — Vendas do chatbot vão para `vendas_bot`, não para `pdv_vendas`. Fluxo independente.
4. **Templates Meta** — Mensagens fora da janela 24h usam templates pré-aprovados pela Meta. O sistema faz fallback automático.
5. **WhatsApp Media Controller** — Serve PDFs em URLs públicas temporárias para a Meta baixar ao enviar templates com header document.
6. **Instagram bridge** — Webhook bridge entre Instagram DM e Chatwoot. Mensagens do Instagram viram conversas no Chatwoot.
7. **Follow-ups automáticos** — Chatbot agenda follow-ups (ex: "verificar se cliente voltou em 3 dias"). Job processa periodicamente.
8. **SSO Chatwoot** — Agentes fazem login automático no embed do Chatwoot via SSO URL.
