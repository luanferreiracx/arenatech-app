# C — Segurança / Auth / RBAC / Webhooks / Secrets

> Auditoria manual (agentes cortados). O sistema já passou por MÚLTIPLAS auditorias
> de segurança (memórias: audit-security 06-27/06-28/07-08). Esta passagem confirma
> que os padrões críticos seguem sólidos e não achou P0 novo.

## Verificado SÓLIDO (preservar)
- **SQL injection:** os 2 `$queryRawUnsafe` (stock.ts:3236, :3659) usam bind param
  (`$1::uuid[]`) ou `current_setting` — SEM interpolação de input. Seguro. Confiança alta.
- **RLS scoping** (db.ts:86-111): `SET LOCAL ROLE` + `SET LOCAL app.current_tenant_id`
  com `validTenantId` (UUID já validado). SET LOCAL (não SET de sessão) — correto p/
  pool. Interpolar UUID validado é aceitável (parametrizar seria marginalmente melhor).
- **Secret logging:** os logs de credencial ("password reset", "passphrase trocada",
  "secret rotacionado") logam só EVENTO + tenantId/userId, NUNCA o valor. Limpo.
- **Auth:** tenantProcedure valida tenant do JWT vs disponível (defense-in-depth,
  testado em auth-tenant-access). adminProcedure exige isSuperAdmin.
- Webhooks: Eulen com auth 3-formatos + cross-check anti-forja; timing-safe compare
  nos crons; dedup de evento (markWebhookProcessed).

## A confirmar (não concluído nesta passagem — hardening, não P0)
### C1 — withAdmin (bypass RLS) em routers tenant-facing — P2 (verificar)
`withAdmin` aparece em provider-commission, imei, sale, settings, service-order,
partner-api-key. Alguns são legítimos (tabelas globais: plans, subscriptions,
imei_quotas, users cross-tenant). Mas cada uso de `withAdmin` numa procedure
tenant-facing precisa de verificação: o filtro por tenantId é aplicado manualmente
DENTRO? Se algum `withAdmin` faz query sem `where tenantId` explícito → vazamento
cross-tenant. **Ação:** revisar 1-a-1 os `withAdmin` em routers tenant (não-admin).
Auditorias anteriores já validaram vários; re-confirmar os de sale/settings/service-order.
Confiança: média (não li cada um nesta passagem).

### C2 — `.max()` em inputs Zod — P3 (hardening)
Verificar se todas as strings livres têm `.max()` (anti-DoS/envenenamento). Auditorias
passadas adicionaram `.max()` em vários. Uma varredura de `z.string()` sem `.max()`
em validators/ vale como hardening. Confiança: baixa (não quantifiquei).

## Conclusão
Postura de segurança MADURA (fruto das auditorias anteriores). Nenhum P0/P1 novo
encontrado nesta passagem. Itens acima são hardening/verificação, não exploráveis
comprovados.
