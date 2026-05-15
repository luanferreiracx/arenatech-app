# Legacy Inventory — Índice Geral

> Inventário completo dos 20 módulos do sistema Laravel Arena Tech.
> Base para SPECs rigorosas na migração para Next.js.

## Módulos Inventariados

| # | Módulo | Arquivo | Controllers | Models | Services |
|---|--------|---------|-------------|--------|----------|
| 1 | [Ordens de Serviço](ordens-de-servico.md) | OS | 3 | 5 | 2+ |
| 2 | [PDV](pdv.md) | Venda | 1 | 6 | 4 |
| 3 | [Clientes](clientes.md) | CRM | 2 | 3 | 2 |
| 4 | [Catálogo](catalogo.md) | Serviços/Aparelhos | 5 | 7 | 1 |
| 5 | [Estoque](estoque.md) | Produtos | 7 | 10+ | 2 |
| 6 | [Caixa](caixa.md) | Caixas | 1 | 3 | 1 |
| 7 | [Financeiro](financeiro.md) | AP/AR | 4 | 6 | 1 |
| 8 | [Comissões](comissoes.md) | MEI/CLT | 4 | 6 | 3 |
| 9 | [Fiscal](fiscal.md) | NF-e | 2 | 2 | 4 |
| 10 | [Operação](operacao.md) | Entregadores | 2 | 1 | 0 |
| 11 | [Consulta IMEI](consulta-imei.md) | IMEI | 1 | 1 | 2 |
| 12 | [Comunicação](comunicacao.md) | WhatsApp/Bot | 6 | 7 | 5 |
| 13 | [Recompensas](recompensas.md) | Cashback | 6 | 5 | 1 |
| 14 | [Configurações](configuracoes.md) | Settings | 2 | 4 | 0 |
| 15 | [Admin Central](admin-central.md) | SaaS | 6 | 7 | 1 |
| 16 | [Autenticação](autenticacao.md) | Auth | 2 | 2 | 0 |
| 17 | [Multi-tenancy](multi-tenancy.md) | Tenancy | - | 1 | 1 |
| 18 | [Notificações](notificacoes.md) | Notif | - | - | - |
| 19 | [Jobs/Queues](jobs-queues.md) | Background | - | - | - |
| 20 | [Eventos/Listeners](eventos-listeners.md) | Events | - | - | - |

## Mapa de Dependências entre Módulos

```
OS ──────┬── Cliente (FK)
         ├── Catálogo/Serviço (FK itens)
         ├── Estoque/Produto (FK peças, reserva/baixa)
         ├── PDV (pagamento de OS cria venda)
         ├── Financeiro (gera conta a receber)
         ├── Caixa (verifica caixa aberto)
         ├── Comunicação (WhatsApp: assinatura, termos, recibo, notificações)
         ├── Recompensas (desconto cashback no pagamento)
         ├── Fiscal (NF-e referencia OS)
         └── Operação (entregador, lab externo)

PDV ─────┬── Estoque (decrementa, IMEI)
         ├── Cliente (associação)
         ├── Caixa (registra movimentação)
         ├── Financeiro (gera conta a receber parcelado)
         ├── Comunicação (WhatsApp: recibo, termos)
         ├── Fiscal (NF-e de venda)
         └── OS (pagamento de OS)

Comissões ┬── PDV (vendas do período)
          ├── OS (OS do período)
          ├── Financeiro (gera conta a pagar ao fechar)
          └── Autenticação (prestador = usuário)

Fiscal ──┬── PDV (NF-e de venda)
         ├── OS (NF-e de OS)
         ├── Estoque (NF-e de entrada/import)
         └── Configurações (dados fiscais)

Admin ───┬── Multi-tenancy (cria/gerencia tenants)
         ├── Recompensas (configuração, campanhas)
         └── Financeiro (estornos DePix)

Comunicação ┬── OS (envio de documentos)
            ├── PDV (envio de recibos)
            ├── Catálogo (chatbot consulta)
            └── Anthropic Claude (IA do chatbot)
```

## Integrações Externas Consolidadas

