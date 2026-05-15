# ADR 0008: RBAC mínimo para módulo Clientes

## Status
Aceita

## Contexto
O legacy não tem Policy formal para clientes. Todos os usuários autenticados podem fazer CRUD completo. A única exceção é `InteresseController@destroy` que verifica `role !== 'admin'` e `deleteInteracao` que permite apenas admin ou o criador.

O dono decidiu introduzir RBAC mínimo com 3 papéis (operator, manager, owner) para controlar ações destrutivas.

## Decisão

| Ação | operator | manager | owner |
|------|----------|---------|-------|
| read (listar, ver) | ✓ | ✓ | ✓ |
| create | ✓ | ✓ | ✓ |
| update | ✓ | ✓ | ✓ |
| soft delete | ✗ | ✓ | ✓ |
| restore | ✗ | ✓ | ✓ |
| hard delete customer | ✗ | ✗ | ✗ |
| delete interesse | ✗ | ✓ | ✓ |
| delete interação própria | ✓ | ✓ | ✓ |
| delete interação alheia | ✗ | ✓ | ✓ |

Implementação: verificação no tRPC procedure level (não middleware de rota).

## Mapeamento Legacy → Novo

| Role legacy | Role novo | Justificativa |
|-------------|-----------|---------------|
| admin | owner | Acesso total |
| gerente | manager | Financeiro + ações gerenciais |
| vendedor | operator | Operacional |
| tecnico | operator | Operacional (limitado a suas OS, mas CRUD de cliente igual) |

## Consequências

### Positivas
- Protege contra exclusão acidental por operadores
- Rastreabilidade de quem pode fazer o quê
- Padrão reutilizável para outros módulos

### Negativas
- Divergência do legacy (todos podiam tudo)
- Complexidade adicional nos procedures tRPC
