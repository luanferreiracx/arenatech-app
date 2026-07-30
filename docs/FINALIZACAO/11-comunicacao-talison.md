# Módulo 11 — Comunicação / Talison

**Passada A (backend):** concluída em 2026-07-30.
**Passada B (frontend):** pendente.

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

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit   # 2032 verdes (2 novos)
```

**Falha antes do fix, verificada:** removi a acumulação de `usage` no laço e o
teste reprovou com a mensagem que descreve o defeito —
`nenhuma métrica de tokens foi emitida: expected undefined to be defined`.
