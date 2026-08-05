# Etapa 5 — Auditoria do Talison (bot de atendimento com LLM)

> Programa de comercialização, etapa 5 de 6. Skill `audit-ai-systems`, protocolo
> de 4 rodadas. Data: 2026-08-05.

## Inventário

**Arquitetura multi-provider:** DeepSeek (texto, `max_tokens` 1024, timeout 45s),
Claude Haiku (visão), Groq/Whisper (áudio), Groq/`gpt-oss-20b` (classificação de
intenção no cron). Integração via Agent Bot do Chatwoot.

**Volume em produção:** 44.894 mensagens desde 27/02; 3.186 conversas; 15.424
respostas do bot; ativo hoje.

**Consumo medido (7 dias, 41 chamadas):**

| métrica | valor |
|---|---|
| input médio por resposta | **16.987 tokens** |
| output médio | 162 tokens |
| razão input:output | **105:1** |
| pico de input | 34.685 tokens |
| iterações máximas observadas | 3 (teto é 5) |

**Custo estimado:** ~US$ 12/mês na escala atual. Com cache de prompt seria
~US$ 2,70. **A diferença de US$ 9,55/mês não justifica ação hoje** — passa a
importar com ~20 lojas (~US$ 250/mês).

---

## Achados

### A3 — A guarda anti-alucinação de dinheiro não pega o incidente que a motivou

**O mais consequente da etapa**, porque o sistema fala de **preço** com clientes.

`agent.ts:167` detecta o bot fazendo conta de dinheiro sem chamar a tool de
cálculo, usando:

```js
const MATH_PATTERN = /R\$\s*[\d.,]+\s*[-–−+]\s*R\$\s*[\d.,]+\s*=/;
```

Exige a **equação literal com `=`**. Testei contra fraseados reais:

| frase | detecta? |
|---|---|
| `R$ 7.799,99 - R$ 3.000,00 = R$ 4.799,99` | ✅ pega |
| `A diferença fica em R$ 4.799,99` | ❌ **passa** |
| `Você paga R$ 4.799,99 de diferença` | ❌ **passa** |
| `Sobrando R$ 4.799,99 para você` | ❌ **passa** |
| `Dando seu aparelho na troca, fica R$ 4.799,99` | ❌ **passa** |

O último é o fraseado do **incidente que motivou a guarda** — a conversa do Caio
Marques (01/08/2026), documentada em `prompt.ts:93-97`: *"calculou a diferença da
troca em cima do preço errado, de cabeça, sem chamar simular_parcelamento"*.

**Prova de dado:** **0 disparos** de ambas as guardas em 7 dias de produção. Não
é que o bot se comportou — é que a guarda quase não pega nada.

A segunda guarda (`suspiciousPrice`, `agent.ts:158`) verifica apenas se *alguma*
tool de preço rodou — **não compara o número dito com o número devolvido**. Se a
tool retorna `R$ 4.999,00` e o bot escreve `R$ 499,00`, não dispara.

E ambas são **passivas por construção**: `agent.ts:159-174` só faz `logger.warn`;
`runner.ts:344` envia a resposta incondicionalmente. Não há `if` entre detectar e
enviar.

**Severidade: P1.** O dano é comercial/reputacional (cliente chega na loja
cobrando um preço que o bot inventou), não perda automática de dinheiro — o bot
não fecha venda nem altera preço.

---

### A2 — Falhas de entrega nunca são marcadas; o reenvio automático nunca roda

**Prova de dado:** 4 mensagens com `status=3` (failed) no Chatwoot nos últimos 30
dias. Todas as 4 estão do nosso lado com `delivery_failed = false`. **Zero
mensagens marcadas como falha em toda a base de 15.424.**

**Causa raiz** (investigada até o fim, com duas hipóteses minhas descartadas no
caminho):

`webhooks/chatwoot/route.ts:342` faz:
```ts
const status = String(body.status ?? "").toLowerCase()
if (!messageId || status !== "failed") break
```

Mas o `webhook_data` do Chatwoot (`app/models/message.rb`) **não inclui o campo
`status`**. Os campos são: `account, additional_attributes, content_attributes,
content_type, content, conversation, created_at, id, inbox, message_type,
private, sender, source_id`.

`body.status` é sempre `undefined` → a condição **sempre** sai fora. Todo o bloco
de detecção de falha **e o reenvio automático** (`route.ts:335-360`) é código
morto por incompatibilidade de contrato.

A informação existe, em outro lugar: `content_attributes.external_error`
(medido: `"500 Internal Server Error"`, `"Net::ReadTimeout"`).

