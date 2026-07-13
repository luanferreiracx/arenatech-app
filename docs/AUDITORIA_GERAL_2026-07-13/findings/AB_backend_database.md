# A+B — Backend/Arquitetura + Banco de Dados

> Auditoria manual (agentes cortados). Passagem de sinal alto, não exaustiva.

## Backend (A)
### A1 — DTO discipline BOA (preservar)
Só 4 procedures retornam Prisma cru (`return tx.model.findMany`) — o padrão de
serializar em DTO no router está bem seguido. Não é problema.

### A2 — findMany sem `take` (paginação) — P2 (verificar)
`valuation.ts` e `catalog.ts` têm `findMany` sem `take` aparente. Verificar se são
listas limitadas (ex.: opções de bateria/armazenamento — pequenas) ou risco de scan.
Provável baixo (catálogo já teve fix de paginação). Confiança: baixa.

## Banco (B)
### B1 — Tabelas de log/evento crescem SEM retenção — P2
**Fato (prod):**
- `webhook_events` = 15.303 linhas (ledger de dedup de webhook). Cresce a cada
  webhook; nada limpa. grep por `webhookEvent...delete`/retention = 0.
- `chatbot_messages` = 35.033 linhas — a MAIOR tabela, de uma feature (chatbot) que
  o F_deadcode encontrou SEM UI. 35k linhas acumulando para função inerte.
- `whatsapp_messages_sent` = 743, `service_order_history` = 1.898 — crescem também.
**Impacto:** crescimento ilimitado; a longo prazo infla backup, índices, custo.
webhook_events só precisa de janela recente (dedup de ~horas/dias).
**Fix:** cron de retenção (deletar webhook_events > N dias; decidir sobre
chatbot_messages junto com o destino do módulo chatbot — F1). Confiança: alta (dados de prod).

### B2 — Índices: OK nas tabelas quentes
installments(4), cash_movements(6), sale_items(5), webhook_events(3), chatbot_messages(4).
Densidade razoável. Não achei tabela quente sem índice óbvio nesta passagem (não
exaustivo — um agente com mais tempo deve rodar pg_stat_user_indexes p/ achar índices
NÃO-USADOS e seq scans em tabelas grandes). Confiança: média.

### B3 — `financial.supplier` / `sale.condition` etc. String onde devia ser FK/enum
Ver D1 (frontend) — é também um problema de MODELAGEM de dados (schema). supplier
devia ser FK; condition devia ser enum. Qualidade de dados.

## A auditar (não concluído — precisa de mais tempo/sessão)
- Concorrência fina em sale.ts (4306 linhas) e financial.ts (1544) — não reli.
- pg_stat_user_indexes em prod (índices não usados / seq scans).
- RLS: confirmar policy SELECT/UPDATE/DELETE par em todas as tabelas com tenant_id
  (via pg_policies) — não rodei nesta passagem.
