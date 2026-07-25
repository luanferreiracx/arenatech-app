# Auditoria geral — 2026-07-25

> Varredura módulo a módulo do sistema inteiro, com protocolo de 4 rodadas
> (skills `audit-fullstack`, `audit-backend`, `audit-frontend`, `audit-security`).
> **Todo achado de dinheiro/estoque foi provado por teste de integração que
> FALHA antes da correção.** Os números de impacto foram medidos contra o banco
> de **produção** (consultas read-only; o backfill foi validado em transação com
> ROLLBACK).
>
> **Fora de escopo por decisão do dono:** módulo NF-e import (aguarda decisão de
> qual API usar).

---

## Resumo executivo — top 5 por severidade × probabilidade × blast radius

| # | Achado | Impacto medido | Estado |
|---|---|---|---|
| 1 | DRE subestimava a despesa: ledger não recebia lançamento à vista | **R$ 342.130,00** de despesa invisível (24% do ano); lucro inflado | PR #698 |
| 2 | IDOR no bot Talison: OS e cadastro de outro cliente pelo WhatsApp | Vazamento de dado pessoal por canal público (LGPD) | PR #697 |
| 3 | Peça na OS nunca funcionou (enum sem RESERVE/RELEASE) | 235 itens de OS em prod, **0 do tipo PRODUCT** | ✅ #694 |
| 4 | Termo de devolução gravava CANCELLED sem cancelar nada | Estoque preso, recebível fantasma, bypass de RBAC | ✅ #694 |
| 5 | Estorno parcial duplicava caixa e estoque sob concorrência | Duas saídas de caixa e estoque em dobro por devolução | ✅ #696 |

---

## 1. DRE subestimava a despesa em R$ 342 mil (P0 — PR #698)

**Causa raiz.** A linha de despesa do DRE e o `stats.paidMonthAmount` leem
**só** de `installment_payments` (correção FIN-B2, que acertou o regime de
caixa). Mas só `payInstallment`/`reverseInstallment` escreviam nesse ledger.
Lançamentos que **nascem PAID** nunca chegavam lá:

- compra de aparelho à vista (`stock.ts`) — FT PAID **sem parcela nenhuma**
- venda à vista não-cartão (`sale.ts`) — idem
- OS paga em dinheiro/pix (`service-order.ts`) — criava a parcela, não o ledger
- estorno de OS — cancelava a parcela PAID sem lançar a contrapartida negativa

O backfill da migration original cobriu o histórico *uma vez*; todo pagamento
posterior por esses caminhos ficou fora.

**Medição em produção (2026):**

```
despesa que o DRE mostrava   R$ 1.107.499,99
despesa real                 R$ 1.449.629,99
despesa invisível            R$   342.130,00   (62 compras de aparelho)
receita fora do "recebido"   R$   266.952,33   (425 registros)
```

Numa loja de aparelhos, a compra de estoque é o maior item de despesa que
existe — e era exatamente o que sumia.

**Correção.** `installment-ledger.service` como ponto único de escrita
(`recordCashPaidTransaction` / `recordInstallmentPayment`) + migration de
backfill idempotente. Dry-run contra produção em `BEGIN…ROLLBACK`: 486 parcelas
+ 486 linhas de ledger, despesa 1.107.499,99 → 1.449.629,99, **zero divergência**
entre a soma do ledger e o `paid_amount`.

**Teste-guardião:** toda FT PAID tem a soma do ledger batendo com `paid_amount`.

---

## 2. IDOR no Talison — vazamento de dado de cliente (P0 — PR #697)

Duas tools montavam o `where` com ternário **excludente**: informado o
identificador, o filtro de dono era **descartado**.

- `consultar_status_os` / `verificar_garantia`: com `numero_os`, o `where` virava
  só `{tenantId, number}`. O número da OS é **sequencial** — qualquer contato no
  WhatsApp lia a OS de qualquer outro cliente (aparelho, status, previsão,
  **valor total**). A mensagem de erro dizia "encontrada para este contato",
  escopo que o código não aplicava.
