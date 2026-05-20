# ADR 0044 — Buscador de iPhones em grupos WhatsApp (tenant central)

> Status: Accepted
> Data: 2026-05-20
> Contexto: Nova ferramenta interna para o tenant central monitorar anúncios de iPhones com caixa em grupos WhatsApp REVENDA.

## Contexto

A operação do tenant `arena-tech` recebe diariamente dezenas de mensagens em grupos
WhatsApp ("REVENDA", "Revenda") com anúncios de iPhones seminovos. Procurar
manualmente por modelo + condição (com caixa, lacrado) é lento e propenso a perder
oportunidades. A Evolution API já está integrada ao projeto (envio de mensagens e
recepção de status de entrega via webhook).

Este ADR registra as decisões para implementar o buscador.

## Decisões

### D1 — Recurso exclusivo do tenant central

A ferramenta só existe para o tenant `arena-tech`. Criamos `centralTenantProcedure`
em `src/server/api/trpc.ts`, que estende `tenantProcedure` e bloqueia (`FORBIDDEN`)
se `activeTenant.slug !== "arena-tech"`. A entrada na sidebar usa `requiresTenantSlug`
e só renderiza para o tenant central.

**Por quê:** os grupos REVENDA são acordos comerciais da Arena Tech central, não
do SaaS. Lojas franqueadas/clientes não devem ver nem acessar.

### D2 — Webhook + cache (não polling, não on-demand)

A mensagem é capturada via `messages.upsert` no webhook existente
(`/api/webhooks/evolution`), filtrada por `remoteJid` terminando em `@g.us` e
matching com `WhatsAppGroup` `monitored=true`. Persistimos:

- `WhatsAppGroupMessage` (idempotente por `evolution_message_id`).
- `IPhoneListing` (1:1 opcional) quando o parser identifica um anúncio elegível.

**Por quê:** busca on-demand seria lenta (chamada à Evolution a cada query) e
indexação em background exigiria infraestrutura adicional. O webhook já existe e a
Evolution já entrega tudo em tempo real.

### D3 — Regex + keywords (não LLM)

`src/lib/services/iphone-listing-parser.ts` extrai:

- Modelo (`iPhone X` até `iPhone 17 Pro Max`, incluindo abreviações como `pm`).
- Storage (64/128/256/512 GB e 1 TB).
- Preço (R$ 500–15.000, com sanitização de storage no texto antes para evitar
  capturar "128" como "R$ 128,00").
- Cor (lista canônica).
- Caixa (positivo: `caixa`, `lacrado`, `na cx`; negativo explícito: `sem caixa`,
  `s/ caixa` → rejeita).
- Condição: `LACRADO` se "lacrado/0 km", `SEMINOVO_CAIXA` se "seminovo + caixa"
  ou apenas "caixa" (default), `SEMINOVO` se sem caixa (mas nesse caso o parser
  já retorna null).

**Por quê:** LLM tem custo recorrente por mensagem (centenas/dia em grupos
ativos) e introduz latência no webhook. Padrões de venda nos grupos REVENDA são
estereotipados — regex captura 80%+ com zero custo marginal. Tudo é função pura
testável (29 unit tests cobrindo variações e edge cases). Se quisermos
hibridizar com LLM no futuro, basta plugar um segundo passo no webhook
processando apenas mensagens com `iphone` no texto mas sem match completo.

### D4 — Modelo de dados separa mensagem crua e extração

`WhatsAppGroupMessage` é a verdade auditável; `IPhoneListing` é a extração
indexada por `(tenant_id, model, posted_at)`. Se o parser mudar (D3), podemos
re-processar mensagens antigas sem perder o histórico bruto. RLS em ambas as
tabelas por `tenant_id`.

### D5 — Gerenciamento de grupos pela UI

A página `/iphone-hunter/groups` lista todos os grupos da instância via
`GET /group/fetchAllGroups/{instance}`. O usuário liga/desliga monitoramento via
switch, que persiste em `WhatsAppGroup`. Inicialmente os 2 grupos REVENDA são
cadastrados manualmente (ou via toggle na UI após primeira sincronização).

## Consequências

- Webhook precisa do evento `messages.upsert` habilitado na instância Evolution
  (`POST /webhook/set/{instance}`).
- Sem cobertura E2E ainda — adicionar quando estabilizar (parser tem cobertura
  unitária forte).
- Se o volume crescer muito, indexar `IPhoneListing.model` com `pg_trgm` para
  busca por `ILIKE` mais rápida.