**Hipóteses que testei e descartei** — registro porque quase viraram achados:
1. *"O Chatwoot não envia `message_updated` para Agent Bots"* — **falso**. O
   `agent_bot_listener.rb:45` tem o handler, e medi **107 eventos** chegando nos
   últimos 7 dias.
2. *"O evento não chega"* — **falso**. O log mostra
   `{"event":"message_updated"}` chegando hoje.

**Impacto:** clientes cujo envio falhou ficam sem resposta e ninguém sabe. Última
falha: **04/08**. Escala com o volume de Instagram.

**Severidade: P1.**

---

### A1 — Sem teto de custo, sem rate limit, e o cache de prompt não é medido

**Sem rate limit em nenhum ponto do caminho do bot** (grep em
`webhooks/chatwoot/route.ts` e `src/lib/talison/*`: zero ocorrências). O único
freio é o debounce de 8s por conversa (`scheduler.ts:22`).

**Cenário de custo medido:**

| cenário | custo |
|---|---|
| conversa real mais longa observada (214 msgs) | US$ 1,02 |
| atacante, 1 msg/9s por 1h (pior caso, 5 iterações) | US$ 9,17 |
| atacante persistente por 24h | **US$ 220** |

Não é ruinoso, mas **nada detecta, limita ou alerta** — e escala com o número de
atacantes.

**Cache de prompt não observável:** com 17k tokens de input por chamada, o cache
do DeepSeek (~10× mais barato) é o que separa US$ 12 de US$ 2,70/mês. O provider
lê `prompt_tokens` e `completion_tokens` (`deepseek.ts:136-137`) e **ignora**
`prompt_cache_hit_tokens`. A métrica mede volume, não custo.

**Kill switch existe mas não é operacional:** `ChatbotConfig.enabled`
(`runner.ts:221`) só é alcançável por UI ou `psql`. Não há env var nem endpoint —
se o bot começar a falar besteira às 2h, é preciso login no painel.

**Severidade: P2** na escala atual; **P1 quando houver 20 lojas.**

---

### A4 — Injeção de prompt: o padrão do ADR 0055 protege o admin, não o cliente

**O que está BLOQUEADO e bem feito** (verificado linha a linha):

O ADR 0055 foi implementado como documentado. As instruções do admin são
delimitadas como DADO (`prompt.ts:176-183`), as guardas do sistema vêm **por
último** (`prompt.ts:242` + `:143`), há fail-closed quando vazio
(`prompt.ts:243-245`), validação de entrada com 12 regex + cap de 4000 chars
(`bot-config.ts:13-26`), `tenantAdminProcedure` + audit log (`settings.ts:150,
178`), e testes que afirmam a posição da guarda
(`talison-prompt.test.ts:63`).

**O que está ABERTO:**

| vetor | estado | evidência |
|---|---|---|
| Mensagem do **cliente** | ❌ sem delimitação | `runner.ts:165` entra crua; `agent.ts:135-138` a coloca **depois** de todas as guardas |
| Áudio/imagem do cliente | ❌ sem delimitação | `runner.ts:91-100`; `claude-vision.ts:88` instrui a transcrever *"qualquer texto visível"* |
| Retorno de **tool** (dado do banco) | ❌ sem sanitização | `stock.ts:120` concatena `description` cru → `agent.ts:95` |

**Prova empírica de que o vetor de tool funciona:** o próprio código usa o
retorno de tool como canal de comando para o LLM —
`valuation.ts:297`: `"[INSTRUÇÃO INTERNA, não repita ao cliente: NÃO subtraia
este valor...]"`. Se a equipe comanda o modelo por ali, um `Product.description`
malicioso também comanda.

**Assimetria de proteção que vale nomear:** o ADR protegeu o campo de instruções
(4000 chars, admin-only, auditado, validado) e deixou aberto um canal maior —
`Product.description`, sem cap prático, editável por qualquer usuário com
permissão de catálogo, sem validação anti-injeção nem audit log.

**Limite de dano (importante):** nenhuma tool escreve em preço, estoque, venda,
OS ou cadastro. As 3 tools de escrita mexem em `Interest`, cancelam follow-up e
transferem para humano. **Mesmo com controle total do LLM, não se move dinheiro
nem estoque.** É o limite arquitetural mais importante do sistema, e está certo.

**Uma exceção a observar:** `sinalizar_lead_quente` (`handoff.ts:181-190`)
interpola `nome`, `produto_modelo`, `observacoes` — todos strings livres do LLM —
numa mensagem enviada a um **grupo de WhatsApp interno**, sem cap nem escape. É
injeção de conteúdo em canal externo (phishing contra a própria equipe).

