# ADR 0024 — RBAC de Estoque (Posição e Movimentações)

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-B (Posição e Movimentações)

## Decisão

| Ação | Operator | Manager | Owner |
|------|----------|---------|-------|
| Read (listar, buscar, detalhe, IMEI) | ✓ | ✓ | ✓ |
| Entrada de estoque | ✗ | ✓ | ✓ |
| Baixa / saída avulsa | ✗ | ✓ | ✓ |
| Ajuste de inventário | ✗ | ✓ | ✓ |
| Reservar item (próprio fluxo) | ✓ | ✓ | ✓ |
| Liberar reserva | ✓ | ✓ | ✓ |
| Marcar defeito / devolvido | ✗ | ✓ | ✓ |
| Bloquear item | ✗ | ✗ | ✓ |
| Desbloquear item | ✗ | ✗ | ✓ |
| Soft delete StockItem | ✗ | ✗ | ✓ |
| Marcar SOLD (via PDV/sistema) | ✓ | ✓ | ✓ |

## Justificativa

- Operator é vendedor/técnico — pode consultar e reservar (fluxo de OS), mas não alterar estoque
- Manager gerencia dia-a-dia (entradas, baixas, defeitos)
- Owner tem controle total (bloquear = segurança, desbloquear = responsabilidade)
- Toda mutation registra userId no StockMovement (auditoria completa)
