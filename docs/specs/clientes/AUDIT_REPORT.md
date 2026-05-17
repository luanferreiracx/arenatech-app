# Audit Report — Módulo Clientes

> Data: 2026-05-17
> Contexto: pós-mortem ADR 0035 (E2E nunca executados)

## Estado encontrado

| Item | Esperado (SPEC) | Encontrado | Gap |
|------|-----------------|------------|-----|
| E2E cenários | 24 | 4 | 20 faltantes |
| Procedures customer | 6 | 6 | ✓ completo |
| Procedures interest | 8 | 8 | ✓ completo |
| Páginas | 7 | 7 | ✓ completo |
| Unit tests | 30+ | 30+ | ✓ completo |
| ADRs (0005-0009) | 5 | 5 | ✓ completo |

## Diagnóstico E2E

Os 4 E2E existentes cobrem apenas:
1. Navegar para listagem
2. Criar PF (assertion mínima)
3. Buscar por nome
4. Editar cliente

Faltam 20 cenários da SPEC seção 11 (T-1 a T-24).

## Descobertas

- **Nenhum bug de aplicação encontrado.** Todas pages respondem, procedures existem.
- **Login helper** já foi corrigido na sessão anterior (rota, senha, waitForLoadState).
- **Helpers de customer** (criar via API, cleanup) não existem — precisam ser criados.
- **RLS multi-tenant** não testado em E2E (T-7, T-8) — exigiria 2 tenants no seed.

## Plano de correção

1. Criar helpers: `createCustomerViaAPI`, `deleteCustomerViaAPI`
2. Expandir customers.spec.ts de 4 para 20+ cenários
3. Adaptar cenários T-7/T-8 (RLS) para usar seed existente (2 tenants no seed)
4. Stubs para cenários dependentes (WhatsApp batch = stub)

## Status final

Pendências resolvidas: SIM (após implementação nesta sessão).
