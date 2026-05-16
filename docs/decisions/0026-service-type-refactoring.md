# ADR 0026 — Refatoração tipo_servico → ServiceType

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Catálogo (Serviços)

## Problema

No Laravel, `servicos.tipo_servico` é um campo string livre. Operações em massa (duplicar tipo, renomear, excluir) fazem queries WHERE tipo_servico = 'X'. Sem integridade referencial.

## Decisão

Criar tabela `ServiceType` com FK em `Service.serviceTypeId`:
- ServiceType: id, tenantId, name, slug, active, deletedAt
- Service.serviceTypeId: FK nullable (para backward compat durante migração)
- Service.serviceType: string mantida (legacy, para queries existentes)

## Justificativa

- Integridade referencial: tipo excluído em cascata
- Renomear tipo: 1 UPDATE em ServiceType vs N UPDATEs em Service
- Slug para busca normalizada
- Preparação para futuro: ServiceType pode ganhar campos (cor, ícone, ordem)

## Backward compatibility

- Service.serviceType (string) mantida por enquanto
- Criar Service auto-cria ServiceType se não existir (combobox com "criar inline")
- Após cutover completo, campo string pode ser removido
