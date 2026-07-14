# Auditoria Geral — Registro de Gaps (2026-07-14)

> Varredura de **12 domínios** em paralelo, cada um com a skill de auditoria correspondente
> (protocolo de 4 rodadas). Checkout fresco (HEAD à frente de origin/main). Cada achado foi
> verificado contra o código real. Fixes anteriores (#481-483, #490-515, #499-502, #536-539,
> #554, #318-323, #436-438) confirmados presentes — não re-listados.
>
> **Fase atual: descoberta.** Nada foi alterado. Este registro existe para o dono priorizar.

## Placar

- **P0 (corrigir já — dinheiro/legal/exploração agora):** 3
- **P1 (bug funcional / robustez / segurança bounded):** ~26
- **P2 (endurecimento / observabilidade / polish / testes):** ~40
- **0 P0 em:** Auth, PDV, OS, Estoque, Financeiro núcleo, DePix crédito, Clientes, Dashboard, Segurança RLS
  (o núcleo transacional está maduro — CAS/RLS/idempotência consistentes)

---

## Temas transversais (aparecem em vários módulos — corrigir a raiz mata vários gaps)

- **T1 — Acoplamento multi-tenant via env global (bomba-relógio):** o bot Talison manda leads
  (PII), link de catálogo e template de saudação para grupo/URL/marca **globais** hardcoded.
  Sem vazamento hoje (1 tenant com bot), mas **vira P0 no instante em que um 2º tenant ligar o bot**.
  → Bot A2/A3/A10.
- **T2 — Fuso BRT não aplicado em alguns relatórios:** DRE, `report.ts` (relatório NF) e `salesChart`
  ainda usam TZ do processo (UTC) → vendas nas bordas de dia/mês caem no bucket errado. O helper
  `date-range.ts` (BRT) já existe, só não foi usado nesses pontos. → F4, R1, D1.
- **T3 — Custo/margem vazam para não-admin:** a decisão A3 ("operador de balcão não vê custo") é
  defendida por stripping server-side no `list`/`getById` de estoque, mas os **relatórios** e o
  `getById` de OS devolvem `costPrice`/margem sem gate. → Estoque E1, OS R4, Financeiro F1.
- **T4 — DRE/relatórios divergem da fonte da verdade:** DRE de despesas ainda lê `installments.paid_amount`
  (não o ledger `installment_payments`), `salesChart` usa definição de receita diferente dos cards,
  `stockDashboard` ignora estoque serializado. Mesma métrica, dois números. → F3, D1, D2.
- **T5 — Erros de query engolidos no app inteiro:** 0 de 219 `useQuery` tratam erro; sem `throwOnError`.
  Falha de backend renderiza como "sem dados" (R$ 0, tabela vazia). Um fix na raiz (`trpc/react.tsx`)
  resolve os 219. → Frontend Q-SILENT.
- **T6 — Resíduos de read-then-write (não-atômico):** alguns caminhos ainda checam-depois-escrevem
  sem CAS/lock. → Interest P1-2, Reward F6/F7, OS R3 (lab payable), quick-sale markPaid.

---

## P0 — corrigir já

| ID | Módulo | Achado | Arquivo | Fix |
|----|--------|--------|---------|-----|
| **G-P0-1** | Fiscal | Payload de emissão NF-e **omite o emitente** (CNPJ/IE/ambiente/série/CSC/endereço do tenant). Nota sai sob a conta global ou é rejeitada; `ambiente` vem de env global → tenant de homologação pode emitir em produção. | `fiscal.ts:331-346`, `fiscal-service.ts:56-77` | Montar payload a partir de `TenantFiscalSettings` por tenant; registrar/selecionar a empresa correta na Nuvem Fiscal. **Confirmar se emissão está ativa em prod antes de priorizar.** |
| **G-P0-2** | Fiscal | Certificado digital é upado e cifrado (AES-GCM, ok) mas **nunca é usado** na emissão — nenhum path registra o cert com a empresa Nuvem Fiscal. Sem cert vinculado ao CNPJ emissor, autorização SEFAZ real não conclui. | `settings.prisma:64-68`, ausente em `fiscal-service.ts` | Registrar o cert com a empresa do tenant; validar `certificateExpiresAt` antes de emitir. |
| **G-P0-3** | Financeiro | **Rota REST `/api/financial/export` fura o gate RBAC F8:** autentica só sessão+tenant, sem check de admin. Operador acessa `?type=transactions&txType=PAYABLE` (custos de fornecedor) e `type=installments` (sem filtro de tipo, dumpa PAYABLE+RECEIVABLE) direto pela URL. | `app/api/financial/export/route.ts:16-115` | Gatear linhas PAYABLE atrás de `isTenantAdmin`; para operador forçar `where.type="RECEIVABLE"` nos dois branches. |

---

## P1 — bug funcional / robustez / segurança

### Dinheiro / fiscal / consistência de relatório
| ID | Módulo | Achado | Arquivo |
|----|--------|--------|---------|
| G-P1-01 | Financeiro | DRE de **despesas ignora o ledger** `installment_payments` (ressuscita FIN-B2 no lado do pagável): parcela PARTIALLY_PAID some do DRE até quitar; pagamento em 2 meses vai todo pro último `paid_at`. `stats` já migrou, DRE não → os dois relatórios discordam. | `financial.ts:1165-1175` |
| G-P1-02 | Dashboard | `salesChart` usa **definição de receita diferente** dos cards do mesmo painel (soma `totalAmount` cru, filtra `createdAt`, só COMPLETED) → barras não somam o card "Vendas do mês"; parcialmente-estornadas somem, trade-in deforma barra, venda 21-23h BRT cai no dia errado. | `dashboard.ts:273-294` |
| G-P1-03 | Dashboard/Fiscal | `report.ts` (relatório NF) **não ancora BRT** (janela −3h, perde vendas 21-23:59) e **omite `deletedAt: null`** (venda soft-deletada COMPLETED infla `valueTotal`). | `report.ts:10-11, 14-45` |
| G-P1-04 | Dashboard | `stockDashboard` **exclui todo estoque serializado** (`isSerialized:false`) e lê a coluna `currentStock` desconfiada → para negócio de iPhone (estoque é serializado) subconta drasticamente; diverge por construção do low-stock do painel/estoque. | `dashboard.ts:469-491` |
| G-P1-05 | Financeiro | DRE não é BRT-ancorado (`new Date(year,0,1)` no TZ do processo + `EXTRACT` no TZ da sessão) → vendas/despesas nas bordas de mês/ano no bucket errado. | `financial.ts:1109-1110` |
| G-P1-06 | Estoque | Relatórios de trade-in (`reportUpgrades`, `reportsSummary.upgrades`) **não filtram `cancelledAt: null`** → compra cancelada (estoque revertido, dinheiro devolvido) ainda conta em quantidade/valor. | `stock.ts:3337, 3411` |
| G-P1-07 | PDV | `applyDiscount` **ignora o abatimento de trade-in** e não sincroniza `refundDueAmount` (é o único mutador de carrinho que não delega a `recalculateSale`) → desconto após trade-in **cobra a mais**; downgrade+desconto deixa estado contraditório que o finalize rejeita. | `sale.ts:917-932` |

### Estoque / OS / caixa
| ID | Módulo | Achado | Arquivo |
|----|--------|--------|---------|
| G-P1-08 | Estoque | **Custo/margem vazam para não-admin** em TODOS os relatórios (`inventoryReport`, `stockDashboard`, `reportPosicao`, `reportVendasProduto`, `reportVendasVendedor`) — `tenantProcedure` sem `isTenantAdmin`/stripping. Operador chama a procedure direto. | `stock.ts:1868, 2586, 2774, 3118, 3230` |
| G-P1-09 | OS | Custo/margem (`costPrice`, `partsCost`, `otherCost`) devolvidos incondicionalmente no `getById` — UI esconde botão via `viewerIsAdmin` mas o payload vaza pela API. | `service-order.ts:562, 272-297` |
| G-P1-10 | OS | `refund` **pula a baixa de caixa** para OS paga direto em dinheiro sem sessão aberta (o guard de sessão só cobre o caminho da Sale vinculada) → gaveta superestimada pelo valor estornado. | `service-order.ts:1357-1376, 1509-1559` |
| G-P1-11 | OS | `delete` (admin) **sem guard de status:** deletar OS PAID/DELIVERED restoca mercadoria vendida (infla estoque) e orfana recebível/caixa/comissão. | `service-order.ts:1598-1644` |
| G-P1-12 | OS/Operação | Geração de PAYABLE de laboratório é **read-then-create** (não atômica) + sem gate admin → duas chamadas `RETURNED`/`COMPLETED` concorrentes criam PAYABLE duplicado. | `operation.ts:266-303` |
| G-P1-13 | Interesses | Telefone do cliente salvo cru (sem normalizar) enquanto a busca usa dígitos → registros legados/importados com máscara ficam **invisíveis na busca**. | `customer.ts:210, 289` vs `:69` |
| G-P1-14 | Interesses | `updateStatus` (guard de estado terminal) é read-then-write sem lock → auto-conversão em venda (COMPLETED) e `updateStatus(CANCELLED)` concorrentes: last-write-wins corrompe funil. | `interest.ts:154-179` |

### Segurança / DePix / auth
| ID | Módulo | Achado | Arquivo |
|----|--------|--------|---------|
| G-P1-15 | DePix | Branch `depix_sent` **sem `blockchainTxID`** chama `applyPixReceivedEffects` **sem cross-check e sem revalidação Eulen** — para `sourceType` SALE/QUICK_SALE/SUBSCRIPTION, webhook forjado (secret vazado) omitindo txid libera venda/renova assinatura. Mesma classe do S1/S2 que o branch `approved` já blinda. | `lib/webhooks/eulen-deposit-handler.ts:224-236` |
| G-P1-16 | DePix/Sec | `recordWebhookEvent` trata **qualquer erro de DB como replay** (`catch → false`) → evento genuíno é ACKado 200 e nunca processado; **MED perdido** (alerta de chargeback nunca dispara). | `lib/webhooks/replay-guard.ts:38-44` |
| G-P1-17 | Segurança | `subscriptions` é **a única tabela tenant sem RLS backstop** (120/120 outras têm ENABLE+FORCE). Sem vazamento hoje (todos os call sites usam `withAdmin`+filtro), mas um futuro `withTenant().subscription.findFirst()` sem filtro leria plano/billing de outro tenant. | `subscription.prisma:38`, `tenant-plan.service.ts:18` |
| G-P1-18 | Auth | **Gating de rota é fail-open** para prefixo não-registrado: rota `(app)` nova sem registrar o prefixo fica acessível a todo tenant, ignorando plano. Autorização default = permitir. | `lib/modules.ts:282-298, 380-387` |
| G-P1-19 | Auth | `updateTenant` escreve `Tenant.status` incondicional, **desacoplado de `Subscription.status`** → podem divergir (sub SUSPENDED mas tenant ACTIVE = login funciona + gating cai no shadow `Tenant.plan`). | `admin.ts:452-461` |
| G-P1-20 | Auth | **DoS de lockout por conta:** limiter de login chaveia só no identificador (`login:cpf:<x>`); quem souber o CPF da vítima trava o login dela por 15min, sem dimensão de IP nem captcha. | `auth.ts:257-269` |

### Bot / IA
| ID | Módulo | Achado | Arquivo |
|----|--------|--------|---------|
| G-P1-21 | Bot | **WhatsApp→Claude Code = RCE em prod:** mensagem roda `claude --print <task>` como `deployer` no repo vivo (edita/branch/PR/merge/deploy). Auth = token + `endsWith()` de telefone; sem teto de custo, sem confirmação para tarefas destrutivas. | `whatsapp-ai-agent/code-agent.ts`, `access-control.ts` |
| G-P1-22 | Bot (T1) | Alertas de lead quente/abandono postam PII em **grupo WhatsApp global** hardcoded (`TALISON_ALERT_GROUP_JID`) — P0 no 2º tenant do bot. | `talison/tools/handoff.ts:165-178` |
| G-P1-23 | Bot (T1) | Link de catálogo é **URL global** para todos os tenants, mas o catálogo público é por-subdomínio → cliente do 2º tenant vai pro catálogo da Arena. | `talison/tools/stock.ts:28` |
| G-P1-24 | Bot | Envios genéricos (`dispatchMessage`/`sendToCustomer`/resend) **furam o fallback de 24h** (mandam texto cru → Meta rejeita fora da janela → "FAILED" silencioso). Só `notifyOsCompleted` foi migrado. | `communication.ts:63` |
| G-P1-25 | Bot | **Sem contabilidade de custo/token nem teto por tenant** — `usage` do provider é descartado; combinado com A1 não há guarda contra estouro de custo. | `talison/agent.ts`, `metrics.ts` |

### Frontend
| ID | Módulo | Achado | Arquivo |
|----|--------|--------|---------|
| G-P1-26 | Frontend (T5) | **Falhas de query engolidas app-wide** (0/219 sites tratam erro; sem `throwOnError`/`QueryCache.onError`) → outage de backend parece "sem recebível/sem estoque". `error.tsx` **não reporta ao Sentry** (só `console.error`). Sem `keepPreviousData` em lista nenhuma (tabela pisca a cada página/filtro). | `trpc/react.tsx:22-28`, `app/error.tsx:14-16` |

---

## P2 — endurecimento / observabilidade / polish / testes

**Fiscal:** P1-1 cancel/carta-correção/download hardcodam `/nfe/` → NFC-e quebra (`fiscal-service.ts:209,250,308`); webhook sem state-machine (CANCELLED volta a AUTHORIZED por reordem) (`route.ts:111-127`); `inutilizar` é **mock** que retorna sucesso sem chamar SEFAZ (`fiscal.ts:646-674`); sem dedup em `createFromSale`/`createFromServiceOrder` → NF-e dupla (`fiscal.ts:169-274`); invoice trava em PENDING sem reconcile/retry (`fiscal.ts:351-399`); parser XML por regex falha em namespace/CDATA silenciosamente (`nfe-import.service.ts:90-174`); total NET vs itens gross sem `vDesc` com trade-in.

**Financeiro/Reward:** CSV injection não corrigido no export financeiro (`route.ts:141-146`); campanha de reward não é admin-gated (`reward.ts:83,125,155`); `lockBalance` de cashback é TOCTOU (`reward.ts:648-689`); contador de participantes não-atômico e conta ações≠pessoas (`reward.ts:242-334`); branch de gate operador morto/contraditório (`financial.ts:264-270`).

**Estoque:** sem unique em `DeviceValuation` → preços duplicados (`valuation.prisma`); dedup IMEI/serial check-then-insert (P2002 cru em vez de CONFLICT) (`stock.ts:1004-1084`); `StockItem` de compra não grava `supplierId` (`stock.ts:1158-1174`); dois writers divergentes de `StockMovement` (com/sem quantityBefore/After); **arrays de lote sem `.max()`** (`stockEntryBatch`, `bulkAdjust`); falta índice `[tenantId, createdAt]` em `StockMovement`; limite IMEI congelado no mês (upgrade não sobe); `bulkAdjustPrice` faz N updates; compra à vista sem sessão deixa gaveta/DRE inconsistente.

**PDV/Caixa:** venda à vista pode cair em gaveta recém-fechada (finalize↔close race, sem `FOR UPDATE`); refund não valida saída contra saldo da gaveta (pode negativar); `autoCloseAbandonedSessions` fabrica saldo contado (`declaredBalance=calculated`, deveria ser null); `quick-sale.markPaid`/`checkPixStatus` sem CAS de status.

**OS/Operação:** base de comissão de prestador externo inclui peças (não só serviceAmount) — confirmar intenção; tabela de transição contradiz o guard de cancelamento; deletes de operação sem check de uso/existência; checklist update/delete sem gate/validação de FK; `ensureBudgetRevision` race pode orfanar quote pendente.

**Auth/Sec:** limiter de login in-memory (migrar p/ Redis antes de escalar horizontal); `forgotPassword` timing oracle; `assertTenantUserQuota` TOCTOU; refresh de JWT degrada aberto em erro de DB; bcrypt no hot-path da partner-API sem cache; `deletePlan` não conta `Subscription.planId`; `publicPlans` vaza `features` completo (gating); login TOTP sem anti-replay (por design — documentar); pre-registration retém `passwordHash` após aprovação; NO-KYC revela email já cadastrado (enumeração); Chatwoot aceita token na query string (depende de nginx externo); CSP mantém `'unsafe-inline'`; rate-limit público não aplica teto degradado.

**Bot:** sem eval suite de qualidade LLM; model aliases flutuantes sem calendário de deprecação; `suspiciousPrice` só loga (nunca abstém); `downloadImage` sem allowlist de host (SSRF); debounce só em processo; sem cap de abuso por-contato; safety rails do code-agent só no prompt (não impostas).

**Frontend:** Suspense fallbacks mortos + skeletons duplicados (0 `useSuspenseQuery`); `tabular-nums` inconsistente em moeda (financeiro/comissões/reports sem); `error.tsx` ainda usa `100vh` (iOS).

**Clientes/Interesses:** `sendBatch` cooldown lê snapshot stale (não-atômico → duplica WhatsApp); auto-conversão por telefone pode converter lead errado (número reciclado); dois caminhos "done" divergentes (status vs convertedAt); `Interest.cpf` não normalizado/validado; scans `contains` sem índice (pg_trgm se crescer); `byId` engole erro de serviceOrder como "tabela não existe".

**Dashboard:** `detailedAlerts` órfão define "overdue"/"late OS" diferente de `alerts` (deletar ou reconciliar); `ordersByStatus` faz 13 counts sequenciais (usar `groupBy`); sem cache/TTL nos agregados do painel.

---

## Confirmações que precisam de check em prod (não bloqueiam, mas mudam prioridade)
1. **Emissão NF-e está ativa em prod?** (define severidade real de G-P0-1/G-P0-2)
2. **Algum tenant não-Arena tem o bot ligado?** (T1 vira P0 se sim)
3. **`APP_DATABASE_URL` (`app_login`) está setado no VPS?** Se não, raw queries caem no `DATABASE_URL` privilegiado (bypass de RLS).
4. **Sentry source maps** (`SENTRY_AUTH_TOKEN`) — stack traces minificados em prod até configurar.
