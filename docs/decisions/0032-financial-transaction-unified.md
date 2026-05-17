# ADR 0032 — FinancialTransaction como modelo unificado AR/AP

## Status

Aceita.

## Contexto

A SPEC original do Financeiro previa dois modelos separados: AccountReceivable (CR) e AccountPayable (CP). Durante a implementação, descobriu-se que a Fase 6 anterior já havia criado FinancialTransaction como modelo unificado, com 8+ arquivos referenciando-o (sale.ts, service-order.ts, financial.ts router, dashboard.ts, etc).

## Decisão

FinancialTransaction é um único modelo com campo discriminador `type: TransactionType` (RECEIVABLE | PAYABLE). Mesmo schema cobre ambos os fluxos.

Estrutura discriminada:
- `type=RECEIVABLE`: customerId obrigatório, supplierId null
- `type=PAYABLE`: supplierId opcional (pode ser despesa avulsa), customerId null
- `categoryId` aponta para FinancialCategory com tipo compatível (RECEITA para RECEIVABLE, DESPESA para PAYABLE)

## Razões

- 8+ arquivos em módulos da Fase 6 já referenciam FinancialTransaction
- Refatorar para 2 modelos quebraria PDV, OS, Dashboard, etc — código já consolidado
- Modelo unificado é padrão em sistemas contábeis maduros (general ledger entries com discriminador)
- DRY: não duplica lógica de parcelamento, baixa, estorno, cancelamento
- XOR de origem (saleId/serviceOrderId/isManual) funciona igualmente bem com modelo único

## Trade-offs aceitos

- Procedures de listagem precisam filtrar por type explicitamente
- RBAC granular exige filtro explícito (operator vê só RECEIVABLE — implementado em filtro service-level)
- Queries podem ficar levemente mais complexas (always where type=X)

## Alternativas consideradas e rejeitadas

- Reescrever para AccountReceivable + AccountPayable: alto custo, baixo ganho
- Herança de tabela (table inheritance Postgres): Prisma não suporta nativamente

## Conexão com a SPEC

- Seção 3 (Modelos) reflete FinancialTransaction único
- Procedures @public-api consumidas por PDV/OS recebem type correto internamente
- RBAC implementado via filtro de type por role

## Aplicabilidade futura

Padrão "modelo unificado com discriminador" registrado em PATTERNS.md.
