# Módulo 11 — Comunicação / Talison

**Passada A (backend):** concluída em 2026-07-30.
**Passada B (frontend):** concluída em 2026-07-30 (4 telas × 2 papéis × 2 viewports).

## Superfície

| | |
|---|---|
| Agente | `lib/talison/` (3.398 linhas): `agent.ts`, `runner.ts`, `prompt.ts`, `scheduler.ts`, `intent.ts`, `metrics.ts` |
| Ferramentas | 13, em `lib/talison/tools/` — catálogo, cliente, OS, estoque, avaliação, parcelamento, handoff |
| Provedores | DeepSeek (`deepseek-chat`) para texto, Groq para áudio |
| Router | `communication.ts` (559) |
| Borda | webhook Chatwoot, webhook Evolution |
| Tabelas | `chatbot_conversations`, `chatbot_messages`, `messages`, `whatsapp_conversations` |

## O que a produção diz (medido em 2026-07-30)

| | |
|---|---|
| Conversas | **2.992** (desde 27/02) |
| Mensagens do bot | **42.384** |
| Status | 2.955 `RESOLVED`, 21 `BOT_ACTIVE`, 9 `HUMAN_TAKEOVER`, 7 `OPEN` |

Volume por mês, **crescendo**:

| Mês | Mensagens |
|---|---|
| abr/2026 | 8.212 |
| mai/2026 | 5.134 |
| jun/2026 | 9.114 |
| **jul/2026** | **12.104** |

Este é, de longe, **o módulo de maior tráfego do sistema**. Cada mensagem de
entrada dispara o laço do agente, que pode gastar até 5 chamadas de LLM.

## Achado

### TL-1 — o custo do bot é invisível (P1 operacional)

O provedor DeepSeek devolve o consumo de cada chamada, e o tipo já previa isso:

```ts
// src/lib/talison/types.ts
usage?: { inputTokens: number; outputTokens: number };
```

O provedor preenche o campo. **Nenhum código o lê.** Confirmado por varredura:
`agent.ts`, `runner.ts` e `metrics.ts` não mencionam `usage`, e o catálogo de 14
métricas do módulo não tem nenhuma de token ou custo.

Ou seja: o módulo que processou **12.104 mensagens só em julho**, com volume
subindo mês a mês, não permite responder "quanto o bot custou este mês?" nem
"qual conversa custou caro?". O dado passava pela mão e era descartado.

Não é hipótese de custo alto — é **ausência de instrumento**. Sem ele, um prompt
que cresce, um laço que passa a gastar as 5 iterações ou um pico de tráfego só
aparecem na fatura.

**Correção proporcional.** O módulo declara sua própria estratégia de telemetria:
*"Não há sistema de métricas dedicado; emitimos logs com um campo estável
`talisonMetric` pra agregar no tooling de logs."* A correção segue isso — uma
métrica `tokens` a mais, com `conversationId`, `tenantId`, modelo, iterações,
ferramentas usadas e os dois contadores. Nada de dashboard novo; só parar de
jogar fora o que já está em mãos.

Detalhe que importa: a soma é do **laço inteiro**, não da última chamada. Um
diálogo que gastou cinco rodadas de tool-call custa muito mais que um que
respondeu de primeira, e somar só a última faria os dois parecerem iguais.

Não emite quando o provedor não informa consumo — `0 tokens` poluiria a agregação
com ruído.

## O que auditei e está íntegro

Este é o módulo **mais endurecido** que este programa encontrou até agora.
Auditorias anteriores passaram por ele e o que elas deixaram continua de pé:

- **Laço limitado.** `MAX_ITERATIONS = 5`, com fail-safe em três saídas (resposta
  vazia, teto atingido, exceção). Não há caminho de laço infinito.
- **Allowlist de ferramentas em CÓDIGO, não no prompt.** `getTool(name)` resolve
  num `Map`; nome desconhecido devolve `undefined`. É a diferença entre um
  controle que uma injeção de prompt contorna e um que ela não contorna.
- **Validação determinística pós-LLM.** `suspiciousPrice`: valor em dinheiro na
  resposta sem nenhuma ferramenta de preço ter rodado marca a conversa para
  auditoria. É o padrão de "não confie no oráculo" — o modelo fala, o código
  confere.
- **Superfície de escrita mínima.** Das 13 ferramentas, **só `handoff` escreve**,
  e o que escreve é um lead. Todo o resto é leitura.
- **PII enxuta no provedor.** `buscarCliente` seleciona `{ id, name }` — nem CPF,
  nem telefone, nem endereço sobem para o modelo. (E uma auditoria de 2026-07-25
  já fechou um IDOR nessa mesma ferramenta.)
- **Webhook autenticado com comparação timing-safe**, com ADR próprio sobre
  redação do token nos logs do nginx (`0048-chatwoot-webhook-token-redaction`).
