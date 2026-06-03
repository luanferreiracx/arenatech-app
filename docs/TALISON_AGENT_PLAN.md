# Plano — Talison IA (reescrita do zero)

> Agente de atendimento ao cliente da Arena Tech, no ambiente Next.js.
> Substitui o `ChatbotController` do Laravel (6.5k linhas, bugado) por um
> núcleo enxuto. Cérebro: **DeepSeek** (conversa + tools). **Claude** apenas
> para visão (decifrar imagem → texto). Escopo v1: atendimento + vendas
> (sem venda/PIX automático).

## Princípio que guia a reescrita

O Laravel acumulou centenas de regras defensivas porque o Haiku alucinava
(principalmente **valores inventados de memória**). A correção certa não é
"mais regra no prompt" — é **arquitetural**:

> **O modelo nunca produz um dado de negócio (preço, status, prazo). Esses
> dados só existem como retorno de uma tool. O modelo orquestra e copia.**

Se a tool não achou, o modelo diz que vai verificar / transfere. Isso elimina
a classe inteira de alucinação de valor, independente do modelo.

## O que já existe (não recriar)

- `POST /api/webhooks/chatwoot` — recebe, valida token, dedup (replay-guard),
  mapeia tenant + customer, persiste `ChatbotMessage`, detecta handoff humano.
  **Hoje ele só persiste — não aciona IA.** É o ponto de entrada.
- Schema `ChatbotConversation/Message/Config/FollowUp` (multi-tenant, RLS).
- Router tRPC `chatbot.ts` (UI de atendimento: listar, atribuir, follow-up).
- Envio WhatsApp via Evolution (`whatsapp-service.ts`) e Cloud API (pronto).
- Dados de negócio: `ServiceOrder`, `DeviceValuation` (231 migradas),
  `Interest` (lead, em customer.prisma), catálogo de serviços.

## Arquitetura

```
webhook chatwoot (existe) ── persiste msg ──► [NOVO] enfileira com debounce
                                                      │ (Redis, ~8s)
                                                      ▼
                                          runTalison(conversationId)
   ┌──────────────────────────────────────────────────────────────┐
   │ 1. carrega histórico (DB) + system prompt                     │
   │ 2. se última msg é imagem → Claude visão → texto no contexto  │
   │ 3. DeepSeek.chat(history, tools)                              │
   │ 4. resposta = texto final?  → vai pro passo 6                 │
   │           = tool_call?      → executa tool (RLS) → passo 3    │
   │ 5. teto de N iterações (anti-loop)                            │
   │ 6. envia resposta ──► Chatwoot API ──► cliente                │
   └──────────────────────────────────────────────────────────────┘
```

### Por que debounce + fila (não inline no webhook)
- O loop DeepSeek+tools leva segundos; o webhook precisa responder rápido
  (senão Chatwoot reentrega → replay).
- Cliente manda vários balõezinhos seguidos; debounce junta numa pergunta só.
- Temos Redis e rodamos standalone na VPS (não serverless puro). Padrão:
  webhook responde 200 e agenda; um runner processa após o debounce, usando
  uma "generation" no Redis para descartar runs obsoletos (msg mais nova
  chegou) — mesma ideia do `ProcessarMensagemBotJob`, sem a complexidade.

### Canal de saída: API do Chatwoot
A resposta do agente é postada como mensagem `outgoing` na conversa do
Chatwoot (`POST /api/v1/accounts/{acc}/conversations/{id}/messages` com
`api_access_token: CHATWOOT_BOT_TOKEN`). Mantém histórico unificado no
Chatwoot e o handoff pra humano fica natural (o atendente vê tudo).
O Chatwoot reentrega a `outgoing` no webhook → persistida como `senderType=bot`.

