# Etapa 2 — Auditoria de Backend / Banco / Arquitetura

> Programa de comercialização, etapa 2 de 6. Skill `audit-backend`, protocolo de
> 4 rodadas. Data: 2026-08-05.
>
> **Diferencial desta etapa:** foi a primeira medida contra **produção real**
> (`pg_stat_statements`, logs, timers systemd) e contra um **segundo tenant
> populado**, criado para esta auditoria. Até aqui o isolamento multi-tenant
> nunca tinha sido exercitado com dois tenants com dados.

## Instrumentação nova

`scripts/audit/seed-second-tenant.ts` — popula `audit-loja-2` na cópia local:
15 clientes, 20 produtos, 24 unidades em estoque, 10 vendas, 5 OS, 2 caixas,
13 parcelas, 11 recebíveis de cartão. Escreve pelos **serviços reais**
(`writeCashMovement`, `recordInstallmentPayment`, `generateCardReceivables`),
não por INSERT cru, e é idempotente.

Credenciais: admin `19191919177` / `Admin@2026`; operador `28282828211` /
`Arena@2026`.

**Limitações declaradas** (do próprio script, não escondidas): não chama
`sale.finalize` de verdade — replica o caminho de escrita, então não segue
mudanças futuras do finalize sozinho; sem DePix; sem estornos/cancelamentos
(a auditoria de estoque de 04/08 registrou que "reversão sangra", e esse terreno
não está coberto); sem comissões apuradas, NF-e ou fidelidade.

---

## O que a produção diz (medição, não leitura de código)

Isto contraria hipóteses razoáveis que eu teria reportado como achado sem medir.

| Métrica | Valor | Leitura |
|---|---|---|
| Deadlocks | **0** | disciplina transacional sólida |
| Conflitos de RLS | **0** | |
| Taxa de rollback | **0,03%** em 2.633.363 transações | |
| Query mais cara (total acumulado) | **5s** em 686 chamadas | banco não é gargalo |
| Queries com média > 50ms | **1** (INSERT de venda, 7 chamadas) | |
| Saturação de pool em 7 dias | **0** | |
| `finalize` lento (>3s) em 7 dias | **0** | |
| Erros de aplicação em 24h | **0** | |
| Índices sobre `tenant_id` em tabelas com RLS | **111/111** | regra do CLAUDE.md cumprida sem exceção |

**Ressalva honesta:** isto é carga de **um** tenant. Não prova escala — prova
que o desenho atual não está sofrendo hoje.

**Análise de índices ociosos foi descartada.** `pg_stat_user_indexes` na cópia
local mostrava 451 índices com `idx_scan=0`, incluindo *primary keys* — sinal de
estatísticas zeradas pela restauração, não de índices inúteis. Reportar isso
teria sido um achado inventado.

---

## Achados

### B1 — 54 FKs sem `tenant_id` composto permitem escrita cross-tenant no banco

**Prova executada** (não teórica). Com dois tenants reais, autenticado como
`audit-loja-2` via `SET LOCAL ROLE app_user` + `app.current_tenant_id`:

```sql
-- Movimento de caixa do tenant B apontando para sessão do tenant A: PASSOU
INSERT INTO cash_movements (..., cash_session_id, ...)
VALUES (..., '<sessão do arena-tech>', ...);   -- INSERT 0 1

-- Pagamento do tenant B contra parcela do tenant A: PASSOU
INSERT INTO installment_payments (..., installment_id, ...)
VALUES (..., '<parcela do arena-tech>', ...);  -- INSERT 0 1
```

RLS bloqueia a **leitura** da linha alheia, mas a verificação de FK roda com
privilégio interno e ignora RLS. 54 FKs estão nessa condição.

**Por que NÃO é P0:** a aplicação não expõe o caminho. Os 19 call sites de
`writeCashMovement` derivam a sessão de `session.id`/`openSession.id` — objetos
lidos dentro de `withTenant`, já filtrados por RLS. Nenhum aceita ID do cliente.
Os dois únicos inputs tRPC que aceitam `sessionId` do cliente:

