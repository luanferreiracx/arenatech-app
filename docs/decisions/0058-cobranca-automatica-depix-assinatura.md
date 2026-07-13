# ADR 0058 — Cobrança automática da assinatura via DePix (self-service + webhook)

## Status
Proposto — 2026-07-12

## Contexto

O billing da assinatura é **manual** (ADR anterior / #511-#531): o superadmin clica
"Marcar como pago" e o `currentPeriodEnd` avança 1 ciclo. Isso não escala e depende de
intervenção humana. Já temos:

- `createPixPayment` (depix-service): gera QR PIX/DePix apontando para um endereço
  destino (a conta CENTRAL da Arena, `DEPIX_ADDRESS`).
- Webhook Eulen (`/api/webhooks/eulen`) que confirma pagamentos DePix.
- `TenantDepixTransaction` com `sourceType`/`sourceId` para correlacionar um
  pagamento a um documento de negócio.
- Cron de vencimento (#529): `ACTIVE`→`PAST_DUE`→`SUSPENDED` com carência.
- `markSubscriptionPaid` (admin): a transição de estado que a automação precisa disparar.

## Restrição decisiva: QR DePix expira em 30 minutos

O dono confirmou: **o QR tem validade de 30 min**. Logo, **não** se pode gerar o QR
no vencimento pelo cron e esperar o tenant pagar — ele estaria expirado quando o tenant
fosse olhar. O QR precisa ser gerado **sob demanda**, no momento em que o tenant decide
pagar.

## Decisão

Cobrança = **auto-atendimento de pagamento (self-service) + confirmação automática por
webhook**. Não é o cron gerando cobrança; é o tenant pagando quando quer, e o sistema
renovando sozinho ao confirmar.

Fluxo:

1. Em `/settings/subscription`, o tenant vê o vencimento e um botão **"Pagar
   assinatura"**. (Destaque quando `PAST_DUE` ou perto do vencimento.)
2. Clicar gera um QR DePix **na hora** (válido 30 min) via `createPixPayment`, sem
   override de endereço → cai no `DEPIX_ADDRESS` **CENTRAL** da Arena (o tenant paga a
   plataforma). O charge é uma `TenantDepixTransaction` do tenant CENTRAL (arena-tech)
   com `sourceType = SUBSCRIPTION` e `sourceId = subscriptionId`.
3. A tela mostra o QR + copia-cola + status ao vivo (polling), com contador de
   expiração (30 min). Expirou sem pagar → o tenant gera outro.
4. O **webhook Eulen** já confirma esse depósito (pipeline existente). No efeito de PIX
   recebido (`applyPixReceivedEffects`), um novo ramo `sourceType = SUBSCRIPTION` chama
   `renewSubscriptionFromPayment(subscriptionId)` de forma **idempotente**.
5. Inadimplência: se não pagar, o cron #529 já cuida (PAST_DUE → suspende após carência).
   Sem escopo novo de inadimplência nesta fase.

### Reuso (via negativa: menos código)
Em vez de um modelo `SubscriptionPayment` paralelo que duplicaria toda a máquina de
depósito/confirmação, o charge REUSA `TenantDepixTransaction` (novo valor de enum
`SUBSCRIPTION` em `DepixTransactionSourceType`) no tenant CENTRAL. Todo o pipeline de
webhook (approved → PROCESSING → COMPLETED, cross-check anti-forja, dedup de evento) já
existe e serve. Só se adiciona o RAMO de efeito de negócio "renovar assinatura".

### Direção do dinheiro
O QR credita a conta CENTRAL (Arena) via default do `createPixPayment`. Sem débito de
saldo do tenant nesta fase.

### Idempotência (dinheiro)
O webhook pode chegar mais de uma vez (retry Eulen). A renovação é **idempotente**: um
depósito confirmado só empurra o período UMA vez — CAS via `updateMany` guardando o
avanço por uma marca no próprio depósito (`subscriptionAppliedAt`) e/ou pela regra de
que o período só avança se o pagamento for do ciclo corrente. O avanço acontece dentro
da transição vencedora (mesma disciplina do `applyDepositSaleEffects`).

## Alternativas consideradas

- **Cron gera QR no vencimento** — rejeitado: QR expira em 30 min, o tenant não está
  olhando na hora.
- **Débito automático do saldo DePix do tenant** — adiado (fase 2): nem todo tenant tem
  saldo; mexe na carteira non-custodial (exige a chave, que o servidor não tem).
- **Reenvio/lembrete de cobrança (WhatsApp/email)** — adiado (fase 2): melhora
  conversão mas adiciona escopo de notificação.

## Consequências

Positivas: fecha o loop do billing manual; reusa 100% da infra DePix; blast radius
controlado (só adiciona um caminho de pagamento). Idempotência protege contra
duplo-crédito de período.

Negativas / a vigiar: depende do webhook Eulen (mesmo SLA dos demais depósitos); o
tenant precisa agir (não é débito compulsório). Observabilidade: logar cada geração de
QR e cada confirmação, com métrica de conversão (gerados vs pagos).

Rollout: **ligado geral ao mergear** (decisão do dono). Sem flag — o botão aparece pra
todo tenant com assinatura. O caminho manual (superadmin "Marcar como pago") permanece
como fallback.
