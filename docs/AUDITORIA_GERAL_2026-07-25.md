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

> **Atualização:** o backlog vem sendo atacado por ordem de risco. Já fechados:
> **#700** (API-key pós-suspensão · gating de módulo no tRPC · cron de caixa
> fabricando saldo), **#702** (comissão dupla em OS intermediada · balde de modo
> misto não-determinístico), **#703** (NF-e duplicada), **#711** (lock de caixa
> no `payInstallment`/`reverseInstallment` · CAS no `financial.cancel` · saldo de
> cashback não-negativo) e **#714** (reajuste/exclusão em massa só-admin com teto
> · caps de campanha com CAS · `cashFlow` pelo ledger e em BRT) e **#717**
> (fidelidade só-admin · diálogos destrutivos da OS com feedback), **#719**
> (desfazer documento fiscal e reverter opt-out só-admin · rate-limit no envio),
> **#720** (badge de caixa se autocorrige · input de liquidação) e **#721**
> (retenção de `webhook_events` · secrets nos templates). Ficam riscados abaixo,
> com o registro do que mudou.
>
> Em 2026-07-27 o dono decidiu os quatro achados que dependiam dele e as
> correções entraram: **#723** (estorno barrado com NF-e viva · `inutilizar`
> falha explicitamente · lab order não gera conta a pagar) e **#724** (tipo de
> serviço vira entidade, com backfill e select na UI).
>
> **Resta 1 achado:** o 24 (`z.string()` sem `.max()` em 165 de 850 campos).

Ordenados por risco. Todos verificados no código; nenhum foi corrigido nesta
rodada por serem decisão do dono ou por escopo.

### Segurança / monetização

1. ~~**API-key de parceiro sobrevive à suspensão do tenant**~~ — ✅ **CORRIGIDO
   (PR #700).** A validação virou fail-closed (exige `ACTIVE` +
   `apiAccessEnabled`) e suspender/cancelar o tenant passa a revogar as keys.
