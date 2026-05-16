# ADR 0025 — Estratégia de migração de dados Laravel → Next.js

## Status

Aceita.

## Contexto

Durante a réplica módulo-a-módulo, surgiu a questão: a cada módulo concluído, devemos migrar dados existentes do Laravel para o Postgres novo, ou esperar um único evento de cutover?

## Decisão

**Big Bang no cutover único.**

Durante todo o desenvolvimento dos módulos, o banco Postgres do Next.js permanece vazio (populado apenas por seed para testes). Não há scripts de migração incremental. Quando todos os módulos estiverem prontos e validados, executamos uma migração única e controlada do Laravel MySQL para o Postgres Next.js.

## Razões

- Evita período de dois sistemas com dados parcialmente sincronizados (fonte clássica de inconsistência)
- Migração vira um evento planejado com checklist, janela definida, rollback claro
- Não exige manter pipelines de sincronização durante meses
- Cada SPEC pode evoluir sem se preocupar com dados legados em produção
- Validação cruzada (quando feita) compara comportamento, não dados de produção

## Trade-offs aceitos

- Durante desenvolvimento, não vemos "dados reais" no Next.js — só seed
- Operadores não testam o sistema novo com dados de produção até o cutover
- ServiceType, fornecedores, categorias, etc., começam vazios em cada módulo
- Quando módulo X depende de dado de módulo Y, dependemos do seed simular o estado

## Alternativas consideradas e rejeitadas

- **Migração incremental** (a cada módulo, migrar tabelas correspondentes do Laravel): rejeitada porque cria sincronização problemática (cliente cadastrado no Laravel depois da migração de Clientes fica fora do Next.js)
- **Híbrido (referência agora, transacional no cutover)**: rejeitada por adicionar complexidade no curto prazo sem ganho proporcional

## Plano do cutover (esboço, detalhado em ADR futuro)

Quando todos módulos estiverem CLOSE, criar ADR 00XX com:
- Mapa de tabelas Laravel → Postgres
- Script de migração (dry-run, idempotente, com checkpoint)
- Procedimento de validação pós-migração
- Plano de rollback
- Janela de manutenção esperada

## Implicações para módulos atuais e futuros

- Toda SPEC pode assumir que o sistema inicia vazio
- Seeds devem ser realistas para permitir desenvolvimento e testes
- Validação de regras é via testes automatizados + (opcionalmente) validação cruzada funcional
- Stubs para módulos não-implementados retornam dados simulados consistentes com a SPEC
