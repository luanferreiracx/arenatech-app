# ADR 0067 — Medir o banco em produção com `pg_stat_statements`

- **Status:** Aceito
- **Data:** 2026-08-03
- **Contexto:** auditoria geral 2026-08-02 (achado A-2)

## Contexto

O sistema estava em produção há meses **sem nenhuma medição de banco**. Quando
alguém suspeitava de lentidão, a ferramenta disponível era `EXPLAIN` — que
responde sobre a query que você **já suspeita**.

O problema desse método é o viés de seleção: o gargalo real costuma ser uma query
que ninguém olhou, barata quando executada uma vez e cara porque roda dez mil
vezes. Não há como suspeitar dela sem medir.

`pg_stat_statements` depende de `shared_preload_libraries`, lido só no **start**
do servidor — daí exigir restart do Postgres, que é a razão de o achado A-2 ter
ficado pendente.

## Decisão

**1. `shared_preload_libraries=pg_stat_statements` no `command` do serviço.**
Versionado nos DOIS composes (produção e desenvolvimento). O dev espelha
produção de propósito: sem isso, um `EXPLAIN` local roda contra um servidor com
capacidades diferentes do que se está diagnosticando, e ensaiar um procedimento
de produção não vale nada.

O primeiro item do `command` **tem** que ser `postgres`. O `command` do Compose
substitui o CMD da imagem, mas o entrypoint oficial continua rodando e recebe
estes argumentos — sem `postgres` na frente ele não reconhece o comando como
"subir o servidor". Um teste guarda isso.

**2. `save=on`.** Persiste as estatísticas no shutdown. Sem isso todo deploy
zeraria o histórico, e a pergunta que o módulo existe para responder ("o que
custou caro nas últimas semanas") não sobreviveria.

**3. O `CREATE EXTENSION` entra no init E foi aplicado à mão em produção.**
`/docker-entrypoint-initdb.d` só roda com o volume de dados **vazio** — em banco
que já existe ele nunca executa. O arquivo cobre ambientes novos; produção foi
feita manualmente. O aviso está no próprio SQL, porque a pegadinha é silenciosa:
edita-se o arquivo, faz-se deploy e acha-se que aplicou.

**4. Teste-guardião** (`__tests__/unit/pg-stat-statements-config.test.ts`).
A configuração quebra em silêncio: removido o `command`, o Postgres sobe normal,
as queries rodam normal, e só a MEDIÇÃO some. O sintoma aparece semanas depois,
quando alguém for diagnosticar lentidão e achar a view vazia.

## O que a primeira medição encontrou

Minutos depois de ligar, a query campeã — **53% do tempo total do banco**:

```
SELECT ... FROM chatbot_messages WHERE conversation_id IN ($1..$11) ORDER BY ...
```

Vem do `include: { messages }` nos crons do Talison
(`process-pending-talison`, `talison-waiting-sweep`), que rodam a cada poucos
minutos. **O Prisma resolve a relação com `WHERE conversation_id IN (...)` e não
repassa o `tenantId` do pai** — e os três índices existentes começavam por
`tenant_id`, então nenhum servia.

Plano medido antes: `Seq Scan` varrendo **43.917 mensagens para devolver 414**.

Correção: índice `(conversation_id, created_at DESC)`, criado em produção com
`CREATE INDEX CONCURRENTLY` e versionado como migration.

| | antes | depois |
|---|---|---|
| tempo | 31,7 ms | **1,56 ms** |
| buffers | 1.286 | **154** |
| plano | Seq Scan (43.917 linhas) | Nested Loop por índice |

Este índice **não** começa por `tenant_id`, ao contrário de todos os outros da
tabela. É deliberado e está comentado no schema: índice é caminho de acesso, não
política de segurança — o RLS de `chatbot_messages` continua valendo integralmente.

## Consequências

**Boas**
- Existe resposta para "qual query custa caro", com dados e concorrência reais.
- O primeiro uso já pagou o custo: −95% no tempo da query mais cara do banco.
- Dev e produção medem igual.

**Custos e riscos**
- ~1KB de memória compartilhada por query distinta (teto de 5.000).
- Exigiu restart do Postgres: **7 segundos** de indisponibilidade, medidos. O app
  não caiu (`depends_on` só vale no start) e o pool `pg` reconectou sozinho — os
  16 erros no log foram `jwt refresh falhou — mantendo token atual (dentro do
  teto de graça)`, degradação sem derrubar sessão de ninguém, e cessaram sozinhos.
- `pg_stat_statements` normaliza a query mas **guarda o texto**. Não há segredo
  em literal aqui (o Prisma parametriza tudo), mas quem for adicionar SQL cru com
  valor embutido precisa saber que ele fica visível na view.

## Alternativas descartadas

- **Continuar com `EXPLAIN` sob demanda.** É o método que deixou uma query de 53%
  passar despercebida por meses.
- **`auto_explain`.** Registra o plano das queries lentas no log, sem precisar de
  restart para o básico — mas responde "esta execução foi lenta", não "o que
  custa mais no agregado". Complementar, não substituto; pode entrar depois.
- **APM externo (Datadog/New Relic).** Custo recorrente e mais uma dependência
  para uma pergunta que o próprio Postgres responde de graça.

## Como usar

```sql
-- As 10 queries que mais consomem tempo total
SELECT calls, round(total_exec_time::numeric) AS total_ms,
       round(mean_exec_time::numeric,2) AS media_ms,
       round((100*total_exec_time/sum(total_exec_time) OVER ())::numeric,1) AS pct,
       left(regexp_replace(query,'\s+',' ','g'),90) AS query
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;

-- Zerar o histórico (depois de uma otimização, para medir o efeito)
SELECT pg_stat_statements_reset();
```

Ler `total_exec_time`, não `mean_exec_time`: a query que aparece no topo por
média costuma ser um relatório mensal que roda uma vez; a que dói é a barata
executada dez mil vezes.