**Severidade: P2** (dano limitado pela ausência de tools destrutivas).

---

### A5 — PII vai para 3 provedores de LLM sem redação, DPA ou opt-out

**O que sai do sistema:**

| destino | o que vai |
|---|---|
| **DeepSeek** (China) | nome do contato, histórico de 20 mensagens cru, **CPF** (o prompt em `prompt.ts:82` instrui a pedir), nome do titular, histórico de OS com **valores** |
| **Anthropic** | a **imagem completa** em base64 — incluindo comprovantes PIX (nome, CPF parcial, banco, valor), que `claude-vision.ts:82-83` antecipa explicitamente |
| **Groq** | áudio bruto (biometria de voz) + transcrição de conversas paradas, esta última **por cron, sem interação do cliente** |

**Ausências verificadas por grep:** zero redação/anonimização, zero headers de
zero-retention, zero DPA registrado, zero opt-out de treinamento configurado.
`ChatbotMessage` persiste indefinidamente, incluindo transcrição de áudio em
`metadata.resolvedText`, sem TTL.

**O opt-out de LGPD existe e não é consultado:** `Customer.unsubscribed`
(`customer.prisma:34`) é respeitado por `communication.ts` e `interest.ts`, mas
**não** pelo pipeline do Talison (`runner.ts:184-320` não checa nenhuma flag de
consentimento).

**Prova de dado que calibra a severidade:** **0 de 1.407 clientes** fizeram
opt-out em produção. O achado é real e latente — não há caso concreto sendo
violado hoje.

**Severidade: P2 hoje, P0 de conformidade ao comercializar.** Vender para
terceiros significa processar PII de clientes *deles*, com contrato. Transferência
internacional para 3 operadores sem DPA é exposição legal que um cliente
corporativo vai perguntar na primeira reunião.

---

## Decisões a preservar

1. **Nenhuma tool escreve em dinheiro, estoque ou venda.** É o que limita o dano
   de toda a família de injeção. Não afrouxar.
2. **Allowlist de tools enforced no código** (`agent.ts:79-90`,
   `registry.ts:32`), não no prompt. Nome desconhecido não executa.
3. **Escopo multi-tenant fechado:** nenhum schema de tool tem `tenantId`; o
   contexto vem do webhook e passa por RLS. Defesa dupla (filtro explícito +
   `SET LOCAL`).
4. **IDOR de OS e de CPF corrigidos com teste de integração**
   (`talison-os-ownership.test.ts`): número de OS nunca vale sozinho, e a
   mensagem de erro é idêntica para CPF inexistente e par que não confere — não
   vira oráculo.
5. **`MAX_ITERATIONS = 5`** (`agent.ts:20`) — loop infinito é impossível.
6. **Cache de mídia em `metadata.resolvedText`** — não reprocessa visão/áudio a
   cada turno.
7. **O padrão anti-injeção do ADR 0055 é real**, com teste afirmando que a guarda
   é a última linha do prompt.

---

## O padrão que atravessa a etapa

**Cada defesa foi construída contra o vetor exato da auditoria anterior, sem
generalizar:**

- O ADR 0055 delimitou o texto do **admin** como dado — e não o do cliente nem o
  do banco.
- `sanitizeContactName` sanitizou o **nome** do contato — e não a mensagem.
- As guardas de preço mediram a **presença** da tool — e não o **valor**.
- O reenvio automático foi escrito para um campo (`status`) que **o provedor não
  envia**.

É a versão específica do padrão que este projeto já nomeou sete vezes ("duas
implementações da mesma regra"). Aqui a forma é: **a correção fecha a instância,
não a classe.**

---

## Áreas de baixa confiança

- **Não testei injeção contra o bot em produção.** Todos os vetores são análise
  de código + medição; não enviei payload malicioso a uma conversa real. Fazer
  isso exigiria uma conversa de teste e autorização.
- **Não medi taxa de acerto do bot.** Não há eval set, golden set nem baseline —
  então não sei dizer se a qualidade regrediu ou melhorou nos 6 meses. **É a
  maior lacuna de qualidade**: 44 mil mensagens e nenhuma medição de acerto.
- **Não confirmei se o cache de prompt do DeepSeek está ativo** — o dado não é
  coletado.
- **`MONITOR_ENABLED=false`** no LWK segue sem explicação (herdado da Etapa 4).
- **Não avaliei o custo de Claude/Groq** — só o DeepSeek emite métrica de tokens.
