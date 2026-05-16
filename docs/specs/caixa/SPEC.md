# SPEC: Caixa

> **Status:** aprovada (SPEC+IMPLEMENT consolidado, decisões K1-K11)
> **Base:** docs/legacy/caixa.md + leitura direta Laravel (Caixa, CaixaAbertura, CaixaMovimentacao, CaixaService, CaixaController, FecharCaixasAbertos) + decisões do dono
> **Versão:** 1.0

---

## 1. Visão geral

Sessão de caixa por usuário (1 aberta por vez), movimentações financeiras (venda, sangria, suprimento, despesa), fechamento manual com conferência de diferença, auto-fechamento de sessões abandonadas, e dashboard gerencial para Manager/Owner.

---

## 2. Modelos

### CashSession
Sessão individual por usuário. Partial unique (tenantId, userId, closedAt) garante K5 (1 aberta por vez — closedAt=null é unique).

### CashMovement
Append-only. 4 tipos: SALE, DEPOSIT, WITHDRAWAL, EXPENSE. Nature derivada (INCOME/OUTCOME). Sem updatedAt.

---

## 3. Regras de negócio

| # | Regra | Fonte |
|---|-------|-------|
| RN-01 | 1 sessão aberta por usuário (K5) | K5, partial unique |
| RN-02 | calculatedBalance = initialBalance + sum(INCOME) - sum(OUTCOME) | K6, legacy saldo_esperado_dinheiro |
| RN-03 | difference = declaredBalance - calculatedBalance | K6 |
| RN-04 | Sangria valida saldo DINHEIRO disponível (não fica negativo) | legacy CaixaService.registrarSangria |
| RN-05 | Venda mista cria N movements (1 por forma) com mesmo referenceId | K7 |
| RN-06 | Auto-close: sessões > 18h → closeType=AUTOMATIC, verified=false | K3 |
| RN-07 | Conferência pendente se: closeType=AUTOMATIC OR difference != 0 | K4 |
| RN-08 | CashMovement append-only, sem update/delete | K2 regra 10 |
| RN-09 | PDV valida caixa aberto antes de registrar venda | legacy |
| RN-10 | RBAC conforme K10 | K10 |

---

## 4. Anti-escopo (K11)

- Tipo ESTORNO e AJUSTE
- Sangria automática por limite
- PDF gerado (HTML print only)
- Migração de dados
