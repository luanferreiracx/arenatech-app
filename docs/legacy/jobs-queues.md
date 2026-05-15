# Legacy: Jobs / Queues / Scheduled Tasks

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Jobs (12)

| Job | Arquivo | Propósito | Queue |
|-----|---------|-----------|-------|
| EnviarMensagemWhatsAppJob | app/Jobs/ | Envia mensagem WhatsApp assíncrona | default |
| EnviarComFallbackTemplateJob | app/Jobs/ | Envia mensagem com fallback para template Meta | default |
| EnviarFollowUpsBotJob | app/Jobs/ | Processa follow-ups agendados do chatbot | default |
| ProcessarMensagemBotJob | app/Jobs/ | Processa mensagem do chatbot (Claude) assíncrona | default |
| MonitorarConversasPendentesJob | app/Jobs/ | Monitora conversas sem resposta no Chatwoot | default |
| ExpirarAddonsVencidos | app/Jobs/ | Expira addons comprados após data de validade | default |
| ExpirarRecompensasJob | app/Jobs/ | Expira ações de recompensa vencidas | default |
| FecharCaixasAbertos | app/Jobs/ | Fecha caixas esquecidos abertos (auto) | default |
| VerificarPixsExpirados | app/Jobs/ | Verifica PIX DePix expirados e cancela vendas | default |
| ResetConsultasMensais | app/Jobs/ | Reseta contadores de consultas IMEI mensais | default |
| GerarDocumentosVendaJob | app/Jobs/ | Gera documentos (recibo, termos) após venda PDV | default |
| LimparPdfTemporarioJob | app/Jobs/ | Limpa PDFs temporários do storage após 1h | default |

## 2. Scheduled Tasks (routes/console.php)

| Task | Frequência | Horário | Descrição |
|------|-----------|---------|-----------|
| ResetConsultasMensais | Mensal | Dia 1, 00:05 | Reseta cotas IMEI |
| ExpirarAddonsVencidos | Diário | 01:00 | Expira addons |
| ExpirarRecompensasJob | Diário | 02:00 | Expira recompensas |
| FecharCaixasAbertos | Diário | Configurável (default 00:15) | Fecha caixas esquecidos |
| VerificarPixsExpirados | 5 min | - | Verifica PIX expirados |
| EnviarFollowUpsBotJob | 15 min | - | Follow-ups do chatbot |
| MonitorarConversasPendentesJob | 5 min | - | Conversas órfãs |
| instagram:refresh-token | Semanal | Segunda, 04:00 | Renova token Instagram |
| Auto-encerrar conversas | Diário | 03:00 | Encerra conversas inativas (24h humano, 12h bot, 30d total) |

**Obs:** Horário de fechamento de caixas é configurável via `configuracoes_recebimento.hora_fechamento_automatico`.

## 3. Artisan Commands (10)

| Comando | Arquivo | Propósito |
|---------|---------|-----------|
| AtualizarClientesReceitaCommand | app/Console/Commands/ | Atualiza dados de clientes via Receita Federal |
| EmitirNfceHprimeCommand | app/Console/Commands/ | Emite NFC-e para H'Prime |
| ExpirarRecompensasCommand | app/Console/Commands/ | Expira recompensas (alternativa manual ao job) |
| ImportarVendasCsvCommand | app/Console/Commands/ | Importa vendas de CSV |
| LimparAtributosCapacidadeCommand | app/Console/Commands/ | Limpa atributos duplicados |
| LimparCpfsDuplicados | app/Console/Commands/ | Limpa CPFs duplicados em usuarios |
| MigrarProdutosVariacoesCommand | app/Console/Commands/ | Migra dados de variações |
| PopularNcmProdutos | app/Console/Commands/ | Popula NCM em produtos |
| PopularProdutosAppleCommand | app/Console/Commands/ | Popula catálogo Apple |
| RefreshInstagramTokenCommand | app/Console/Commands/ | Renova token Instagram |

## 4. Queue Configuration

- Driver: database (default Laravel)
- QueueTenancyBootstrapper ativo: jobs mantêm contexto do tenant
- Sem queue naming specific — tudo na "default"
- Todas as jobs usam: Queueable, InteractsWithQueue, SerializesModels
- withoutOverlapping() em todos os scheduled jobs

## 5. Observações técnicas relevantes

1. **Queue driver = database** — Sem Redis para filas (Redis não configurado no Laravel).
2. **Tenant-aware** — QueueTenancyBootstrapper garante que jobs dispatchados no contexto de um tenant rodam no banco correto.
3. **Auto-encerramento inline** — A lógica de encerrar conversas (03:00) é uma closure no schedule, não um Job dedicado.
4. **5 jobs de alta frequência** — VerificarPixsExpirados e MonitorarConversasPendentesJob rodam a cada 5 min.
5. **Hora de fechamento configurável** — FecharCaixasAbertos consulta tabela de configuração para horário.
