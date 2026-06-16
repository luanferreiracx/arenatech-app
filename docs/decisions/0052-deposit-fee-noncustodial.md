# 0052 — Taxa de depósito em carteiras non-custodial (cobrança sem usuário presente)

- **Status:** Aceito (Opção A refinada — ver "Decisão final 2026-06-16")
- **Data:** 2026-06-16
- **Decisores:** Dono do produto + dev sênior
- **Relacionado:** [[0051-depix-non-custodial-passphrase]] (ETAPA 7 / "Fase 3" original, reaberta após a reorientação non-custodial)

---

## Contexto

Com o ADR 0051, toda carteira de tenant comum nasce **non-custodial**: a seed só decifra com a passphrase que **apenas o usuário sabe**, e o servidor não consegue assinar sozinho. Isso quebra a cobrança automática da **taxa Arena Tech no depósito**, que hoje assina **sem usuário presente**.

### Como o depósito funciona hoje

1. Cliente gera um QR PIX (PixPay) apontando para um **endereço da carteira LWK do tenant**.
2. Cliente paga o PIX → PixPay converte BRL→DePix e **deposita o DePix direto na carteira do tenant** (on-chain Liquid). O dinheiro já entra non-custodial.
3. O monitor LWK detecta o depósito → webhook → `settleDepositConfirmed`.
4. A Arena Tech cobra a taxa: `lwk.transfer(tenantId, [→ arenaMaster], …)` — **da carteira do tenant para a Arena Tech**. **Aqui é preciso assinar.**

O passo 4 roda no **webhook**, sem sessão de usuário. Para carteira non-custodial não há passphrase disponível → o `transfer` não assina.

### Estado atual do código (já tolera a falha)

`settleDepositConfirmed` já tem fallback: se a taxa não for cobrada, a tx vira `COMPLETED_FEE_PENDING` e cria um `tenantDepixFeeLedger` com `status=PENDING_SETTLEMENT` (`markFeeMissing`). **O depósito completa normalmente** (o cliente recebe o DePix); só a **taxa fica pendente** para reconciliação. Ou seja: hoje, depósito em tenant non-custodial funciona, mas a taxa Arena Tech **não é coletada automaticamente** — fica registrada como pendente no ledger.

Há também o caminho de **fee fixo via PixPay** (`settleDepositConfirmedPixPay`, recipients no sweep) — investigar se cobre parte do caso (taxa já embutida no split do PixPay) antes de decidir.

## Problema a decidir

Como a Arena Tech coleta a taxa de depósito de um tenant non-custodial, sem a passphrase do usuário no momento do webhook?

## Opções

### Opção A — Sub-conta custodial dedicada a taxas (desenho original do ADR 0051)

Cobrar a taxa numa **carteira custodial separada, só para taxas**, isolada do saldo do cliente. A Arena Tech controla essa carteira e assina sem usuário.

**Tensão com o fluxo real:** no ADR 0051 isso foi desenhado assumindo que a taxa seria *desviada antes* de o dinheiro chegar ao tenant. Mas hoje **o DePix entra direto na carteira do tenant** (PixPay → endereço do tenant). Para a sub-conta custodial cobrar, seria preciso **mudar o destino do depósito**: o PixPay apontaria para um endereço da **sub-conta custodial**, que então repassaria (líquido) ao tenant e reteria a taxa. Isso:
- reintroduz custódia intermediária do dinheiro do cliente (todo depósito passa por uma carteira que a Arena Tech controla) — contraria o espírito non-custodial;
- exige reescrever `createDeposit` (endereço de destino), o monitor (detectar na sub-conta), e um repasse on-chain extra por depósito (custo de fee L-BTC ×2);
- a sub-conta vira ponto único custodial de **todo** o fluxo de depósito (alvo de valor).

### Opção B — Acumular no ledger e cobrar no próximo saque (com o usuário presente)

A taxa de depósito fica `PENDING_SETTLEMENT` no ledger (já é o comportamento de fallback). No **próximo saque** do tenant — quando o usuário **está presente e digita a passphrase** — somamos as taxas de depósito pendentes ao PSET do saque (recipient extra → Arena Tech), liquidando tudo de uma vez.

- **Prós:** usa o caminho que já assina com passphrase (saque); zero custódia intermediária; aproveita o ledger e o `markFeeMissing` existentes; 1 só on-chain (o do saque já existe). Mantém o non-custodial puro.
- **Contras:** a taxa de depósito é coletada **com atraso** (até o tenant sacar). Tenant que só deposita e nunca saca acumula dívida de taxa (mitigável: gate "salde as taxas pendentes" ao bater um teto, ou cobrar via wallet management). Precisa de UI clara ("você tem R$ X de taxas pendentes, serão somadas no próximo saque").
- Foi rejeitada no ADR 0051 "em favor da sub-conta" — mas **antes** da reorientação non-custodial. Reabrir é justificado: agora o dinheiro já está non-custodial no tenant, e a sub-conta custodial perdeu o encaixe natural.

### Opção C — Taxa de depósito embutida no split do PixPay (cobrar em BRL, não on-chain)

Se o PixPay permite **múltiplos recipients / split** no pagamento PIX, a taxa Arena Tech sai **em BRL no momento do PIX** (antes de virar DePix), creditada numa conta Arena Tech — nunca precisa assinar on-chain na carteira do tenant.