- `buscar_cliente`: com `cpf`, ignorava o telefone do contato e casava qualquer
  CPF do tenant → **oráculo CPF→nome**, com o argumento controlado pelo texto
  livre do cliente.

Também fechado: **prompt-injection** pelo `contactName` (nome do perfil do
WhatsApp, atacante-controlado) que entrava cru no system prompt, fora do bloco
delimitado do ADR 0055 e antes da reafirmação das guardas.

**Prova:** sem o fix, o contexto do atacante retorna `ok: true` com os dados da
vítima. Com o fix, 4/4 verdes — incluindo o controle de que o **dono legítimo
continua consultando a própria OS**.

---

## 3. Peça na OS nunca funcionou — drift de enum (P0 — ✅ #694)

O `schema.prisma` declara `StockMovementType.RESERVE/RELEASE` desde o fluxo
"peça na OS", mas **nenhuma migration adicionou os valores ao banco**.

**Prova em produção:** 235 `service_order_items`, **100% SERVICE, zero PRODUCT**;
zero `stock_movements` RESERVE/RELEASE. A UI oferece "Produto/Peça" em dois
lugares. Sem corrupção (decremento e insert na mesma transação → rollback), mas
a funcionalidade nunca funcionou.

Varri **todos os 58 enums** do schema contra produção: era o único com drift real.

---

## 4. Termo de devolução não cancelava de verdade (P0 — ✅ #694)

Havia **4 caminhos** gravando `status: "CANCELLED"` e só o `cancel` fazia o
trabalho:

| | `cancel` | termo de devolução |
|---|---|---|
| guard de status | ✅ | ❌ |
| libera estoque reservado | ✅ | ❌ |
| cancela recebíveis pendentes | ✅ | ❌ |
| CAS anti-concorrência | ✅ | ❌ |
| RBAC | ✅ | ❌ |

Consequências: peça reservada **sumia do inventário para sempre**; parcelas de OS
cancelada seguiam vencendo; **operador comum cancelava OS PAGA** sem estorno
(o `refund` depois fica inalcançável, pois não aceita CANCELLED).

**Correção estrutural:** `applyOsCancellation` como ponto único; os 4 caminhos
passam por ele, inclusive o `cancel` (que agora delega em vez de duplicar).

---

## 5. Estorno parcial duplicava caixa e estoque (P1 — ✅ #696)

O filtro `total > 0` roda sobre o snapshot lido no início da transação. Sob
READ COMMITTED, dois estornos simultâneos das mesmas linhas passam os dois — e o
CAS de status **não os separa**, porque no parcial aceita `PARTIALLY_REFUNDED`
como estado de entrada **e** de saída.

Provado: duplo-clique → `expected 2 to be 1`, dois `Sale refunded` no log,
estoque em dobro e duas saídas de caixa. O estorno **total** já era seguro.

**Correção:** claim das linhas (`updateMany` com guarda `total > 0`) **antes** de
qualquer efeito.

---

## 6. `stock.entryQuantity` criava saldo fantasma (P0 — ✅ #696)

O saldo tem 3 regimes (`resolveCurrentStockByProduct`): serializado =
`COUNT(StockItem)`, com variações = `SUM(variação)`, simples = `currentStock`.
`entryQuantity` aceitava **qualquer** produto e escrevia direto em
`product.currentStock` → saldo gravado no banco e no kardex, **invisível em toda
a UI**. No produto com variações ainda sobrescrevia o `costPrice` do pai com
média ponderada sobre saldo irreal (corrompe o CMV).

As 5 procedures irmãs já tinham o guard; essa era a única sem.

---

## Backlog — achados reais ainda NÃO corrigidos

Ordenados por risco. Todos verificados no código; nenhum foi corrigido nesta
rodada por serem decisão do dono ou por escopo.

### Segurança / monetização

1. **API-key de parceiro sobrevive à suspensão do tenant** (P1) —
   `validatePartnerApiKey` checa só `revokedAt`, nunca `Tenant.status` nem
   `apiAccessEnabled`. Tenant suspenso/cancelado continua sacando via
   `POST /api/v1/partner/depix/withdrawals` (dinheiro irreversível). O toggle do
   painel não tem efeito sobre o tráfego REST.
