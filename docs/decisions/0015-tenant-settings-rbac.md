# ADR 0015: RBAC granular por aba em Configurações

## Status
Aceita

## Contexto
Legacy: apenas `admin` (role) pode acessar configurações. Não havia granularidade por tipo de configuração. No novo sistema com 4 papéis (operator, technician, manager, owner), precisamos definir quem pode o quê.

## Decisão

| Tab | Leitura | Edição |
|-----|---------|--------|
| Geral | Todos autenticados | Manager + Owner |
| Assistência | Todos autenticados | Manager + Owner |
| Fiscal | Todos autenticados | Owner APENAS |
| Pagamento | Todos autenticados | Owner APENAS |
| Parcelamento | Todos autenticados | Owner APENAS |
| Recebimento | Todos autenticados | Owner APENAS |

## Razão
- **Geral/Assistência:** gerentes precisam atualizar horário de funcionamento, telefone, etc. no dia a dia sem depender do dono.
- **Fiscal/Pagamento/Parcelamento/Recebimento:** mudanças aqui afetam financeiramente toda a operação (taxas, impostos, certificados). Apenas o proprietário deve alterar.
- **Leitura universal:** todos os papéis precisam VER configurações (operador precisa saber formas de pagamento ativas no PDV, técnico precisa saber termos de garantia para informar cliente).

## Consequências
- Procedures de leitura usam `tenantProcedure` (qualquer papel autenticado)
- Procedures de edição verificam role no middleware: `requireRole(['manager', 'owner'])` ou `requireRole(['owner'])`
- UI desabilita botão "Salvar" e mostra tooltip "Apenas proprietários podem alterar" para papéis sem permissão
