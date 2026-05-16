# ADR 0010: Refatoração key-value genérico para modelos tipados

## Status
Aceita

## Contexto
O legacy armazena configurações em tabela `configuracoes` (chave/valor/tipo) — modelo key-value genérico. 38 chaves identificadas via busca exaustiva no código. Problemas: sem validação de tipo em build-time, sem autocompletar, sem type-safety no tRPC, risco de typo em chaves string.

## Decisão
Substituir key-value por **6 modelos Prisma tipados** (singleton por tenant):
1. `TenantGeneral` — dados da loja (7 chaves → 17 campos tipados)
2. `TenantFiscalSettings` — emitente NF-e (23 chaves → 24 campos tipados)
3. `TenantAssistanceSettings` — termos (legacy model dedicado → mantido)
4. `TenantReceivingSettings` — políticas (legacy model dedicado → mantido)
5. `PaymentMethod` + `PaymentMethodRate` — formas (1 chave JSON + 2 models → 2 models com FK)
6. `InstallmentRate` — parcelamento (36 colunas → tabela relacional)

## Consequências
- Type-safety completa do banco ao frontend
- Validação Zod por campo (não por chave string)
- Autocompletar em IDE
- Migration de dados: mapear cada chave para campo tipado no cutover
- 13 chaves de Recompensas adiadas para módulo próprio
