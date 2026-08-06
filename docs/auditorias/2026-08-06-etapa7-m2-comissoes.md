# Etapa 7 · Módulo 2 — Comissões

> Varredura por módulo. Skill `audit-backend`, três provas.
> Data: 2026-08-06.

## O fato que orienta tudo

**9 apurações em produção, todas `OPEN`. Nenhuma jamais foi fechada.**

O `closeApuracao` — que gera o PAYABLE e cria a dívida da loja com o prestador —
é código **nunca exercitado por dado real**. Todo o hardening dele (recompute
antes de fechar, CAS, ordem de operações) foi feito às cegas.

E o único teste de integração que o cobre
(`__tests__/integration/close-apuracao.test.ts:42-72`) é, por admissão própria,
uma **cópia manual** do resolver — que **omite a chamada ao recompute**. Ou seja:
testa a versão anterior ao fix que o próprio código documenta como C2.

---

## Prova de dado

| checagem | resultado |
|---|---|
| `net = bruto − reversals + ajuda − teto` | **bate em todas as 9** |
| `net_amount` negativo | 0 |
| CLOSED/PAID sem `closed_at` | 0 |
| apuração duplicada (prestador/mês) | 0 |
| regras órfãs (sem contrato) | 0 |
| apuração sem contrato | 1 — **a zerada**, benigna |

Cheguei a suspeitar de `net_amount > gross_commission` em todas. Era a **ajuda de
custo** (`total_allowance`), e a fórmula fecha exatamente. Falso alarme meu,
registrado.

Outro dado: **0 OS com `service_provider_id`** (249 têm `technician_id`) — a
comissão vem de **vendas**, não de OS.

---

## Achado A — Estorno lia o mês no fuso do processo (P1) — ✅ CORRIGIDO

`provider-reversal.service.ts:59-60` derivava o mês do fato com
`getFullYear()`/`getMonth()`, que respondem no fuso do **processo**.

**Produção roda em UTC** (confirmado: `TZ=` vazio no container).

Provado por execução:

```
Venda de 31/07/2026 22:00 BRT  →  julho para a loja
  processo em America/Sao_Paulo  →  getMonth() devolve 7  ✅
  processo em UTC (produção)     →  getMonth() devolve 8  ❌
```

Com o mês errado, o estorno procura a apuração de **agosto**, não acha a de
julho, e cai no `return` do guard `status === "OPEN"` (`:65`). **A comissão
indevida nunca é estornada.**

### É a quarta instância da mesma família

O projeto já corrigiu este bug em três lugares, todos com comentário nomeando-o:

| onde | o que corrigiu |
|---|---|
| `month-range.ts:12-19` (J3) | janela do mês — cita literalmente *"venda de 31/jul 22:00 BRT vazava para agosto"* |
| `month-range.ts:29-39` (CM-1) | dias do mês para a ajuda de custo |
| `provider-commission.ts:58-62` | `assertApuracaoAberta`, usando `getUTC*`, com o comentário *"Mesma família do CM-1"* |

O estorno ficou de fora. **A correção fechou a instância, não a classe** — pela
oitava vez neste programa.

### O fix

`monthOfDate()` em `month-range.ts`, ancorada em `America/Sao_Paulo` — a inversa
de `monthRange`, na mesma fonte única. Uma regra, um lugar.

### Uma fragilidade que encontrei no meu próprio teste

O primeiro teste que escrevi **passava mesmo com o bug** quando o processo roda
em BRT (minha máquina) — só falhava em UTC. O CI não fixa `TZ`, então depender do
fuso do runner é sorte.

Acrescentei um caso que afirma a **regra** (`monthOfDate` direto), não o efeito
colateral do fuso. Verificado: quebrando a função, dois casos falham **em
qualquer fuso**.

---

## Achados documentados, não corrigidos

Ordenados por consequência. Nenhum sangra hoje — todos dependem de um
fechamento de apuração, que nunca aconteceu.

