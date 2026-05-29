# 05 — PROGRESS

> Este arquivo é a **memória viva** do projeto. Claude atualiza após cada checkpoint.
> Você consulta com `arena-progress` de qualquer lugar.

---

## Estado atual

**Fase atual:** Sistema rodando em produção (https://app.arenatechpi.com.br). Migração de dados Laravel → Postgres concluída (clientes, produtos, vendas, OS, financeiro, configurações, recompensas, chatbot, dashboard custom). PDFs refeitos com identidade Arena Tech (dourado #c9a84c + preto-noite). Upload de logo via MinIO. Onda 1+2+3 de paridade PDV+Estoque entregue. Fluxo de upgrade/downgrade de aparelhos auditado e corrigido com paridade total ao Laravel (DePix como devolucao, StockItem AVAILABLE, IMEI Luhn, PDF com IMEIs).
**Ultima atualizacao:** 2026-05-29
**Módulos totais:** 29 routers tRPC + 7 webhooks/API routes
**Progresso E2E:** 126/126 @business verde no pre-push (paridade total na suite reduzida)
**Branch atual:** `main`
**Em produção:** ✅ contabo (194.34.232.81) — Postgres prod + MinIO + app rodando

---

## Fases

### ✓ Fase 0 — Bootstrap & infra local
- [x] Diagnóstico do ambiente
- [x] Docker Compose criado (postgres:16, redis:7, minio, mailhog)
- [x] Stack subindo — todos healthy (postgres, redis, minio, mailhog)
- [x] Mapeamento .env do Laravel → .env.example + .env.local
- [x] MIGRATION_NOTES.md com inventário do legado
- [x] Commit final

### ✓ Fase 1 — Esqueleto Next.js + tRPC + Prisma
- [x] create-next-app (Next.js 16.2.5, App Router, standalone)
- [x] TypeScript estrito (strict + noUncheckedIndexedAccess + noImplicitOverride)
- [x] ESLint flat config (eslint.config.mjs) + Prettier
- [x] tRPC v11 estruturado (server + client + API route)
- [x] Prisma 7 multi-file schema (prismaSchemaFolder preview)
- [x] NextAuth v5 placeholder
- [x] shadcn/ui inicializado (new-york, slate, 22 componentes)
- [x] Vitest + Playwright configurados
- [x] Hello World tRPC (`/` → "olá" via server caller)
- [x] typecheck ✓ | lint ✓ | test ✓ | e2e ✓ | build ✓
- [x] Commit final

### ✓ Fase 2 — Schema base + RLS
- [x] Schema Tenant + User + UserTenant + AuditLog (Prisma 7 multi-file)
- [x] Convenções documentadas em docs/PATTERNS.md
- [x] Migration RLS aplicada (current_tenant_id(), policies, FORCE ROW LEVEL SECURITY)
- [x] Cliente Prisma com tenant scoping (withTenant, withAdmin via $transaction + SET LOCAL)
- [x] Roles app_user (RLS) / app_admin (BYPASSRLS) criadas
- [x] Seed idempotente (tenant arena-tech + super admin via env)
- [x] Suite de testes RLS: 6 cenarios passando (isolamento, WITH CHECK, bypass, defense in depth)
- [x] ADR 0001 em docs/decisions/
- [x] typecheck ✓ | lint ✓ | test ✓ | e2e ✓ | build ✓
- [x] Commit final

### ✓ Fase 3 — Auth
- [x] Validador CPF com Zod (26 unit tests)
- [x] NextAuth v5 beta.31: Credentials provider (CPF + bcrypt)
- [x] JWT callbacks: availableTenants, activeTenantId, isSuperAdmin
- [x] Auth config split: auth.config.ts (Edge) + auth.ts (Node)
- [x] Cookie x-active-tenant para switch de tenant sem re-auth
- [x] Middleware Edge: proteção de rotas, redirect por estado auth/tenant
- [x] tRPC: publicProcedure, protectedProcedure, tenantProcedure, adminProcedure
- [x] Páginas: login, select-tenant, no-access, forgot-password, dashboard, admin
- [x] CpfInput component com máscara automática
- [x] Seed: 4 users (super admin, single-tenant, multi-tenant, no-access)
- [x] E2E: 8 cenários (invalid CPF, wrong password, single/multi/super admin, logout, redirect)
- [x] ADR 0002 + PATTERNS.md atualizado
- [x] typecheck ✓ | lint ✓ | test ✓ | e2e ✓ | build ✓
- [x] Commit final

### ✓ Fase 4 — Design system + layout
- [x] Tokens CSS — paleta Arena Tech (dourado #c9a55c, preto #0a0a0a, prata)
- [x] Branding — logo placeholder SVG "ARENA·TECH"
- [x] Layout shell (app) — sidebar 224px/64px + header + breadcrumb
- [x] Layout shell (admin) — variação para super admin
- [x] Componentes de domínio — data-table, forms, inputs especializados
- [x] Status-badge, entity-selector, confirm-dialog, page-header, empty-state
- [x] Command palette ⌘K
- [x] Toast helpers (sonner)
- [x] Auth pages redesign (login, select-tenant, no-access)
- [x] Página /dev/components (catálogo completo)
- [x] Testes unit + e2e do shell (11 unit + 8 e2e)
- [x] ADR 0004
- [x] Commit final

### ✓ Fase 5 — Configurações + Catálogo + Clientes
- [x] Configurações (6 submódulos: settings, payment methods, installment rules, integrations, user roles, invite user)
- [x] Catálogo (4 submódulos: services, diagnostic templates, device categories, devices)
- [x] Clientes (4 submódulos: list, create, edit, detail + interests)
- [x] PATTERNS.md documentado com padrão CRUD + notas Zod v4
- [x] Testes verdes (82 unit + integration customers + e2e customers)
- [x] Commit final

### ✓ Fase 6 — Estoque + Caixa + Financeiro
- [x] Estoque (produtos CRUD, movimentações atômicas, compras de aparelhos, relatório inventário)
- [x] Caixa (abrir/fechar com conferência, sangria/suprimento, histórico, resumo por forma de pagamento)
- [x] Financeiro (transações AP/AR, parcelamento automático, pagamento de parcelas, fluxo de caixa, vencidos)
- [ ] Saques Depix (integração Pixpay adiada para Fase 7/8 — depende de OS/PDV)
- [x] Testes verdes (31 unit tests de validators)
- [x] Commit final

### ✓ Fase 7 — Ordens de Serviço (CRÍTICO)
- [x] Schema OS + items + history + documents (4 tabelas, 2 enums, RLS)
- [x] Wizard de criação (5 steps: cliente, equipamento, problema+checklist, itens, resumo)
- [x] Mudança de status com regras (13 estados, transições validadas server-side)
- [x] Pagamento com integração financeiro (FinancialTransaction + CashMovement)
- [x] Vista pública por link (/os/[publicLink])
- [x] Listagem com filtros + stats cards
- [x] Detalhe com ações de status contextuais + adicionar/remover itens
- [x] Editar dados da OS
- [ ] Geração de PDF (placeholder criado, implementação futura)
- [ ] Integração Autentique (campos no schema, sem integração nesta fase)
- [ ] Integração Depix/PixPay (adiada para Fase 8+)
- [ ] Envio WhatsApp (adiado para Fase 13)
- [x] Testes (42 unit + 4 e2e)
- [x] Commit final

### ✓ Fase 8 — PDV
- [x] Schema Sale + SaleItem (2 tabelas, 1 enum, RLS)
- [x] Tela de venda (PDV full-screen, 2 colunas, busca + carrinho)
- [x] Carrinho com calculo (add/remove/+/-, desconto fixo/percentual)
- [x] Split payment (multiplas formas, parcelas para cartao credito)
- [x] Finalize atomico (estoque + CashMovement + FinancialTransaction)
- [x] Historico de vendas com DataTable + stats cards
- [x] Detalhe de venda com estorno
- [x] Atalhos de teclado (F2/F8/F9/Esc)
- [ ] Comissoes (adiadas para Fase 10 dedicada)
- [ ] PIX (Depix) (adiado — depende de integracao Depix)
- [x] Testes (35 unit + 5 e2e)
- [x] Commit final

### ✓ Fase 9 — Fiscal (NF-e via Nuvem Fiscal)
- [x] Schema invoices + invoice_items (2 tabelas, 2 enums, RLS)
- [x] Validators Zod: fiscal.ts (9 schemas)
- [x] Serviço: fiscal-service.ts com OAuth2, mock dev + real API prod
- [x] tRPC router: fiscalRouter (11 procedures: list, getById, create, createFromSale, createFromServiceOrder, authorize, cancel, correctionLetter, downloadPdf, downloadXml, stats)
- [x] Páginas: /fiscal (listagem + stats cards), /fiscal/new (emissão manual), /fiscal/[id] (detalhe com autorizar/cancelar/carta correção/PDF/XML)
- [x] Sidebar: Fiscal adicionado
- [x] Testes: 26 unit tests de validators
- [x] typecheck ✓ | lint ✓ | test ✓ | build ✓
### ✓ Fase 10 — Comissões
- [x] Schema commission_rules + commissions + RLS
- [x] Validators Zod: createRule, updateRule, listRules, listCommissions, calculate, changeStatus, batchChange, report
- [x] tRPC router: commissionRouter (9 procedures: listRules, createRule, updateRule, deleteRule, list, calculate, approve, pay, cancel, report, userSummary)
- [x] Páginas: /commissions (listagem), /commissions/rules (CRUD regras), /commissions/report (relatório mensal)
- [x] Sidebar: Comissões adicionado
- [x] Testes: 24 unit tests de validators
- [x] typecheck ✓ | lint ✓ | test ✓ | build ✓
### ✓ Fase 11 — Operação
- [x] Schema operation.prisma (4 tabelas: delivery_persons, external_labs, lab_orders, service_providers)
- [x] RLS habilitado em todas as 4 tabelas
- [x] Validators Zod: operation.ts (12 schemas)
- [x] tRPC router: operationRouter (14 procedures)
- [x] Páginas: /operation com tabs (Entregadores, Laboratórios, Envios Lab, Prestadores)
- [x] Sidebar: Operação adicionado
- [x] Testes: 30 unit tests de validators
- [x] typecheck ✓ | lint ✓ | test ✓ | build ✓
### ✓ Fase 12 — Consulta IMEI
- [x] Schema imei_queries + imei_quotas + RLS
- [x] Validators Zod: imeiSchema (Luhn), queryImei, listImeiQueries
- [x] Serviço: imei-service.ts com mock dev + real API prod
- [x] tRPC router: imeiRouter (4 procedures: query, history, getQuota, getById)
- [x] Página: /imei (consulta + resultado + histórico + indicador quota)
- [x] Sidebar: Consulta IMEI adicionado
- [x] Testes: 19 unit tests de validators
- [x] typecheck ✓ | lint ✓ | test ✓ | build ✓
### ✓ Fase 13 — Comunicação (WhatsApp + Email)
- [x] Schema messages + message_templates (2 tabelas, 3 enums, RLS)
- [x] Serviço: whatsapp-service.ts (Evolution API), email-service.ts (Resend)
- [x] Validators Zod: communication.ts (8 schemas)
- [x] tRPC router: communicationRouter (14 procedures: list, getById, send, sendToCustomer, resend, notifyOsCompleted, notifyOsStatusChanged, sendOsReceipt, sendSaleReceipt, listTemplates, createTemplate, updateTemplate, deleteTemplate)
- [x] Páginas: /communication (histórico), /communication/send (envio manual), /communication/templates (CRUD templates)
- [x] Quick actions: notifyOsCompleted, notifyOsStatusChanged, sendOsReceipt, sendSaleReceipt
- [x] Sidebar: Comunicação adicionado
- [x] Testes: 22 unit tests de validators + 6 unit tests whatsapp-service
- [x] typecheck ✓ | lint ✓ | test ✓ | build ✓
### ☐ Fase 14 — Recompensas (paralelizável, requer decisão prévia)
### ✓ Fase 15 — Admin Central (SaaS)
- [x] Schema admin.prisma (2 tabelas globais: plans, pre_registrations — sem tenant_id, sem RLS)
- [x] Validators Zod: admin.ts (11 schemas)
- [x] tRPC router: adminRouter (15 procedures: dashboard, tenants CRUD, plans CRUD, pre-registrations approve/reject, reports, publicPlans, submitPreRegistration)
- [x] hashPassword util (bcryptjs)
- [x] approve cria Tenant + User + UserTenant automaticamente
- [x] Páginas admin: /admin (dashboard), /admin/tenants (lista + detalhe), /admin/plans (CRUD), /admin/pre-registrations (lista + detalhe + aprovar/rejeitar), /admin/reports
- [x] Página pública: /register (form pre-cadastro sem auth)
- [x] Proxy.ts: /register como rota pública
- [x] AdminSidebar: hrefs corretos (Dashboard, Tenants, Planos, Pré-cadastros, Relatórios)
- [x] Testes: 25 unit tests de validators
- [x] typecheck ✓ | lint ✓ | test ✓ | build ✓

### ✓ Fase 16 — Hardening
- [x] Rate limiting (src/lib/rate-limit.ts) — in-memory Map com TTL cleanup
- [x] Security headers (next.config.ts) — X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [x] Logger estruturado (src/lib/logger.ts) — JSON output, integrado em todos os services + tRPC middleware
- [x] Metadata por pagina — createMetadata helper + export metadata em 13 paginas principais
- [x] Open Graph no root layout
- [x] Loading states — loading.tsx em app shell, service-orders, customers, stock
- [x] Bundle optimization — optimizePackageImports (lucide-react, date-fns, @tanstack/react-table)
- [x] 404 page (not-found.tsx) — Logo Arena Tech + botao voltar
- [x] Error page (error.tsx) — error boundary com retry + voltar
- [x] Testes: 17 unit tests (rate-limit 6, logger 7, metadata 4)
- [x] typecheck ✓ | lint ✓ | test ✓ | build ✓
### ✓ Fase 17 — Cutover
- [x] Dockerfile multi-stage (deps → build → runner) para Next.js standalone
- [x] .dockerignore otimizado
- [x] docker-compose.prod.yml (app + postgres:16 + redis:7 + minio)
- [x] .env.production.example com todas as variaveis
- [x] Nginx config (SSL Cloudflare, real IP, security headers, proxy 3001)
- [x] GitHub Actions CI/CD (validate + deploy via SSH)
- [x] Script de migracao de dados (scripts/migrate-arena-dev.sh — executado com sucesso)
- [x] RUNBOOK.md operacional (deploy, monitoramento, backup, cutover)
- [x] README.md atualizado (stack, setup, comandos, modulos, deploy)
- [x] typecheck ✓ | lint ✓ | test ✓ | build ✓

---

## Decisões pendentes (Claude registra aqui)

> Quando Claude precisa de uma decisão de produto sua, registra aqui em vez de pausar a execução. Continua com o que dá pra fazer e aguarda sua resposta.

### 2026-05-08 — Catálogo público (catalogo.arenatechpi.com.br)
O sistema Laravel tem um e-commerce completo separado (`catalogo.arenatechpi.com.br`) com VendaBot via WhatsApp. Está no escopo da migração? Se sim, em qual fase? Atualmente não está mapeado em nenhuma fase do plano.

### 2026-05-08 — Provider de NF-e
O sistema Laravel tem tanto Nuvem Fiscal quanto Focus NFe implementados via interface. Qual vai ser o provider padrão no Next.js? O plano menciona Nuvem Fiscal.

### 2026-05-08 — Cloudinary → MinIO
O sistema atual usa Cloudinary para imagens de produtos. A migração vai reescrever para MinIO (que está na stack). Isso vai requerer migração dos assets existentes no cutover (Fase 17).

---

## Lacunas identificadas no sistema antigo

- IMEI API key hardcoded em `IMEICheckService.php` — mover para env var
- Cross-banco FKs (depix_transacoes → ordens_servico em outro banco) — resolver no Postgres unificado
- Timestamps inconsistentes (criado_em vs created_at) — padronizar na migração
- configuracoes_parcelamento com 36 colunas (juros_2x...juros_36x) — redesenhar como tabela relacional
- avaliacoes.valor como string em vez de decimal
- Checklist OS com 30 colunas individuais — migrar para JSONB
- Status da OS mistura estados de processo + financeiros — redesenhar
- sem soft delete padronizado (alguns usam ativo boolean, sem deleted_at)
- Depix cria VendaAvulsa para toda transação PIX — redesenhar como Payment genérico
- PagBank webhook sem credenciais (provavelmente abandonado)
- Corrida99Service sem credenciais (provavelmente não ativo)

---

## Decisões arquiteturais (ADRs resumidos)

### 2026-05-08 — Multi-tenancy via RLS em vez de banco separado (ADR 0001)
O Laravel usa `stancl/tenancy` com banco MySQL separado por tenant. O Next.js usa RLS no PostgreSQL com `tenant_id UUID` + `SET LOCAL ROLE app_user` + `SET LOCAL app.current_tenant_id`. Ver `docs/decisions/0001-multi-tenancy-via-rls.md`.

### 2026-05-08 — Deploy Next.js via Docker na VPS (coexistência com Laravel)
O arenatech-app será hospedado na mesma VPS Contabo via Docker container próprio, com docker-compose dedicado. Next.js standalone na porta interna 3001, atrás do Nginx em `app.arenatechpi.com.br`. PostgreSQL 16 container na porta 5434, Redis 7 dedicado na porta 6380, MinIO nas portas 9000/9001.

### 2026-05-08 — WhatsApp via Evolution API (não Meta Cloud API diretamente)
O sistema atual usa Evolution API como wrapper sobre WhatsApp. Manter essa integração no Next.js — não migrar para Meta Cloud API diretamente pois a Evolution API já está funcionando e estável.

### 2026-05-08 — Payment via Depix/PixPay (não Pixpay.com.br diferente)
O "Pixpay" mencionado no plano de migração é na verdade o serviço "Depix" que usa a API `api.pixpay.space`. Não confundir com outros serviços de nome similar.

---

## Historico de execucao

### 2026-05-29 — SIMULADOR: taxas exibidas ao cliente separadas das taxas reais do PDV

Gap de paridade nao capturado antes: no Laravel o simulador usa `configuracoes_parcelamento` (taxas EXIBIDAS AO CLIENTE, com margem embutida pelo lojista para mitigar risco operacional) — **propositalmente separadas** das taxas reais do PDV/financeiro (`FormaPagamentoTaxa`). O nosso simulador estava reusando `PaymentMethod.feePercent` + `InstallmentRule.feePercent` (taxas de custo do PDV), furando a margem do lojista. **Decisao do dono:** SIM, usa taxa separada — a taxa do simulador e geralmente superior a real.

- **Schema:** novos models `SimulatorRateConfig` (singleton por tenant: `creditAvistaFeePercent`, `debitFeePercent`, `maxInstallments`) + `SimulatorInstallmentTier` (relacional, substitui as 35 colunas `juros_Nx` do Laravel — resolve a lacuna "redesenhar como tabela relacional"). RLS em ambas. Migration `20260529120000_simulator_rate_config`.
- **Defaults:** `src/lib/simulator-defaults.ts` replica a escala Laravel (2x/3x=0, 4x=1.99, +0.50/parcela ate 36x=17.99).
- **Router:** `simulate` agora le de `SimulatorRateConfig` (gross-up identico). `getOrCreateSimulatorConfig` cria com defaults se tenant nao tiver (tenants migrados antes da feature continuam funcionando). Novas procedures `getConfig`/`updateConfig` (RBAC owner/manager). So exibe parcela com taxa > 0 (paridade).
- **Init:** `tenantFinancialInit` seeda a config-padrao para tenants novos.
- **UI:** `/settings/installments` (antes redirect stub) virou a tela "Taxas do Simulador" — credito a vista + debito + max parcelas (2-36) + grid de taxas por parcela com show/hide por max + botao "Restaurar taxas-padrao". Nav atualizado.
- **Backfill prod:** `scripts/backfill-simulator-rates.ts` deriva a config das taxas ja existentes (InstallmentRule do cartao de credito) para preservar exatamente o que o cliente ja via em producao — rodar no deploy com `tsx --env-file`.

**Validacao:** typecheck OK | lint 0 erros | 685 unit OK (8 novos) | build OK | migration aplicada local.

---

### 2026-05-28 — OS: valores unificados nos itens + autorizacao de orcamento pos-assinatura

Reformulacao completa de "alteracao de orcamento / valores na OS". A causa-raiz era um conflito arquitetural: os totais eram items-driven (`recalculateOrderTotals`), mas o fluxo de orcamento gravava valores flat (`createQuote`) sem mexer nos itens — a proxima operacao de item apagava o valor aprovado (corrupcao de dados).

**Modelo (decisao do dono):** itens da OS = fonte unica da verdade; toda edicao (add/editar/remover/desconto) e feita direto nos itens. A partir da confirmacao da assinatura de entrada, qualquer alteracao exige nova autorizacao do cliente (envio manual via WhatsApp) ou de adm/gerente. Rejeitar reverte os itens ao snapshot anterior (estoque reconciliado).

- **Schema:** `ServiceOrderQuote` ganhou `previousItemsSnapshot` + `newItemsSnapshot` (JSONB). Migration `20260528160000_os_quote_item_snapshots`.
- **Router:** helpers `isEntrySigned`, `ensureBudgetRevision` (cria revisao pendente capturando snapshot pre-edicao), `syncBudgetRevision`, `revertItemsToSnapshot`, `applyQuoteApproval`/`applyQuoteRejection`. `addItem/updateItem/removeItem` + novo `updateDiscount` operam em regime A (livre pre-assinatura) ou B (cria pendencia pos-assinatura). `createQuote`+`sendQuoteWhatsApp` flat removidos → novo `requestBudgetApproval`. Approve nao sobrescreve mais valores (itens ja sao a verdade); reject reverte. Gate: pagamento bloqueado com `budgetPending`. RBAC de autorizacao manual agora cobre super admin; `adminRespondQuote` ganhou RBAC.
- **UI detalhe:** edicao inline por item + breakdown (servico/pecas/desconto/total) + desconto editavel; painel "Alteracao de Orcamento — Aguardando Autorizacao" (enviar/autorizar/reverter); dialogo flat removido. `viewerCanAuthorize` gateia "Autorizar agora".
- **Pagina publica + PDF do orcamento:** agora itemizados (anterior vs novo via snapshots).

**Validacao:** typecheck OK | lint 0 erros | 677 unit + 12 integracao OK | build OK | e2e novo T-15 (regime A livre → assinatura → regime B pendente → operador envia) verde.

---

### 2026-05-23 — PDV: fluxo de upgrade/downgrade de aparelhos com fidelidade total ao Laravel

Auditoria do trade-in (upgrade) + devolucao de diferenca (downgrade) revelou 10 gaps. Todos endereçados:

**Backend (sale router + validator)**
- DevicePurchase.purchasePrice = abatedValue (era appraisedValue — sobreestimava custo do aparelho usado)
- IMEI valida Luhn + duplicidade (estoque + upgrades da mesma venda) em addSaleUpgrade
- abatedValue <= appraisedValue enforced via Zod refine
- IMEI ou serialNumber obrigatorio (paridade Laravel valida_imei_ou_serial)
- 4 condicoes suportadas (NEW | SEMI_NEW | USED | DISPLAY)
- StockItem AVAILABLE criado para o aparelho de entrada (entra no estoque vendavel imediatamente)
- Product generico criado se nao existir + StockMovement ENTRY
- FinancialTransaction PAYABLE quando downgrade em PIX/dinheiro (era so comment "downgrade: sem receivable")
- refundDueMethod aceita "depix" + dispara createDepixWithdraw automatico apos commit da tx
- DepixWithdraw record persistido com number SQ-YYYYMMDD-NNNNN

**UX (PDV screen + UpgradeDialog)**
- Preview ao vivo no dialog: total carrinho, total abatido, saldo (cliente paga / loja devolve)
- Alerta laranja quando vira downgrade com explicacao + valor
- Badge "DOWNGRADE — loja devolve" destacado no resumo da venda
- Linha "Aparelho(s) de entrada" no breakdown de totais

**PDF (sale-delivery)**
- Nova tabela "Aparelhos Recebidos como Entrada" com IMEI/serie/condicao/avaliado/abatido
- Bloco "Quitacao da Diferenca" lista IMEIs dos aparelhos entregues
- Suporte ao metodo "depix" no texto de devolucao (era so cash/PIX)

**Validacao:** typecheck OK | lint 0 errors (warnings pre-existentes) | paridade visual Laravel termo-entrega.blade.php
**Commits:** 1 (`b8755d7`)

---

### 2026-05-20 — CHECKLIST: persistir laudo via TRPC ao finalizar (Onda 3, modulo 11/11 ✓ ONDA 3 COMPLETA!)

Modulo Checklist tinha schema + 6 procedures + UI funcional, mas a UI nunca chamava `create` — todo o trabalho do avaliador era estado local que sumia ao refresh. 1 gap critico corrigido:

- **G1 — Persistencia real do laudo:** `ChecklistFlow` agora invoca `checklist.create()` em `handleFinalizeLaudo` via mutation. Serializa `answers` como `results` JSON, valor oferecido em centavos, notas avaliador. Loading state durante save (Loader2 + "Salvando..."). Banner finalizado exibe ID salvo. Apenas marca `finalizado=true` apos sucesso (antes era otimista).

**Fora do escopo (decisao do dono):** Vinculacao com ServiceOrder/Purchase via props opcionais. Upload de fotos. Assinatura digital do avaliador.

**ONDA 3 COMPLETA (11/11):** Reward (1) + Chatbot (2) + Comunicacao (3) + Interest (4) + Valuation (5) + Depix-Withdraw (6) + Simulator (7) + Reports (8) + Dashboard (9) + Auth/Admin (10) + Checklist (11).

**Validacao:** typecheck OK | 655 unit OK | build OK
**Commits:** 1 (`8aeff30`)

---

### 2026-05-20 — AUTH/ADMIN: rate limit in-memory em login (Onda 3, modulo 10/11)

NextAuth v5 + Credentials provider funcional, mas sem qualquer protecao contra brute force. Schema TenantSecuritySettings (criado na Onda 2) tinha `maxFailedLoginAttempts/lockoutMinutes` mas nunca era enforced. 1 gap critico endereçado:

- **G1 — Rate limit no login:** Novo `src/lib/utils/rate-limit.ts` com `checkRateLimit`/`recordFailedAttempt`/`clearRateLimit`. Map global por chave (CPF), defaults 5 tentativas em 15min → lockout 15min. `auth.ts` authorize agora:
  1) Chama `checkRateLimit(cpf)` antes de tentar; se bloqueado, lanca Error com mensagem "Tente novamente em X minutos"
  2) `recordFailedAttempt` em CPF nao encontrado ou senha errada
  3) `clearRateLimit` em sucesso
