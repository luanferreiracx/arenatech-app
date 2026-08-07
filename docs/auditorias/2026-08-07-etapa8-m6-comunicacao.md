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

- **Não verifiquei quem pode LER as conversas** — ver abaixo.
- **Não verifiquei quem pode LER as conversas.** `list` e `getById` são
  `tenantProcedure`; não comparei operador × admin no navegador como fiz no
  módulo de Configurações.
- **`notifyOsCompleted` não chama `dispatchMessage`** (usa outro caminho de
  envio) e ficou fora do teto. Verifiquei que respeita opt-out, mas não medi se
  tem limite próprio.

---

## E8-7 — Retenção das conversas: medido, decisão do dono é NÃO MEXER AGORA

Fui atrás da lacuna que registrei acima. Os números:

| | |
|---|---|
| mensagens | **44.787** |
| tamanho | **17 MB — 17% do banco inteiro** (103 MB) |
| crescimento | ~12.600/mês em julho, monotônico |
| política de retenção | **nenhuma** |
| CPFs em claro no conteúdo | **85** |
| menções a "senha" | 69 |

O precedente existe e é do mesmo sistema: `purge-webhook-events` usa **90 dias**,
criado na auditoria de 25/07 pela razão idêntica (*"crescimento monotônico, sem
nenhuma purga"*).

### Quem escreveu os CPFs

| origem | mensagens |
|---|---|
| cliente (`incoming`/`inbound`) | 63 |
| loja (`outgoing`/`outbound`) | 22 |

A maioria é o **próprio cliente digitando o CPF no WhatsApp** — inerente ao
atendimento, não vazamento do sistema.

### O que 90 dias custaria

**17.859 mensagens (40% do histórico)**, de fev a mai/2026. 180 dias apagaria
zero hoje e passaria a agir em setembro.

### Decisão

**Não mexer agora** (dono, 07/08/2026). Apagar conversa com cliente é decisão de
negócio, e 17 MB não é urgente. Fica registrado com os números para revisitar
quando escalar — em 12 meses no ritmo atual seriam ~150 mil mensagens.

### Um falso positivo, descartado

As **18 sequências de 13-16 dígitos** que o regex de cartão pegou são **IMEI**
(15 dígitos, `354222852869496`). Loja de celular — legítimo.

### Uma divergência estrutural, inerte

`direction` tem **dois vocabulários** para a mesma coisa:

| valor | registros | período |
|---|---|---|
| `outbound` | 15.212 | 27/02 → 23/05 |
| `inbound` | 5.954 | 27/02 → 23/05 |
| `outgoing` | 12.372 | 03/06 → hoje |
| `incoming` | 11.249 | 03/06 → hoje |

O corte é limpo em junho. **Não é achado**: verifiquei o runner do Talison
(`runner.ts:165-168`) e ele decide o papel de quem falou por **`senderType`**,
nunca por `direction`. Nenhum leitor filtra pelo campo. É dívida cosmética, e
"corrigir" faria um UPDATE em 21 mil linhas históricas sem ganho.