2. **Gating de módulo não existe no tRPC** (P1) — o gate por plano vive só no
   proxy e **pula `/api/*`** (decisão documentada após um incidente: o redirect
   307 quebrava o cliente JSON). Tenant wallet-only chama `stock.*`, `sale.*`,
   `financial.*` direto pela API. Não é cross-tenant (RLS segura), é bypass de
   **monetização** — o plano vira preferência de UI.
3. **Fiscal/communication/operation sem `isTenantAdmin`** (P2) — qualquer membro
   autoriza/cancela NF-e, dispara WhatsApp para telefone arbitrário, reverte
   opt-out de LGPD e gera PAYABLE no laboratório.

### Dinheiro

4. **`autoCloseAbandonedSessions` fabrica saldo contado** (P1) — grava
   `declaredBalance = calculatedBalance, difference = 0` (o anti-padrão que o
   `forceClose` já corrigiu) e **sem CAS**: pode sobrescrever um fechamento
   manual concorrente. Divergência real de gaveta vira "R$ 0,00 conferido".
5. **`payInstallment`/`reverseInstallment` sem `lockOpenCashSessionOrThrow`**
   (P1) — escrevem na gaveta sem travar a sessão; o `cashier.close` pode fechar
   no meio. O helper já existe e é usado 4× no mesmo módulo.
6. **`financial.cancel` sem CAS** (P2) — cancela FT enquanto uma parcela é paga
   em paralelo → conta CANCELLED com `paidAmount > 0` e dinheiro na gaveta.
7. **`cashFlow` usa `installment.paidAt`** (P2) — terceiro consumidor que o
   FIN-B2 não migrou para o ledger; diverge de `stats`/DRE no pagamento
   multi-mês.
8. **Comissão duplicada em OS intermediada** (P1) — o filtro de participação
   exclui o técnico mas não o `vendorId`; prestador com regra de intermediação
   **e** de participação comissiona duas vezes a mesma OS.
9. **Modo do balde de comissão não-determinístico** (P1) — `sorted[0]` define
   `valueType`/`base` do balde e o `findMany` das regras **não tem `orderBy`**;
   a mesma apuração pode mudar entre dois `calculate`.

### Fiscal

10. **NF-e duplicada para a mesma venda** (P1) — sem guard de nota ativa por
    `referenceId` e sem unique; duplo-clique gera duas notas válidas na SEFAZ.
11. **Venda estornada mantém NF-e ativa** (P1) — os dois lados são
    independentes; imposto sobre receita inexistente.
12. **`inutilizar` retorna `{success: true}` sem fazer nada** (P1) — mock sem o
    gate de produção que a emissão tem.

### Fidelidade / catálogo

13. **`lockBalance`/`unlockBalance` sem CAS** (P1) — saldo de cashback pode ficar
    negativo; sem CHECK constraint como rede.
14. **Caps de campanha são TOCTOU** (P1) — `rewardLimit`/`maxActive` burláveis
    por claims concorrentes; `totalParticipants` conta claims, não clientes.
15. **`bulkAdjustPrice` sem admin e sem teto** (P0 no papel, P1 na prática) —
    operador reajusta o catálogo de serviços inteiro sem limite e sem
    `logAudit`. O irmão `bulkAdjustPrices` tem os dois guards.
16. **`reward` sem `isTenantAdmin`** (P1) — `updateCampaign` muda valor/percentual
    da campanha (vira desconto real no PDV); `expireOverdue` exposto como
    procedure duplica o cron.
17. **Tipo de serviço é texto livre** (P1) — as 5 operações "por tipo" casam por
    igualdade exata: "Troca de Tela" ≠ "troca de tela". Reajuste em massa não
    pega as linhas com outra caixa. Mesma armadilha do Asus/ASUS já resolvida no
    estoque com `findOrCreateBrandByName`.

### Frontend