| # | achado | evidência |
|---|---|---|
| B | `status = PAID` e `paidAt` **nunca são escritos** — o ciclo morre em CLOSED, sem reconciliação com o PAYABLE | `commission.prisma:28,131`; 0 escritas no repo |
| C | Evento sem regra correspondente é **descartado em silêncio** — venda some da apuração sem aviso nem telemetria | `compute-lines.ts:106` |
| D | `Math.max(0, ...)` no `netAmount` **descarta saldo devedor** do prestador; sem carry-forward | `commission-preview.service.ts:466` |
| ~~E~~ | ~~O teste de `closeApuracao` é cópia manual que omite o recompute~~ ✅ **CORRIGIDO** — passa a chamar o resolver real; a asserção corrompe o valor para 99.999 e exige que o PAYABLE saia com 250 (prova de que o recompute rodou). Verificado: reintroduzindo o valor stale, os 3 casos quebram | `close-apuracao.test.ts` |
| F | Sem unique no banco em `FinancialTransaction(referenceType, referenceId)` — PAYABLE único é garantia só comportamental | `financial.prisma:82-88` |
| G | `financialTransactionId` **sem FK** — ponteiro solto | `commission.prisma:132` |
| H | `recomputeProviderApuracao` não checa status; TOCTOU `calculate` × `closeApuracao` pode sobrescrever apuração já selada | `commission-preview.service.ts:437,480` |
| I | Sem `@@unique([providerId, day])` em `ProviderUncoveredDay`; toggle é TOCTOU | `commission.prisma:167-176` |
| J | Validador "um modo por balde" só roda em `updateRules` — as 15 regras atuais nunca foram revalidadas | `validators/provider-commission.ts:366-386` |
| K | Fechar apuração (criar dívida) não gera `AuditLog`, só `logger.info` | `provider-commission.ts:512-516` vs. `sale.ts:2938-2949` |
| L | `dailyMeal`/`dailyTransport` são valores **mensais**, não diárias — o nome mente no schema, validators e UI | `allowance.ts:5-6` |

**Por que não corrigi agora:** B, D, F, G, H e K só se manifestam **depois** do
primeiro fechamento. Corrigi-los antes de o fluxo rodar uma vez é trabalho sobre
comportamento não observado — e o achado E diz que nem o teste observa. A ordem
sensata é: **fechar uma apuração de verdade primeiro**, com acompanhamento, e
então tratar o que aparecer.

---

## O que está genuinamente bem defendido

- **Autorização:** 100% das mutations são `tenantAdminProcedure`. Operador não
  fecha apuração. Alinhado com o ADR 0053, coberto por teste de integração.
- **Idempotência do `calculate`:** `upsert` com valores **absolutos**, não
  incrementos. Clicar 3× não triplica.
- **Idempotência do estorno por delta** (`:77-92`) e o anchor em mês aberto
  (`:226-253`) — reversal cai num mês que o `calculate` ainda vai processar.
- **Anti-double-count:** `sellerId: {not: provider.userId}` (`:86`) e
  `vendorId: {not: provider.userId}` (`:265`) impedem a mesma venda contar como
  OWN e STORE.
- **Ordem estável das regras** (`:344`, `:404`) — o comentário registra que sem
  isso "a MESMA apuração podia mudar sozinha entre dois cálculos".
- **Fuso dos dias do mês (CM-1) e da janela (J3)** — corrigidos e comentados.
- **`closeApuracao`:** recompute antes de fechar, CAS, tudo em transação única,
  `withAdmin` fora da tx para não segurar duas conexões.

## Baixa confiança

- **Não exercitei um fechamento real.** Seria a única forma de validar o caminho
  principal — e exigiria decisão sua, porque cria dívida contábil.
- **Não naveguei as telas** deste módulo (a prova 3 ficou só no M1). O crawler
  cobriu `/commissions` na Etapa 6 sem erro, mas não inspecionei botões por papel.
- **Achados F, G, I** são de schema e exigiriam migration — não avaliei o custo.