- **Instruções da loja delimitadas como DADO**, com as guardas por último
  (ADR 0055) — o padrão anti-injeção correto.

Registro isso com o mesmo peso dos achados: um módulo que aguenta 42 mil mensagens
com essas defesas no lugar é resultado de trabalho anterior bem feito, e desfazer
qualquer um desses pontos por engano seria caro.

## Passada de frontend

Crawler nas 4 telas do módulo (as três de `/communication` mais `/settings/bot`,
que mora em Configurações mas é deste módulo por ADR 0055), como admin e como
operador, em 1440 e 390: **16 visitas, 0 quebradas, 0 atenção**.

Os 2 redirects são o gate de papel do Módulo 10 funcionando: `/settings/bot` é
configuração de admin, e o operador é mandado para o painel com aviso visível.

### CMN-1 — o painel empurrava 932px numa tela de 390 (P2)

Achado no destino do redirect, não nas telas do módulo — mas medido, severo e na
tela mais visitada do sistema, então corrigido aqui.

Os cartões de alerta do painel (`10 contas vencidas`, `6 OS atrasadas`,
`10 produtos com estoque baixo`) são itens de grid, e item de grid nasce com
`min-width: auto`: não encolhe abaixo do conteúdo. Os `truncate` que já existiam
**dentro** deles nunca disparavam — o "truncate ghost", a classe presente e sem
efeito porque a cadeia de encolhimento quebra num ancestral. `min-w-0` no cartão,
não só no texto.

Medido a 390px: `scrollWidth` **932 antes, 390 depois**, zero elementos fora.

> **Lição de método, segunda ocorrência.** Cheguei a medir 932px com a correção
> **já aplicada** na árvore e quase concluí que ela não funcionava. Era
> compilação velha em `.next/dev`. A mesma armadilha produziu um P0 fantasma no
> Módulo 2. A regra vale sempre: **medir contra build limpo antes de concluir** —
> e não escrever no comentário que algo "resolveu" antes de ver o número novo.

## Achados da passada de frontend

### CMN-1 — o painel empurrava 932px numa tela de 390 (P1)

Achado **por acidente e fora do módulo**: o crawler mandou o operador para
`/settings/bot`, o gate de papel do Módulo 10 o redirecionou para `/painel`, e foi
lá que o overflow apareceu.

O painel é **a primeira tela que todo usuário abre**. No celular ele tinha
`scrollWidth` de **932px** — 542 a mais que a tela.

Causa, em três lugares diferentes e sempre a mesma: os cartões são filhos de
`grid`, e item de grid nasce com `min-width: auto` — não encolhe abaixo do
conteúdo. Os `truncate` dentro dos cartões (que **existem**, escritos com
cuidado) nunca disparavam, porque a cadeia de encolhimento quebrava no ancestral.
É o **truncate ghost**: a classe está lá, sem efeito.

Corrigido com `[&>*]:min-w-0` nos **6 grids** do painel — cobre os cartões de hoje
e os que vierem. Medido depois: `scrollWidth` 390 em tela de 390, e o crawler do
módulo Painel voltou com 0 quebradas · 0 atenção · 0 redirect.

Sétima vez que este mecanismo aparece no programa, e a primeira na tela de maior
tráfego.

> **Registro de método, duas correções minhas no caminho.** Primeiro suspeitei do
> `Alert` que eu mesmo tinha adicionado no Módulo 10 (o aviso de acesso
> bloqueado). Medi as duas variantes de URL: **932px nas duas**, com e sem o
> alerta — não era regressão minha. Depois de corrigir os cartões de alerta,
> sobrou overflow **só** na variante com `?error=`, e eu quase escrevi que aí sim
> era o meu componente. Medi de novo: eram "Últimas Vendas" e "Últimas OS", que
> só aparecem depois que a query resolve — a diferença entre as duas medições era
> o tempo de espera da sonda, não o alerta.

### CMN-2 — falha de query virava "nenhum template" (P3)

`templates-list.tsx` fazia `data ?? []` sem olhar `isError`, e nenhum arquivo das
telas de comunicação checava erro. Mesmo eixo já corrigido nos Módulos 8 e 9;
passou a usar o `QueryErrorState`.

## O que o crawler achou nas telas do módulo

Nada. As três telas de comunicação mais a aba do bot, em admin e operador, 1440 e
390: **0 quebradas, 0 atenção**. Os 2 redirects são o operador sendo barrado em
`/settings/bot` — o gate de papel do Módulo 10 funcionando.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit          # 2032 verdes (2 novos)
pnpm tsx scripts/audit/crawl-module.ts comunicacao     # 0 quebradas · 0 atenção
```

**Falha antes do fix, verificada:** removi a acumulação de `usage` no laço e o
teste reprovou com a mensagem que descreve o defeito —
`nenhuma métrica de tokens foi emitida: expected undefined to be defined`.