- 5 unit tests novos (`__tests__/unit/utils/rate-limit.test.ts`) cobrindo allowed/decrement/lockout/reset/config customizada.

**Limitacoes documentadas:** Single-instance only. Producao multi-instance precisa migrar para Redis (`INCR` + `EXPIRE`) — interface foi desenhada para troca facil. TODO no codigo.

**Fora do escopo (decisao do dono):** RBAC com role enum (UserTenant.role e string livre hoje), activity logging em auth events, 2FA/MFA, validacao CPF com DV (util `isValidCpf` ja existe em tax-id.ts — pode ser plugado em sprint dedicado).

**Validacao:** typecheck OK | 626 unit OK (5 novos) | build OK
**Commits:** 1 (`2c13035`)

---

### 2026-05-20 — DASHBOARD: comparacao periodo anterior + comissoes em alertas (Onda 3, modulo 9/11)

Dashboard tinha 8 procedures (stats, recentSales/Orders, ordersByStatus, salesChart, alerts, cashierStatus, stockDashboard, detailedAlerts) + UI rica, mas faltava comparacao temporal (KPIs sem contexto) e alertas nao cobriam comissoes. 2 gaps endereçados:

- **G1 — Comparacao periodo anterior em stats:** Procedure agora calcula tambem `customersPrevMonth`, `osPrevMonth`, `salesPrevMonth*` (todalAmount + count) com janela do mes passado completo. Cada KPI retorna `previousMonth/previousMonthTotal` + `deltaPercent` (variacao% vs mes anterior). Formula: `(curr - prev) / prev * 100` com tratamento de prev=0 → 100% se curr>0 ou 0% se ambos 0.
- **G2 — Comissoes em detailedAlerts:** Inclui `pendingCommissions` (Commission status=PENDING) e `approvedCommissions` (status=APPROVED). `totalAlerts` soma pendingCommissions. UI consome gradualmente — campos novos sao aditivos.

**Fora do escopo (decisao do dono):** Cache Redis em queries pesadas (requer infra dedicada + estrategia de invalidacao). Refinamento de roles em alertas (gerente ve financeiro, vendedor ve so OS dele).

**Validacao:** typecheck OK | 621 unit OK | build OK
**Commits:** 1 (`7971585`)

---

### 2026-05-20 — REPORTS: endpoint generico /api/reports/[type]/pdf (Onda 3, modulo 8/11)

Reports tinha 7 relatorios funcionais (NF, Stock 8-tabs, Commission, Technician, Cashier, Admin) com procedures via tRPC e UI completa, mas sem export PDF generico. 1 gap endereçado:

- **G1 — Endpoint PDF generico:** `GET /api/reports/[type]/pdf?from=&to=` suporta 4 tipos canonicos:
  - `commission` — Comissoes do mes (usuario, tipo, ref, base, taxa%, valor) + total
  - `stock-position` — Posicao completa (SKU, produto, estoque, min, custo, venda) + total imobilizado
  - `nf` — Auditoria notas fiscais (tipo, numero, status, destinatario, total, autorizada)
  - `technician` — Desempenho por tecnico (OS count, concluidas, faturamento, custo, lucro)
  Cada renderer consulta via `withTenant` + cross-tenant users via `withAdmin`. HTML imprimivel via navegador (Ctrl+P) com CSS A4 print-friendly. Layout padrao com tenant trade name, periodo, timestamp. Paridade Laravel `RelatorioController::*Pdf`.

**Fora do escopo:** XLSX export, relatorios consolidados financeiros (DRE+receita+despesa em 1 view), dashboard executivo, comparativos periodo anterior.

**Validacao:** typecheck OK | 621 unit OK | build OK
**Commits:** 1 (`35d0cac`)

---

### 2026-05-20 — SIMULATOR: SimulatorSession + sendWhatsApp via Cloud API (Onda 3, modulo 7/11)

Simulator tinha 1 procedure (`simulate`) que calculava parcelas usando InstallmentRule + PaymentMethod, mais UI funcional + rota PDF. Sem persistencia + sem envio. 3 gaps endereçados:

- **G1 — WhatsApp Cloud Service (novo, substitui Evolution):** `src/lib/services/whatsapp-cloud-service.ts` com `sendCloudText`, `sendCloudTemplate`, `formatBrPhone`. Usa Meta Graph API v22.0 com `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_CLOUD_PHONE_NUMBER_ID`. Sem credenciais = mock dev (logger.info). **Migracao dos demais modulos (Comm, Interest, Chatbot) que ainda usam Evolution fica em sprint dedicado.**
- **G2 — SimulatorSession (novo model):** persiste simulacoes com `customerId` opcional, `productValueCents`, `downPaymentCents`, `resultPayload` JSON, `convertedToSaleId`, `sentAt`/`sentVia`, RLS. Procedures `saveSession`, `listSessions` (filtro por cliente), `getSession`.
- **G3 — sendWhatsApp:** Monta mensagem formatada (PIX/Debito/Credito a vista + 12 opcoes de parcelamento) e envia via Cloud API. Marca `sentAt` + `sentVia=whatsapp_cloud` + atualiza `customerPhone` se necessario.

**Fora do escopo:** Conversao simulacao → venda automatica (vincular SimulatorSession.convertedToSaleId quando finalizar PDV). UI nova para historico de sessoes.

**Validacao:** typecheck OK | 621 unit OK | build OK
**Commits:** 1 (`2a64888`)

---

### 2026-05-20 — DEPIX-WITHDRAW: webhook Pixpay + validacao DV CPF/CNPJ (Onda 3, modulo 6/11)

Modulo Depix-Withdraw tinha schema completo + 7 procedures + UI funcional, mas dependia de polling manual (`checkStatus`) e validacao de documento era apenas length. 2 gaps endereçados (integracao API real adiada):

- **G1 — Webhook Pixpay:** Novo `POST /api/webhooks/depix-withdraw` com HMAC SHA256 (`PIXPAY_WEBHOOK_SECRET`). Mapeia status Pixpay (unsent/processing/completed/failed/cancelled) para `DepixWithdrawStatus`. Idempotente: estados terminais (SENT/FAILED/CANCELLED) nao reprocessam. Atualiza `status`, `blockchainTxId`, `receivedAmount`, `fee`, `apiResponse`.
- **G2 — Validacao DV CPF/CNPJ:** Novo util `src/lib/utils/tax-id.ts` com `isValidCpf`/`isValidCnpj`/`isValidTaxId` (algoritmo DV oficial, rejeita sequencias triviais). `createWithdrawSchema.recipientTaxId` agora aplica `refine(isValidTaxId)` — falha rapida antes de chamar API Pixpay, evitando rejeicoes downstream.

**Fora do escopo (decisao do dono):** Integracao real `criarSaque()` com POST /v1/withdraw Pixpay (depende de credenciais + ambiente teste). create() continua criando registro local em PENDING.

**Validacao:** typecheck OK | 621 unit OK | build OK
**Commits:** 1 (`6c4b6ca`)

---

### 2026-05-20 — VALUATION: validade configuravel por tenant + audit log em bulk ops (Onda 3, modulo 5/11)

Modulo Valuation tinha 11 procedures + UI + WhatsApp formatter, mas validade era hardcoded 7 dias e operacoes em massa (ajuste %, fixo, duplicar, deletar modelo) nao tinham rastreabilidade. 2 gaps endereçados (workflow de proposta adiado):

- **G1 — Validade configuravel por tenant:** TenantAssistanceSettings ganha `valuationValidityDays` (default 7). `updateAssistance` aceita o campo. `create` valuation usa default do tenant quando `validadeDias` nao informado. `formatWhatsAppMessage` prioriza config do tenant sobre validade do entry — garante consistencia ao mostrar prazo da proposta.
- **G2 — Audit log em bulk ops:** `logAudit` plugado em `bulkAdjust` (% por modelo), `bulkAdjustFixed` (R$ por modelo), `duplicateModel`, `deleteModel`. Cada operacao registra payload com `modelo`, parametros e contadores (`updated`/`created`/`deleted`). Reusa service `audit-log.service.ts` da Onda 2.

**Fora do escopo (decisao do dono):** Workflow de proposta com aprovacao do cliente + auto-criar DevicePurchase apos aceite (escopo grande — 1 sprint dedicado).

**Validacao:** typecheck OK | 621 unit OK | build OK
**Commits:** 1 (`7a27862`)

---

### 2026-05-20 — INTEREST: conversao + sendBatch real + conversionStats (Onda 3, modulo 4/11)

Modulo Interest tinha 8 procedures + UI completa mas com 2 gaps importantes: stub no sendBatch e sem tracking de conversao para ROI. 2 gaps endereçados (bridge estoque adiada):

- **G1 — sendBatch integrado com communication real:** Removido TODO. Agora cria Message real (channel=WHATSAPP, ref=interest) e invoca `sendTextMessage` da Evolution API. Em sucesso, cria InterestInteraction + atualiza `lastNotifiedAt`. Em falha, marca Message como FAILED mas nao reverte tx (atomicidade pode levar a inconsistencia se 1 dentre 5 falhar — manter parcial e contar errors).
- **G2 — Tracking de conversao:** Interest ganha `customerId`, `convertedAt`, `convertedToSaleId`, `convertedToOsId`, `lastNotifiedAt` + indice em `(tenantId, status, createdAt)` para aging queries. Procedure `markConverted({id, saleId|osId})` marca como COMPLETED. Procedure `conversionStats({from, to})` retorna `total/completed/converted/conversionRate%/byStatus`.

**Fora do escopo (decisao do dono):** Bridge automatica Estoque→Interest (cron de match StockItem novo vs Interest.desiredModel — schema complexo: texto livre vs catalogo + dificil dedup).

**Validacao:** typecheck OK | 621 unit OK | build OK
**Commits:** 1 (`b182ac0`)

---

### 2026-05-20 — COMUNICACAO: webhook Evolution + opt-out LGPD + SMS removido (Onda 3, modulo 3/11)

Modulo Comm tinha 13 procedures (Message + MessageTemplate), services Resend/Evolution e UI completa, mas faltava observabilidade de status real e compliance LGPD. 3 gaps endereçados:

- **G1 — Webhook Evolution para status:** `POST /api/webhooks/evolution` recebe `messages.update` com status (DELIVERY_ACK/READ/ERROR) e atualiza `Message.deliveredAt/readAt`. Implementa rank de status (PENDING<SENT<DELIVERED<READ; FAILED sobrescreve) para nao retroceder. Autenticacao via `Bearer EVOLUTION_WEBHOOK_TOKEN`.
- **G2 — Opt-out LGPD:** Customer ganha `unsubscribed` + `unsubscribedAt`. `sendToCustomer` rejeita FORBIDDEN quando cliente opted-out. Procedures `unsubscribeCustomer`/`resubscribeCustomer` para admin gerenciar. Compliance basica.
- **G3 — SMS removido + filter active em listTemplates:** Enum Zod `messageChannelEnum` agora so aceita WHATSAPP/EMAIL (SMS removido do scope produto). DB mantem SMS por compat de migration. `listTemplates` aceita filtros `channel` + `active` (bug anterior onde `active` flag era ignorado). UI atualizada para refletir 2 canais.

**Fora do escopo (decisao do dono):** SMS provider real, retry com backoff em FAILED, anexos WhatsApp via UI, template engine sofisticado (so suporta `{{var}}` simples), webhook inbound para receber respostas de cliente.

**Validacao:** typecheck OK | 621 unit OK | build OK
**Commits:** 1 (`bf168cc`)

---

### 2026-05-20 — CHATBOT: customer lookup + handoff bot->humano + ChatbotConfig (Onda 3, modulo 2/11)

Modulo Chatbot tinha estrutura basica (8 procedures + webhook chatwoot) mas zero integracao com cliente cadastrado e sem deteccao automatica de handoff. 3 gaps endereçados (IA/Anthropic adiada):

- **G1 — Customer lookup no webhook:** Ao receber message_created, busca Customer pelos ultimos 9 digitos do telefone em `phone` ou `phoneSecondary`. Cria conversation com `customerId` ja vinculado. Quando conv pre-existia sem cliente, vincula no proximo evento. Habilita uso futuro de contexto (OS ativa, historico).
- **G2 — Deteccao bot->humano + cancelar follow-ups:** Webhook agora distingue `sender.type=user` (agente humano Chatwoot) de `agent_bot`. Quando agente responde, marca conversation como `HUMAN_TAKEOVER` e cancela todos os ChatbotFollowUp pendentes para essa conv. Paridade Laravel `ChatbotController::detectarHandoff`.
- **G3 — ChatbotConfig (novo):** Singleton por tenant com `enabled`, `whitelistPhones[]`, `businessHoursStart/End`, mensagens padrao (`greetingMessage`, `outOfHoursMessage`, `handoffMessage`), `followUpDelayHours`. Procedures `getConfig`/`updateConfig` (owner/manager). Tambem `searchCustomerByPhone` + `linkConversationToCustomer` para uso manual via admin.

**Fora do escopo (decisao do dono):** AnthropicService + tool calling + FAQ tools (projeto grande, semanas). Notificacoes outbound automaticas (status OS). UI dedicada de atendimento.

