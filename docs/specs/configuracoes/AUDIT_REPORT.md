# Audit Report — Módulo Configurações

> Data: 2026-05-17
> Contexto: pós-mortem ADR 0035 (E2E nunca executados)

## Estado encontrado

| Item | Esperado (SPEC) | Encontrado | Gap |
|------|-----------------|------------|-----|
| E2E cenários | 17 | 0 | 17 faltantes |
| Procedures settings | 20+ | 22 | ✓ completo |
| Páginas | 6 tabs mínimo | 16 pages | ✓ excede |
| Unit tests | 17+ | existem no validators | ✓ |
| ADRs (0010-0015) | 6 | 6 | ✓ |

## Diagnóstico detalhado

### Procedures implementadas (22)
- getGeneral, updateGeneral
- listPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod
- upsertInstallmentRules
- listIntegrations, updateIntegration
- listUsers, createUser, updateUser, removeUser, resetUserPassword
- listAuditLogs, getAuditLog
- getFiscalSettings, updateFiscalSettings
- getSubscription
- listTeam
- getAssistance, updateAssistance
- getReceiving, updateReceiving

### Páginas (16)
general, assistance, fiscal, payment-methods, installments, integrations,
users, users/[id]/edit, users/new, security, subscription, team, logs,
receiving, delivery-persons, page.tsx (root redirect)

### businessHours
- Campo existe no schema (settings.prisma:20)
- NÃO tem uso em nenhum arquivo src/ (0 referências)
- Decisão já registrada em CLOSE.md: "feature útil, manter como feature nova"
- **Ação:** nenhuma. Campo existe no schema, sem UI. Dívida já registrada e aceita.

### .pfx encryption
- Campos no schema: certificateUrl, certificateUploadedAt, certificateExpiresAt (em TenantFiscalSettings)
- Procedure de upload: NÃO existe (nenhuma referência a "certificate" no router)
- Status: **adiado conforme CLOSE.md** — "para quando módulo Fiscal precisar decifrar"
- **Ação:** manter como dívida aceita (não é bloqueio para Configurações).

## Plano de correção

1. Criar E2E tests cobrindo as tabs principais (settings é módulo de formulários)
2. businessHours e .pfx mantidos como dívidas aceitas (já documentadas em CLOSE.md)
3. Nenhum bug de app a corrigir

## Status final

Pendências resolvidas: parcial — E2E faltantes criados, dívidas aceitas mantidas.