- `cashier.manualAdjustment` (`cashier.ts:823`) — filtra `tenantId: ctx.tenantId`
  explicitamente. Defesa dupla. ✅
- `cashier.forceClose` (`cashier.ts:726`) — **não** filtra por tenant, depende só
  do RLS. Testei: como `audit-loja-2`, a sessão aberta do arena-tech é invisível
  (`count = 0`), então devolveria NOT_FOUND. RLS segura, mas é **uma camada só**.

**Severidade: P1** — ausência de defesa em profundidade, não vulnerabilidade
explorável hoje. O risco real é uma procedure futura aceitar um ID do cliente e
esquecer o filtro, como `forceClose` já esqueceu.

**Correção sugerida:** FK composta `(tenant_id, id)` nas relações de dinheiro
(cash_movements→cash_sessions, installment_payments→installments,
installments→financial_transactions, sale_items→sales). Não precisa ser nas 54 —
priorizar as de dinheiro.

---

### B2 — L-BTC da central a 113 sats do piso, alertando há horas sem ação

**Prova de produção** (log de 05/08, repetindo 45× em 24h):

```json
{"level":"warn","message":"[lbtc-central] L-BTC da central perto do piso —
 abasteca antes que os saques comecem a falhar",
 "context":{"sats":10113,"floor":10000,"refillsCovered":2,
            "refillSats":5000,"walletsServed":3,"warningSats":20000}}
```

10.113 sats contra piso de 10.000. Cobre **2 reabastecimentos** para 3 carteiras.
Saldo estático (não está caindo), mas **não há reabastecimento automático**.

Quando cruzar o piso, os saques DePix param com "Saque temporariamente
indisponível" — a memória do projeto já registra esse modo de falha.

**Severidade: P1 operacional, ativo.** Não é bug de código: é um alerta correto
que ninguém está consumindo. Para comercializar, um alerta que repete 45×/dia
sem destinatário é observabilidade decorativa.

---

### B3 — `cache-integrity` adia metade das carteiras toda rodada, indefinidamente

**Prova de produção:** `{"skipped":2,"checked":2,"totalWallets":4}` — em toda
execução. O orçamento da rodada verifica 2 de 4 e adia 2, sempre.

`src/lib/depix/cache-integrity-plan.ts:17` documenta a intenção — *"o que sobrou
hoje é o primeiro amanhã"* — que é um rodízio correto. O que o log não permite
afirmar é se o rodízio está de fato alternando ou se as mesmas 2 carteiras ficam
sempre para trás (o log registra a contagem, não os IDs).

É a mesma família do achado [alarme-que-nunca-cala] já registrado no projeto:
warn em 100% das execuções deixa de ser sinal.

**Severidade: P2.** Investigar se o rodízio alterna; se alternar, rebaixar o log
para `info` (ou logar os IDs). Confiança: média — não confirmei o comportamento
do rodízio.

---

### B4 — 5 crons sem lock; um deles roda a cada 60s e envia WhatsApp

`close-abandoned-cash-sessions`, `mark-overdue`, `process-pending-talison`,
`resolve-stale-conversations`, `talison-waiting-sweep` não usam `withCronLock`
(os outros 10 usam).

**Medição na VPS:**

| cron | intervalo | duração real | margem |
|---|---|---|---|
| `talison-waiting-sweep` | **60s** | sub-segundo | estreita |
| `process-pending-talison` | 10 min | 3-5s | confortável |
| demais | diário | — | confortável |

O `talison-waiting-sweep` é o de risco: o padrão do código é
**read-check-send-then-write** (`route.ts:281-289`) — lê `waitCount`, envia a
mensagem, e só **depois** grava o contador. Duas execuções concorrentes enviariam
a mesma mensagem ao cliente.

**Hipótese testada e REFUTADA:** procurei a mensagem de espera em produção —
**0 ocorrências**. O caminho nunca disparou. A corrida é real no código, mas o
código nunca chegou lá.

