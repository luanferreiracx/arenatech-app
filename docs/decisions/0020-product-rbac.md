# ADR 0020 — RBAC de Catálogo de Produtos

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-A (Catálogo de Produtos)

## Problema

Quem pode criar, editar e excluir produtos, categorias, atributos e fornecedores?

## Decisão

**3 níveis: Operator (read-only), Manager (CRUD), Owner (CRUD + restore).**

| Ação | Operator | Manager | Owner |
|------|----------|---------|-------|
| Read (listar, buscar, detalhe) | ✓ | ✓ | ✓ |
| Create/Update/Delete | ✗ | ✓ | ✓ |
| Restore (soft deleted) | ✗ | ✗ | ✓ |

### Implementação

- Server: tRPC procedures de escrita usam role check (`ctx.session.user.role`)
- Client: botões de ação condicionais ao role (não renderiza "Novo produto" para Operator)
- URL direta: redirect ou mensagem "Sem permissão" (não FORBIDDEN no browser)

## Justificativa

- Consistente com RBAC de Configurações (ADR 0015)
- Operator é vendedor/técnico — precisa consultar catálogo mas não alterar
- Manager é gerente — pode gerenciar catálogo no dia-a-dia
- Owner é dono — pode restaurar itens excluídos (ação mais destrutiva/irreversível)
- Não há necessidade de granularidade maior (ex: "pode editar preço mas não excluir") para o porte da operação

## Alternativas descartadas

- Granularidade por campo (preço vs dados básicos): over-engineering
- Permissões por categoria (manager X só edita categoria Y): não existe no legacy
- Criar role "Estoquista" dedicado: 3 roles já cobrem (estoquista = manager)