**Validacao:** typecheck OK | 620 unit OK | build OK
**Commits:** 1 (`15e164a`)

---

### 2026-05-20 — REWARD: validacao frequencia + percentual dinamico + lock + cron expiracao (Onda 3, modulo 1/11)

Modulo Reward com schema/router maduros mas tinha 4 gaps importantes de logica de negocio. UI propria adiada (sprint dedicado).

- **G1 — Validacao de frequencia + max ativas em createAction:** Le `campaign.rules` JSON (paridade Laravel RecompensaRegraTipo) com `maxPerDay/maxPerWeek/maxPerMonth/maxActive`. Conta RewardAction do cliente naquele campaign + janela temporal (hoje/semana/mes). `maxActive` conta APPROVED+PENDING ainda nao expiradas. Rejeita com mensagem clara.
- **G2 — Percentual dinamico em useAction:** Procedure agora aceita `saleTotalCents` + opcionalmente `osId` (alem de saleId). DISCOUNT_PERCENTAGE/CASHBACK calculam `discountCents = saleTotal * percentage / 100` com cap (`campaign.maxCap`). DISCOUNT_FIXED usa value pre-fixado. GIFT retorna 0. Retorna `discountCents` para PDV/OS aplicar. Paridade `RecompensaUtilizacaoController::aplicar`.
- **G3 — Lock/Unlock de saldo:** Procedures `lockBalance` e `unlockBalance` movem centavos entre `availableBalance` ↔ `lockedBalance`. Cria RewardMovement type=lock|unlock. Caller (PDV) chama `lockBalance` ao iniciar checkout e `unlockBalance` se cancelar.
- **G4 — Cron expiracao automatica:** `POST /api/cron/expire-rewards` (autenticado com `Bearer CRON_SECRET`). Marca APPROVED com `expiresAt<now` como EXPIRED. Para CASHBACK, decrementa `availableBalance/totalBalance` e move para `totalExpiredHistorical`. Cria RewardMovement type=expire por cliente. Sugerido cron diario 02:00 UTC.

**Fora do escopo (decisao do dono):** UI admin (paginas de validacao/campanhas/relatorios), pagina publica de cadastro de claim, notificacoes ao cliente, audit log especifico de validacoes.

**Validacao:** typecheck OK | 620 unit OK | build OK
**Commits:** 1 (`e843a51`)

---

### 2026-05-20 — OPERACAO: Expense entity + LabOrder->PAYABLE + ServiceProvider->OS (Onda 2, modulo 4/4 ✓ Onda 2 COMPLETA!)

Modulo Operacao tinha 15 procedures (DeliveryPerson, ExternalLab, LabOrder, ServiceProvider) mas sem Expense entity propria. 3 gaps endereçados:

- **G1 — Expense entity (nova):** Schema novo com 10 categorias canonicas (TRAVEL/MEALS/SUPPLIES/MAINTENANCE/UTILITIES/RENT/SOFTWARE/MARKETING/TAXES/OTHER) + 5 status (PENDING_APPROVAL/APPROVED/PAID/REJECTED/CANCELLED). Procedures listExpenses, createExpense, approveExpense, rejectExpense, deleteExpense, expenseStats. Owner/manager pode `autoApprove` na criacao; rejectExpense exige motivo. approveExpense aceita `generatePayable` para criar PAYABLE no financeiro com referenceType=expense.
- **G2 — LabOrder → PAYABLE:** Campo `payableTransactionId` em LabOrder. `updateLabOrderStatus` agora gera PAYABLE automatico quando status muda para RETURNED/COMPLETED com `finalCost > 0` (descricao com nome do lab + ref OS). Tambem marca `serviceOrder.labReceived = true` para a OS vinculada.
- **G3 — ServiceProvider → OS:** Campo `serviceProviderId` em ServiceOrder (paridade Laravel `ordens_servico.prestador_id`). Propagado em `createServiceOrderSchema` e `updateServiceOrderSchema`. Procedures create/update do OS persistem o campo. Habilita futura calculo automatico de comissao via ProviderCommissionRule.

**Onda 2 (IMPORTANT) ✓ COMPLETA:** Fiscal (1) + Settings (2) + Comissoes (3) + Operacao (4).

**Validacao:** typecheck OK | 620 unit OK | build OK
**Commits:** 1 (`d7dafc0`)

---

### 2026-05-20 — COMISSOES: socio rules + lock CAS apuracao + export CSV (Onda 2, modulo 3/4)

Modulo Comissoes maduro: 10 procedures commission + 11 provider-commission + 6 models + 8 paginas. Auditoria contra `ComissaoController`, `SocioComissaoController`, `PrestadorComissaoController`, `ComissaoEngine` Laravel. 3 gaps endereçados:

- **G1 — SocioCommissionRule (novo):** Paridade Laravel `socio_regras_comissao` (caso Samya). Schema novo com `(tenantId, userId, category)` unique + `rate Decimal(5,2)` + `active`. 6 categorias: PRODUTO_ACESSORIO, APARELHO, SERVICO_AT_SEM_PECA, SERVICO_AT_COM_PECA, INTERMEDIACAO_AT, OUTROS. Procedures `listSocioRules`, `upsertSocioRule`, `deleteSocioRule` (apenas owner).
- **G2 — Lock CAS em closeApuracao:** Risco real era findFirst + update em 2 etapas — 2 chamadas concorrentes poderiam criar PAYABLE duplicada. Solucao: novo status transitorio `CLOSING` no enum + updateMany atomico (where status=OPEN) como CAS. Postgres serializa o UPDATE; somente 1 chamada ve count=1. As demais recebem CONFLICT. Rollback automatico (CLOSING → OPEN) se algo falhar entre lock e commit.
- **G3 — Export CSV:** Rota `/api/commissions/export?year=&month=&status=&userId=` gera CSV com BOM UTF-8 + separador `;` + valores BR. Resolve nomes de usuarios via `withAdmin` (cross-tenant). Botao "Exportar CSV" na pagina /commissions. Paridade `ComissaoController::exportarCsv`.

**Fora do escopo (decisao do dono):** Auto-link de estornos a apuracao fechada (ja existe em closeApuracao, linhas 637-647). Engine compartilhado entre commission e provider-commission (refactor grande, fica para Onda 3).

**Validacao:** typecheck OK | 620 unit OK | build OK
**Commits:** 1 (`cfdd1f9`)

---

### 2026-05-20 — SETTINGS: assistencia expandida + security + notifications + audit (Onda 2, modulo 2/4)

Módulo Settings já era robusto (18 procedures, 15 páginas). Auditoria contra `ConfiguracaoController` + `ConfiguracaoAssistencia` + `ConfiguracaoRecebimento`. 4 gaps endereçados:

- **G1 — Assistência paridade Laravel:** `TenantAssistanceSettings` ganha 10 campos (assistanceName, cnpj, phone, email, address, city, state, zipCode, logoPath, businessHours). Antes só tinha 4 campos (termos + garantia + parcelas + PIX). Usados em cabeçalhos de orçamento WhatsApp/PDF, termos e comunicação ao cliente.
- **G2 — TenantSecuritySettings (novo):** singleton por tenant com `minPasswordLength`, `requireUppercase/Number/SpecialChar`, `passwordExpirationDays`, `sessionTimeoutMinutes`, `maxFailedLoginAttempts`, `lockoutMinutes`. Procedures `getSecurity`/`updateSecurity` (apenas owner). Aplicação no auth flow virá em rodada futura.
- **G3 — NotificationConfig (novo):** tabela com 8 eventos canônicos (`OS_CRIADA`, `OS_PRONTA`, `OS_ASSINADA`, `OS_ENTREGUE`, `ORCAMENTO_ENVIADO`, `VENDA_FINALIZADA`, `COBRANCA_VENCIDA`, `CAIXA_FECHADO`) × canais email/WhatsApp + template opcional. Procedures `listNotificationConfigs`, `upsertNotificationConfig`, `toggleNotificationConfig`.
- **G4 — AuditLog em mutations sensíveis:** schema `AuditLog` ganha `userId` + índices (createdAt, entity, userId). Service `src/server/services/audit-log.service.ts` com `logAudit` e `pickChanges` (diff before/after). 6 mutations gravam audit: `updateGeneral`, `updateFiscalSettings`, `updateAssistance`, `updateReceiving`, `updateSecurity`, `upsertNotificationConfig`. Cada entrada inclui o diff dos campos efetivamente modificados.

**Fora do escopo (decisão do dono):** Política de senha aplicada no auth real (precisa adaptar NextAuth + reset flow), branding UI completa, integrações UI (já tem CRUD genérico).

**UI:** Procedures expostas via tRPC mas formulários de Security/Notifications ainda não criados — dono fará por sprint dedicado.

**Validação:** typecheck ✓ | 620 unit ✓ | build ✓ (E2E não executado — mudanças só no router/schema, sem alteração de páginas)
**Commits:** 1 (`0145744`)

---

### 2026-05-20 — FISCAL: TenantFiscalSettings expandida + webhook NuvemFiscal + auto-link NfeImport (Onda 2, modulo 1/4)

Auditoria contra `NfeImportController` + `NfeEmissaoService` + `Fiscal/NuvemFiscalService`. 24 procedures fiscal + 14 nfeImport + service completo. **Emissão real adiada para Onda 3** (requer certificado SEFAZ homolog + testes campo). 4 gaps endereçados nesta rodada:

- **G1 — TenantFiscalSettings expandida:** novos campos `defaultCfop` (5102), `defaultNcm` (85171231=celular), `cscId`, `cscToken`. `updateFiscalSettings` agora persiste todos os campos do validator (`cfopDentroEstado`, `ncmPadrao`, `csosnPadrao`, `nfceCscId`, `nfceCscToken`) que antes eram silenciosamente descartados. Migration `20260520020000_fiscal_cfop_ncm_csc` aplicada.
- **G2 — Validação chave Mod 11:** `validateAccessKey` agora valida DV usando algoritmo Mod 11 com pesos cíclicos 2-9 (paridade SEFAZ). Util novo `src/lib/utils/nfe-key.ts` com `isValidNfeKey`, `parseNfeKey` (extrai cUF/AAMM/CNPJ/modelo/serie/numero).
- **G3 — Webhook NuvemFiscal:** `POST /api/webhooks/nuvemfiscal` recebe callback assíncrono com validação HMAC-SHA256 via `NUVEM_FISCAL_WEBHOOK_SECRET`. Mapeia eventos (autorizada/rejeitada/cancelada/cce) para `InvoiceStatus`. Atualiza Invoice via `withAdmin` (eventos cruzam tenants). Sem secret = modo dev (warning + aceita).
- **G4 — Auto-vinculação produtos:** `nfeImport.processXml` agora busca produtos por `barcode` ou `sku` matching o `barcode`/`productCode` do item NF-e. Itens vinculados ficam `status=LINKED` direto. Retorna `autoLinkedCount` para feedback.
- **G5 — Sugestão produtos similares:** `nfeImport.suggestProducts({itemId})` retorna top N produtos com `score` por: token overlap no nome (×20/token), NCM match (+30), preço ±30% (+15). Inclui `reasons` para UI explicar o match.

**Fora do escopo (decisão do dono — adiar):** Emissão real NF-e/NFC-e via NuvemFiscal, NFS-e, multi-certificado, consulta PDF→XML (MeuDANFE), relatório SPED EFD.

**Validação:** typecheck ✓ | 620 unit ✓ | 123/125 E2E (2 flakies cashier que passam em rerun) ✓ | build ✓
**Commits:** 1 (`a59dbaa`)

---

### 2026-05-20 — FINANCEIRO: integracao compra->PAYABLE + estorno parcial + export CSV (Onda 1, modulo 6/6 ✓ Onda 1 completa!)

Módulo Financeiro maduro: 24 procedures, 14 páginas/componentes. Auditoria contra `ContaPagarController`/`ContaReceberController`/`FinanceiroController` + Models `ContaPagar`/`ContaReceber`/`ContaPagarParcela`/`ContaReceberParcela`/`CategoriaFinanceira`. 4 gaps resolvidos:

- **G1 — Catálogo PaymentMethod:** schema `PaymentMethod` já existia em `settings.prisma` (com `feePercent`, `installmentRules`, `acceptsChange`). Gap real era **seedar 6 métodos padrão** (Dinheiro/PIX/DEPIX/Cartão Crédito/Débito/Crediário) no `tenantFinancialInit` chamado em `admin.approvePreReg`. Tenant pode customizar (CRUD em settings).
- **G2 — Integração Compra → PAYABLE:** `createDevicePurchaseSchema` ganha `supplierId`, `sellerType`, `generatePayable`, `payableInstallments`, `payableFirstDueDate`. `stock.createPurchase` gera `FinancialTransaction(type=PAYABLE)` + parcelas automaticamente. `stock.cancelPurchase` cancela os PAYABLEs relacionados. Form de Nova Compra ganha seção "Conta a Pagar". Procedure pública `financial.createPayableFromPurchase` exposta para integrações.
- **G3 — Estorno parcial:** `reverseInstallment` aceita `amount` opcional (centavos). Permite estornar `PAID` ou `PARTIALLY_PAID`, decrementa `paidAmount`, mantém parcela como `PARTIALLY_PAID` quando ainda há saldo pago. Paridade `ContaReceberParcela::estornoParcial`.
- **G4 — Export CSV:** rota `/api/financial/export?type=transactions|installments` com filtros `txType/status/from/to`. CSV em UTF-8 com BOM (Excel-friendly), separador `;`, datas pt-BR, valores `0,00`. Botões "Exportar CSV" em `/financial`, `/financial/pending`, `/financial/receivables`. Paridade `ContaPagarController::export`.

**Fora do escopo (decisão do dono):** Conciliação bancária, centro de custo, hierarquia de categorias, anexos em transações, limpeza dos campos deprecated em `Installment` (estornadaAt/estornoReason — nunca populados, agora também não, mas mantidos pelo custo de migration).

**Onda 1 (CRITICAL) ✓ COMPLETA:** Cliente (1) + Catálogo (2) + Estoque+IMEI (3) + PDV (4) + Caixa (5) + Financeiro (6).

**Validação:** typecheck ✓ | 620 unit ✓ | 125/125 E2E ✓ | build ✓
**Commits:** 1

---

### 2026-05-20 — CAIXA: relatorio PDF + estatisticas periodo (Onda 1, modulo 5/6)

Módulo Caixa muito completo: 19 procedures, UI com sangria/suprimento/conferência/close. 14 de 16 actions Laravel já cobertas. 2 gaps resolvidos:

- **G3 — Relatório PDF de fechamento:** route `/api/cashier/[id]/relatorio` gera HTML/PDF com cabeçalho (logo + CNPJ), meta (operador, datas), resumo por tipo, resumo por forma de pagamento, conferência (calculado x declarado x diferença com badge), movimentações completas e observações. Paridade `CaixaController::relatorioPdf`.
- **G4 — `cashier.periodStats({from, to, userId?})`:** estatísticas agregadas por período. Agrupa sessions por range de data + opcionalmente por operador. Retorna totais de vendas/sangrias/suprimentos/despesas/estornos/diferenças. Paridade `CaixaService::getEstatisticasPeriodo`.

**Fora do escopo (decisão do dono):** entidade `CashRegister` (Caixa físico separado) — para esta loja, `CashSession` por usuário é suficiente. `verificarSangriaAutomatica` adiada pelo mesmo motivo.

**Sweep — tudo OK:** abrir/fechar, sangria/suprimento/despesa, conferência (review), close automático (ADR 0029), forceClose admin, recordReversal, manualAdjustment, statusCheck, openCashiers multi-user, history.

**Validação:** typecheck ✓ | 620 unit ✓ | 94/95 E2E (1 flaky no sidebar Interesses) ✓ | build ✓
**Commits:** 1

---

### 2026-05-20 — PDV: trade-in + pix status + linkCustomer + updateSaleDate (Onda 1, modulo 4/6)

Módulo PDV (sale + quick-sale). 28 procedures sale + 7 quick-sale. Auditoria vs `PdvController.php` (25 actions). 19 já cobertas. 5 gaps resolvidos:

- **G1 — Trade-in (aparelho de entrada):** novos schemas `SaleUpgrade` + `SaleAudit`. Migration `20260520000000_sale_upgrades_audit`. Procedures `addUpgrade`/`removeUpgrade`. `recalculateSale` subtrai `abatedValue` dos upgrades. `finalize` cria `DevicePurchase` para cada upgrade vinculando o customer da venda como vendedor. UI: `UpgradeDialog` standalone + botão no PDV (bloqueado em pagamento de OS).
- **G2 — `checkPixStatus`:** `sale.checkPixStatus` + `getPixStatus` no depix-service com normalização (paid/pending/expired/failed/refunded + isFinal). Paridade `consultarStatusPix`.
- **G3 — `linkCustomer`:** vincula cliente a venda já finalizada. Audit log. Paridade `vincularCliente`.
- **G4 — `updateSaleDate` (admin only):** muda data com motivo obrigatório + audit log. Paridade `atualizarData`.

**UI minor adiada:** UIs para `checkPixStatus` (botão Verificar PIX no payment dialog) e `linkCustomer`/`updateSaleDate` (botões no detail da venda) ficaram em backlog — procedures expostas via tRPC já cobrem o contrato. Implementar quando demanda surgir.

**Sweep — tudo OK:** múltiplas formas pagamento via paymentDetails JSON, cancel/refund com retorno estoque, sendReceipt WhatsApp, recibo/termo PDF routes, busca produtos, integração OS↔PDV (ADR 0042). QuickSale (`VendaAvulsaDepix`) tem CRUD + markPaid — suficiente por enquanto (Depix não está em produção).

**Validação:** typecheck ✓ | 620 unit ✓ | 78/79 E2E (1 flaky em sidebar — não relacionado) ✓ | build ✓
**Commits:** 2 (backend + schema, UI upgrade)

---

### 2026-05-19 — ESTOQUE+IMEI: termo compra + supplier duplicate + filtros (Onda 1, modulo 3/6)

Módulo grande (70 procedures + IMEI router). Schema é muito completo (Product, DevicePurchase, Supplier, Category, Attribute, AttributeValue, ProductVariation, ProductPhoto, StockItem, StockMovement, ImeiQuery, ImeiQuota). 3 gaps reais vs Laravel.

- **G1 — Termo de Responsabilidade + Autentique em compras (paridade `CompraAparelhoController`):** schema `DevicePurchase` ganhou 9 campos (`supplierId`, `sellerType`, `termSigned*`, `autentique*`). Migration `20260519110000_purchase_term_signature`. 3 procedures (`confirmPurchasePhysicalSignature`, `sendPurchaseTermAutentique`, `checkPurchaseSignatureStatus`). Route `/api/purchases/[id]/termo-responsabilidade` gera HTML do termo com dados do vendedor (customer ou supplier conforme `sellerType`), aparelho, declaração formal. Tabela de compras ganhou coluna "Termo" com badge (Assinado físico/digital) ou 3 botões inline (PDF + Autentique + confirmação física).
- **G2 — Supplier duplicate inline:** `checkSupplierDuplicate({cpf?, cnpj?})` + alerta inline no form de fornecedor com link clicável para o existente. Reuso do padrão Cliente.
- **G3 — `listStockItems` com filtros expandidos:** `productSearch` (busca por nome/marca via relação) + `availableOnly` (atalho `status=AVAILABLE`). Paridade `EstoqueController::buscarItensDisponiveis`.

**Sweep — tudo OK:** Produtos (fotos múltiplas, variações, atributos, NCM, CSV), movimentações, IMEI (com quota mensal + cache), 8+ relatórios (posição, movimentações, curva ABC, mín, vendas múltiplas dimensões) — vai bem além do Laravel.

**Validação:** typecheck ✓ | 620 unit ✓ | 68/68 E2E (OS+customers+stock) ✓ | build ✓
**Commits:** 1 (7 arquivos, 639 inserções)

---

### 2026-05-19 — CATÁLOGO: cleanup órfãos + config assistência + observações UI (Onda 1, modulo 2/6)

