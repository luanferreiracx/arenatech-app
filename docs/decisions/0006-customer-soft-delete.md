# ADR 0006: Soft delete via deletedAt substitui campo ativo

## Status
Aceita

## Contexto
O legacy usa `ativo: boolean (default true)` para soft delete manual. `Cliente::destroy()` faz `$cliente->update(['ativo' => false])`. Não usa SoftDeletes do Eloquent.

Problemas do approach legacy:
1. Não registra QUANDO foi excluído
2. Não padronizado — outros models usam convenções diferentes (alguns sem soft delete)
3. Scopes manuais: `->where('ativo', true)` espalhados

O Prisma não tem soft delete nativo, mas o padrão `deletedAt: DateTime?` é estabelecido no projeto (CLAUDE.md).

## Decisão
Substituir `ativo: boolean` por `deletedAt: DateTime?`:
- `null` = ativo (registro visível)
- `DateTime` preenchido = excluído (registro oculto)

Listagens default filtram `deletedAt IS NULL`. Toggle na UI permite incluir excluídos.

Unique constraints de CPF/CNPJ usam partial index (`WHERE deleted_at IS NULL`) para permitir reuso após exclusão.

## Consequências

### Positivas
- Registro de quando foi excluído (auditoria)
- Padrão Prisma consistente com todo o projeto
- Partial index permite reuso de CPF/CNPJ após exclusão

### Negativas
- Migração: `ativo=false` → `deletedAt=now()` (perda da data real de exclusão)
- Queries precisam de `WHERE deleted_at IS NULL` (mas middleware Prisma pode automatizar)

### Migração
- `ativo=true` → `deletedAt=null`
- `ativo=false` → `deletedAt=updated_at` (melhor aproximação disponível)