- **Prós:** elimina o problema na raiz (sem assinatura on-chain p/ taxa de depósito); cobra na hora.
- **Contras:** depende de o PixPay suportar split/multi-recipient (verificar na doc/API — **ação de investigação**); muda o modelo de cobrança (taxa em BRL na entrada vs DePix on-chain); a Arena Tech passa a receber parte em BRL (conta PixPay) e não em DePix.

## Recomendação preliminar

**Opção B** parece o melhor encaixe com o modelo non-custodial (sem custódia intermediária, reusa o que existe), **se** o atraso de coleta for aceitável e tratável por UI/gate. **Opção C** é a mais limpa **se** o PixPay suportar split — vale confirmar na API antes, porque pode tornar B desnecessária. **Opção A** é a mais cara e a que mais contraria o non-custodial; só faria sentido se houver requisito de coletar a taxa de depósito estritamente on-chain e na hora.

## Impacto medido em produção (2026-06-16)

Consulta no banco prod: **todos os 53 depósitos DePix são do tenant central (custodial)**; **nenhum tenant non-custodial recebeu depósito ainda**, e o `tenant_depix_fee_ledger` está **vazio** (nenhuma taxa em `PENDING_SETTLEMENT`). Ou seja, a lacuna é **real mas sem impacto atual** — não há dívida de taxa acumulando. Isso permite **decidir com calma** e implementar antes do primeiro tenant non-custodial começar a operar depósitos de verdade (não é urgente, mas é pré-requisito para "ligar" depósito non-custodial em produção).

> Os DOIS caminhos de settle de depósito (`settleDepositConfirmed` e o do PixPay com `recipients`/sweep, ~L799-823) assinam a taxa via `lwk.transfer(tenantId, …)` sem passphrase — ambos têm a lacuna.

## Próximos passos (antes de implementar)

1. **Confirmar com o PixPay** (WebFetch/doc) se há split/multi-recipient no PIX (decide a viabilidade da Opção C — potencialmente a mais limpa).
2. Dono escolhe A/B/C → este ADR vira "Aceito" com o desenho final + plano de implementação.
3. **Gate operacional:** enquanto não implementado, não habilitar depósito para tenant non-custodial em produção sem aceitar que a taxa fica `PENDING_SETTLEMENT` (cliente recebe o DePix; taxa coletada depois). Hoje isso é inócuo (zero depósitos non-custodial).

## Consequências (enquanto não implementado)

- Depósitos em tenant non-custodial **funcionam** (cliente recebe o DePix).
- A taxa Arena Tech do depósito **não é coletada automaticamente** — fica `COMPLETED_FEE_PENDING` / `PENDING_SETTLEMENT` no ledger. Sem perda contábil (registrada), mas sem coleta até a feature ligar.
- O saque (com usuário/passphrase) e a taxa de saque seguem normais. O tenant central (custodial) não é afetado.

---

## Decisão final 2026-06-16 — Opção A refinada (carteira de taxas custodial dedicada)

O dono **descartou B e C**:
- **B (cobrar no próximo saque):** cria incentivo perverso — um tenant poderia usar o serviço **só para depositar** e nunca sacar, nunca pagando a taxa.
- **C (split no PixPay):** não existe na API do PixPay; e, mesmo se existisse, **feriria a privacidade** (exporia a relação tenant↔Arena Tech à operadora de PIX) — privacidade é foco do produto.

**Escolhida: Opção A refinada.** Uma **carteira custodial nova e dedicada** — tenant técnico **`arena-fees`** ("operacional Arena Tech": taxas + futuramente L-BTC) — gerenciada pelo **superadmin**. Para tenant **non-custodial**:

1. `createDeposit` aponta o PixPay para um endereço da **carteira de taxas** (não do tenant), único por tx (`label = transactionId`). **Fail-closed:** se `arena-fees` não estiver provisionada, o depósito é bloqueado.
2. O DePix cai na carteira de taxas. O webhook chega com `tenant_id = arena-fees`.
3. `settleDepositViaFeeWallet`: acha a tx pelo label (via `withAdmin`), calcula a taxa, e a carteira de taxas (custodial, **assina sem passphrase**) **repassa o líquido** (bruto − taxa) → `master_address` do tenant real. A **taxa fica retida** na carteira de taxas (sem tx própria).
4. **Falha no repasse → fila idempotente** (`DepixDepositRepayment`, `idempotencyKey=repay:{id}`) + cron de retry. **Os efeitos de negócio (liberar venda/saldo) só são aplicados após o repasse confirmar** — o cliente só "tem" o dinheiro quando ele chega na carteira dele.

**Por que A apesar dos contras:** B e C foram vetadas; A é a única que coleta a taxa de forma automática, on-chain, sem depender do saque nem expor a relação. O trade-off (o depósito passa pela nossa carteira custodial por um instante) foi **aceito conscientemente**, mitigado por: repasse imediato + retry (o líquido sai rápido; só a taxa acumula).

**Escopo:** só tenants **non-custodial** passam pela carteira de taxas. Tenant central (`arena-tech`) e quaisquer custodiais **mantêm o fluxo atual** (`settleDepositConfirmed`, intacto). **ETAPA 8 futura** (ADR próprio): migrar o central para non-custodial, deixando `arena-fees` como a **única** carteira custodial do sistema (assumindo também o auto-refill de L-BTC).

Plano de implementação (6 PRs): provisão idempotente da carteira → migration da fila de repasse → roteamento no `createDeposit` → settle via fee wallet → cron de retry → painel superadmin.