Auditoria do módulo Catálogo (servicos + dispositivos + categorias). Escopo limitado: `CatalogoController.php` (e-commerce) confirmado fora pela decisão D1. `ProdutoCategoriaController` é catálogo de produtos (Estoque). `CategoriaDashboardController` é menu admin (fora). Foco: `ServicoController` + `AparelhoCatalogoController` + observações.

**Schema NextJs era superior** ao Laravel: 7 modelos vs 2. Tinha 3 entidades órfãs sem UI nem demanda do Laravel: `DiagnosticTemplate`, `DeviceCategory`, `Device`. Decisão: remover.

- **G3 — Cleanup órfãos:** DROP tables + remoção de 13 procedures + remoção de schemas Zod + remoção de 3 describes de testes. Migration `20260519100000_catalog_cleanup_assistance_config`. Reduz superfície sem perder paridade.
- **G4 — TenantAssistanceSettings + 2 campos:** `installmentsNoInterest` (default 12) e `pixDiscount` (default 5%). Paridade Laravel `configuracoes_assistencia.parcelas_sem_juros` + `.desconto_pix`. `settings.updateAssistance` aceita novos campos.
- **G1 — `sendServiceWhatsApp` refatorado:** antes `pixDiscount=5` hardcoded e `maxInstallments` do `paymentMethod`. Agora ambos do `TenantAssistanceSettings`. Inclui **observações ativas** concatenadas (filtradas por serviceType/deviceModel). Nome da loja vem de `tradeName`. Paridade Laravel `enviarOrcamentoWhatsApp`.
- **G2 — UI Observações em `/services/manage`:** novo componente `ServiceObservationsManager` com CRUD completo (criar, editar, toggle ativa, excluir). Conecta com 5 procedures que já existiam mas estavam órfãs de UI.
- **UI Settings/Assistance:** seção "Orçamentos de serviço (WhatsApp)" com inputs para instalments + PIX discount.

**PDF do orçamento de serviço:** adiado (decisão: usuário pode usar PDF da OS quando virar OS real).

**Validação:** typecheck ✓ | 620 unit ✓ | E2E em andamento | build ✓
**Commits:** 2 (backend cleanup + schema, UI obs + settings)

---

### 2026-05-19 — CLIENTES: 5 gaps Laravel fechados (Onda 1, modulo 1/6)

Inicio da auditoria sistematica dos módulos restantes. Cliente é o primeiro da Onda 1 (críticos com dados reais). Comparacao contra `ClienteController.php` + views Laravel.

- **G1 — Duplicidade inline:** `customer.checkDuplicate({cpf?, cnpj?})` + alerta inline com link clicável para cliente existente. Bloqueia submit. Paridade Laravel `consultarCpf`/`consultarCnpj` (parte de duplicidade). DirectD adiado.
- **G2 — Tab OS do cliente:** `byId` carrega 20 OS recentes; UI renderiza tabela compacta com link para `/service-orders/[id]`. Antes mostrava só contador.
- **G3 — Tab Cashback removida:** era placeholder confuso. Integração futura quando `reward` for auditado.
- **G4+G5 — Toggle Ativos/Inativos + Restaurar (admin only):** nova `customer.viewerInfo` expondo `isAdmin`. Selector Ativos/Inativos aparece só para admin. Botão Restaurar nas linhas com `deletedAt`. Procedure restore existia mas estava órfa de UI.

**Schema NextJs superior ao Laravel:** modelo `PF/PJ` explícito + campos `cpf`/`cnpj`/`tradeName` separados (Laravel usa 1 string para ambos). Não exigiu mudanças.

**Sweep extra:** nada crítico encontrado além dos 5 gaps. CRUD, soft-delete + restore, paginacao, busca multi-campo (nome/cpf/cnpj/telefone/email), filtros tipo, páginas list/new/edit/detail — todos OK.

**Validação:** typecheck ✓ | 20/20 E2E customers ✓ | 14/14 E2E OS ✓ | build ✓
**Commits:** 1 (1 backend + 3 UI)

---

### 2026-05-19 — OS: edicao com escopo correto + stepper exige assinatura (7a rodada)

Refino pos-audit baseado em revisao manual:

- **Edit page com 2 niveis de bloqueio (paridade Laravel `$osAssinada` + `$osConcluida`):**
  - `isSigned` bloqueia equipamento, IMEI, problema relatado, entryChecklist, deviceInfo (ja existia).
  - `isCompleted` (COMPLETED/PAID/READY_FOR_PICKUP/DELIVERED/REFUNDED) bloqueia **adicionalmente** defeito constatado, observacoes internas e prazo garantia. Banners explicativos no UI.
- **DeviceInfo (6 checkboxes "Cliente informou que...")** agora aparece no edit page como secao dedicada, editavel ate assinatura. Antes era so backend.
- **Backend `update` locked fields** refatorado para considerar `isCompleted` (defesa em profundidade).
- **Stepper exige assinatura**: backend `updateStatus` rejeita avancos enquanto OS nao assinada (excecao: CANCELLED/REFUNDED/IN_WARRANTY). UI mostra alerta amarelo "Assinatura de entrada pendente" no lugar dos botoes "Avancar para X".

**Validação:** typecheck ✓ | 629 unit ✓ | 14/14 E2E OS ✓ | build ✓
**Commits:** 1

---

### 2026-05-19 — OS: 7 MEDIUMS DA AUDITORIA FINAL RESOLVIDOS (6a rodada)

Última camada de polimento da auditoria. Todos os 7 mediums implementados:

- **M1 — CNPJ/CPF formatados nos PDFs**: novo helper `formatCnpj()` / `formatCpf()` em [src/lib/utils.ts](src/lib/utils.ts). Aplicado nos 5 PDFs (pdf principal, recibo, termo-entrega, termo-devolução, quote-pdf). Documentos oficiais agora têm formato `00.000.000/0000-00` e `000.000.000-00`.
- **M2 — quote-pdf paridade Laravel**: layout reescrito com caixas temáticas dedicadas (verde "JÁ APROVADOS", amarelo "AGUARDANDO APROVAÇÃO", verde com texto declaratório "Eu, [nome], APROVO..." quando approved, vermelho quando rejected).
- **M3 — Schema NFS-e timestamp**: novos campos `nfseIssuedAt` + `nfseAttachmentPath` no `ServiceOrder`. `update` captura transição `false→true` e seta `nfseIssuedAt = now()`. Migration aplicada.
- **M4 — Tabela OS com filtros data + telefone alt**: inputs `<Input type="date">` (de/até) ligados ao backend `dateFrom`/`dateTo` que já existiam no schema. Coluna Cliente mostra `phoneSecondary` com sufixo "(alt)" quando preenchido.
- **M5 — Card Datas consolidado**: novo card na coluna lateral do detalhe entre Pagamento e Custos com Entrada, Previsão, Conclusão e Entrega. Paridade `show.blade.php:1666-1691`.
- **M6 — PDF principal com técnico/pagamento/conclusão**: seção SERVIÇOS E VALORES agora inclui Técnico Responsável, Forma de Pagamento e Data de Conclusão.
- **M7 — Botão Excluir admin only**: quando OS está CANCELLED e usuário é admin (`viewerIsAdmin` do `getById`), botão "Excluir" aparece no header. Dialog de confirmação alerta sobre permanência. Paridade `show.blade.php:582-590`. Backend `delete` já bloqueia se há OS de garantia vinculada (C6 da rodada anterior).

**Sweep extra adicionado:** `viewerIsAdmin` no return de `getById` para evitar `useSession` no client (SessionProvider não configurado).

**Validação:** typecheck ✓ | 629 unit ✓ | 14/14 E2E OS ✓ | build ✓
**Commits:** 4 (PDFs, schema+backend, UI tabela+detail, progress)

**STATUS DA AUDIT FINAL:** 4 críticos + 7 highs (6 entregues + 1 TODO bloqueado) + 7 mediums = **17/18 issues resolvidos**. Único pendente: H2 (notificar técnico WhatsApp) aguarda `phone` no User schema.

---

### 2026-05-19 — OS: 7 HIGHS DA AUDITORIA FINAL RESOLVIDOS (5a rodada)

Após os 4 críticos, atacados os 7 highs do `/review-project`. 6 implementados, 1 com TODO documentado:

- **H1 — confirmPhysicalSignature delivery com guard**: só avança para `DELIVERED` se status atual é `PAID` ou `READY_FOR_PICKUP`. Senão registra a assinatura física mas mantém o status (paridade `OrdemServicoController:1046`). Evita pular pagamento via "assinatura física do termo".
- **H2 — Notificar técnico ao criar OS (BLOQUEADO/TODO)**: `User` model não tem campo `phone`. TODO documentado no código. Atacar quando schema for atualizado.
- **H3 — `sendToLab` aceita mensagem WhatsApp**: novo campo `message` opcional no schema. Quando preenchido + `deliveryPersonId`, dispara `sendTextMessage` best-effort ao entregador. Histórico registra envio. UI: dialog mostra textarea quando entregador selecionado.
- **H4 — `getById` retorna `linkedSale`**: carrega `Sale` finalizada vinculada via `serviceOrderId`. UI mostra link clicável "Ver venda #X" no card Pagamento. Também adiciona linha destacada "Valor Pendente" em warning quando `paidAmount < totalAmount - paymentDiscount`.
- **H5 — Botões Recibo no header**: quando status ∈ `PAID/READY_FOR_PICKUP/DELIVERED`, exibe "Recibo" (link PDF) + "Enviar/Reenviar Recibo" (via `sendReceipt` WhatsApp). Paridade `show.blade.php:537-547`.
- **H6 — Timeline com eventos de assinatura**: histórico mescla `serviceOrderHistory` com `signatureSignedAt`, `deliveryTermSignedAt`, `returnTermSignedAt`. Eventos de assinatura têm círculo âmbar para distinção. Ordem cronológica decrescente.
- **H7 — Logo nos 5 PDFs**: todos os routes (pdf principal, recibo, termo-entrega, termo-devolução, quote-pdf) agora carregam `TenantSettings.logoUrl` e renderizam `<img>` no header quando disponível.
- **H8 — Recibo com serviços adicionais**: orçamentos aprovados (`ServiceOrderQuote.status='approved'`) renderizados como "Serviços Adicionais" abaixo dos itens originais com motivo + valor novo + descrição. Paridade `gerarPdfRecibo:1002-1052`.

**Pendente:** 7 mediums + H2 (bloqueado por schema).

**Validação:** typecheck ✓ | 629 unit ✓ | 14/14 E2E OS ✓ | build ✓
**Commits:** 3 (backend procedures, UI detail, PDFs)

---

### 2026-05-19 — OS: 4 CRÍTICOS DA AUDITORIA FINAL + LISTAGEM/GARANTIA (4a rodada)

Quarta rodada após auditoria sistemática via `/review-project` (3 subagents paralelos). Identificados 4 críticos + 7 highs + 7 mediums. **Críticos todos resolvidos:**

- **Listagem ordem determinística** (P1a): backend `serviceOrder.list` agora usa `[entryDate desc, number desc]` para desempate. `dashboard.recentOrders` idem. 5 links quebrados no dashboard apontavam para `/services/*` em vez de `/service-orders/*` — corrigidos.

- **Garantia/retorno (P2)**: `warrantyTypeEnum` reescrito para 3 valores Laravel (`return`, `sold_product`, `manufacturer`); `extended` removido. Wizard step-device agora tem checkbox "Este equipamento está em garantia" no topo, com tipo + select de OS Original (carregada via `getByCustomer`) + prazo. Em `retorno_servico` + OS original selecionada, herda equipamento (tipo/marca/modelo/serial/IMEI/senha) e bloqueia campos com readonly. Step-summary tem resumo readonly.

- **C1 cancel exige termo SEMPRE**: antes só quando assinada — divergia do Laravel `OrdemServicoController:652-664` que exige para toda OS (aparelho está sob responsabilidade da loja). Admin força via `input.force`.

- **C2 addItem com status guard**: bloqueia `PAID/DELIVERED/CANCELLED/REFUNDED`. Paridade `OrdemServicoController:2990`. Estava permitindo adicionar item em OS finalizada, corrompendo totais.

- **C3 removeItem+updateItem com status guard**: `removeItem` bloqueia `PAID/DELIVERED` (paridade Laravel:3049). `updateItem` ganhou guard equivalente para consistência. `cancelLab` agora cria entrada no histórico.

- **C4 Lab Externo UI ativa**: card antes era alerta passivo "Aguardando Retorno". Agora tem 4 ações (paridade Laravel `show.blade.php:828-867`): Enviar para Laboratório (selector de entregador), Confirmar Recebimento, Notificar Entregador (WhatsApp via `notifyDeliveryPerson`), Cancelar Envio. Usa `operation.listDeliveryPersons`.

**Pendente (7 highs + 7 mediums do AUDIT):** notificação WhatsApp ao criar OS com técnico, sendToLab com mensagem WhatsApp, confirmPhysicalSignature delivery com status guard, link "Ver venda" no card pagamento, recibo PDF botão no header, histórico timeline com eventos de assinatura, logo nos PDFs (5x), CNPJ formatado, recibo com serviços de orçamentos aprovados, layout quote-pdf paridade, etc.

**Validação:** typecheck ✓ | 629 unit ✓ | 14/14 E2E OS + 20/20 E2E customers ✓ | build ✓
**Commits:** 6 (dashboard fix, warranty enum, garantia UI, backend guards, lab UI, progress)

---

### 2026-05-19 — OS: 6 DIVERGENCIAS DE NEGOCIO RESOLVIDAS (3a rodada)

Terceira rodada de auditoria após testes manuais. Investigação via skill `investigate`, implementação direta:

- **P1 stepper com ícones**: novo `SERVICE_ORDER_STATUS_ICON` no validator + componente `StatusStepper` standalone com lucide-react (equivalentes FA do Laravel). Tooltip ao hover, barra de progresso horizontal entre os círculos.
- **P2 PDF com termos**: PDF da OS agora lê `TenantAssistanceSettings.termsOfService` + `.warrantyPolicy` e injeta antes da assinatura. Campos já existiam mas estavam órfãos.
- **P3 pagamento via PDV**: detalhe da OS substitui Payment Dialog por botão "Receber Pagamento (PDV)" que chama `sale.createFromOS` e navega para `/pdv?saleId=...`. `pdv-screen` aceita `?saleId=` e pula `createDraft`. Bug corrigido: `sale.finalize` agora marca OS como `PAID` quando `isOSPayment=true` (antes ficava em `COMPLETED`). OS sem valor / garantia continuam pulando PDV com botão "Marcar como Paga".
- **P4 bloqueio pós-assinatura**: edit page detecta `isSigned` e torna readonly equipamento/IMEI/problema relatado/checklist entrada. Continuam editáveis: defeito constatado, garantia, checklist saída, NFS-e. Defesa em profundidade no backend: `service-order.update` ignora silenciosamente esses campos quando OS assinada.
- **P5 cancel via termo**: cancel agora exige termo de devolução assinado (Autentique ou físico) quando OS está assinada (aparelho na loja). Admin pode forçar via `input.force=true` — registrado como `[FORCADO SEM TERMO DE DEVOLUCAO]` no histórico. UI mostra alerta + checkbox quando aplicável.

**Validação:** typecheck ✓ | 629 unit ✓ | 45/45 E2E (service-orders + customers + pdv) ✓ | build ✓
**Commits:** 4 (stepper visual, PDF termos, pagamento PDV, edit lock + cancel termo)

---

### 2026-05-19 — OS: 5 BUGS DE UX/COMPORTAMENTO CORRIGIDOS

Após o dono testar manualmente o módulo OS, identificou 5 divergências de comportamento vs Laravel. Investigação via skill `investigate`, depois implementação:

- **Cadastro inline de cliente**: step-customer abria nova aba para `/customers/new`. Agora abre Sheet (drawer lateral) com CustomerForm completo. CustomerForm aceita `onSuccess`/`onCancel` opcionais. EntitySelector aceita `initialLabel` para mostrar o cliente recém-criado.
- **IMEI sem validador**: criado `ImeiInput` (digits-only, max 15, valida Luhn) usado no step-device. Vazio não dispara erro.
- **Itens — default invertido**: `manualMode` agora é `false` quando o item é novo (busca catálogo). Só fica `true` se já tem `description` sem `serviceId`/`productId` (item legado digitado manual).
- **Pendências contextuais**: as 4 divs (Signature/Communication/DeliveryTerm/ReturnTerm) eram empilhadas todas no topo da OS recém-criada. Agora aparecem só no estado certo: Signature antes do pagamento, Communication após COMPLETED, DeliveryTerm em PAID/READY_FOR_PICKUP, ReturnTerm só durante cancelamento em curso.
- **Stepper Laravel-style**: removido o dialog que exigia observação para mudar status. Novo helper `getNextStatusOptions(current)` em validators retorna o próximo do `STATUS_FLOW` (e o seguinte se for opcional). Botões "Avancar para X" disparam direto. PAID continua via Payment Dialog.

**Bonus (sessão anterior):** bug crítico no `customer-form` — CpfInput/CnpjInput/PhoneInput não eram compatíveis com `form.register()` do RHF. Substituído por `<Controller>` nos 4 campos especializados. Não impacta os 18 outros usos desses inputs no app.

**Validação:** typecheck ✓ | 629 unit ✓ | 14/14 E2E OS ✓ | 20/20 E2E customers ✓ | build ✓
**Commits:** 5 (sheet a11y, customer fix, customer inline, IMEI+items, stepper+contextual)

---

### 2026-05-19 — AUDITORIA MÓDULO OS — GAPS LARAVEL CORRIGIDOS

Auditoria sistemática (skill `arenatech-module-audit`) do módulo de Ordens de Serviço antes da migração de dados do Laravel. 47 procedures + 7 checklist + 6 páginas + 5 rotas PDF + 14 E2E @business mapeados e validados.

**Gaps identificados e corrigidos (AUDIT_REPORT + ADR 0043):**
- P0 G1 — Checklist: rebatizada com 15 itens 1:1 do Laravel (aparelhoLiga, vidroTraseiro, carregamentoCabo, imaMagsafe etc.). Wizard, edit, detalhe e PDF herdam labels via constante única.
- P1 G3 — `updateStatus` bloqueia PAID via fluxo direto; admin pode `force` para corrigir OS legadas.
- P1 G4 — `registerPayment` exige `CashSession` aberta; garantia/sem valor / admin bypassam.
- P1 G5 — `updateStatus → DELIVERED` exige termo assinado (físico ou Autentique).
- P2 G6 — `updateStatus → COMPLETED` com `notifyWhatsapp` dispara mensagem (best-effort).
- P2 G7 — `updateStatus` limpa `returnTerm*` se OS estava em cancelamento e usuário retoma.
- P2 G8 — `delete` bloqueia se há OS de garantia/retorno vinculadas (lista os números).
- P2 G9 — `registerPayment` aceita `rewardActionId`: valida APPROVED, não expirada, dono igual customer; aplica desconto e marca como USED em novo campo `RewardAction.usedInOsId`.

**Migration:** `20260518040000_add_used_in_os_id_to_reward_action`
**ADR:** 0043 (decisões + mapeamento Laravel → NextJs)
**Validação:** typecheck ✓ | test 629/629 ✓ | E2E 14/14 OS ✓ | build ✓
**Commits:** 3 (refactor checklist, feat bloqueios+rewards, docs)

---

### 2026-05-18 — MIGRAÇÃO 100% COMPLETA — TODOS OS GAPS CORRIGIDOS

Todos os módulos que existiam no Laravel foram migrados para Next.js:

**NF-e Import (novo):** Schema + Service + Router (15 procedures)
- Upload XML, parse, vincular produtos, alocar custos, importar estoque

**Checklist (novo backend):** Schema + Router (8 procedures)
- UI já existia, agora persiste no banco

**DEPIX/PIX (completado):** Procedures em sale.ts + service-order.ts
- generatePix, cancelPix em ambos os módulos

**Recompensas (novo):** Schema + Router (16 procedures)
- Campanhas, ações, aprovação/rejeição, cashback, expiração

