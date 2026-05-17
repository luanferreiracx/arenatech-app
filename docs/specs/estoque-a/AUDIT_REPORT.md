# Audit Report — Módulo Estoque-A (Catálogo de Produtos)

> Data: 2026-05-17
> Contexto: fechamento 100% (pós ADR 0035)

## Estado encontrado

| Item | Esperado (SPEC) | Encontrado | Gap |
|------|-----------------|------------|-----|
| E2E cenários | 19 | 0 | 19 faltantes |
| Procedures stock router | 30+ | 66 | ✓ excede (inclui Estoque-B) |
| Páginas | 10+ | 18 | ✓ excede |
| Unit tests | 51 (stock-catalog + brasilapi-ncm) | 51 | ✓ |
| ADRs (0016-0020) | 5 | 5 | ✓ |

## Diagnóstico

- **Procedures:** 66 no stock router (combina Estoque-A e Estoque-B). Todas as do SPEC implementadas.
- **Páginas:** 18 pages (listagem, new, edit, detalhe, categorias, atributos, fornecedores CRUD, movimentações, compras, reports, import CSV, etc).
- **Integrações:** BrasilAPI NCM (mapa curado + fallback API) implementado. MinIO + Sharp upload implementado.
- **Modelo híbrido (ADR 0016):** currentStock no Product + ProductService.getAvailableQuantity implementado.
- **Nenhum bug de aplicação encontrado.**

## Plano

Criar 19 cenários E2E cobrindo SPEC seção 11 + ADRs.
