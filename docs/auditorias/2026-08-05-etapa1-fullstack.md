# Etapa 1 — Auditoria Fullstack (sistêmica)

> Programa de comercialização, etapa 1 de 6. Protocolo de 4 rodadas da skill
> `audit-fullstack`. Data: 2026-08-05.
>
> **Regra aplicada:** todo achado precisa de prova de código + prova de dado
> (medição na cópia de produção) + prova de uso quando aplicável. Achado sem
> medição entra como hipótese, não como achado.

## Baseline verificado antes de auditar

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | limpo |
| `pnpm lint` | 0 erros (114 warnings de ruído conhecido) |
| `pnpm test:unit` | 2318 ✅ |
| `pnpm test:integration` | 425 ✅ |
| Cópia de produção | restaurada, 7 tenants, dados reais |

## Fato que recalibra todo o resto

**Só um tenant usa o sistema de verdade.**

| tenant | vendas | OS | caixas | depix | clientes |
|---|---|---|---|---|---|
| arena-tech | 2571 | 253 | 347 | 389 | 1407 |
| pdv-06a429b8 | 0 | 0 | 0 | 127 | 0 |
| pdv-ff198666 | 0 | 0 | 0 | 1 | 0 |
| arena-fees, pdv-b35c6eb5, pdv-09ed1f82, demo-paybis | 0 | 0 | 0 | 0 | 0 |