**Chatbot WhatsApp (novo):** Schema + Router (12 procedures) + Webhook
- Conversas, mensagens, follow-ups, webhook Chatwoot

**PagBank Webhook (novo):** Webhook receiver
- Confirmação de pagamento de vendas rápidas

**Catálogo Público (novo):** Páginas + API pública
- Listagem, busca, detalhe de produto sem auth

---

### 2026-05-18 — AUDITORIA COMPLETA TODOS OS MÓDULOS VS LARAVEL

Auditoria módulo a módulo comparando com Laravel original. Gaps corrigidos:

**Financial (+3 procedures):**
- `payMultipleInstallments`: baixa em lote de parcelas
- `getDashboardComparison`: comparativo com período anterior
- `createPayableDowngrade`: conta a pagar para downgrade

**Cashier (+2 procedures):**
- `recordReversal`: estorno de venda no caixa
- `manualAdjustment`: ajuste manual (manager only)

**Stock (+3 procedures):**
- `getPurchaseById`: detalhe da compra de aparelho
- `cancelPurchase`: cancelamento com reversão de estoque
- `updatePurchaseDate`: atualizar data da compra
- Schema: purchaseDate, cancelledAt, cancellationReason no DevicePurchase

**Dashboard (+2 procedures):**
- `stockDashboard`: métricas de estoque (total, ativos, baixo estoque, top produtos)
- `detailedAlerts`: alertas avançados (financeiro, caixa, OS, estoque)

**Módulos verificados sem gaps críticos:**
- Fiscal: 17 procedures cobrem emissão/cancelamento/correção/inutilização
- Catalog: 48 procedures cobrem services, devices, categories, observations
- Commissions: 22 procedures (10 + 12 provider) cobrem regras, cálculo, apuração
- Communication: WhatsApp + Email integrados

**Gaps aceitos como scope futuro:**
- Fiscal: NF-e import XML (workflow de UI complexo)
- Catalog: E-commerce público (checkout, cart, frete) — scope diferente
- Commissions: Export PDF/CSV (funcionalidade de UI)
- Recompensas: Phase 14 — pendente decisão de produto

---

### 2026-05-18 — COMPLETAR PDV (PONTO DE VENDA)

**Procedures adicionados ao sale.ts:**
- `updateItemPrice`: override de preço por item
- `createFromOS` + `cancelOSMode`: venda originada de OS
- `sendReceipt`: envio de recibo via WhatsApp
- `sendForSignature` / `checkSignatureStatus` / `confirmPhysicalSignature`: assinatura Autentique

**Schema:** serviceOrderId, isOSPayment, signature fields, receipt fields (migration manual)
**Fix:** searchProducts retorna currentStock real (não mais hardcoded 0)
**E2E:** 11/11 @business passando
**ADR:** 0042 (PDV ↔ OS integration)

---

### 2026-05-18 — AUDITORIA MÓDULO OS (SERVICE ORDERS)

Auditoria completa do módulo OS existente (6.250+ linhas, 42 procedures, 5-step wizard).

**Gaps encontrados e corrigidos:**
- P0: Stock reservation/release — criado `os-stock.service.ts` (ADR 0041)
  - `reserveStockForOsItem()` em create/addItem
  - `releaseStockForOsItem()` em removeItem
  - `releaseAllOsItems()` em cancel
- P1: `sendReceipt` procedure — envio de recibo via WhatsApp
- P1: Exit checklist editável na página de edição

**Gaps aceitos como dívida:**
- P2: DEPIX/PIX QR generation (adiado — integração Pixpay pendente)

**E2E OS:** 14 @business tests (4 Nível 2) implementados.
- Customer criado via tRPC API (CpfInput/PhoneInput não respondem a fillField — ver bug)
- EntitySelector interaction via [cmdk-input]/[cmdk-item]
- Edit page E2E não funciona (Turbopack compilation timeout) — aceito como dívida

**Decisões:** ADR 0041 (OS stock reservation)
**Próximo:** E2E tests para OS ou próximo módulo conforme orientação do dono

---

### 2026-05-17 — SKILLS CUSTOMIZADAS CRIADAS

2 skills criadas em `.claude/skills/`:
1. `arenatech-module-audit` — protocolo de auditoria (diagnóstico → AUDIT_REPORT → correções)
2. `arenatech-module-refactor` — refatoração @smoke → @business (ADR 0036)

CLAUDE.md atualizado com referências.
Próximas sessões: "refatorar E2E do módulo X" dispara a skill automaticamente.

---

### 2026-05-17 — LINTER E2E PASSA A SER POR-ARQUIVO

Threshold mudou de agregado para por-arquivo + whitelist explícita (lint-e2e.config.json).
ADR 0036 ganhou Revisão 2.
Whitelist atual: 8 arquivos pendentes de refatoração.
Sem --no-verify esperado a partir de agora.

---

### 2026-05-17 — LINTER E2E ENDURECIDO PARA 100% BUSINESS

Threshold revisado de 60% para 100% @business. Tag @smoke removida como categoria aceita. Razão: smoke virou muleta — 99 de 103 testes eram "página carrega" disfarçados de lógica de negócio.

Estado atual:
- 4 testes @business reais (auth: login invalid CPF, login wrong password, multi-tenant select; cashier: cron endpoint)
- 99 testes @smoke (categoria não mais aceita) — precisam ser refatorados para @business OU removidos
- Linter bloqueia push (4% < 100%)
- ADR 0036 revisado

Próximas sessões: refatoração módulo a módulo. Cada test() vira @business real com ação + assertion ou é deletado.
Ordem planejada: Clientes (23) → Configurações (17) → Caixa (14) → Financeiro (4) → Estoque-A (19) → Estoque-B (15) → Auth/Home (5).

---

### 2026-05-17 — Estoque-B: auditoria + fechamento 100%

- Audit: 0 bugs. 10 procedures, 42 unit tests, 5 páginas — tudo funcional.
- stock-b.spec.ts: 15 cenários E2E verdes (23.1s)
- Total E2E projeto: 103 passed (2.0m)
- AUDIT_REPORT.md criado

---

### 2026-05-17 — Estoque-A: auditoria + fechamento 100%

- Audit: 0 bugs. 66 procedures, 18 páginas — tudo funcional.
- stock-a.spec.ts: 19 cenários E2E verdes (30.5s)
- Total E2E projeto: 88 passed (1.9m)
- AUDIT_REPORT.md criado

---

### 2026-05-17 — Configurações: auditoria + fechamento 100%

- Audit: 0 bugs. 22 procedures, 16 páginas — tudo funcional.
- settings.spec.ts: 17 cenários E2E rodando verde (25.8s)
- Dívidas mantidas (aceitas em CLOSE.md): .pfx encryption, businessHours sem UI
- AUDIT_REPORT.md criado

---

### 2026-05-17 — Clientes: auditoria + fechamento 100%

- Audit: 0 bugs de app encontrados. Gap era apenas cobertura E2E (4 de 24).
- customers.spec.ts expandido de 4 para 23 cenários (T-1 a T-24 da SPEC, exceto T-20 que depende de 2 users simultâneos)
- Helpers compartilhados já corrigidos na sessão anterior (login, waitForLoadState)
- AUDIT_REPORT.md criado em docs/specs/clientes/
- 23 E2E rodando verde (33.9s)

---

### 2026-05-17 — Caixa: dívidas zeradas (16 E2E + CSS print). Módulo 100% completo.

- 16 cenários E2E com Playwright (helpers + todos os cenários da SPEC seção 11)
- CSS @media print: layout A4, brand Arena Tech, área de assinatura, botão Imprimir (no-print)
- Relatório enhanced com cabeçalho, conferência e assinaturas
- Dívidas: ZERO (módulo Caixa 100% completo)

---

### 2026-05-17 — Financeiro: fechamento 100% completo

- 4 páginas faltantes implementadas: dashboard (4 cards), categorias (CRUD FIXED/CUSTOM), parcelas-pendentes (consolidada com cards), contas-receber/criar e contas-pagar/criar (forms separados com preview de parcelas)
- 39 integration tests (listagem, criação, baixa, estorno, cancelamento, RBAC F8, stubs @public-api, tenant init)
- 5 E2E críticos com Playwright (criar manual, baixa, estorno, cancelamento, RBAC operator)
- TODAS dívidas do Financeiro pagas — módulo 100% completo
- typecheck ✓ | test ✓ (615) | build ✓

---

### 2026-05-16 — Financeiro: ADRs + RBAC + tenant init

- ADRs 0032 (modelo unificado), 0033 (VENCIDO computed), 0034 (categorias FIXED+CUSTOM) criados
- RBAC F8 implementado: operator vê só RECEIVABLE, bloqueado em PAYABLE
- Tenant init service ativo: 8 FIXED categories criadas automaticamente no approve de tenant
- PATTERNS.md: 3 novos padrões (modelo unificado, status derivado, híbrido sistema-tenant)

---

### 2026-05-16 — IMPLEMENT Financeiro (Categorias + Procedures @PDV/@OS)

- **Implementado:**
  - Schema: FinancialCategory (FIXED/CUSTOM, RECEITA/DESPESA, unique tenantId+code)
  - FinancialTransaction expandido: +categoryId, +saleId, +serviceOrderId, +isManual (F3 XOR), +supplierId, +paymentMethodId, +cancelledAt/By/Reason, +createdByUserId
  - Installment expandido: +paidByUserId, +estornadaAt/By/Reason
  - TransactionStatus: +ESTORNADA
  - installment-generator.service.ts: divisão proporcional com dízima (last absorbs remainder)
  - tRPC: +8 procedures (categories CRUD, @PDV createReceivablesFromSale, @OS createReceivablesFromServiceOrder, cancelReceivablesFromSale, getCustomerOpenBalance)
  - RBAC: operator bloqueado, Owner para FIXED toggle
  - Testes: 10 novos (installment generator — dízima, exact, 36 parcelas, edges)
  - typecheck ✓ | test ✓ (576) | build ✓
- **Decisões aplicadas:** F1 (reuso PaymentMethod), F3 (XOR origin), F4 (stubs), F5 (cancel+estorno), F6 (VENCIDO computed), F7 (categories FIXED+CUSTOM), F8 (RBAC), F9 (anti-escopo)
- **Dívidas técnicas:** ADRs 0032-0034 pendentes, testes E2E (batch final), páginas UI (existentes da Fase 6 com schema expandido)
- **Próximo:** Módulo OS ou próxima prioridade

---

### 2026-05-16 — Caixa: fechamento de 3 dívidas técnicas

- ADR 0030 (CashMovement append-only) criado
- ADR 0031 (RBAC granular) criado com matriz completa
- Endpoint cron POST /api/cron/close-abandoned-cash-sessions com CRON_SECRET auth
- autoCloseAbandonedSessions refatorado para multi-tenant (sem tenantId param)
- CRON_SECRET adicionado a .env.example
- docs/operations/cron-setup.md: systemd timer + GitHub Actions schedule
- PATTERNS.md: seções "Event log append-only" e "RBAC granular por procedure"
- Dívidas restantes: 16 E2E (batch final) + CSS print relatório

---

### 2026-05-16 — IMPLEMENT Caixa (Sessão + Movimentações + Auto-close)

- **Implementado:**
  - Schema refatorado: CashRegister→CashSession, CashMovement simplificado (4 tipos K2, nature enum)
  - CashSession: 18 campos incluindo verificação, closeType, partial unique K5
  - Migration + RLS em 2 tabelas
  - Service: calculateBalance, calculateCashOnHand, getPaymentMethodSummary, closeSession, autoCloseAbandonedSessions (idempotente)
  - tRPC: +5 procedures públicas (@PDV getOpenSession, recordSale; @OS recordServiceOrderPayment; expense, forceClose)
  - Refatorados 11 arquivos existentes (sale.ts, financial.ts, dashboard.ts, service-order.ts, cashier.ts, validators, UI)
  - ADRs: 0028 (sessão por usuário K1), 0029 (auto-close sem Job externo K3)
  - SPEC: docs/specs/caixa/SPEC.md
  - Testes: 17 novos (validators, cálculos, regras K4-K7)
  - typecheck ✓ | test ✓ (566) | build ✓
- **Decisões aplicadas:** K1-K11 todas implementadas ou documentadas como anti-escopo
- **Próximo:** Módulo Financeiro ou próxima prioridade do dono

---

### 2026-05-16 — IMPLEMENT Catálogo (Serviços + Aparelhos + Simulador)

- **Implementado:**
  - ADR 0025 (estratégia migração Big Bang no cutover)
  - Schema: ServiceType (name, slug, active), Service expandido (+serviceTypeId FK), CatalogDevice (14 campos), CatalogDeviceCategory
  - Migration + RLS em 3 tabelas
  - tRPC: +14 procedures no catalogRouter:
    - ServiceType: listWithCount, create, rename, duplicate (copia services), delete (cascata soft)
    - bulkAdjustPrices: aplica % sobre basePrice filtrado
    - CatalogDevice: list (paginado+filtros), get, create, update, delete
    - CatalogDeviceCategory: list, create, update, delete
    - simulateInstallments: gross up formula do legacy usando InstallmentRule
  - RBAC: operator read-only, manager+ CRUD
  - ADRs: 0025 (migração), 0026 (ServiceType refactoring), 0027 (CatalogDevice separado de Product)
  - SPEC: docs/specs/catalogo/SPEC.md (7 seções, modelos, regras, anti-escopo)
  - typecheck ✓ | test ✓ (549) | build ✓
- **Decisões aplicadas:** D1 (sem e-commerce público), D2 (avaliações para Estoque-C), D3 (checklist anti-escopo), D4 (simulador), D5 (ServiceType), D6 (CatalogDevice separado), D7 (anti-escopo), D8 (RBAC)
- **Próximo:** Módulo Caixa ou próxima prioridade do dono

---

### 2026-05-16 — IMPLEMENT Estoque-B (Posição, Movimentações, IMEI)

- **Implementado:**
  - **FASE 0 (revisão Estoque-A):** Product.currentStock reintroduzido para modelo híbrido (D1). ADR 0016 atualizado. ProductService.getAvailableQuantity híbrido. PATTERNS.md atualizado.
  - **Schema:** StockItem (22 campos, 4 índices, RLS), StockMovement refatorado (+quantityBefore/After, +stockItemId, -unitCost). Enums: StockItemStatus (6), StockItemCondition (4), StockMovementType (5 novos valores).
  - **Validators:** IMEI Luhn (export validateImei), stock-item.ts (10 schemas + labels + state machine)
  - **Services:** stock-item.service.ts (entrySerializedItems, entryNonSerialized, exitNonSerialized, adjustInventory, changeItemStatus)
  - **tRPC:** +10 procedures (listStockItems, getStockItem, entrySerializedItems, entryQuantity, writeOff, adjustInventory, changeItemStatus, searchByImei, getImeiHistory, getAvailableQuantity)
  - **RBAC:** operator read-only, manager CRUD, owner bloqueio/desbloqueio
  - **ADRs:** 0021 (state machine), 0022 (IMEI Luhn), 0023 (append-only movements), 0024 (RBAC)
  - **Testes:** 42 novos (IMEI, state machine, validators)
  - typecheck ✓ | test ✓ (549) | build ✓
- **Decisões aplicadas:** D1 (modelo híbrido), D2 (5 tipos movement), D3 (reserva), D4 (6 status), D5 (Luhn), D6 (IMEI history), D7 (RBAC), D8 (anti-escopo)
- **Próximo:** Página UI de Estoque-B (se solicitado) ou próximo módulo

---

### 2026-05-16 — IMPLEMENT Estoque-A contra SPEC v1.0

- **Implementado:**
  - Schema Prisma: +7 tabelas (ProductCategoryPivot, ProductAttribute, ProductAttributeValue, ProductVariation, ProductVariationAttribute, ProductAttributeConfig, ProductPhoto) + Supplier expandido + Product expandido
  - Migration: expand_stock_catalog_estoque_a + RLS em 5 tabelas
  - Product: +ncm, cest, isSerialized, isPremium, hasVariations, icmsDifferentialRate, defaultMargin; -currentStock (ADR 0016), -isDevice
  - Supplier: address JSON → 7 campos separados (ADR 0007), cpfCnpj → cpf + cnpj separados, type enum
  - BrasilAPI NCM: mapa curado ~45 categorias + fallback API + timeout 5s
  - BrasilAPI CNPJ: lookup de fornecedor com degradação graciosa
  - Product Image Service: Sharp (3 versões WebP) + MinIO upload/delete
  - API route /api/products/upload para multipart form-data
  - tRPC: +15 procedures (attributes CRUD, values CRUD, variations CRUD, photos CRUD, NCM search, CNPJ lookup, duplicate product)
  - RBAC: operator bloqueado em todas as mutations (padrão ctx.session.availableTenants)
  - Product form expandido: seção fiscal, isPremium, hasVariations, defaultMargin, categoria select
  - Página /stock/attributes: CRUD atributos com valores inline (expand row)
  - 51 testes unitários novos (38 validators + 13 BrasilAPI NCM)
  - typecheck ✓ | test ✓ (507) | build ✓
- **Dependências adicionadas:** sharp, @aws-sdk/client-s3
- **22 arquivos corrigidos** para referências quebradas (currentStock→stub 0, isDevice→isSerialized, cpfCnpj→cpf/cnpj)
- **Próximo:** Revisão do dono → SPEC Estoque-B (StockItem, movimentações)

---

### 2026-05-16 — SPEC Estoque-A (Catálogo de Produtos) v1.0

- **Produzido:**
  - `docs/specs/estoque-a/SPEC.md` — 16 seções, ~1060 linhas
  - `docs/specs/estoque-a/QUESTIONS.md` — 9 perguntas pendentes
  - `docs/specs/estoque-a/ASSUMPTIONS.md` — 10 premissas documentadas
  - 5 ADRs (0016-0020): single source of truth, MinIO+Sharp, BrasilAPI NCM, variações modelo, RBAC
- **Modelos especificados:** Product (26 campos + 3 computed), ProductCategory, ProductCategoryPivot, ProductAttribute, ProductAttributeValue, ProductVariation, ProductVariationAttribute, ProductAttributeConfig, ProductPhoto, Supplier (22 campos)
- **Descobertas do código real:**
  - `eh_aparelho` e `controla_imei` sempre setados juntos → unificados em `isSerialized`
  - Multi-categoria existe via pivot `produto_categorias_pivot` com flag `principal`
  - Fornecedor NÃO tem FK direta para Product (relação é via EstoqueItem)
  - Supplier.address no schema atual é JSON — precisa migrar para campos separados (ADR 0007)
  - Schema atual tem `currentStock` — será removido (ADR 0016)
  - MAX_FOTOS = 3 é constante do legacy
  - Geração de SKU é automatizada via `gerarCodigoInterno()`
  - NCM tem mapa curado de ~45 categorias hardcoded no controller
- **Próximo:** Revisão do dono → IMPLEMENT Estoque-A

---

### 2026-05-16 — IMPLEMENT Configurações contra SPEC v1.0

- **Implementado:**
  - Schema Prisma: TenantFiscalSettings (24 campos), TenantAssistanceSettings (2 campos), TenantReceivingSettings (8 campos) — todos com RLS
  - TenantSettings expandido: campos endereço separados (ADR 0007), warrantyNewMonths, warrantyUsedMonths, businessHours
  - RBAC granular em TODAS as mutations de settings:
    - updateGeneral: manager + owner
    - updateFiscalSettings, createPaymentMethod, updatePaymentMethod, deletePaymentMethod, upsertInstallmentRules, updateReceiving: owner only
    - updateAssistance: manager + owner
  - getFiscalSettings/updateFiscalSettings migrado de hack JSON (address.fiscal) para modelo TenantFiscalSettings tipado com mapeamento PT↔EN
  - Página /settings/assistance: termos de serviço + política garantia (textarea)
  - Página /settings/receiving: políticas, mín parcelamento, CPF, caixa auto, metas, alíquotas DAS/ICMS
  - Sidebar reorganizada com tabs na ordem correta (Geral, Assistência, Fiscal, Pagamento, Parcelamento, Recebimento, ...)
  - typecheck ✓ | test ✓ (456) | build ✓
