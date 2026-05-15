# Legacy: Notificações

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Visão Geral

O sistema **não usa** o sistema de notificações nativo do Laravel (Illuminate\Notifications). Todas as notificações são enviadas diretamente via:

1. **WhatsApp (MetaWhatsAppService)** — Notificações ao cliente e entregadores
2. **Evolution API (EvolutionService)** — Notificação interna no grupo da equipe
3. **Chatwoot (ChatwootService)** — Mensagens no CRM

## 2. Tipos de Notificação

### Para Clientes (WhatsApp)
| Evento | Template/Contexto | Disparado por |
|--------|-------------------|---------------|
| OS: assinatura digital | os_termo_pdf / os_termo_pdf_link | enviarAssinatura |
| OS: termo de entrega | os_termo_pdf / os_termo_pdf_link | enviarTermoEntrega |
| OS: termo de devolução | os_termo_pdf | enviarTermoDevolucao |
| OS: conclusão (pronto) | Texto livre / template | notificarConclusao |
| OS: rastreamento | Link público | enviarRastreamento |
| OS: recibo | os_recibo_pdf | enviarRecibo |
| OS: orçamento | os_orcamento_pdf | enviarOrcamento |
| PDV: recibo | pdv_recibo_pdf | enviarRecibo |
| Avaliação: tabela preços | Texto formatado | enviarWhatsApp |
| Simulador: parcelas | Texto formatado | enviarWhatsApp |
| Interesses: lote | Texto personalizado | enviarLote |
| Saque DePix: comprovante | Texto + PDF | enviarComprovanteWhatsApp |

### Para Equipe Interna (Evolution API)
| Evento | Disparado por |
|--------|---------------|
| Nova OS criada | enviarNotificacaoTecnicoWhatsApp |
| Entregador: coleta | notificarEntregador |

### Auto-encerramento de conversas
| Tipo | Condição | Schedule |
|------|----------|----------|
| Humano sem resposta 24h | Atendente respondeu, cliente não | 03:00 diário |
| Bot sem resposta 12h | Bot respondeu, cliente não | 03:00 diário |
| Conversa 30+ dias | Qualquer status ativo | 03:00 diário |

## 3. Observações técnicas relevantes

1. **Sem notification model/table** — Não existe tabela de notificações. Histórico fica nas tabelas whatsapp_mensagens_enviadas e chatbot_mensagens.
2. **Templates Meta pré-aprovados** — Mensagens fora da janela 24h usam templates. Sistema faz fallback automático.
3. **Sem notificações in-app** — Não existe sistema de notificações dentro da interface web (push, badges, etc.).
4. **Sem email transacional** — Emails são usados apenas para NF-e (envio de DANFE/XML) e pré-cadastro.