| Integração | Tipo | Módulos que usam | Env vars |
|------------|------|------------------|----------|
| Autentique | Assinatura digital | OS, PDV, Estoque (compras) | AUTENTIQUE_TOKEN |
| DePix/PixPay | Pagamento PIX | OS, PDV, Admin (assinatura), Saques | DEPIX_* |
| Meta WhatsApp Cloud API | Mensagens | OS, PDV, Comunicação, Interesses | WHATSAPP_TOKEN, WHATSAPP_PHONE_ID |
| Evolution API | WhatsApp grupo | Comunicação (interno) | EVOLUTION_URL, EVOLUTION_API_KEY |
| Chatwoot | CRM atendimento | Comunicação | CHATWOOT_URL, CHATWOOT_API_TOKEN |
| Anthropic Claude | IA chatbot | Comunicação (Lia) | ANTHROPIC_API_KEY |
| Nuvem Fiscal | NF-e/NFC-e | Fiscal | NUVEM_FISCAL_CLIENT_ID/SECRET |
| Focus NFe | NF-e (alternativo) | Fiscal | FOCUS_NFE_TOKEN |
| DirectD | CPF/CNPJ Receita | Clientes, Recompensas | DIRECTD_TOKEN |
| IMEI Check API | Consulta IMEI | Consulta IMEI | IMEI_API_URL, IMEI_API_KEY |
| Cloudinary | Imagens | Estoque, Catálogo | CLOUDINARY_* |
| Instagram | DM bridge | Comunicação | INSTAGRAM_* |
| MeuDANFE | Validação NF-e | Fiscal | - |

## TODOs / FIXMEs / Hacks Identificados

1. **IMEI API key hardcoded** — `IMEICheckService.php` tinha key hardcoded (corrigido para env var)
2. **ConfiguracaoParcelamento com 36 colunas** — juros_2x...juros_36x. Redesenhar como tabela relacional
3. **Avaliacao.valor como string** — Deveria ser decimal
4. **Status "cancelado" vs "cancelada"** — Inconsistência no status de OS
5. **Checklist com 30 colunas individuais** — 15 entrada + 15 saída. Migrar para JSONB
6. **Soft delete inconsistente** — Alguns usam `ativo` boolean, outros não têm soft delete
7. **Timestamps inconsistentes** — `criado_em`/`atualizado_em` vs `created_at`/`updated_at`
8. **OrdemServicoController com 3100+ linhas** — Monolítico, sem separation of concerns
9. **Carrinho em session PHP** — Sem persistência, perde se sessão expirar
10. **PagBank webhook sem credenciais** — Provavelmente inativo/abandonado
11. **Corrida99Service sem credenciais** — Provavelmente não ativo
12. **VendaBot separado do PDV** — Vendas do chatbot em tabela própria, não integrada com pdv_vendas
13. **User e Usuario = mesma tabela** — Dois models apontando para `usuarios` com guards diferentes
14. **Queue driver = database** — Sem Redis para filas no Laravel

## Features Aparentemente Não Utilizadas (Código Morto Candidato)

1. **PagBankWebhookController** — Webhook existe mas sem credenciais
2. **Corrida99Service** — Service existe mas sem credenciais configuradas
3. **AssinaturaController** — Desativado (Asaas removido, DePix em desenvolvimento)
4. **PdvVendaAuditoria** — Model existe mas uso incerto
5. **CategoriaDashboard / LinkDashboard** — Customização de dashboard, uso limitado

## Descobertas que Mudam o que Sabíamos

1. **Chatbot Lia é muito mais complexo** — ~700 linhas de lógica com tool calls, VendaBot integrado, follow-ups automáticos. Não é simples proxy.
2. **Strategy Pattern no Fiscal** — FiscalApiInterface com Nuvem Fiscal + Focus NFe. Ambos implementados.
3. **Auto-encerramento de conversas** — Lógica inline no schedule (03:00) com 3 critérios diferentes.
4. **Upgrade de aparelhos no PDV** — Fluxo completo de trade-in: avaliação, abatimento, devolução ao cliente.
5. **Orçamento adicional com aprovação pública** — Cliente aprova/rejeita orçamento via link público. Cancela PIX DePix se valor mudar.
6. **Termo de devolução para cancelamento** — OS assinada (aparelho na loja) exige termo de devolução assinado para cancelar.
7. **Conferência de caixas fechados automaticamente** — Job fecha caixas, gerente precisa conferir valores depois.
8. **NF-e de entrada via import XML** — Fluxo separado da emissão, vincula itens do XML com produtos do estoque.