Praticamente todo o sistema **nunca rodou sob um segundo tenant com uso real**.
O isolamento está sustentado por RLS e testes, não por operação. É exatamente
onde moram os bugs de comercialização — e o programa anterior já viu um caso
("cadastrar o primeiro prestador dava 500: invisível no arena-tech, certeiro
nos outros 6 tenants").

**Consequência para o plano:** a prova de uso das próximas etapas precisa rodar
com um **segundo tenant populado**, não só com o arena-tech.

---

## Achados

Severidade: **P0** = sangra agora · **P1** = buraco real, incidência zero ou
baixa hoje · **P2** = dívida/risco de regressão · **P3** = higiene.

### P0-1 — O webhook de saque da Eulen nunca casou uma transação (dinheiro)

**Prova de dado:** 83 de 83 eventos `eulen_withdraw` gravados entre 26/06 e
03/08 estão com `processed=false, error_message='not_found'`.

**Causa:** a Eulen envia o UUID **com hífens** (`019fc800-315f-7616-...`); nós
gravamos o mesmo ID **sem hífens** (`019fc800315f7616...`), porque
`pixpayDepixId` recebe `withdrawResult.id` da resposta de criação do saque.
`src/lib/webhooks/eulen-withdraw-handler.ts:69` usa `payload.id` cru e o
`findFirst` compara string exata.

**Prova de que é o mesmo ID:** normalizando os hífens, **83/83 casam** com uma
transação existente. Nenhum é saque de terceiro.

**Consequência:** a confirmação em tempo real de saque **nunca funcionou**. O
comentário do próprio arquivo declara a intenção que falha na prática — *"Confirma
o saque na hora (status `sent` → COMPLETED), liberando a reserva contábil de
saldo (saque preso em PROCESSING reservava saldo até o cron de reconciliação
rodar)"*. O status final depende só do cron. O projeto já teve um pagamento
duplicado (TXW20260727-00002) por status de saque mal resolvido.

**Correção:** normalizar o ID nos dois lados da comparação. Precisa de teste que
falha antes do fix, usando um payload com hífen.

---

### P1-1 — `/api/storage` serve qualquer chave do bucket sem autenticação

**Prova de código:** `src/app/api/storage/[...path]/route.ts` — sem `auth()`,
sem restrição de prefixo. Única defesa é anti-path-traversal (`..`, `/`). O
comentário diz "apenas assets públicos", mas o código não restringe nada.

**O que existe no mesmo bucket:**

| prefixo | conteúdo | protegido? |
|---|---|---|
| `tenants/{id}/logo-*` | logo | público por intenção |
| `tenants/{id}/products/...` | fotos de produto | público por intenção |
| `nfse/{tenantId}/{orderId}/...` | **nota fiscal de serviço** | ❌ em claro |
| `tenants/{id}/certificates/{certId}.pfx.enc` | certificado A1 | ✅ AES-256-GCM |

**Prova de dado:** `service_orders.nfse_attachment_path` → **0 registros**. O
buraco é real e latente, não ativo.

O certificado digital está cifrado com AES-256-GCM, chave obrigatória de env
(`PFX_ENCRYPTION_KEY`), IV aleatório, e `certId` é UUID — mitigação real. É por
isso que este achado é P1 e não P0.

**Agravante:** credenciais MinIO com default hardcoded `minioadmin`/`minioadmin`
em 7 arquivos.

**Correção:** allowlist de prefixos públicos no proxy; remover o default das
credenciais.

---

### P1-2 — Tabela de incidente com PII de pagamento fora do RLS

**Prova de dado:** `_fix_txw20260727_00002_backup`, 1 linha, criada durante o
incidente de saque duplicado de 27/07. Contém `pix_key`, `recipient_name`,
`recipient_tax_id` (CPF).

RLS **desabilitado** nela — é 1 das 2 exceções entre 113 tabelas com `tenant_id`
(a outra, `user_tenants`, é global por design documentado).

Verificado: `set role app_user; select count(*)` devolve a linha. O role que a
aplicação usa em **toda** requisição lê a tabela sem filtro de tenant.

**Correção:** extrair para fora do banco (o incidente já está documentado) ou
habilitar RLS. Não é para viver em produção.

---

### P1-3 — Corrida fechar-caixa × finalizar-venda continua aberta

**Prova de código:** `sale.ts:1805` lê a sessão com `findFirst` sem
`FOR UPDATE`. `financial.payInstallment` (`:680`) e `reverseInstallment`
(`:843`) usam `lockOpenCashSessionOrThrow`. O finalize não.

`cashier.ts:176-179` documenta a janela e o follow-up: *"Eliminação total
exigiria SELECT ... FOR UPDATE no finalize — follow-up documentado."* Nunca foi
feito.

**Prova de dado:** **0 movimentos** gravados após o `closed_at` da sessão, em
1.796 movimentos. A corrida existe no código e nunca se materializou — janela de
milissegundos, um operador só.

**Por que sobe de prioridade agora:** múltiplos tenants com caixas simultâneos
aumentam a exposição. É risco de comercialização, não risco atual.

---

### P2-1 — 204 vendas em cartão sem recebível (dívida histórica, já estancada)

**Prova de dado:**

| mês | vendas em cartão | sem recebível |
|---|---|---|
| 2026-05 | 21 | 21 (100%) |
| 2026-06 | 134 | 134 (100%) |
| 2026-07 | 196 | 49 (25%) |
| 2026-08 | 28 | **0** |

R$ 146.014,27 em vendas sem `CardReceivable`. **O buraco fechou** — corresponde
à unificação da taxa de cartão (#334-#340). Não é dinheiro perdido: as vendas
existem. O que está incompleto é o DRE e a conciliação por adquirente dos meses
anteriores.

**Risco de regressão que continua vivo:** a mesma pergunta ("existe taxa para
esta combinação?") é respondida de dois jeitos opostos no mesmo `finalize` —
`payment-calculator.ts:233-239` **lança erro**;
`card-receivable-writer.service.ts:61,71` **retorna 0 em silêncio** e a venda
segue sem recebível.

---

### P2-2 — Status DePix divergente dentro do mesmo arquivo

`quick-sale.ts:294` usa a fonte única `isSettledForSaleDepixStatus` (que aceita
`PROCESSING` como pago — decisão deliberada e documentada).
`quick-sale.ts:464` reimplementa o mapeamento à mão e **não** aceita
`PROCESSING`.

**Consequência:** o cliente paga, um caminho libera a venda, e a tela de status
diz "pendente". 2 quick-sales em `AWAITING_PAYMENT` hoje (de 21).

---

### P2-3 — `decimalToCents` tem 15 cópias idênticas

15 definições locais de `decimalToCents` e 9 de `centsToPrisma`, todas
byte-idênticas, em routers e services. É a conversão que **todo** valor
monetário do sistema atravessa.

Hoje não há divergência. O risco é uma correção futura (arredondamento bancário,
tratamento de negativo) ser aplicada em 14 lugares e esquecida no 15º.

---

### P2-4 — Código morto que discorda da fonte única

| item | evidência |
|---|---|
| `calculateCashOnHand` (`cash-session.service.ts:230`) | **0 call sites**; filtra `paymentMethod: "dinheiro"` literal, em reais, sem `affectsCashDrawer` — discorda de `computeCashDrawerCents`, a fonte única |
| `DepixWithdraw` (modelo paralelo de saque) | 5 registros, último de **29/05**. Mutations `create`/`update` já fechadas com FORBIDDEN e bem documentadas; `stats` e `checkStatus` seguem vivos sobre dados mortos |
| `TransactionStatus.ESTORNADA` | 0 registros, nenhum escritor |
| `ProviderApuracaoStatus.CLOSING` | 0 registros, declarado legado no schema |

---

### P2-5 — 24.631 webhooks do Chatwoot mascaram sinal real

`chatwoot` é o único provider que chama `recordWebhookEvent` e **nunca**
`markWebhookProcessed`. Resultado: 99,9% dos eventos ficam `processed=false`
para sempre.

**Por que importa:** foi esse ruído que escondeu o P0-1. Uma consulta de
"webhooks não processados" devolve 24.846 linhas, e as 83 que representam
dinheiro somem no meio.

**Autentique** (127 não processados) foi investigado e **descartado como
achado**: 124 dos 127 não casam com nada no banco, e 237 OS estão assinadas
contra apenas 151 documentos enviados — a maioria é assinada por outro caminho.
São documentos de conta compartilhada ou anteriores à migração.

---

### P3-1 — 96 stock_items SOLD sem venda (resíduo de migração)

Todos anteriores a **19/05** (data da migração); os saudáveis vão até 03/08. É
dívida da migração do Laravel, não vazamento do código atual.

### P3-2 — Teste de integração com CPF fixo em banco compartilhado

`__tests__/integration/input-size-caps.test.ts` usa o CPF `52998224725` fixo.
Colide com qualquer cliente criado à mão no banco de dev. Custou-me três
verificações nesta sessão até isolar que não era bug do sistema.

### P3-3 — `payment_details` com duas formas

257 vendas com o campo como `string`, 1.259 como `array`. As `string` são todas
de 10/04 (migração). Consumidores precisam tratar os dois formatos.

---

## Verificado limpo (mérito do trabalho anterior)

Não é preenchimento — é o contraponto honesto aos achados acima.

- **Financeiro íntegro:** 0 divergências entre `installments.paid_amount` e a
  soma de `installment_payments`, em 2.222 parcelas e 1.766 pagamentos. 0 parcelas
  PAID sem `paid_at`, 0 com `paid_amount > amount`.
- **Estoque íntegro:** 0 produtos com estoque negativo, 0 reservas presas.
- **DePix íntegro:** 0 saques COMPLETED sem `tx_id`, 0 travados em PROCESSING
  há mais de 24h, 0 saques sem `idempotency_key`.
- **RLS:** 111 de 113 tabelas com `tenant_id` protegidas; `current_tenant_id()`
  devolve NULL quando não setada (falha segura, linhas somem em vez de vazar).
- **Cadeia de autorização em 4 camadas** bem construída: proxy → tRPC procedures
  → RLS → gate de módulo, com regra única em `module-gate.ts`.
- **Saque DePix:** `pg_advisory_xact_lock` por tenant, guarda de quase-duplicata,
  cap diário, 2FA obrigatório, e tratamento explícito de estado **indeterminado**
  (mantém PROCESSING em vez de liberar a reserva) — desenhado por quem já
  apanhou do problema.
- **Crons:** `withCronLock` com aquisição atômica em statement único
  (`INSERT ... ON CONFLICT ... WHERE expires_at < now() RETURNING`), à prova de
  pool.

## Decisões a preservar (Chesterton's Fence)

1. **`/api/*` nunca recebe redirect** (`proxy.ts:181-196`) — nasceu de três
   incidentes de `Unexpected token '<'`. Não "consertar".
2. **Fail-open deliberado em divergência de valor** no finalize
   (`sale.ts:1253-1257`) — decisão do dono, grava `saleAudit` e segue.
3. **HTTP fora da transação** no finalize e no quick-sale (padrão ETAPA 1/2/3) —
   evita segurar locks de estoque durante chamada externa.
4. **Mutations do router de saque legado fechadas em vez de duplicadas** — a
   alternativa (replicar a cadeia de proteção num caminho morto) seria pior.

## Áreas de baixa confiança

- **Não medi com segundo tenant populado.** É a lacuna mais séria desta etapa e
  a mais relevante para comercializar.
- **Não rodei prova de uso (navegador)** — esta etapa foi código + dado. A
  auditoria de frontend de 04/08 cobriu navegador há um dia.
- **Não medi performance sob carga.** `finalize` tem ~1050 linhas numa transação
  de timeout 20s, com imports dinâmicos dentro dela; `FINALIZE_SLOW_MS=3000`
  existe para medir contenção, mas não coletei a métrica.
- **`impersonatedTenantId`** existe no JWT e nos tipos, nunca é escrito com valor
  nem lido por decisão de autorização. Não determinei se é resto ou preparação.
- **5 crons sem `withCronLock`** (`close-abandoned-cash-sessions`, `mark-overdue`,
  `process-pending-talison`, `resolve-stale-conversations`,
  `talison-waiting-sweep`). Não avaliei o impacto de execução concorrente em cada
  um — fica para a Etapa 4 (infra).
