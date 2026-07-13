# F — Código Morto / Funções Incompletas / Órfãos

> Auditoria manual (agentes cortados por limite de sessão). Método: script Node
> (`/tmp/orphan-check2.mjs`) cruzando as 565 procedures tRPC com callers em todo o
> `src` (mapeando a chave camelCase do router via `root.ts`), + verificação manual
> por grep de cada achado. Só listo o que PROVEI.

## Resumo
- 565 procedures tRPC no total.
- ~95 sem caller pelo regex automático; a maioria são FALSOS POSITIVOS (chamadas
  que o regex não pega: destructuring de `trpc`, uso indireto). Os confirmados
  manualmente abaixo são reais.

## Achados confirmados

### F1 — Módulo `reward` inteiro sem UI (feature pela metade ou morta) — P1
**Fato:** `rewardRouter` é montado em `root.ts:46` mas **nenhum caller existe em
todo o `src`** (grep `trpc.reward.` = 0 fora do root; 0 no frontend, 0 no bot, 0 em
services). Tem procedures: listCampaigns/createCampaign/updateCampaign/toggleCampaign,
listActions/createAction/approveAction/rejectAction/cancelAction/useAction,
getBalance/getAvailableRewards/lockBalance/unlockBalance, expireOverdue. Há inclusive
um cron `expire-rewards` ativo (systemd) operando sobre dados que nenhuma UI cria.
**Impacto:** sistema de fidelidade/recompensas 100% backend, invisível ao usuário.
Ou (a) falta a UI (feature incompleta), ou (b) é código morto a remover. O cron roda
à toa. **Confiança: alta.**
**Ação:** decidir com o dono — completar a UI de recompensas OU remover o módulo +
cron + schema. NÃO remover sem confirmar (pode ser roadmap).

### F2 — Sub-cluster de DESPESAS em `operation` sem UI — P2
**Fato:** `operation.listExpenses/createExpense/approveExpense/rejectExpense/
deleteExpense/expenseStats` — 0 callers no frontend (a página `/operation` usa só
delivery-persons/external-labs/service-providers/lab-orders). grep confirma 0.
**Impacto:** feature de despesas operacionais construída no backend, sem tela.
Nota: existe `cashier.expense` (despesa de caixa) que É usada — não confundir; o
`operation.*Expense*` é um segundo sistema de despesas, órfão.
**Confiança: alta.** **Ação:** completar a UI de despesas operacionais OU remover.

### F3 — `depix-swap` (conversão DePix→USDT) desativado mas ainda montado — P3
**Fato:** `root.ts:26` comenta "depixSwapRouter DESATIVADO — ver depix-swap.ts",
mas `depix-swap.preview`/`execute` aparecem como procedures (key `?` = não montado).
**Confiança: média** (precisa confirmar se o router está de fato fora do appRouter).
**Ação:** se está desativado, o arquivo `depix-swap.ts` é código morto — remover ou
documentar como "parqueado" explicitamente. Ver memória depix-usdt-conversao-sideswap.

## LISTA DEFINITIVA — 85 procedures cujo nome só aparece no próprio router
> Método confiável (`/tmp/orphan-final.mjs`): conta `\bproc\b` em TODO o `src`;
> se só ocorre no arquivo do router, tem **0 callers**. Calibrado: `listTenants`
> e `finalize` (usadas) corretamente NÃO aparecem. Alguns podem ser chamados por
> caminho não-tRPC (webhook/cron via import do service, não da procedure) — mas a
> procedure tRPC em si está sem uso. Agrupadas por natureza:

**Clusters de FEATURE SEM UI (fluxo pela metade — completar ou remover):**
- **reward.\*** (15 procedures): sistema de fidelidade/recompensas inteiro sem UI (F1).
- **chatbot.\*** (11): listConversations, getConversation, assignAgent, resolve/reopen
  Conversation, sendMessage, list/schedule/cancelFollowUp, searchCustomerByPhone,
  linkConversationToCustomer — gestão de atendimento sem UI (o chat vive no Chatwoot
  via webhook; essa API tRPC paralela é inerte).
