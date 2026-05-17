# ADR 0034 — Categorias financeiras híbridas FIXED + CUSTOM

## Status

Aceita.

## Contexto

FinancialCategory classifica transações (Vendas, Serviços, Aluguel, Folha de Pagamento, etc). Duas necessidades conflitantes:
1. Categorias do sistema, estáveis, com código imutável, usadas por código
2. Flexibilidade para tenant criar categorias customizadas

## Decisão

Modelo híbrido com campo `kind: FinancialCategoryKind` (FIXED | CUSTOM).

### Categorias FIXED (8 predefinidas)

| Code | Name | Type |
|------|------|------|
| VENDAS | Vendas | RECEITA |
| SERVICOS | Serviços | RECEITA |
| OUTRAS_RECEITAS | Outras Receitas | RECEITA |
| ALUGUEL | Aluguel | DESPESA |
| FOLHA_PAGAMENTO | Folha de Pagamento | DESPESA |
| FORNECEDORES | Fornecedores | DESPESA |
| MANUTENCAO | Manutenção | DESPESA |
| OUTRAS_DESPESAS | Outras Despesas | DESPESA |

Regras:
- Seeded automaticamente em todo tenant (via tenant-init service)
- Code imutável — usado por procedures @public-api
- Não podem ser deletadas, apenas desativadas (active=false)
- Desativar exige role Owner
- Persistem desativadas para preservar histórico

### Categorias CUSTOM

- Criadas pelo tenant via UI
- Code gerado do name (slugify)
- CRUD livre por Manager+Owner
- Podem ser deletadas

## Razões

- Procedures @public-api referenciam FIXED por code estável
- Tenant tem realidade contábil própria — 8 fixas não bastam
- FIXED desativável (não deletável) preserva histórico

## Trade-offs aceitos

- Schema com 2 tipos semânticos — cuidado em validações
- Seed automático no tenant init

## Conexão com a SPEC

- Seção 3.5: FinancialCategory com campos type, kind, code
- Tenant init service garante 8 FIXED em todo tenant novo
- Validação: ao criar transação, categoria deve existir, ativa, type compatível