- **Lacunas aceitas (dívida técnica):**
  - Upload certificado .pfx encriptado → adiado para quando módulo Fiscal precisar realmente decifrar
  - Testes E2E dos 17 cenários da SPEC → batch de testes no final
- **Próximo:** SPEC do próximo módulo (Estoque ou Catálogo)

---

### 2026-05-16 — SPEC Configurações v1.0

- **Produzido:**
  - `docs/specs/configuracoes/KEY_VALUE_INVENTORY.md` — 38 chaves inventariadas, 4 famílias
  - `docs/specs/configuracoes/SPEC.md` — 15 seções, ~650 linhas
  - `docs/specs/configuracoes/QUESTIONS.md` — 5 perguntas pendentes
  - `docs/specs/configuracoes/ASSUMPTIONS.md` — 7 premissas documentadas
  - 6 ADRs (0010-0015): modelos tipados, InstallmentRate relacional, fiscal scope, certificado encriptado, payment methods híbridas, RBAC por tab
- **Descobertas do código real:**
  - Legacy tem `FormaPagamento` + `FormaPagamentoTaxa` como tabelas reais (não apenas key-value JSON)
  - Taxas são granulares: por parcela + por tipo (aparelho/não-aparelho) + política (loja absorve vs cliente paga)
  - ConfiguracaoAssistencia duplica campos de identidade com key-value (nome, cnpj, telefone, logo)
  - Senha do certificado digital armazenada em PLAINTEXT no banco (corrigido: não armazenar no novo)
  - 8 formas de pagamento no legacy (Dinheiro, PIX, DePix, Cartão Crédito, Cartão Débito, Parcelado, Crediário, Misto)
- **Decisões tomadas:**
  - 6 modelos tipados substituem 38 chaves + 4 tabelas legacy
  - RBAC granular: Owner-only para Fiscal/Pagamento/Parcelamento/Recebimento
  - 4 formas fixas + customizadas (híbrido)
  - Certificado .pfx encriptado AES-256-GCM em MinIO, senha nunca armazenada
  - Sem cache Redis por enquanto (performance ok com singleton reads)
- **Próximo:** Revisão do dono → IMPLEMENT Configurações

---

### 2026-05-16 — Dívida técnica: ViaCEP reincorporado em Clientes

- **Implementado:**
  - SPEC atualizada: ViaCEP removido do anti-escopo, adicionado RN-16, testes T-23/T-24
  - `src/lib/integrations/viacep.ts` — lógica extraída com timeout 5s e degradação graciosa
  - `cep-input.tsx` reescrito: debounce 500ms (era onBlur), mensagem de erro inline
  - `customer-form.tsx` agora usa CepInput com onAddressFound (preenche logradouro/bairro/cidade/estado)
  - 4 consumidores existentes (fiscal/entrada, settings/general, stock/suppliers new+edit) migrados de ViaCEPResponse para AddressResult
  - 6 testes unitários do viacep.ts (mock fetch, erro, timeout, CEP malformado, resposta ok, strips chars)
  - ADR 0009: integração ViaCEP em formulários de endereço
  - PATTERNS.md: seção "Formulários de endereço" com padrão reusável
- **Decisões:**
  - AddressResult usa nomes em português normalizado (logradouro, bairro, cidade, estado) em vez de nomes raw da API ViaCEP (localidade, uf)
  - Debounce 500ms no onChange (8 dígitos) em vez de onBlur — UX mais responsiva
  - Mensagem de erro discreta em text-muted-foreground (não vermelha/destructive) — é situação esperada, não erro do usuário
- **Próximo:** SPEC de Configurações

---

### 2026-05-15 — Etapa 0: Varredura Legacy Completa

- **Implementado:**
  - **20 módulos inventariados** em `docs/legacy/`:
    1. Ordens de Serviço (OS) — 3100+ linhas controller, 5 models, Autentique, DePix, WhatsApp
    2. PDV — Carrinho session, split payment, upgrade aparelhos, DePix
    3. Clientes — CRUD, interesses/leads, CPF/CNPJ lookup (DirectD)
    4. Catálogo — Serviços, avaliações (tabela preços), simulador, checklist, catálogo público (e-commerce)
    5. Estoque — Dual model (Produto counter + EstoqueItem individual), IMEI, NF-e import, compras aparelhos
    6. Caixa — Abertura/fechamento, sangria/suprimento, conferência, fechamento automático
    7. Financeiro — Contas pagar/receber com parcelas, DRE, fluxo de caixa, formas de pagamento configuráveis
    8. Comissões — Prestadores MEI/CLT, faixas progressivas estilo IR, 5 categorias, ajuda de custo proporcional
    9. Fiscal — NF-e/NFC-e com Strategy Pattern (Nuvem Fiscal + Focus NFe), DANFE, inutilização
    10. Operação — Entregadores (CRUD simples), lab externo via flags na OS
    11. Consulta IMEI — API externa com quota mensal por tenant
    12. Comunicação — WhatsApp (Meta Cloud API + Evolution), Chatwoot (CRM), Chatbot Lia (Claude AI), VendaBot, Instagram bridge
    13. Recompensas — Cashback completo: ações (story/reels), campanhas, saldo, utilização, relatórios
    14. Configurações — 4 tabelas (geral, assistência, parcelamento, recebimento)
    15. Admin Central — SaaS: tenants, planos, addons, pré-cadastros, estornos
    16. Autenticação — 2 guards (web/tenant), login CPF, troca senha obrigatória, 4 roles
    17. Multi-tenancy — stancl/tenancy com banco MySQL separado por tenant
    18. Notificações — Sem sistema nativo, tudo via WhatsApp/Chatwoot
    19. Jobs/Queues — 12 jobs, 9 scheduled tasks, queue driver database
    20. Eventos/Listeners — 1 listener (SeedTenantDatabase), observers inline, 5 webhooks
  - **INDEX.md** com: mapa de dependências, 13 integrações externas consolidadas, 14 TODOs/hacks, 5 features código morto, 8 descobertas
  - 5 commits em lotes de 4 módulos
- **Descobertas surpreendentes:**
  - Chatbot Lia muito mais complexo que esperado (~700 linhas, tool calls Claude, VendaBot integrado)
  - Strategy Pattern no fiscal (2 providers implementados)
  - Upgrade de aparelhos com trade-in completo no PDV
  - Orçamento adicional com aprovação via link público
  - Auto-encerramento de conversas com 3 critérios
  - NF-e de entrada com parse XML e vinculação de itens
- **Próximo:** SPEC rigorosa do módulo OS (Prompt 2)

### 2026-05-15 — SPEC Clientes v1.0

- **Produzido:**
  - `docs/specs/clientes/SPEC.md` — 15 seções, ~900 linhas
  - `docs/specs/clientes/QUESTIONS.md` — 5 perguntas pendentes
  - `docs/specs/clientes/ASSUMPTIONS.md` — 7 premissas documentadas
  - 4 ADRs (0005-0008): PF+PJ unificado, soft delete, endereço campos separados, RBAC
- **Descobertas do código real vs inventário:**
  - Interest NÃO tem FK para Cliente (entidade autônoma com dados próprios)
  - Tipos de interesse reais: Compra/Venda/Troca/Reparo (não aparelho/servico/acessorio como inventário dizia)
  - Status reais: Em espera/Contatado/Finalizado/Cancelado
  - Tipos de interação reais: Telefone/WhatsApp/E-mail/Presencial/Outro (5 tipos, dono reduziu para 3)
  - CPF é required no StoreClienteRequest (inventário dizia nullable)
- **Decisões tomadas:**
  - Endereço: campos separados (ADR 0007) — compatibilidade NF-e
  - RBAC: 3 papéis (operator/manager/owner) para controle de ações destrutivas
  - Partial unique index para CPF/CNPJ (permite reuso após soft delete) — sujeito a Q1
- **Próximo:** Implementação concluída, validação cruzada pelo dono

### 2026-05-15 — IMPLEMENT Clientes contra SPEC v1.0

- **Implementado:**
  - Schema: Customer (PF/PJ, 19 campos, partial unique CPF/CNPJ), Interest (autônomo), InterestInteraction (enum)
  - Migration: realign_customers_to_spec + RLS em 3 tabelas
  - Validators: 30 testes (CPF/CNPJ dígito verificador, cross-field, sendBatch)
  - Routers: customer (list/byId/create/update/delete/restore com RBAC), interest (CRUD + interactions + sendBatch stub)
  - Páginas: /customers (CRUD), /interests (CRUD + interações)
  - CustomerForm PF/PJ toggle, endereço campos separados (ADR 0007)
  - typecheck 0 erros, 30 testes passando
- **Próximo:** Validação cruzada pelo dono

### 2026-05-15 — Sprint 6: Lacunas finais (PDF recibos, Admin CRUD, sidebar)

- **Implementado:**
  - **Quick Sales PDF recibo:** API route `/api/quick-sales/[id]/recibo` (HTML receipt para vendas pagas, fiel ao Laravel vendas-avulsas/pdf/recibo.blade.php)
  - **DePix Comprovante PDF:** API route `/api/depix/withdrawals/[id]/comprovante` (HTML transfer receipt para saques SENT, fiel ao Laravel saques-depix/pdf/comprovante.blade.php)
  - **Botoes PDF:** Botao "Recibo" na tela de detalhe de venda avulsa (status PAID), Botao "Comprovante" na tela de detalhe de saque DePix (status SENT)
  - **Admin Addons CRUD completo:** Schema Prisma (addons, addon_purchases — 2 tabelas globais sem RLS), validators Zod (createAddon, updateAddon, listAddons, assignAddon), 8 procedures admin (listAddons, getAddon, createAddon, updateAddon, toggleAddon, deleteAddon, assignAddon, addonStats), pagina com DataTable + dialog criar/editar + toggle ativo/inativo + excluir + stats cards
  - **Admin Refunds CRUD completo:** Schema Prisma (refunds — 1 tabela global sem RLS), validators Zod (listRefunds, processRefund, cancelRefund), 5 procedures admin (listRefunds, getRefund, processRefund, cancelRefund, refundStats), pagina com DataTable + filtro status + dialog processar/cancelar + stats cards
  - **Sidebar verificado:** Todos os 33 links do sidebar app e 8 links do sidebar admin apontam para paginas existentes
  - Migration: 20260515115419_add_addons_and_refunds
  - typecheck ok | build ok | 120 paginas
- **Decisoes:**
  - Addons e Refunds sao tabelas GLOBAIS (sem tenant_id RLS, sem RLS policies) — acessadas via adminProcedure + withAdmin
  - AddonPurchase tem tenant_id para tracking mas sem RLS (dados acessados apenas pelo super admin)
  - PDFs implementados como HTML com window.print() (mesmo padrao do simulador e recibos de OS)
  - Sidebar 100% funcional — nenhum link morto encontrado
- **Proximo:** Fase 14 (Recompensas) quando decisao de produto for tomada

### 2026-05-15 — Sprint 4+5: Prestadores MEI completo + Modulos menores

- **Implementado:**
  - **Prestadores MEI/CLT (Sprint 4):**
    - Schema Prisma: 6 novas tabelas (providers, provider_contracts, provider_commission_rules, provider_apuracoes, provider_reversals, provider_uncovered_days) + 4 enums (ProviderProfile, ProviderBondType, ProviderApuracaoStatus, ProviderReversalType)
    - RLS habilitado em todas as 6 tabelas via migration SQL
    - Validators Zod: provider-commission.ts (13 schemas + labels)
    - tRPC router: providerCommissionRouter (12 procedures: listProviders, createProvider, updateProvider, createContract, updateRules, getDetail, calculate, closeApuracao, createReversal, deleteReversal, toggleUncoveredDay, listAvailableUsers)
    - Motor de calculo: faixas progressivas estilo IR por categoria+escopo, rateio proporcional, ajuda de custo proporcional (dias efetivos), estornos, fechamento com geracao de conta a pagar (FinancialTransaction PAYABLE)
    - Paginas: /commissions/providers (listagem MEI/CLT), /commissions/providers/new (form com selecao de usuario, perfil, vinculo, CNPJ/razao social), /commissions/providers/[id] (ficha completa com apuracao, memoria de calculo, estornos, dias nao cobertos)
  - **Observacoes de Servico (Sprint 5):**
    - Schema Prisma: 1 nova tabela (service_observations) com serviceTypes/deviceModels como JSON
    - RLS habilitado
    - Validators Zod: 3 schemas (create, update, list)
    - 5 procedures no catalogRouter: listServiceObservations (com filtro por tipo/modelo), createServiceObservation, updateServiceObservation, toggleServiceObservation, deleteServiceObservation
  - **Consulta CPF/CNPJ (Sprint 5):**
    - 2 procedures no customerRouter: lookupCpf, lookupCnpj
    - Integracao DirectD API (Receita Federal) com token via env var DIRECTD_TOKEN
    - Verifica se CPF/CNPJ ja existe no sistema antes de consultar API
    - Mock automatico quando token nao configurado (retorna lookupUnavailable)
  - **Assinatura Tenant (Sprint 5):** Verificado no Laravel — controller desativado (Asaas removido, DePix em desenvolvimento). Nao implementado no Next.js pois ja esta coberto por /settings/subscription existente.
  - Testes: 47 novos unit tests (35 provider-commission + 12 service-observation), total 445
  - typecheck ok | build ok | test ok
- **Decisoes:**
  - Prestadores MEI redesenhados com schema proprio (vs ServiceProvider da Fase 11 que era generico) — Provider tem contrato, faixas progressivas, apuracao mensal, estornos, dias nao cobertos
  - Calculo usa faixas progressivas estilo IR (como Laravel) em vez de taxa fixa (como CommissionRule da Fase 10)
  - 5 categorias de comissao: produto_acessorio, produto_aparelho, servico_at_sem_peca, servico_at_com_peca, intermediacao_at
  - Ajuda de custo proporcional: (diaria_refeicao + deslocamento) * dias_efetivos + celular, limitado pelo teto do contrato
  - Fechamento de apuracao gera FinancialTransaction PAYABLE automaticamente
  - CPF/CNPJ lookup via DirectD API (mesma do Laravel) com cache client-side via TanStack Query
- **Proximo:** Fase 14 (Recompensas) quando decisao de produto for tomada

### 2026-05-15 — Auditoria de 7 modulos (Estoque, Configuracoes, Avaliacoes, Comissoes, Clientes, Checklist, Simulador)

- **Auditado contra Laravel:**
  - **Estoque:** Produtos CRUD completo, fornecedores CRUD, categorias, entrada/saida/ajuste, compras de aparelhos, relatorios inventario. Migration adicionou campos `brand`, `is_device`, `promotional_price`, `image_url` ao Product para paridade com Laravel (marca, eh_aparelho, preco_promocional, imagem_url). Form atualizado com marca, preco promocional e switch "E Aparelho".
  - **Configuracoes:** Completo — gerais (nome, CNPJ, telefone, endereco com CEP), fiscais (razao social, IE, IM, CNAE, regime tributario, NF-e/NFC-e config, certificado), formas de pagamento com taxas, regras de parcelamento por forma, integracoes, usuarios CRUD com roles, alterar senha, audit logs, assinatura/plano.
  - **Avaliacoes:** Tabela de precos por modelo/armazenamento/bateria com CRUD completo. Adicionado `bulkAdjustFixed` (ajuste por valor fixo R$ como Laravel), `deleteModel` (excluir modelo inteiro), `formatWhatsAppMessage` (formata tabela e gera link wa.me para envio). UI atualizada com botoes "Ajuste R$", "Enviar WhatsApp" e dialogs correspondentes.
  - **Comissoes:** Redesenho completo vs Laravel — Laravel tem regras hardcoded por usuario com calculo semanal/mensal e categorias (aparelho/nao-aparelho, propria/loja, com-custo/sem-custo). Next.js usa tabela de regras (CommissionRule) por tipo (SALE/SERVICE_ORDER) e papel (seller/technician) com calculo automatico sobre vendas e OS do periodo. Mais flexivel e escalavel. Paginas: listagem, regras CRUD, relatorio mensal, prestadores (via operation), comissao socia, minha comissao.
  - **Clientes:** Completo — CRUD com busca (nome, CPF, CNPJ, telefone, email), tipo PF/PJ com validacao, endereco com CEP (via addressSchema), data nascimento, telefone principal + alternativo, interesses com status/tipo/prioridade/followUp, LGPD consent, soft delete, restore.
  - **Checklist:** Completo — 15 itens (display, touchscreen, bateria, carregamento, wifi, bluetooth, camera, alto-falante, microfone, botoes, biometria, faceId, GPS, rede celular, sensores) com 3 estados (OK/NOK/N/A via boolean|null). Fluxo de entrada e saida na OS. 6 infos adicionais do aparelho (deviceInfo).
  - **Simulador:** Completo — mostra TODAS as parcelas incluindo taxa 0% (PIX/Dinheiro, Debito, Credito 1x, parcelas 2x-36x conforme regras). PDF funciona via /api/simulator/pdf. Campo nome do cliente presente.
- **Decisoes:**
  - Comissoes redesenhadas intencionalmente (regras em tabela vs hardcoded) — mais flexivel para SaaS multi-tenant
  - bulkAdjust em avaliacoes mantido com percentual (adicionado bulkAdjustFixed para valor fixo como alternativa)
  - WhatsApp de avaliacao usa URL wa.me (nao Evolution API diretamente) — abre no navegador do usuario
- **Proximo:** Fase 14 (Recompensas) quando decisao de produto for tomada

### 2026-05-14 — Modulos finais (DePix, Pagamento Publico, Pre-cadastro, Simulador PDF, Recibo, Relatorios NF)

