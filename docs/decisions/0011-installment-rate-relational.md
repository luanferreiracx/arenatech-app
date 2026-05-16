# ADR 0011: Parcelamento em tabela relacional (não 36 colunas)

## Status
Aceita

## Contexto
Legacy `configuracoes_parcelamento` tem 36 colunas (`juros_2x`, `juros_3x`, ..., `juros_36x`). Problemas: não extensível, não permite taxa por forma de pagamento, schema rígido.

## Decisão
Modelo `InstallmentRate` relacional: (tenantId, numberOfInstallments, rate, paymentMethodId?).

## Consequências
- Flexibilidade: taxa pode variar por forma de pagamento (paymentMethodId)
- Extensibilidade: adicionar parcelas acima de 36x sem migration
- Query: `WHERE numberOfInstallments = N AND (paymentMethodId = X OR paymentMethodId IS NULL)` com fallback para global
- Migration de dados: transcrever 35 valores de colunas para 35 linhas na tabela
