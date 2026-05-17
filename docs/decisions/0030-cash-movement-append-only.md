# ADR 0030 — CashMovement append-only

## Status

Aceita.

## Contexto

CashMovement registra cada entrada/saída de dinheiro do caixa. Decisão recorrente em sistemas financeiros: registros de movimentação são imutáveis (append-only) para garantir auditoria, prevenir falsificação de histórico e simplificar reconciliação.

## Decisão

CashMovement é tratado como event log append-only:
- Não há mutation update na procedure
- Não há soft delete na UI (deletedAt existe no schema apenas para casos administrativos excepcionais)
- Correções são feitas por novas movimentações em sentido contrário (estorno é movimentação adicional, não edição da original)
- Histórico completo é preservado

## Razões

- Auditoria contábil exige rastro imutável
- Reconciliação de caixa fica determinística (saldo = soma das movimentações)
- Evita race conditions de "alguém editou movimentação enquanto fechava caixa"
- Padrão estabelecido em sistemas financeiros (event sourcing leve)

## Trade-offs aceitos

- Erros de digitação geram trabalho extra (movimento corretivo, não edição)
- Auditoria precisa olhar conjunto de movimentações
- UI precisa exibir clareza sobre estornos

## Alternativas consideradas e rejeitadas

- Permitir edição com audit log paralelo: mais complexo, não previne adulteração
- Soft delete com restore: cria ambiguidade sobre "fato real" do dia

## Conexão com a SPEC

- RN-08 (CashMovement append-only) implementa essa decisão
- Procedures recordSale, recordWithdrawal, recordDeposit, recordExpense só CRIAM, nunca atualizam

## Aplicabilidade futura

Padrão "event log append-only" registrado em PATTERNS.md para módulos futuros:
- StockMovement (Estoque-B) — já segue (ADR 0023)
- AccountingEntry (Financeiro futuro) — deve seguir
- AuditLog do sistema — deve seguir