Fato colateral, mais interessante que o achado original: **um recurso do bot que
nunca funcionou em produção**. Fica para a Etapa 5 (IA/Talison).

**Severidade: P2** (era P1 antes da medição).

---

### B5 — Nenhum teste cobre a corrida fechar-caixa × finalizar-venda

Existem 4 testes de concorrência (`cashier-installment-concurrency`,
`financial-cash-lock-and-cancel-cas`, `sale-partial-refund-concurrency`,
`stock-adjust-cancel-concurrency`). **Nenhum** cobre o P1-3 da Etapa 1 — o
`finalize` gravando na sessão que está sendo fechada.

É lacuna de cobertura sobre invariante de dinheiro, e o teste é pré-requisito de
qualquer correção (a regra do programa exige teste que falha antes do fix).

---

### B6 — 33 mensagens não entregues no Instagram

`⚠️ MENSAGEM NÃO ENTREGUE: Erro ao enviar mensagem para o Instagram
(api_error)` — 33 ocorrências, mais 4 de "tipo de arquivo não suportado".
Cliente do outro lado não recebeu. Escopo da Etapa 5.

**Descartado no mesmo levantamento:** `[object Object]` visível ao cliente — 7
ocorrências, **última em 14/04**. Já corrigido; não é achado.

---

## Decisões a preservar (Chesterton's Fence)

1. **Pool explícito de 25 com o raciocínio documentado** (`db.ts:54-73`). O
   comentário identifica que o `connection_limit` da URL é ignorado pelo adapter
   do Prisma 7 e que, por causa do RLS, toda procedure segura uma conexão. É a
   melhor peça de documentação de infraestrutura que li neste código.
2. **`withCronLock` com aquisição atômica em statement único** — `INSERT ... ON
   CONFLICT DO UPDATE ... WHERE expires_at < now() RETURNING`. À prova de pool,
   ao contrário de advisory lock de sessão.
3. **`pg_advisory_xact_lock` por tenant no saque DePix**, com reserva agregada
   calculada dentro do lock e HTTP fora dele.
4. **Tratamento de saque indeterminado**: mantém `PROCESSING` em vez de liberar a
   reserva. Desenhado por quem apanhou de um pagamento duplicado.
5. **`recordWebhookEvent` relança erro não-P2002** em vez de tratar como
   duplicata — evita engolir evento genuíno como replay.

---

## Risco estrutural de escala (não é achado — é característica)

Como o RLS exige `SET LOCAL` dentro de transação, **toda** procedure (inclusive
leitura pura) roda em transação interativa e segura uma conexão do pool do começo
ao fim. O pool de 25 é, na prática, o **teto de requisições simultâneas que tocam
o banco**.

O `finalize` tem ~1050 linhas dentro de uma transação com timeout de 20s. Com um
tenant, zero saturação em 7 dias. Com 20 lojas em horário de pico, o cálculo
muda — e o sintoma não seria lentidão, seria **erro** (`maxWait` de 10s estourado).

Não é bug e não recomendo mexer agora. É o número a monitorar quando os primeiros
clientes entrarem: conexões ativas vs. 25.

---

## Áreas de baixa confiança

- **Não testei escala.** Todas as métricas de produção são de um tenant. Não fiz
  teste de carga.
- **Não validei o rodízio do `cache-integrity`** (B3) — o log não expõe os IDs.
- **O seed do segundo tenant replica o `finalize`, não o executa.** Bugs que só
  aparecem no caminho real do finalize não estão cobertos por esse dado.
- **Não auditei estornos/reversões com o segundo tenant** — o seed não cria esse
  terreno, e a auditoria de estoque de 04/08 aponta que é onde o sistema sangra.
- **FKs compostas:** não avaliei o custo de migração das 54 (índices adicionais,
  reescrita de tabela). A recomendação de priorizar as ~4 de dinheiro é baseada
  em blast radius, não em medição de custo.
