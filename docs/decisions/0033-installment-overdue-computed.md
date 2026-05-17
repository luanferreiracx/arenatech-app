# ADR 0033 — Status VENCIDO de parcela: computed, não persistido

## Status

Aceita.

## Contexto

Parcelas têm status enum (PENDING, PAID, CANCELLED, ESTORNADA). O status "VENCIDA" (parcela com dueDate < now e ainda não paga) é um estado derivado do tempo, não uma transição real.

Duas estratégias possíveis:
1. Persistir status VENCIDA + job diário que muda PENDING → VENCIDA quando dueDate < now
2. Manter apenas status reais persistidos e calcular VENCIDA em queries

## Decisão

Estratégia 2 — VENCIDA é COMPUTED em tempo real.

Schema persiste: PENDING, PAID, CANCELLED, ESTORNADA.
Queries que precisam de "parcelas vencidas" usam: `WHERE status = 'PENDING' AND dueDate < now()`.
UI exibe badge "Vencida" baseado no resultado da query.

## Razões

- Status persistido com tempo seria stale entre execuções do job
- Sem job para manter — uma peça a menos de infra
- Mais simples: estado real é uma função pura do schema + tempo atual
- Performance: índice em (tenantId, status, dueDate) cobre queries eficientemente
- Determinismo: query "vencidas hoje 14h00" é sempre exata

## Trade-offs aceitos

- Cada consulta de "vencidas" exige avaliação do timestamp — aceitável com índice
- Não há "trigger" para notificações automáticas — futuras notificações viriam de job que CONSULTA sem mutar

## Alternativas consideradas e rejeitadas

- Status persistido com job: introduz race conditions e stale state
- Materialized view: complexidade desnecessária para essa cardinalidade

## Conexão com a SPEC

- Regra RN-06: parcela com status=PENDING e dueDate<now() é exibida como "Vencida" na UI
- Procedures retornam isOverdue: boolean computed
- Filtros de listagem usam dueDate como parte do WHERE
