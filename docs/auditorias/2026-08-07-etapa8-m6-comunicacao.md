# Etapa 8 · Módulo 6 — Comunicação

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-security`.

## Escala

O maior volume não auditado do sistema, e é **conteúdo de conversa com cliente**
(dado pessoal, LGPD):

| tabela | registros |
|---|---|
| `chatbot_messages` | **44.787** |
| `chatbot_conversations` | 3.176 |
| `whatsapp_messages_sent` | 1.077 |
| `whatsapp_conversations` | 767 |
| `messages` | 39 (30 `FAILED`) |

---

## E8-6 — Três caminhos enviam para fora, um só tinha teto — ✅ CORRIGIDO

| procedure | dispara `dispatchMessage` | rate limit (antes) |
|---|---|---|
| `send` | sim | **sim** (60/h) |
| `resend` | sim | **não** |
| `sendToCustomer` | sim | **não** |

O `send` documenta a razão do teto, e ela vale igual para os irmãos:

> "um loop dispara para números quaisquer pelo WhatsApp Business da loja e
> arrisca o **BAN do número na Meta**, que é recurso **COMPARTILHADO**: derruba
> o atendimento real junto."

### Por que o `resend` é o pior dos dois

O status volta a `FAILED` quando o envio falha — então uma mensagem que a
Evolution API recusa é reenviável **indefinidamente**.

Produção tem **30 `FAILED`**, 23 delas com `Evolution API HTTP 404`. Munição
pronta para o loop.

### Uma medição que me enganou primeiro

Testei o loop no navegador e vi `200,400,400,400…` — parecia que o `resend` se
protegia sozinho. Estava **errado**: localmente o dispatch cai em **mock
automático** quando não há credencial Meta, e o status vira `SENT` no primeiro
resend, bloqueando os seguintes.

Foi preciso ler `whatsapp-cloud-service.ts:96-110` para ver que em produção,
**com** credencial e falha real, o status permanece `FAILED` — e o loop existe.
O mock local mascarou o caso que importa.

### A chave é ÚNICA de propósito

`enforceRateLimit` compõe a chave como `trpc:{path}:{userId}`. Passar o nome de
cada procedure daria **três baldes de 60 = 180/hora** pelo mesmo número.

**O recurso protegido é o número, não a procedure.** Por isso os três usam
`RL_ENVIO_EXTERNO`.

Provado no navegador:

```
62× send            -> 60 ok, 2× 429
sendToCustomer      -> 429 "Rate limit exceeded. Try again in 3580s."
```

O `sendToCustomer` foi recusado porque o `send` já consumira o balde. Compartilhado.

---

## O que ataquei e resistiu

### O gate de LGPD está no ponto certo

`isRecipientUnsubscribed` vive dentro de `dispatchMessage` — o wrapper que
**todas** as procedures de envio atravessam. Fonte única: um caminho novo herda
o opt-out de graça, sem depender de lembrar.

Isso é o que impediu o E8-6 de ser **também** um furo de LGPD: mesmo sem rate
limit, `resend` e `sendToCustomer` já respeitavam o opt-out.

Registro porque quase relatei o contrário: meu recorte por procedure não
alcançava o helper compartilhado, e cheguei a medir "opt-out = NÃO" nas três.

### A assimetria opt-in/opt-out é deliberada

| procedure | papel exigido |
|---|---|
| `unsubscribeCustomer` | **operador** — atender o pedido do cliente é livre |
| `resubscribeCustomer` | **admin** — reverter opt-out é decisão de gestão (LGPD) |

Documentado no código, da auditoria de 25/07. É a decisão certa e não deve ser
"corrigida" para simetria.

### O mock em produção falha ruidoso

`whatsapp-cloud-service.ts` **lança** se faltar credencial com
`NODE_ENV=production`, em vez de descartar mensagem em silêncio. O comentário
nomeia o risco: *"mock-mode silencioso é perigoso: mensagens 'enviadas' são
descartadas sem qualquer indicação no UI"*.

---

## Baixa confiança

- **Não auditei o conteúdo das 44.787 mensagens de chatbot** quanto a PII
  gravada em claro (CPF, endereço ditado pelo cliente). O volume é o maior do
  sistema e a retenção não foi verificada — só existe `purge-webhook-events`,
  que é outra coisa.
- **Não verifiquei quem pode LER as conversas.** `list` e `getById` são
  `tenantProcedure`; não comparei operador × admin no navegador como fiz no
  módulo de Configurações.
- **`notifyOsCompleted` não chama `dispatchMessage`** (usa outro caminho de
  envio) e ficou fora do teto. Verifiquei que respeita opt-out, mas não medi se
  tem limite próprio.
