# Legacy: Eventos / Listeners / Observers Globais

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Events

O sistema **não define eventos customizados** em `app/Events/`. O diretório está vazio.

## 2. Listeners

### SeedTenantDatabase
**Arquivo:** app/Listeners/SeedTenantDatabase.php
- **Escuta:** `Stancl\Tenancy\Events\DatabaseMigrated`
- **Ação:** Roda seeders no banco do novo tenant (ConfiguracoesFiscaisSeeder, AppleProdutosSeeder).
- **Único listener no sistema.**

## 3. Observers

O diretório `app/Observers/` está vazio. Não há Observers registrados formalmente.

### Observers inline (via boot() no Model)

| Model | Evento | Ação |
|-------|--------|------|
| OrdemServico | creating | Gera numero_os, link_publico, data_entrada |
| OrdemServicoOrcamento | creating | Gera link_aprovacao |
| PdvVenda | creating | Gera numero_venda, link_publico, token_documento |
| PdvVendaItem | saving | Calcula subtotal |
| PdvVendaItem | saved/deleted | Recalcula totais da venda |
| Produto | boot (implícito) | Lógica de criação |

## 4. Webhooks (entrada)

| URL | Controller | Origem | Propósito |
|-----|-----------|--------|-----------|
| /webhook/depix | DepixWebhookController@handle | DePix/PixPay | Status de transação PIX (pago/expirado/cancelado) |
| /webhook/chatwoot-bot | ChatbotController@handle | Chatwoot | Mensagens recebidas para o chatbot Lia |
| /webhook/instagram | InstagramWebhookController@handle | Instagram | DMs recebidas no Instagram |
| /webhook/chatwoot-instagram | InstagramOutboundController@handle | Chatwoot | Mensagens enviadas para Instagram |
| /webhook/pagbank | PagBankWebhookController@handle | PagBank | Status de pagamento (provavelmente inativo) |

## 5. Observações técnicas relevantes

1. **Sistema majoritariamente procedural** — Sem events/listeners para fluxos de negócio. Toda lógica está nos controllers.
2. **Observers inline** — Geração de números e tokens é feita no boot() dos models, não em Observer classes separadas.
3. **Webhooks como "eventos externos"** — DePix, Chatwoot e Instagram notificam o sistema via webhooks.
4. **PagBank webhook existe mas provavelmente inativo** — Sem credenciais configuradas (lacuna já identificada).
5. **Sem event sourcing** — Histórico de mudanças é registrado manualmente (OrdemServicoHistorico, PdvVendaAuditoria, LogAtividade), não via eventos.