18. **Diálogos destrutivos de OS fecham antes do `isPending`** (P0 de UX) —
    `mutate()` + `dialog.close()` no mesmo tick anula o guard de duplo-submit em
    estorno/cancelamento/exclusão. Sem feedback, o operador clica de novo.
19. **"Salvar custos" da OS sem `disabled`** (P1) — custo é base de comissão e
    margem; duplo-clique polui a auditoria.
20. **Badge "Caixa aberto" nunca invalidado** (P1) — o PDV mostra caixa aberto
    depois de fechado em outra aba; a venda monta e falha no último clique —
    exatamente o cenário que o recurso existe para evitar.
21. **Input de liquidação de recebível re-formata a cada tecla** (P2) — único
    campo de dinheiro que não usa o `MoneyInput`.

### Higiene

22. **`webhook_events` sem retenção** (P2) — payload JSON de todo webhook,
    indefinidamente, em tabela de escrita quente.
23. **Secrets de webhook fora dos templates de deploy** (P2) — 5 envs ausentes de
    `.env.example`/runbook; fail-closed (503), então vira indisponibilidade
    silenciosa num redeploy limpo.
24. **165 de 850 `z.string()` sem `.max()`** (P2) — campos de busca que alimentam
    `contains`.

---

## Decisões boas que devem ser preservadas (Chesterton's Fence)

Registrado para ninguém "simplificar" isto depois:

1. **`withTenant` = transação + `SET LOCAL` + `SET ROLE app_user`** — atomicidade
   e isolamento são estruturais, não disciplina de call-site. RLS **ENABLE +
   FORCE em 109/110** tabelas (`user_tenants` é global por design).
2. **DePix mantém HTTP externo FORA das transações** — o serviço quebra o fluxo
   em transações curtas de propósito, para não segurar conexão do pool na
   latência da Eulen/LWK. Cada guard rastreia um incidente real (advisory lock
   anti-saque-concorrente, nonce idempotente, guard de expiração, cache
   fail-open).
3. **Router `depix-withdraw` legado é um túmulo deliberado** — as escritas
   lançam `FORBIDDEN` apontando para o fluxo correto, e as leituras seguem. É
   documentado no código. **Não "reativar" nem apagar sem ler o comentário.**
4. **Anti-forja do crédito DePix** — mesmo com o secret vazado, um `approved`
   forjado não libera venda: revalida via canal separado (API-key) e é
   fail-safe. O crédito de saldo exige cross-check on-chain independente.
5. **`MoneyInput`** — acumula dígitos crus e formata só na saída; é a razão de o
   sistema não ter bug de vírgula pt-BR nos formulários de dinheiro.
6. **`payment-dialog` do PDV** — guard de reentrância + `autoFinalizeAttemptedRef`
   contra o SSE do DePix disparar duas finalizações. O fluxo mais crítico do
   sistema, bem defendido.
7. **Crons** — 11/11 com `CRON_SECRET` timing-safe; `withCronLock` com lease
   atômico (`INSERT … ON CONFLICT … RETURNING`), imune a pool de conexões.

---

## Áreas de baixa confiança / não cobertas

- **NF-e import** — fora de escopo por decisão do dono. Há achados levantados
  (serializado importa sem criar StockItem; custo sobrescrito em vez de média
  ponderada; sem CAS no PENDING→PROCESSING; sem admin gate) que devem ser
  revisitados **quando a API for escolhida** — podem virar irrelevantes se o
  módulo for substituído.
- **Comportamento de provedor externo** — frequência real de `refunded` da Eulen
  para saque já varrido, e se a Autentique de fato envia a assinatura, ficaram
  como hipótese (não dá para confirmar por leitura de código).
- **Validação empírica no browser** — os achados de frontend saíram de leitura
  de código, não de sessão real com CDP. O item 21 (input de liquidação)
  merece reprodução no navegador para medir a severidade exata.
- **Testes de integração não rodam em paralelo** no mesmo Postgres local
  (compartilham caixa/draft) — usar `--no-file-parallelism` ao validar. Lição
  já registrada no PROGRESS e reconfirmada nesta rodada.