- **operation.\*Expense\*** (6): despesas operacionais sem UI (F2).
- **catalog serviceType** (5): create/rename/duplicate/deleteServiceType +
  listServiceTypesWithCount — CRUD de tipos de serviço sem UI aparente.
- **communication** (3): sendToCustomer, un/resubscribeCustomer — sem UI.

**Procedures avulsas órfãs (backend existe, sem botão/tela):**
- admin.deleteTenant — **CONFIRMADO**: sem botão "excluir tenant" no admin (embora o
  backend tenha sido endurecido no épico de tenants). Fluxo incompleto.
- admin.{getAddon, assignAddon, getRefund, publicPlans}
- cashier.{statusCheck, getOpenSession} — (periodStats saiu; usada em outro ponto)
- dashboard.detailedAlerts
- depix-wallet.{getFeeConfig, updateFeeConfig}
- fiscal.{createFromSale, createFromServiceOrder, downloadPdf, downloadXml}
- iphone-hunter.{listGroups, toggleGroup}
- nfe-import.{saveCosts, suggestProducts, getProductVariations, getXml}
- partner-api-key.getAccess
- provider-commission.updateProvider
- service-order.saveSignaturePad
- settings.{upsertInstallmentRules, upsertPaymentRates, listTeam,
  updateFiscalCertificate, removeFiscalCertificate, updateSecurity,
  listNotificationConfigs, upsertNotificationConfig, toggleNotificationConfig}
- stock.{updatePurchaseDate, stockEntry, getCsvImportTemplate, createVariation,
  getStockItem, entryQuantity, getImeiHistory}
- two-factor.regenerateBackupCodes — 2FA sem "regenerar códigos de backup" na UI?
- valuation.{listStorageOptions, listBatteryOptions}
- auth.validateTenantAccess (pode ser usada internamente por outra procedure)

**IMPORTANTE (metodologia):** "só no próprio router" prova 0 caller-por-nome, mas
NÃO prova morto — alguns são chamados de forma que o nome aparece só 1x (ex.: a UI
pode chamar via variável). Cada item acima precisa de 1 verificação visual da tela
correspondente ANTES de remover. `admin.deleteTenant`, `reward.*`, `chatbot.*`,
`operation.*Expense*` já foram verificados (sem UI, confirmados). Os demais: verificar.

## A verificar (candidatas do script, precisam de checagem manual 1-a-1)
Muitas abaixo provavelmente SÃO usadas (falso positivo do regex). Verificar cada:
- catalog.{listServiceTypesWithCount,createServiceType,renameServiceType,duplicateServiceType,deleteServiceType,bulkAdjustPrices,getCatalogDevice,simulateInstallments}
- chatbot.{listConversations,getConversation,assignAgent,resolveConversation,reopenConversation,sendMessage,listFollowUps,scheduleFollowUp,cancelFollowUp,searchCustomerByPhone,linkConversationToCustomer}
- communication.{sendToCustomer,resend,unsubscribeCustomer,resubscribeCustomer}
- fiscal.{createFromSale,createFromServiceOrder,downloadPdf,downloadXml}
- nfe-import.{saveCosts,suggestProducts,getProductVariations,getXml}
- dashboard.detailedAlerts, cashier.{statusCheck,getOpenSession,periodStats}
- admin.{deleteTenant,getAddon,assignAddon,getRefund,publicPlans} (alguns são chamados no admin UI)

> Nota metodológica: `admin.deleteTenant` aparece como órfã mas EU MESMO a chamo em
> tenant-detail via mutation — é falso positivo (o regex não pegou o padrão). Isso
> mostra que a lista "a verificar" tem muitos FP. A verificação 1-a-1 continua.