2. ~~**Gating de módulo não existe no tRPC**~~ — ✅ **CORRIGIDO (PR #700).**
   `tenantProcedure` resolve o módulo pelo namespace do path e recusa com
   FORBIDDEN — erro tRPC em JSON, nunca redirect, então não reintroduz o
   incidente do 307. Cobre as ~310 procedures numa checagem central.
3. ~~**Fiscal/communication/operation sem `isTenantAdmin`**~~ — ✅ **CORRIGIDO
   (PR #719).** Viraram admin: `fiscal.cancel`, `fiscal.correctionLetter` e
   `communication.resubscribeCustomer` (reverter opt-out de LGPD). **Decisão do
   dono:** EMITIR NF-e (`authorize`) continua livre — é rotina de balcão, e
   desfazer, que é o estrago maior, agora é só-admin. `unsubscribeCustomer`
   (registrar o opt-out) também segue livre: é o operador atendendo o cliente.
   `operation.updateLabOrderStatus` **não** foi gateado — ver o item 20.

4. ~~**`autoCloseAbandonedSessions` fabrica saldo contado**~~ — ✅ **CORRIGIDO
   na PR #700.** `declaredBalance`/`difference` ficam NULL e o update virou CAS
   em `closedAt: null`.
5. ~~**`payInstallment`/`reverseInstallment` sem `lockOpenCashSessionOrThrow`**~~
   — ✅ **CORRIGIDO (PR #711).** Os dois passaram a travar a sessão antes de
   escrever, como os 4 escritores de `cashier.ts` já faziam.
6. ~~**`financial.cancel` sem CAS**~~ — ✅ **CORRIGIDO (PR #711).** CAS
   ancorado em `status` E `paidAmount`, o que cobre também o pagamento PARCIAL
   (`PARTIALLY_PAID`) que o guard de `status === "PAID"` não pegava.
7. ~~**`cashFlow` usa `installment.paidAt`**~~ — ✅ **CORRIGIDO (PR #714).**
   Passou a ler do ledger `installment_payments`, como `stats` e o DRE. Ao
   corrigir apareceu um 2º bug na mesma função: a janela e o agrupamento por dia
   ignoravam o fuso (UTC em vez de BRT). Medido em produção: **359 pagamentos,
   R$ 1.428.511,25** (21% do total) feitos após 21h BRT eram reportados no DIA
   SEGUINTE. Agora usa `startOfDayBrt`/`endOfDayBrt`/`brtDayKey`.

8. ~~**Comissão duplicada em OS intermediada**~~ — ✅ **CORRIGIDO (PR #702).**
   O filtro de participação passou a excluir também o `vendorId`, espelhando o
   guard que as vendas já tinham. Decisão do dono: quem vendeu ganha pela
   intermediação e não entra como participação.
9. ~~**Modo do balde de comissão não-determinístico**~~ — ✅ **CORRIGIDO
   (PR #702).** O validador rejeita `valueType`/`base` divergentes no mesmo
   balde e as consultas ordenam por `(rangeMin, id)`. Produção tinha 0 contratos
   mistos — a validação nova não quebrou nenhum existente.

### Fiscal

10. ~~**NF-e duplicada para a mesma venda**~~ — ✅ **CORRIGIDO (PR #703).**
    Guard `assertNoActiveInvoiceFor` nas duas procedures + índice único PARCIAL
    no banco (CANCELLED/REJECTED de fora, porque reemitir após cancelar é o
    fluxo normal).
11. ~~**Venda estornada mantém NF-e ativa**~~ — ✅ **CORRIGIDO (PR #723).**
    Decisão do dono: BLOQUEAR. `assertNoActiveInvoiceBlockingRefund` roda antes
    de qualquer efeito nos estornos de venda e de OS — o operador tem que
    cancelar a nota primeiro (fluxo que já existe e é só-admin). Fica aberto o
    caminho irmão: `createFromServiceOrder` aceita OS em qualquer status, então
    uma OS não paga pode ter nota e depois ser **cancelada** (item 26).
12. ~~**`inutilizar` retorna `{success: true}` sem fazer nada**~~ — ✅
    **CORRIGIDO (PR #723).** Agora falha com `NOT_IMPLEMENTED`; o link saiu do
    menu e a tela manda fazer pelo portal da SEFAZ. A rota continua de pé para
    quem tinha o link salvo.

### Fidelidade / catálogo

13. ~~**`lockBalance`/`unlockBalance` sem CAS**~~ — ✅ **CORRIGIDO (PR #711).**
    CAS repetindo a condição no `where` + CHECK no banco. A fidelidade legada
    (2 saldos negativos vindos da migração do Laravel, módulo nunca usado) foi
    zerada com autorização do dono antes de aplicar a constraint.
14. ~~**Caps de campanha são TOCTOU**~~ — ✅ **CORRIGIDO (PR #714).** O limite
    passou a ser repetido no `where` do update: o Postgres reavalia depois do
    row lock e o claim perdedor aborta.

15. ~~**`bulkAdjustPrice` sem admin e sem teto**~~ — ✅ **CORRIGIDO (PR #714).**
    `isTenantAdmin` + teto de R$ 100.000 + `logAudit`, e os itens escondidos no
    menu para não-admin. O `deleteByType` (que tinha a regra invertida em
    relação ao `deleteService`) também ganhou o gate.

16. ~~**`reward` sem `isTenantAdmin`**~~ — ✅ **CORRIGIDO (PR #717).**
    `createCampaign`/`updateCampaign`/`toggleCampaign`/`rejectAction` e o
    `expireOverdue` viraram admin, com os controles escondidos/desabilitados na
    UI. `createAction` fica SEM gate de propósito: cria PENDING e só o
    `approveAction` (admin) credita — é segregação de função, com teste
    garantindo que o operador ainda registra a submissão.

17. ~~**Tipo de serviço é texto livre**~~ — ✅ **CORRIGIDO (PR #724).** As 5
    operações "por tipo" casavam por igualdade exata de string ("Troca de Tela"
    ≠ "troca de tela"). Produção tinha **0 tipos divergindo** (medido em
    2026-07-27), então o bug era latente — o primeiro operador que digitasse a
    mesma coisa com outra caixa o ativaria. O dono pediu a correção completa.
    Descoberta durante a implementação: a entidade `ServiceType` e a FK
    `services.service_type_id` **existiam desde 2026-05-16 e estavam 100%
    mortas** (0 linhas em produção, 6 procedures FK-based que a UI nunca
    chamou) — havia duas implementações paralelas e a UI usava a errada.
    Entregue: resolver find-or-create por slug canônico, backfill (105 serviços
    → 14 tipos, 0 órfãos, dry-run validado em produção), as procedures por nome
    removidas e o input livre virou select-com-criar-inline.

18. ~~**Diálogos destrutivos de OS fecham antes do `isPending`**~~ — ✅
    **CORRIGIDO (PR #717).** O `closeDialog()` foi para o `onSuccess` (padrão
    que o hook já usava) e cada botão mostra o estado. Atingia estorno,
    cancelamento, descancelamento e exclusão permanente.

19. ~~**"Salvar custos" da OS sem `disabled`**~~ — ✅ **CORRIGIDO (PR #717).**
    Guard + rótulo de progresso.

20. ~~**Badge "Caixa aberto" nunca invalidado**~~ — ✅ **CORRIGIDO (PR #720).**
    A query era montada uma vez e nunca revalidada — o PDV mostrava caixa aberto
    depois de fechado em outra aba e a venda só falhava no último clique, com o
    carrinho montado. Agora revalida por intervalo (60s) + ao focar, e as telas
    de caixa invalidam `statusCheck` ao abrir/fechar.

21. ~~**Input de liquidação de recebível re-formata a cada tecla**~~ — ✅
    **CORRIGIDO (PR #720).** Passou a usar o `MoneyInput`, que acumula os
    dígitos crus e só formata na saída (era o único campo de dinheiro fora dele).

22. ~~**`webhook_events` sem retenção**~~ — ✅ **CORRIGIDO (PR #721).** Cron
    `/api/cron/purge-webhook-events` apaga o que passa de 90 dias, em lotes.
    Medido antes: 21.517 linhas / 43 MB em 2 meses. ⚠️ **Pendente instalar o
    timer no VPS.**

23. ~~**Secrets de webhook fora dos templates de deploy**~~ — ✅ **CORRIGIDO
    (PR #721).** Os 5 ausentes entraram no `.env.example`. Vale registrar a
    natureza: o código é fail-closed, então a falta não era brecha — era
    indisponibilidade silenciosa num redeploy limpo.

24. **165 de 850 `z.string()` sem `.max()`** (P2) — campos de busca que alimentam
    `contains`.

25. ~~**`updateLabOrderStatus` cria PAYABLE fora do propósito**~~ — ✅
    **CORRIGIDO (PR #723).** O dono esclareceu que o envio ao laboratório existe
    **só para saber onde o aparelho está e avisar o entregador**, e que o custo
    vai nos **custos da OS**. A criação do PAYABLE + parcela saiu. Era caminho
    morto na prática (a tela nunca manda `finalCost`) e não havia histórico a
    migrar (0 envios em produção). `LabOrder.payableTransactionId` fica no
    schema, sempre null, com a nota de que reintroduzir exige o CAS de volta.

26. **NF-e de OS não paga sobrevive ao cancelamento da OS** (NOVO — 2026-07-27,
    achado durante a correção do item 11) — `createFromServiceOrder` aceita OS em
    **qualquer** status, então dá para emitir nota de uma OS ainda não paga e
    depois **cancelá-la** (caminho diferente do estorno, que já está bloqueado).
    Mesma consequência fiscal do item 11: a nota fica viva na SEFAZ e o relatório
    segue contando. Duas saídas possíveis: estender o guard ao cancelamento, ou
    exigir OS paga para emitir. Não entrou no #723 porque a decisão do dono foi
    sobre estorno.

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