### Provider abstraído (higiene, não feature de produto)
- `LlmProvider` interface (`chat(messages, tools) → {text | toolCalls}`).
- Impl `DeepSeekProvider` (OpenAI-compatible) é o default.
- `VisionProvider.describe(imageUrl) → text` via Claude (`claude-haiku` visão).
- Trocar de modelo = trocar a impl, sem mexer no agente nem nas tools.

## Tools v1 (cada uma = função TS tipada, RLS-scoped)

Reaproveitam a lógica que já existe nos routers (não duplicam acesso a dados).

| Tool | Lê | Escreve | Fonte |
|---|---|---|---|
| `consultar_status_os` | OS por número/telefone | — | ServiceOrder |
| `verificar_garantia` | prazo/validade garantia | — | ServiceOrder.warranty* |
| `estimar_orcamento` | preço de serviço | — | catálogo de serviços |
| `listar_servicos` | serviços disponíveis | — | catálogo |
| `buscar_cliente` | cliente por telefone/CPF | — | Customer |
| `consultar_avaliacao` | valor de trade-in | — | DeviceValuation |
| `qualificar_lead` | — | cria | Interest |
| `transferir_para_humano` | — | status + Chatwoot | ChatbotConversation + Chatwoot API |

Regras embutidas nas tools (não no prompt):
- toda tool valida input com Zod e retorna `{ ok, data }` ou `{ ok:false, reason }`;
- número/valor sempre vem com a moeda formatada pronta, pra o modelo copiar;
- `transferir_para_humano` muda status p/ HUMAN_TAKEOVER, cancela follow-ups,
  e chama a API do Chatwoot (assign/label) — reusa o que o router já faz.

## System prompt (enxuto)
- Identidade: "Talison IA, atendimento da Arena Tech".
- Escopo: assistência iPhone/iPad/Mac/PC + venda de aparelho/acessório.
- Regra de ouro única: número só de tool, nunca de memória.
- Horário comercial + mensagem fora de horário (de `ChatbotConfig`).
- Quando transferir: pedido humano, fora de escopo, lead quente, frustração.
- Tudo o mais é comportamento de tool, não texto.

## Fases de implementação

1. **Infra de IA** — instalar SDK (OpenAI client p/ DeepSeek + Anthropic p/
   visão), `LlmProvider`/`VisionProvider`, env vars (`DEEPSEEK_*`,
   `ANTHROPIC_API_KEY`), mock mode em dev. Sem tocar no webhook ainda.
2. **Tools** — implementar as 8 tools como funções puras + schema Zod +
   testes unit (mock Prisma). Cada tool isolada e testável.
3. **Loop do agente** — `runTalison()`: monta histórico, chama provider,
   executa tools, teto de iterações, envia resposta. Testes unit do loop
   com provider fake.
4. **Debounce + ligação** — Redis generation + runner; webhook agenda após
   persistir. Feature-flag por `ChatbotConfig.enabled` + whitelist.
5. **Visão** — desvio Claude quando `contentType=image`.
6. **E2E + observabilidade** — teste @business do fluxo, logging estruturado
   (tokens, tool calls, latência), tratamento de erro fail-safe (nunca deixa
   o cliente sem resposta).
7. **ADR + PROGRESS** — ADR 0047 (arquitetura do agente) + atualizar PROGRESS.

## Fora de escopo v1
- Venda de acessório + geração de PIX (Talison Laravel tinha; fica pra v2).
- Escalação dinâmica de modelo (DeepSeek único; visão é Claude pontual).
- Follow-ups automáticos por IA (a infra de follow-up já existe no router;
  o agente pode agendar via tool numa fase futura).

## Riscos e mitigação
- **DeepSeek fraco em function-calling com muitas tools** → poucas tools (8),
  descrições claras, provider trocável.
- **Loop infinito de tools** → teto de iterações + log.
- **Resposta nunca chega ao cliente (erro no meio)** → fail-safe: em erro,
  envia mensagem de fallback e/ou transfere pra humano.
- **Custo** → DeepSeek barato; visão só quando há imagem.
