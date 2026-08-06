# Etapa 7 · Módulo 4 — Interesses (leads)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-06.

## Prova de dado

119 leads (114 WAITING, 5 COMPLETED), ativo — lead de hoje. Todos com nome e
telefone: **PII de gente que ainda não é cliente**.

| checagem | resultado |
|---|---|
| Leads WAITING cujo telefone **já comprou** | **0** — a conversão automática funciona (era o bug #503-#508) |
| COMPLETED sem `customer_id` | 0 |
| `convertedToSaleId` apontando para venda inexistente | 0 |
| `convertedToSaleId` de **outro tenant** | 0 |
| Leads órfãos (tenant inexistente) | 0 |
| Opt-outs registrados em produção | **0** |

Os 96% em WAITING são taxa de conversão do negócio, não bug — verifiquei
explicitamente que nenhum lead em espera já havia comprado.

---

## M4-1 — Opt-out de LGPD inalcançável para lead sem Customer — ✅ CORRIGIDO

**114 dos 119 leads não têm `Customer`.** O opt-out do sistema vivia só em
`Customer.unsubscribed`, e `communication.unsubscribeCustomer` exige
`customerId: uuid`.

Consequência: **se um desses leads responde "PARE" no WhatsApp, o operador não
tem onde registrar.** As saídas eram criar um `Customer` fictício só para
marcá-lo, ou apagar o lead — hard delete que destrói a prova de que o pedido foi
atendido.

### O que já estava certo

O **gate** do disparo em massa era bom: casa por `customerId` **ou** por
telefone, com o comentário do CL-2 explicando que *"o opt-out é da PESSOA, não do
registro"*. Alguém já tinha pensado nisso.

O que faltava era a **porta de entrada**. A defesa contra furar o descadastro
existia; a maneira de se descadastrar, não.

### O fix

- `Interest.unsubscribed` + `unsubscribedAt` (migration com índice parcial —
  quem pede para sair é minoria por natureza)
- `unsubscribeInterest()` — serviço idempotente: pedir duas vezes **não reescreve
  a data do primeiro pedido**, porque o carimbo é a evidência de *quando* a
  pessoa pediu
- `interest.unsubscribe` — **não é admin-only de propósito**: quem recebe o
  "PARE" é quem atende o WhatsApp. Exigir admin criaria atrito para cumprir a lei
- O filtro do lote passa a checar as **três** formas: o próprio lead, o Customer
  vinculado, e o telefone

**Sem backfill.** Inventar consentimento retroativo seria pior do que admitir a
lacuna — mesmo critério do aceite de termos (ADR 0065).

O teste de integração afirma o **efeito**, não só o registro: um campo
`unsubscribed` que ninguém consulta seria pior que não ter, porque daria a
impressão de que o pedido foi atendido. Verificado desligando o filtro — o teste
quebra.

---

## Achados documentados, não corrigidos

| # | achado | por que não agora |
|---|---|---|
| **M4-2** | Apagar o cliente **não apaga o lead** — `interests.customer_id` não tem FK (a tabela foi recriada "autonomous, no FK", migration de 15/05) | É decisão de produto sobre **retenção**, não bug isolado: envolve definir por quanto tempo lead vira dado morto e se erasure de cliente deve varrer leads. Precisa da sua decisão |
| **M4-3** | `markConverted` aceita `saleId`/`osId` arbitrário sem verificar existência nem tenant | **0 corrompidos** em produção. Latente |
| **M4-4** | `markConverted`, `addInteraction` e `sendBatch` escrevem status sem CAS — `updateStatus` tem | Corrida entre operadores do mesmo tenant; sem incidência medida |
| **M4-5** | Três convenções de match de telefone convivem: `endsWith(8)`, comparação em memória, `contains(9)` no bot | O `contains(9)` do bot pode casar telefones diferentes. Sem colisão nos dados atuais (medido) |
| **M4-6** | **Zero retenção/expurgo** de PII de não-cliente | Mesma decisão do M4-2 |
| **M4-7** | Sem rate limit em nenhuma procedure do módulo | Cap de 5 por lote + cooldown de 24h por lead já limitam muito |
| **M4-8** | UI mostra "Enviar WhatsApp" ao operador, que recebe FORBIDDEN | Mesma classe do M1-2, que corrigi. Aqui o botão é de lote, não destrutivo |

**39% dos leads têm 15-16 dígitos no campo `phone`** — são IDs do Instagram
(um deles tem `(@pe.drk)` no nome). Não é bug: o canal grava assim. Mas alimenta
o M4-5, porque `phoneMatchKey` usa os últimos 8 dígitos e IDs longos podem
colidir. **Medido: 0 colisões** nos dados atuais.

---

## O que está bem defendido

- **Conversão automática funciona** — 0 leads WAITING cujo telefone já comprou
- **`sendBatch` é admin-only** (B1), com **cap de 5** por lote no schema
- **Cooldown de 24h** por lead (B5) — `lastNotifiedAt` era gravado e nunca lido
- **HTTP fora da transação** (gap In1) — microtransações por lead, então falha no
  meio não reenvia o que já saiu
- **CAS em `updateStatus`** com `count !== 1` → CONFLICT
- **Nenhuma procedure pública** — não há captura anônima de lead, então não há
  superfície de spam externo
- **Normalização de telefone em todas as portas de escrita** + migration de
  backfill

## Baixa confiança

- **Não naveguei as telas** deste módulo — a prova 3 ficou no M1 e M3.
- **Não testei o caminho do bot** criando lead (auditado na Etapa 5, mas não
  reexercitado aqui).
- **O `contains(9)` do bot** é o achado com maior chance de morder e o que menos
  consegui medir: exigiria dois contatos com sufixos sobrepostos.
