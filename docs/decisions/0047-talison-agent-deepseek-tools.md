# ADR 0047 — Talison IA: agente de atendimento reescrito (DeepSeek + tools)

Data: 2026-06-03
Status: Aceito

## Contexto

O atendimento WhatsApp via Chatwoot tinha um agente de IA (Claude/Haiku) no
`ChatbotController` do Laravel — **6.547 linhas**, bugado. O dono estava
insatisfeito: o Haiku alucinava (principalmente **valores inventados de
memória**), e cada alucinação virou uma regra defensiva nova no system prompt,
até o ponto em que "a IA quase não trabalhava sozinha" e ainda assim alucinava.

A infra de atendimento já tinha sido migrada pro Next.js (webhook Chatwoot,
schema `ChatbotConversation/Message/Config/FollowUp`, router tRPC), mas **sem
nenhum cérebro de IA plugado** — o webhook só persistia a mensagem.

Decisão do dono: **migrar a infra, mas reescrever o agente do zero** (não
portar as 6.5k linhas), trocando o modelo de conversa para **DeepSeek** (custo)
e usando **Claude apenas para visão** (decifrar imagem).

## Decisão

### 1. Reescrever o cérebro com abordagem anti-alucinação arquitetural
Em vez de combater alucinação com mais regras no prompt, a defesa é estrutural:

> O modelo **nunca** produz um dado de negócio (preço, status, prazo, garantia).
> Esses dados só existem como **retorno de uma tool**. O modelo orquestra e
> copia. Tool não achou → transfere pra humano, jamais estima de memória.

Validado contra a API DeepSeek real: ao perguntar um preço inexistente, o
modelo respondeu "não tenho na minha base, vou transferir" em vez de inventar.

### 2. DeepSeek para conversa+tools; Claude só para visão
- Conversa e function-calling: **DeepSeek** (`deepseek-chat`), via SDK `openai`
  (OpenAI-compatible). Mais barato; function-calling validado sólido com as 8
  tools.
- Visão: **Claude** (`claude-haiku-4-5`) descreve a imagem → texto, que entra
  no histórico do DeepSeek. Roda só quando há imagem — custo pontual.
- Provider abstraído atrás de `LlmProvider`/`VisionProvider` (higiene, não
  feature de produto): trocar de modelo = trocar a impl, sem reescrever agente.

### 3. Tools = funções TS tipadas, RLS-scoped (8 na v1)
Schema Zod → JSON Schema (`z.toJSONSchema`, Zod 4) é a fonte única. Leitura:
`consultar_status_os`, `verificar_garantia`, `estimar_orcamento`,
`listar_servicos`, `buscar_cliente`, `consultar_avaliacao`. Escrita:
`qualificar_lead` (cria `Interest`, idempotente), `transferir_para_humano`
(status + Chatwoot). Reusam a lógica/schema que já existe; cálculos (garantia)
são feitos pela tool, não pelo modelo.

### 4. Debounce por generation (Redis + setTimeout), não inline
O webhook responde 200 e **agenda** o processamento; o scheduler grava uma
generation no Redis e dispara após `TALISON_DEBOUNCE_MS` (8s). No disparo, só
processa se ainda for a generation vigente — a rajada de balõezinhos vira uma
resposta só. Timer vive no processo Node long-lived da VPS. Sem worker novo,
sem fila externa. Sem `REDIS_URL`, cai pra processamento imediato.

### 5. Fail-safe: o cliente nunca fica sem resposta
Teto de 5 iterações no loop (anti-loop de tools). Erro do provider, texto
vazio ou teto atingido → mensagem de fallback + log `degraded:true`. Erro
interno de tool instrui o modelo a seguir natural, sem expor "erro técnico".

### 6. Canal de saída: API do Chatwoot
A resposta é postada como mensagem `outgoing` na conversa (mantém histórico
unificado e handoff natural pro atendente). Feature-flag por
`ChatbotConfig.enabled` + whitelist (modo teste). Não responde em
`HUMAN_TAKEOVER`/`RESOLVED`.

## Consequências

- A classe inteira de alucinação de valor desaparece por construção.
- O system prompt é enxuto (identidade, escopo, regra de ouro, handoff).
- Observabilidade: cada conversa loga `iterations`, `toolsUsed`, `degraded`.
- **Fora da v1** (entram depois): venda de acessório + PIX automático,
  follow-up por IA, escalação dinâmica de modelo.
- Risco aceito do debounce: se o processo reinicia durante a janela de 8s,
  aquele disparo se perde (cliente reescreve / próxima msg reagenda).

## Referências
- Plano: `docs/TALISON_AGENT_PLAN.md`
- Código: `src/lib/talison/` (providers, tools, agent, runner, scheduler)
- Webhook: `src/app/api/webhooks/chatwoot/route.ts`