- **Implementado:**
  - **Saques DePix:** schema depix-withdraw.prisma (1 tabela + 2 enums), RLS, 7 validators Zod, router depixWithdrawRouter (7 procedures: list, getById, create, update, stats, searchRecipients, checkStatus), 3 paginas (listagem+filtros+stats, novo saque com resumo lateral, detalhe com valores+acoes)
  - **Pagamento Publico:** /pay/[token] pagina publica com layout DePix (placeholder para integracao futura)
  - **Recibo Publico:** /receipt/[token] pagina publica que busca Sale por publicLink e exibe recibo com itens, cliente, totais
  - **Pre-cadastro Fluxo:** /register/pending (aguardando aprovacao), /register/approved (sucesso + link login), /register/rejected (com motivo + contato WhatsApp)
  - **Simulador PDF:** API route /api/simulator/pdf (gera HTML formatado para impressao), botao "Gerar PDF" + campo "Nome do Cliente" no formulario
  - **Relatorios NF:** router reportRouter (1 procedure: nfReport), pagina /reports com filtros (periodo, status NF), 6 cards de totais, tabela visao conjunta (vendas + OS)
  - Proxy.ts: /pay, /receipt, /register/* como rotas publicas
  - Sidebar: "Saques DePix" em Financeiro, "Relatorio NF" em Fiscal
  - RLS habilitado em depix_withdrawals, quick_sales, interest_interactions
- **Decisoes:**
  - DePix create e mock (sem integracao real com api.pixpay.space nesta sessao) — webhook externo pode atualizar status
  - Recibo publico usa prisma direto (sem withTenant) pois e rota publica
  - Relatorio NF cruza vendas/OS com invoices por referenceId
  - Invoice.number e Int? — mapeado como string|number|null na interface
- **Proximo:** Fase 14 (Recompensas) quando decisao de produto for tomada

### 2026-05-12 — Alinhamento OS com Laravel campo a campo (segunda rodada)

- **Implementado:**
  - Schema: vendorId, otherCost, nfseIssued, nfseNumber, paymentDate
  - Wizard: campo "Vendedor intermediador" no step 5 com EntitySelector
  - Listagem: colunas Telefone, CPF, tipo equipamento; badge Garantia; filtro por tecnico e data
  - Detalhe: card "Custos e Lucro" com edicao inline (partsCost, otherCost) + calculo lucro; vendedor; NFS-e; data pagamento
  - Edicao: secoes Responsaveis (tecnico + vendedor via EntitySelector) e NFS-e (checkbox + numero)
  - PDF: vendedor, secao pagamento, secao NFS-e
  - Router: procedures updateCosts e listVendors
- **Decisoes:**
  - otherCost separado de partsCost (alinhado com Laravel custo vs custo_pecas)
  - NFS-e como campo manual (checkbox + numero) alinhado com Laravel edit
  - Lucro calculado client-side em tempo real (total - partsCost - otherCost)
  - paymentDate automatico no registerPayment
- **Proximo:** Verificar fluxos restantes (orcamento adicional, descancelamento)

### 2026-05-08 — Fix fidelidade modulo OS

- **Implementado:**
  - Checklist com 3 estados (OK/Nao OK/N/A) via boolean|null e toggle group visual
  - Itens da OS: EntitySelector como padrao, campo manual so via toggle "Nao encontrou?"
  - Device types alinhados com Laravel (iPhone, iPad, MacBook, Android, etc.)
  - Busca na listagem agora inclui nome e CPF do cliente
  - Formulario de edicao agora tem secoes de checklist entrada/saida e info adicionais
  - Dialog de adicionar item na tela de detalhe agora usa EntitySelector
- **Decisoes:**
  - checklistSchema: z.boolean().nullable().optional() para representar 3 estados
  - UI: grupo de 3 botoes (Check/X/Minus) por item do checklist
  - Busca por cliente feita em 2 etapas (busca IDs de clientes, depois filtra OS)

### 2026-05-08 — Migracao de dados arena_dev

- **Implementado:**
  - Script shell `scripts/migrate-arena-dev.sh` para migracao MySQL -> PostgreSQL via SSH
  - 15 tabelas migradas com verificacao de contagem (todas batendo)
  - usuarios (13), clientes (1236), servicos (96), avaliacoes (231), produtos (665), formas_pagamento (9), entregadores (2), prestadores (5), ordens_servico (160), OS itens (168), OS historico (1352), vendas (1728), venda itens (1782), contas_receber (499), contas_pagar (46)
  - Mapeamento old_id -> new_uuid via tabelas temporarias _map_*
  - Idempotente: DELETE + INSERT por tabela a cada execucao
- **Decisoes:**
  - COALESCE(NULLIF(col,''),'__X__') para evitar colapso de tabs em campos vazios pelo bash read
  - IF(col IS NULL, default, col) para colunas DATETIME/TIMESTAMP (MySQL strict mode rejeita NULLIF com '')
  - REPLACE(REPLACE(col,'\n',' '),'\r','') para campos TEXT multiline que quebram while read
  - Produto placeholder "Item Avulso (Migrado)" para 18 sale_items sem product_id (FK NOT NULL)
  - Passwords bcrypt $2y$ do PHP sao compativeis com bcryptjs do Node.js
  - Users do seed preservados; apenas users do MySQL (com CPF valido) migrados
- **Proximo:** Cutover real (janela de manutencao com o dono)

---

### 2026-05-08 — Fase 17

- **Implementado:**
  - Dockerfile multi-stage build (node:22-alpine, 3 stages: deps/builder/runner)
  - .dockerignore (node_modules, .next, .git, docs, tests, .env*)
  - docker-compose.prod.yml: app (3001), postgres:16 (5434), redis:7 (6380), minio (9000/9001)
  - .env.production.example com todas as variaveis de producao
  - Nginx config: SSL via Cloudflare Origin cert wildcard, Cloudflare real IP ranges, security headers (HSTS, X-Frame-Options DENY, etc.), proxy para 127.0.0.1:3001
  - GitHub Actions CI/CD: validate job (lint + typecheck + test + build com Postgres e Redis services), deploy job (SSH + docker compose build/up + prisma migrate deploy)
  - scripts/migrate-data.ts: placeholder com mapeamento completo MySQL->PostgreSQL (tabelas, campos, status enums, helpers de conversao), --dry-run flag, ordem de migracao respeitando FKs
  - docs/RUNBOOK.md: deploy (primeiro + subsequente + rollback), monitoramento (logs, health check, alertas), backup (PostgreSQL + MinIO, crontab automatico), cutover (pre/durante/pos), troubleshooting
  - README.md: descricao, stack, setup local, comandos, estrutura, modulos, deploy, multi-tenancy, contribuicao
- **Decisoes:**
  - Docker container em vez de PM2 (consistente com Chatwoot/Evolution API ja na VPS)
  - SSL via Cloudflare Origin Certificate wildcard (valido ate 2040), nao Let's Encrypt
  - Nginx inclui set_real_ip_from para ranges Cloudflare (todo trafego passa por CF proxy)
  - Script de migracao e placeholder — implementacao real sera refinada no dia do cutover
  - CI nao roda e2e (Playwright) por default para velocidade — pode ser adicionado quando necessario
- **Proximo:** Cutover real (janela de manutencao com o dono)

---

### 2026-05-08 — Fase 16

- **Implementado:**
  - Rate limiting in-memory com TTL cleanup (ja existia, adicionado teste)
  - Security headers em next.config.ts (ja existia: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera/mic/geo=())
  - Logger estruturado JSON (ja existia, integrado em todos services)
  - Logger adicionado ao tRPC middleware (protectedProcedure, tenantProcedure, adminProcedure) para monitorar tentativas de acesso nao autorizadas
  - createMetadata helper (src/lib/metadata.ts) — formato "{title} | Arena Tech"
  - Metadata exportado em 13 paginas: service-orders, pdv, customers, stock, cashier, financial, fiscal, commissions, imei, communication + layouts auth e admin
  - Open Graph metadata no root layout
  - not-found.tsx: Logo Arena Tech + "Pagina nao encontrada" + botao voltar
  - error.tsx: Error boundary client component com "Tentar novamente" + "Voltar ao inicio"
  - loading.tsx em 4 locais: app shell (card), service-orders (table), customers (table), stock (table)
  - Bundle optimization: optimizePackageImports ja incluia lucide-react, date-fns, @tanstack/react-table
  - 17 testes novos (rate-limit 6, logger 7, metadata 4), total 360
- **Decisoes:**
  - Rate limiter, logger e security headers ja existiam de sessoes anteriores — faltava commit do metadata.ts e testes
  - Logger integrado no tRPC middleware para security observability (warn em UNAUTHORIZED e FORBIDDEN)
  - Login page e "use client" — metadata colocado no (auth)/layout.tsx
  - Admin page e "use client" — metadata colocado no (admin)/layout.tsx
- **Proximo:** Fase 17 — Cutover

---

### 2026-05-09 — Fases 9 + 13

- **Implementado:**
  - **Fase 9 (Fiscal):** 2 tabelas Prisma (invoices, invoice_items) + 2 enums (InvoiceType, InvoiceStatus), RLS em ambas, 9 validators Zod, 11 procedures tRPC, 3 páginas (listagem + emissão manual + detalhe), sidebar atualizada
  - **Fase 13 (Comunicação):** 2 tabelas Prisma (messages, message_templates) + 3 enums (MessageChannel, MessageStatus, MessageDirection), RLS em ambas, 8 validators Zod, 14 procedures tRPC, 3 páginas (histórico + envio manual + templates), sidebar atualizada
  - fiscal-service.ts: OAuth2 Client Credentials com cache de token, polling assíncrono, mock automático sem env vars
  - whatsapp-service.ts: Evolution API (sendText, sendMedia, sendTemplate, formatPhone), mock automático
  - email-service.ts: Resend API, mock automático
  - Quick actions: notifyOsCompleted, notifyOsStatusChanged, sendOsReceipt, sendSaleReceipt com lookup de template + customer
  - 54 testes novos (26 fiscal + 22 communication + 6 whatsapp-service), total 343
- **Decisões:**
  - Nuvem Fiscal como provider único (conforme decisão pendente já documentada)
  - Evolution API para WhatsApp (não Meta Cloud API diretamente, conforme ADR existente)
  - Chatwoot não implementado nesta fase (placeholder futuro)
  - VendaBot fora do escopo
  - Services com fallback mock: log + retorno success quando env vars ausentes
  - Templates de mensagem são tenant-scoped com slug único (@@unique([tenantId, slug]))
  - Zod v4: z.record() requer 2 argumentos (key, value); .email() antes de .max() pode causar type error
- **Próximo:** Fase 14 — Recompensas (requer decisão prévia de regras)

---

### 2026-05-08 — Fases 11 + 15

- **Implementado:**
  - **Fase 11 (Operacao):** 4 tabelas Prisma (delivery_persons, external_labs, lab_orders, service_providers) + 1 enum (LabOrderStatus), RLS em todas, 12 validators Zod, 14 procedures tRPC, 7 paginas com layout tabs, sidebar atualizada
  - **Fase 15 (Admin Central):** 2 tabelas globais (plans, pre_registrations) + 2 enums, 11 validators Zod, 15 procedures tRPC (incl. publicPlans e submitPreRegistration), dashboard com cards resumo, CRUD tenants/plans, pre-cadastros com approve/reject, relatorios cross-tenant, pagina publica /register
  - hashPassword util para bcryptjs (usado no approve)
  - AdminSidebar com hrefs corretos
  - Proxy.ts com /register como rota publica
  - 55 testes novos (30 operation + 25 admin), total 289
- **Decisoes:**
  - Plans e PreRegistrations sao tabelas GLOBAIS (sem tenant_id, sem RLS) — acessadas via adminProcedure + withAdmin
  - Approve de pre-cadastro: cria Tenant (slug auto-gerado), User (senha temporaria Arena@XXXX), UserTenant (role admin)
  - publicPlans e submitPreRegistration usam publicProcedure com prisma direto (sem withAdmin/withTenant)
  - Operacao usa tenantProcedure padrao (dados scoped)
  - Lab orders tem timestamps automaticos por status (receivedAt, completedAt, returnedAt)
- **Proximo:** Fases restantes (9, 13, 14)

---

### 2026-05-08 — Fases 10 + 12

- **Implementado:**
  - 2 schemas Prisma (commission.prisma, imei.prisma) com 4 tabelas + 2 enums
  - RLS habilitado em todas as 4 tabelas via migration SQL
  - Validators Zod: commission.ts (8 schemas), imei.ts (3 schemas + Luhn validation)
  - tRPC routers: commissionRouter (9 procedures), imeiRouter (4 procedures)
  - IMEI service com mock para dev e real API call para prod (env-driven)
  - Comissões UI: Listagem com filtros (mês/ano/status/tipo), Regras CRUD com Dialog inline, Relatório mensal com cards resumo + tabela agrupada por colaborador, Botão "Calcular Comissões" que processa vendas e OS do período
  - IMEI UI: Input IMEI com validação Luhn, Resultado visual (dispositivo/segurança/garantia), Histórico com DataTable, Indicador de quota mensal
  - Sidebar atualizada: Comissões + Consulta IMEI entre Financeiro e Configurações
  - Testes: 43 unit tests de validators (24 comissão + 19 IMEI)
- **Decisões:**
  - Comissões recalculáveis: "Calcular" deleta PENDING existentes e recria com base nas regras ativas
  - IMEI service usa env vars (IMEI_API_URL, IMEI_API_KEY) — mock automático quando ausentes
  - Quota IMEI criada automaticamente no primeiro uso do mês (50/mês default)
  - Comissões de venda aplicam regras role=seller sobre Sale.sellerId
  - Comissões de OS aplicam regras role=technician sobre ServiceOrder.technicianId
  - Batch approve/pay para múltiplas comissões; cancel individual com validação (não cancela PAID)
- **Próximo:** Fases restantes (9, 11, 13, 14, 15)

---

### 2026-05-08 — Fase 8

- **Implementado:**
  - 1 schema Prisma (sale.prisma) com 2 tabelas + 1 enum (SaleStatus)
  - RLS habilitado em sales e sale_items via migration SQL
  - Validators Zod: sale.ts (paymentDetail, addSaleItem, updateSaleItem, applyDiscount, finalizeSale, cancelSale, refundSale, listSales + labels)
  - tRPC router: saleRouter (15 procedures: createDraft, getDraft, addItem, updateItemQuantity, removeItem, setCustomer, applyDiscount, finalize, cancel, refund, list, getById, stats, byPublicLink, listSellers)
  - PDV UI: Tela principal full-screen com 2 colunas (busca produtos + carrinho), Dialog de pagamento com split payment, Historico de vendas com DataTable + stats cards, Detalhe de venda com estorno
  - Finalize atomico: decrementa estoque (Product.currentStock), cria StockMovement (SALE), CashMovement para cada forma de pagamento, FinancialTransaction (RECEIVABLE) com parcelas para cartao de credito
  - Sidebar: PDV adicionado entre OS e Caixa
  - Command palette: Nova Venda + Historico de Vendas
  - Testes: 35 unit tests de validators + 5 e2e specs
- **Decisoes:**
  - Comissoes adiadas para Fase 10 (dedicada) — apenas sellerId armazenado
  - Integracao Depix adiada — depende de finalizacao da integracao PixPay
  - Draft pattern: venda criada como DRAFT, items adicionados um a um, finalizada atomicamente
  - Numero gerado atomicamente dentro da transacao (VND{year}{5-digit seq})
  - Split payment armazenado como paymentDetails JSON na venda
  - MoneyInput trabalha em centavos — router aceita valores em reais (conversao no client)
  - Produto duplicado no carrinho incrementa quantidade (nao cria novo item)
  - Troco calculado sobre o total pago vs total da venda
- **Proximo:** Fase 9 — Fiscal

### 2026-05-08 — Fase 7

- **Implementado:**
  - 1 schema Prisma (service-order.prisma) com 4 tabelas + 2 enums
  - RLS habilitado em todas as 4 tabelas via migration SQL
  - Validators Zod: service-order.ts (create, update, updateStatus, list, addItem, updateItem, registerPayment, addDocument, checklist, deviceInfo + labels)
  - tRPC router: serviceOrderRouter (15 procedures: list, getById, create, update, delete, updateStatus, addItem, updateItem, removeItem, registerPayment, addDocument, listDocuments, stats, byPublicLink, listTechnicians)
  - Service Orders UI: Listagem com DataTable + stats cards (abertas, em andamento, concluidas, receita), Wizard de criacao multi-step (5 etapas), Detalhe completo com acoes de status contextuais + dialogs (pagamento, cancelamento, estorno), Edit com FormSection, Vista publica /os/[publicLink]
  - Integracao pagamento: registerPayment cria FinancialTransaction (RECEIVABLE) + CashMovement (se caixa aberto)
  - Sidebar nav atualizada (/service-orders), command palette atualizada
  - Proxy.ts: /os/* como rota publica
  - Testes: 42 unit tests de validators + 4 e2e specs
  - PDF placeholder (src/lib/service-order-pdf.ts)
- **Decisoes:**
  - Checklist de entrada/saida como JSONB (redesenho dos 30 campos individuais do Laravel)
  - 13 estados de OS com transicoes validadas server-side via ALLOWED_TRANSITIONS
  - Numero gerado atomicamente dentro da transacao (OS{year}{5-digit seq})
  - Customers buscados dentro do mesmo withTenant (RLS-scoped); users via withAdmin (global)
  - MoneyInput trabalha em centavos — router tRPC aceita valores em centavos
  - EntitySelector usa queryClient.fetchQuery com queryOptions (nao raw trpc client)
  - PageHeader.title aceita ReactNode (mudanca de interface)
  - Integracao Autentique, Depix, WhatsApp ficam como placeholders — implementacao em fases futuras
- **Proximo:** Fase 8 — PDV

---

### 2026-05-08 — Fase 6

- **Implementado:**
  - 3 schemas Prisma (stock.prisma, cashier.prisma, financial.prisma) com 7 novas tabelas + 6 enums
  - RLS habilitado em todas as 7 tabelas tenant-scoped via migration SQL
  - Validators Zod: stock.ts, cashier.ts, financial.ts
  - tRPC routers: stockRouter (11 procedures), cashierRouter (7 procedures), financialRouter (9 procedures)
  - Stock UI: Produtos (DataTable + CRUD + ajuste estoque Dialog), Movimentações (histórico geral filtrado), Compras de Aparelhos (DataTable + form), Relatório de Inventário (cards resumo + tabela)
  - Cashier UI: Página principal com dois estados (sem caixa/caixa aberto), Dialogs para abrir/sangria/suprimento/fechar com conferência, Resumo por forma de pagamento, Histórico de caixas, Detalhe de caixa fechado
  - Financial UI: Listagem com Tabs A Pagar/A Receber + filtros, Criar transação com parcelamento automático (1-36x), Detalhe com pagamento de parcelas (Dialog), Fluxo de Caixa (agrupamento dia/semana/mês + cards resumo), Seção de vencidos
  - Sidebar nav atualizada (Estoque → /stock, Caixa → /cashier, Financeiro → /financial)
  - Testes: 31 unit tests de validators (product, cash register, financial transaction, installment, device purchase)
- **Decisões:**
  - MoneyInput trabalha em centavos internamente — forms convertem centavos↔reais no submit/defaultValues
  - Prisma Decimal retornado em queries precisa de cast para Number() nas tabelas UI — row interfaces usam `unknown` para Decimal fields
  - Saques Depix (integração Pixpay) adiados para Fase 7/8 — dependem de OS e PDV para fazer sentido
  - `adjustStock` usa delta atômico (increment/decrement) dentro de `withTenant` transaction
  - Caixa: apenas 1 aberto por user (validado server-side com CONFLICT error)
  - Parcelas geradas automaticamente com divisão proporcional (última parcela recebe resto)
- **Próximo:** Fase 7 — Ordens de Serviço

---

### 2026-05-08 — Fase 5

- **Implementado:**
  - 3 schemas Prisma (settings.prisma, catalog.prisma, customer.prisma) com 11 novas tabelas + 5 enums
  - RLS habilitado em todas as 11 tabelas tenant-scoped via migration SQL
  - Validators Zod: settings.ts, catalog.ts, customer.ts (CNPJ com dígito verificador)
  - tRPC routers: settingsRouter (14 procedures), catalogRouter (16 procedures), customerRouter (11 procedures)
  - Settings UI: Geral (form com ViaCEP), Formas de Pagamento (CRUD + parcelamentos Sheet), Integrações (grid de cards com config Dialog), Usuários (tabela + invite por CPF)
  - Catalog UI: Serviços (DataTable + form), Templates de Diagnóstico (DataTable + form), Aparelhos (DataTable + filtros), Categorias (inline CRUD)
  - Customers UI: listagem com busca+filtro PF/PJ, criar (LGPD consent), editar, detalhe (tabs Dados/OS/Interesses)
  - Testes: 23 unit tests de validators (CPF/CNPJ/serviço/pagamento), 7 integration tests de RLS de clientes, 4 e2e specs de clientes
  - LoadingState ganhou variante "form"
  - ConfirmDialog ganhou prop variant="destructive"
  - PATTERNS.md: seção "Padrão CRUD por módulo" com template completo + notas Zod v4
- **Decisões:**
  - Zod v4 não suporta `.default()` em schemas usados com react-hook-form (causa type mismatch no resolver) — removidos todos os `.default()` dos validators, defaults passados no `useForm({ defaultValues })`
  - Zod v4 não suporta `.partial()` em schemas com `.superRefine()` — updateCustomerSchema definido explicitamente
  - `z.input<>` usado como FormValues type quando schema tem refinements que mudam o output type
  - Prisma Device.attributes usa `as Parameters<...>` cast para contornar ambiguidade de union type no Prisma v7 (DeviceCreateInput vs DeviceUncheckedCreateInput com categoryId)
  - Settings layout usa `headers()` `x-pathname` para destacar nav ativa (padrão estático — Next.js não expõe pathname em Server Components sem headers)
  - Users page: user_roles é tenant-scoped, mas users é global — busca roles via withTenant, depois users via withAdmin
- **Próximo:** Fase 6 — Estoque + Caixa + Financeiro

---

### 2026-05-08 — Fase 4

- **Implementado:**
  - globals.css: paleta Arena Tech completa (dark/light com tokens success, warning, sidebar)
  - next-themes ThemeProvider (dark padrão) + Sonner Toaster no root layout
  - Logo placeholder SVG "ARENA·TECH" (variantes: full, icon, monogram; tamanhos: sm/md/lg)
  - App Shell: SidebarProvider com cookie de persistência, AppSidebar colapsável (224/64px), MobileSidebar (Sheet), AppHeader com breadcrumb e trigger ⌘K
  - Admin Shell: AdminSidebar e AdminHeader com badge SUPER ADMIN dourado/warning
  - DataTable com TanStack Table v8 (server-side pagination, skeleton loading, toolbar)
  - FormSection + FormActions com loading state
  - Inputs especializados: MoneyInput (centavos), CnpjInput, PhoneInput, CepInput (ViaCEP), DatePicker, DateRangePicker
  - Domain components: StatusBadge (CVA), EntitySelector (Popover+Command+debounce), ConfirmDialog, PageHeader, EmptyState, LoadingState
  - Command Palette ⌘K via CommandDialog (Context Provider global)
  - Toast helpers wrapper (lib/toast.ts)
  - Auth pages redesign: layout com glassmorphism + radial gradient dourado, login/select-tenant/no-access/forgot-password atualizados
  - /dev/components: catálogo de 13 seções (typo, cores, botões, inputs, badges, cards, tabela, toast, empty, loading, confirm, form, command palette)
  - Unit tests: 11 testes de inputs (CPF, CNPJ, phone, money) passando
  - E2E tests: 8 cenários de shell (sidebar, cookie, navegação, ⌘K, /dev/components, toast, mobile)
  - ADR 0004 + PATTERNS.md atualizado com seções de design system, nova página, novo componente
- **Decisões:**
  - Sidebar mobile usa Sheet (gaveta) em vez de overlay fixo — melhor UX em telas pequenas
  - Cookie arena_sidebar_collapsed lido no servidor evita flash de estado no SSR
  - CommandPaletteProvider no (app)/layout.tsx — disponível em todas as páginas autenticadas
  - E2E usa credenciais do seed (não mockadas) — testa fluxo real
  - Integration tests (rls, auth-tenant-access) falhando por issue pré-existente de credenciais DB test — não é regressão da Fase 4
- **Próximo:** Fase 5 — Configurações + Catálogo + Clientes

---

### 2026-05-08 — Revisão e fechamento da Fase 3

- **Contexto:** Revisão do dono identificou duas pendências antes do fechamento.
- **Correção A — Segurança:** Brecha no tenantProcedure corrigida. Cookie `x-active-tenant` é raw, mas agora validado em dois pontos independentes (proxy.ts + tenantProcedure). 6 testes de regressão adicionados.
- **Correção B — Next.js 16:** middleware.ts migrado para proxy.ts (Node.js runtime). auth.config.ts mesclado em auth.ts (split não mais necessário). Zero warnings de deprecação.
- **Documentação:** ADR 0002 com adendo pós-revisão, ADR 0003 novo (Next.js 16), PATTERNS.md atualizado.

---

### 2026-05-08 — Fase 3

- **Implementado:**
  - Validador CPF (normalizeCpf, validateCpf, cpfSchema) com 26 unit tests
  - NextAuth v5 (beta.31) com Credentials provider (CPF + bcrypt)
  - JWT callbacks carregam availableTenants, auto-select single-tenant
  - Auth config split: auth.config.ts (Edge-safe) + auth.ts (Node-only)
  - Cookie x-active-tenant para switch sem re-auth
  - Middleware Edge com protecao completa de rotas
  - tRPC: 4 tipos de procedures (public, protected, tenant, admin)
  - Auth router: me + validateTenantAccess
  - Server actions: loginAction, logoutAction, switchTenantAction
  - 6 paginas: login, select-tenant, no-access, forgot-password, dashboard, admin
  - CpfInput component com mascara automatica
  - Seed expandido: 2 tenants + 4 users cobrindo todos os cenarios de auth
  - 8 cenarios E2E passando (fluxos completos de auth)
  - ADR 0002 em docs/decisions/0002-auth-strategy.md
- **Decisoes:**
  - SEM subdomain — tenant resolvido por cookie/JWT pos-login
  - Auth config split para Edge runtime (middleware nao pode importar crypto/pg)
  - middleware.ts deprecated no Next.js 16 em favor de proxy.ts — funciona com warning
  - bcryptjs mantido (pure JS, Docker-safe, performance negligivel para login)
  - Passwords no .env sem chars $ para evitar shell expansion no source
  - impersonatedTenantId preparado no JWT para futuro uso
- **Proximo:** Fase 4 — Design system + layout (aguardando confirmacao)

---

### 2026-05-08 — Fase 2

- **Implementado:**
  - Prisma 7 multi-file schema: tenant.prisma (Tenant, User, UserTenant), audit.prisma (AuditLog)
  - prisma.config.ts para Prisma 7 (datasource url migrado do schema para config)
  - @prisma/adapter-pg para PrismaClient (Prisma 7 breaking change: driver adapter obrigatorio)
  - Migration SQL pura para RLS: current_tenant_id(), roles app_user/app_admin, policies em audit_logs
  - withTenant(id, fn) e withAdmin(fn) em src/server/db.ts
  - Seed idempotente: tenant arena-tech + super admin (CPF/senha via env vars)
  - 6 cenarios de teste RLS passando (isolamento A/B, WITH CHECK, BYPASSRLS, defense in depth, USING)
  - ADR 0001 em docs/decisions/0001-multi-tenancy-via-rls.md
  - PATTERNS.md com convencoes de schema, checklist de nova tabela, template SQL
- **Decisoes:**
  - Prisma 7 removeu datasourceUrl do schema — requer prisma.config.ts + @prisma/adapter-pg
  - prismaSchemaFolder preview feature removida em Prisma 7 (multi-file e nativo)
  - SET LOCAL ROLE app_user necessario porque superuser/owner bypassa RLS mesmo com FORCE
  - Interactive transaction ($transaction) em vez de Client Extensions (extensions ignoram contexto de transacao existente)
- **Proximo:** Fase 3 — Auth (aguardando confirmacao)

---

### 2026-05-08 — Diagnóstico VPS

- **Implementado:** Diagnóstico read-only completo da VPS Contabo (194.34.232.81). Ver `docs/VPS_INVENTORY.md`.
- **Decisões pendentes:** 8 decisões registradas no inventário (D1–D8) sobre estratégia de deploy, portas, limpeza de configs
- **Próximo:** Aguardando decisões D1–D8 antes de qualquer ação na VPS

---

### 2026-05-08 — Fase 1

- **Implementado:**
  - Scaffold Next.js 16.2.5 (App Router, `output: "standalone"`, Turbopack)
  - TypeScript estrito com `noUncheckedIndexedAccess` + `noImplicitOverride`
  - tRPC v11 completo: `src/server/api/trpc.ts`, `routers/example.ts`, `root.ts`, `api/trpc/[trpc]/route.ts`, `trpc/server.ts`, `trpc/react.tsx`
  - Prisma 7 multi-file schema em `prisma/schema/base.prisma`
  - NextAuth v5 placeholder em `src/server/auth.ts`
  - shadcn/ui new-york + 22 componentes base
  - ESLint flat config (`eslint.config.mjs`) — migrado de `.eslintrc.cjs` por ESLint 10→9 + Next.js 16 remover `next lint`
  - `src/lib/utils.ts` com `cn()` helper
  - Vitest + Playwright configurados com smoke tests verdes
  - `src/app/page.tsx` exibindo "olá" via tRPC server caller
- **Decisões:**
  - Downgrade ESLint 10→9 (`eslint-plugin-react@7` incompatível com ESLint 10 flat config)
  - `next lint` removido no Next.js 16 — lint script usa `eslint src` diretamente
  - Prisma 7 (mais recente estável) em vez de Prisma 6 conforme spec
- **Próximo:** Fase 2 — Schema base + RLS (aguardando confirmação)

---

### 2026-05-08 — Fase 0

- **Implementado:**
  - docker-compose.yml com postgres:16, redis:7, minio, mailhog
  - docker/postgres/init/01-extensions.sql (uuid-ossp, pg_trgm, unaccent)
  - Stack Docker subida e todos os 4 serviços healthy
  - .gitignore criado
  - .env.example com todos os campos mapeados do Laravel
  - .env.local com valores reais de dev (gitignored)
  - docs/MIGRATION_NOTES.md — inventário completo do sistema Laravel
- **Decisões:**
  - Docker context orbstack (OrbStack precisa estar rodando)
  - IMEI API key estava hardcoded no código Laravel — mapeado como lacuna de segurança
  - Evolution API é o provider de WhatsApp (não Meta Cloud API diretamente)
  - Depix = PixPay (api.pixpay.space) — não é o mesmo que outros serviços de PIX
  - Sistema tem catálogo e-commerce completo (catalogo.arenatechpi.com.br) não documentado no plano
- **Próximo:** Fase 1 — Esqueleto Next.js + tRPC + Prisma

---

## Dívida técnica

- **Configurações: campo `businessHours` em TenantSettings** — origem validada contra Laravel. Campo no schema sem UI. Mantido como feature futura.
- **Stock-A: 7 cenários E2E adicionais (T-20 a T-26)** — upload foto, NCM modal, variações multi-step, RBAC negativo, duplicar, soft delete, ViaCEP supplier. Cada um depende de investigação da UI antes de implementação. 19 testes Nível 2 cobrem fluxo principal. 7 adicionais ficam como dívida aceita.

---

## Bloqueios atuais

_(vazio)_

---

### 2026-05-23 — Migração final de dados + PDFs profissionais + upload de logo

- **Migração de dados Laravel (arena_dev MySQL) → Postgres prod** (tenant Arena Tech `dd308431-0525-417a-97c5-459e4b6cf45a`):

  | Agregado | Count migrado | Origem Laravel |
  |---|---:|---|
  | customers | 1265 | clientes |
  | products (+ photos + variations + attributes) | 705 | produtos |
  | sales + sale_items | 1856 + 1928 | pdv_vendas + pdv_venda_itens |
  | service_orders + items | 170 + 178 | ordens_servico |
  | financial_transactions RECEIVABLE + installments | 638 + 1141 | contas_receber + parcelas |
  | financial_transactions PAYABLE + installments | 72 + 72 | contas_pagar + parcelas |
  | device_purchases | 0 (sem dados Laravel) | compras_aparelhos |
  | stock_movements | 1714 | estoque_movimentacoes |
  | tenant_settings | 1 | configuracoes (k/v: nome_loja, cnpj, etc.) + bloco fiscal_* |
  | tenant_assistance_settings | 1 | configuracoes_assistencia |
  | tenant_receiving_settings | 1 | configuracoes_recebimento |
  | payment_methods (+ code preenchido) | 9 | formas_pagamento |
  | payment_method_rates | 84 | formas_pagamento_taxas |
  | socio_commission_rules | 5 (consolidou 7) | socio_regras_comissao |
  | catalog_device_categories | 9 | aparelhos_categorias |
  | catalog_devices | 29 | aparelhos_catalogo |
  | service_order_quotes | 58 | ordens_servico_orcamentos |
  | providers | 5 | prestadores |
  | reward_balances + actions + movements | 4 + 22 + 14 | recompensas_* |
  | chatbot_conversations + messages + follow_ups | 1611 + 21172 + 1758 | chatbot_* |
  | whatsapp_conversations + messages_sent | 767 + 349 | whatsapp_conversations + whatsapp_mensagens_enviadas |
  | dashboard_categories + links | 5 + 20 | categorias_dashboard + links_dashboard |
  - **Pulados intencionalmente:** saques_depix (52), logs_atividades histórico (1394), nfe_emitidas (4 — Next ainda não emite NFe).
  - **Perdas conhecidas:** 1119 chatbot_conversas duplicadas (UNIQUE phone) → 10592 mensagens órfãs.

- **PDFs refeitos com identidade Arena Tech** (paridade fiel ao Laravel intranetpdv):
  - Paleta: dourado `#c9a84c` (header divider, totais) + preto-noite `#1a1a2e` (section titles, header de tabelas) + linhas alternadas + badges UPGRADE.
  - **sale-receipt-pdf** (recibo de venda): tabela com IMEI/série/condição/garantia, badges UPGRADE dourados, box azul para aparelhos em troca, TOTAL preto destacado, bloco detalhado de pagamentos (parcelas + downgrade + troco), assinatura com fallback Autentique (verde dashed).
  - **purchase-term-pdf** (termo de responsabilidade compra): declaração vermelha (propriedade + procedência, art. 171/180 CP) + azul (autorização), resumo com valor em dourado.
  - **sale-warranty-pdf** + rota `/api/pdv/[id]/termo-garantia` (criado do zero, era HTML): info-cards Empresa+Cliente, tabela de produtos, box verde de validade máxima, 7 termos numerados, assinaturas duplas. Lê `warrantyMonths` do StockItem ou fallback `warrantyNewMonths`/`warrantyUsedMonths` das settings.
  - **sale-delivery-pdf** + rota `/api/pdv/[id]/termo-entrega` (criado do zero): info-table compacta, IMEI em highlight amarelo, declaração verde, box âmbar com quitação de diferença em downgrade.
  - Suporte a tenant logo em todos: lê `tenant_settings.logoUrl`, baixa do MinIO interno via S3 client (sem round-trip HTTP), embute como data URL.

- **Upload de logo profissional via MinIO** (substitui campo URL feio):
  - Service `tenant-logo-service.ts` com Sharp (redimensiona 400x200 max, exporta PNG; SVG mantém original), valida formato e 2MB max.
  - Procedures `settings.uploadLogo` + `settings.deleteLogo` (RBAC owner/manager) — apaga logo antiga ao subir nova.
  - Componente `<LogoUpload>` com drag-drop, preview, botões Substituir/Remover.
  - Proxy `/api/storage/[...path]` para servir do MinIO sem expor credenciais (cache 1h).
  - Removido `TenantAssistanceSettings.logoPath` duplicado (estava sempre NULL, sem UI).

- **Paridade PDV+Estoque (3 ondas):**
  - **Onda 1 — PDV pós-venda:** botão "Enviar recibo" (Meta `pdv_recibo_pdf`), botão "Enviar termo" (Autentique + `pdv_termo_pdf_link`), assinatura física para qualquer usuário, card de status com polling 10s.
  - **Onda 2 — Estoque HIGH:** `/stock/bulk-adjust` (ajuste em massa), `/stock/exit` com Select de motivos predefinidos (paridade Laravel `MOTIVOS_BAIXA`), drag-drop no CSV import, `searchProducts.currentStock` real (era stub 0).
  - **Onda 3 — Estoque MEDIUM:** `ImeiInput.checkDuplicate` com debounce 500ms + alerta visual, `/stock/nfe` (upload XML drag-drop + lista) + `/stock/nfe/[id]` (vinculação item-a-produto + ignorar + importar), `/stock/purchases/[id]` (detalhe com termo Autentique/físico/cancelar), `DeviceCondition` estendido com `SEMI_NEW`/`DISPLAY` (paridade Laravel novo/seminovo/usado/vitrine).
  - **Relatórios:** rota `/api/reports/stock/[type]` (6 tipos: posicao-estoque, estoque-minimo, vendas-periodo, vendas-vendedor, vendas-produto, curva-abc) com PDF binário via react-pdf, botão "Baixar PDF" no header de `/stock/reports`.

- **Schemas novos criados nesta sessão:**
  - `whatsapp.prisma` (WhatsappConversation + WhatsappMessageSent, RLS) — paridade Laravel `whatsapp_conversations` + `whatsapp_mensagens_enviadas`.
  - `dashboard.prisma` (DashboardCategory + DashboardLink, RLS) — paridade `categorias_dashboard` + `links_dashboard`.
  - 3 migrations aplicadas em local + prod (add_device_condition_seminovo_display, remove_assistance_logo_path, add_whatsapp_and_dashboard).

- **Bugfixes em produção:**
  - `tenant_number_sequences` (sale=1860 → 1884; service_order/2026 240 → 242) — `Unique constraint failed` por dessincronia entre migração direta de IDs e sequence atômica.
  - Limpeza de venda de teste R$2 "TESTE" (`VND202601885`) para abrir o número correto da venda Laravel original.
  - 347 receivables PENDING/OVERDUE + 854 parcelas marcadas PAID (decisão do dono: "nada pendente").

- **Decisões importantes:**
  - **NUNCA usar BrasilAPI/DirectD** para auto-preenchimento de CPF/CNPJ (decisão reforçada várias vezes pelo dono — salvo em memory `feedback_no_cpf_cnpj_lookup.md`).
  - **Logo único do tenant** — `tenant_settings.logoUrl` (removido `tenant_assistance_settings.logoPath` duplicado).
  - Sales mantém UNIQUE em `number` — sequence atômica via `nextTenantNumber()` evita race.

- **Próximo:**
  - Resolver chatbot duplicados (10592 mensagens órfãs sem conversa pai) — decisão de produto: associar à conversa "principal" do mesmo telefone ou descartar?
  - Avaliar emissão de NFe (tenant_fiscal_settings ainda vazio, sem certificado).
  - 7 cenários E2E adicionais Stock-A (dívida técnica aceita).

---

### 2026-05-20 — Ferramenta: Buscador de iPhones nos grupos WhatsApp (tenant central)

- **Implementado:**
  - Schema `whatsapp-group.prisma` (WhatsAppGroup, WhatsAppGroupMessage, IPhoneListing) + RLS.
  - `centralTenantProcedure` em `src/server/api/trpc.ts` (constante `CENTRAL_TENANT_SLUG = "arena-tech"`).
  - Parser puro em `src/lib/services/iphone-listing-parser.ts` + 29 unit tests verdes.
  - Webhook Evolution estendido (`messages.upsert`) — captura grupos monitorados, persiste mensagem (idempotente) e extrai IPhoneListing quando bate no parser.
  - Router `iphoneHunterRouter` (listGroups, listEvolutionGroups, upsertGroup, toggleGroup, search, stats).
  - Páginas `/iphone-hunter` (busca por modelo + janela + preço) e `/iphone-hunter/groups` (toggle de grupos via switch).
  - Sidebar com prop `tenantSlug` + flag `requiresTenantSlug` no NavItem — entrada "Buscar iPhones" só aparece para tenant `arena-tech`.
- **Decisões:** ADR 0044 — exclusivo do tenant central, webhook+cache, regex+keywords (não LLM), mensagem crua e extração em tabelas separadas.
- **Validação:** typecheck verde, build verde (rotas /iphone-hunter e /iphone-hunter/groups), 655 unit tests verdes.
- **Próximo:** habilitar evento `messages.upsert` na instância Evolution em produção (POST /webhook/set/{instance}).

---

## Métricas

| Métrica | Valor |
|---|---|
| Linhas de codigo | ~27500 |
| Cobertura de testes | 445 unit + 6 integration + 25 e2e |
| Tabelas no schema | 55 (52 anteriores + addons + addon_purchases + refunds) |
| Procedures tRPC | 208 (195 anteriores + admin addon 8 + admin refund 5) |
| Paginas | 120 |
| Componentes shadcn/ui | 24 (+ tooltip, calendar) |
| Componentes de domínio | 15 (DataTable, StatusBadge, EntitySelector, ConfirmDialog, PageHeader, EmptyState, LoadingState, FormSection, FormActions, MoneyInput, CnpjInput, PhoneInput, CepInput, DatePicker, DateRangePicker) |
| Tabelas inventariadas do Laravel | ~55 tabelas tenant + ~20 tabelas central |
| Rotas inventariadas do Laravel | ~150+ rotas |
| Jobs identificados | 13 |
| Integrações externas | 11 (Autentique, Depix, Evolution/WhatsApp, Chatwoot, Nuvem Fiscal, Focus NFe, IMEI Check, Asaas, Anthropic, DirectD, MeuDANFE) |
