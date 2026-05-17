# Dívidas Técnicas — Módulo Caixa

> Relatório de validação pós-implementação (2026-05-16)

---

## PONTO 1 — ADRs pendentes

ADRs 0030 (append-only model) e 0031 (RBAC granular) NÃO foram criados. Ficaram pendentes. Apenas 0028 e 0029 foram escritos. Os conceitos estão documentados na SPEC (regras RN-08 e RN-10, tabela K10), mas faltam os ADRs formais como arquivos separados.

---

## PONTO 2 — 11 arquivos refatorados

1. `src/server/api/routers/cashier.ts` — rewrite principal
2. `src/lib/validators/cashier.ts` — schemas e labels
3. `src/server/api/routers/sale.ts` — CashMovement de venda/estorno
4. `src/server/api/routers/financial.ts` — CashMovement de baixa de parcela
5. `src/server/api/routers/dashboard.ts` — cashierStatus query
6. `src/server/api/routers/service-order.ts` — CashMovement de pagamento OS
7. `src/app/api/cashier/report/route.ts` — relatório
8. `src/app/(app)/cashier/reviews/_components/pending-reviews-list.tsx` — UI conferências
9. `src/app/(app)/cashier/_components/cashier-dashboard.tsx` — painel
10. `src/app/(app)/cashier/[id]/page.tsx` — detalhe sessão
11. `src/app/(app)/cashier/close/page.tsx` — fechamento

**Tocou em módulos já concluídos?** Sim — `sale.ts`, `financial.ts`, `service-order.ts` e `dashboard.ts` pertencem a PDV/Financeiro/OS/Dashboard (Fases 6-8 anteriores). Mas a mudança foi mínima: apenas renomear `cashRegisterId`→`cashSessionId`, `userId`→`createdByUserId`, e atualizar os valores de enum/nature. Não alterou lógica de negócio desses módulos.

---

## PONTO 3 — Testes E2E

**Zero testes E2E (Playwright) foram implementados.** Os 17 testes criados são todos **unitários** (Vitest) — validam schemas Zod, cálculos puros de saldo/diferença, e regras de negócio em isolamento. Os 16 cenários E2E da SPEC seção 11 ficaram como dívida técnica (assim como nos módulos anteriores, onde E2E foram adiados para batch final).

---

## PONTO 4 — Páginas e Job

**Páginas:** As 11 páginas da SPEC seção 4 já existiam da Fase 6 (implementação original de Caixa). Foram refatoradas (campo renaming) mas NÃO foram criadas páginas novas nesta sessão. Especificamente:
- `/caixa` (painel) — existe, refatorado
- `/caixa/abrir` — existe (é o form dentro do painel)
- `/caixa/fechar` — existe (`/cashier/close`), refatorado
- Sangria, suprimento — existem como modais/forms no painel

**Job de auto-fechamento:** Existe como **código** (`autoCloseAbandonedSessions` em `cash-session.service.ts`) mas **NÃO tem scheduler ativo**. Não há cron configurado, nem BullMQ, nem endpoint `/api/cron/close-cash`. É uma função idempotente pronta para ser chamada. O ADR 0029 documenta a decisão: será ativada via systemd timer ou GitHub Actions schedule na VPS, chamando um endpoint protegido — mas esse endpoint ainda não foi criado.

---

## PONTO 5 — Páginas gerenciais e relatório

- **Dashboard caixas abertos:** A procedure `openCashiers` existe e retorna dados. A página correspondente existe em `/cashier` (seção do dashboard para managers). Não há página dedicada `/caixa/abertos` separada — está integrada no painel existente.
- **Conferências pendentes:** A procedure `pendingReviews` existe. A página `/cashier/reviews` com `pending-reviews-list.tsx` existe (refatorada).
- **Relatório imprimível:** A API route `/api/cashier/report` existe (refatorada). Porém NÃO é CSS print — é HTML gerado server-side. O CSS `@media print` dedicado (padrão Arena Tech com espaço para assinatura) conforme descrito na SPEC **não foi implementado**.

---

## Resumo de pendências

| Item | Status | Ação necessária |
|------|--------|-----------------|
| ADR 0030 (append-only) | Pendente | Criar arquivo em docs/decisions/ |
| ADR 0031 (RBAC granular) | Pendente | Criar arquivo em docs/decisions/ |
| 16 cenários E2E | Pendente | Batch final de testes E2E |
| Endpoint /api/cron/close-cash | Pendente | Criar API route com auth por secret |
| CSS @media print relatório | Pendente | Implementar layout de impressão |
| Página dedicada /caixa/abertos | Não necessária | Integrada no painel existente |
