# Etapa 8 · Módulo 1 — DePix

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-security` (dinheiro em cripto = irreversível).

## Por que esta etapa existe

A Etapa 7 fechou 9 módulos. Medindo a cobertura por router, **24 dos 38 nunca
foram citados** em relatório nenhum — e o maior bloco é o DePix, com 9 routers.

Volume que justifica a prioridade:

| | |
|---|---|
| transações | **517** |
| movimentado | **R$ 159.687** (403 depósitos + 54 saques concluídos) |
| natureza | cripto — **irreversível** |

---

## E8-1 — Operador cancelava saque que só admin cria — ✅ CORRIGIDO

`depixTransaction.cancel` tinha **dois defeitos no mesmo ponto**.

### 1. RBAC assimétrico

Os três caminhos de criação de saque são `tenantAdminProcedure` **+ step-up
2FA**. O `cancel` era `tenantProcedure` — operador comum.

Provado no navegador contra a cópia de produção, com uma transação de teste:

```
OPERADOR do proprio tenant  -> HTTP 200, WITHDRAW de R$ 50 CANCELADO
OPERADOR de OUTRO tenant    -> HTTP 404 (RLS barrou)
```

O isolamento entre tenants **estava intacto**. O furo era dentro do tenant: o
operador desfazia pela porta dos fundos o que não pode fazer pela frente.

### 2. Sem CAS

`findUnique` → checa `PENDING` → `update` **cru**. Entre a leitura e a escrita,
o webhook da Eulen ou o reconciliador podem mover a transação para
PROCESSING/COMPLETED. O `update` sobrescreveria o avanço e marcaria como
cancelada **uma transação cujo dinheiro já saiu**.

O `depix-transaction.service.ts` já usa CAS em todos os pontos equivalentes
(linhas 752, 859, 1002, 1272). **Só o router ficou de fora** — a regra existia e
foi esquecida no irmão. Décima primeira ocorrência do padrão neste programa.

### Impacto medido: zero ocorrências

As 2 transações `CANCELLED` de produção foram canceladas pelo **próprio
serviço**:

| transação | motivo |
|---|---|
| TXW20260531-00001 | "LWK timeout (Esplora rate limit)" |
| TXW20260531-00002 | "Saldo L-BTC insuficiente pra fee de rede" |

Não é a corrida. **Correção preventiva de dinheiro irreversível**, não incidente.

### Verificado depois do fix

```
OPERADOR -> HTTP 403  "Acao restrita a administradores do tenant"
ADMIN    -> HTTP 200, cancelou
```

Não exigi 2FA no cancelamento: cancelar não move dinheiro para fora. Mas quem
cria e quem cancela precisa ser o mesmo nível.

**Dado de teste removido**: produção voltou a 457/38/20/2, idêntica ao início.

---

## O que ataquei e resistiu

Não é preenchimento — é o que a rodada de red team **não** conseguiu derrubar:

| superfície | teste | resultado |
|---|---|---|
| `webhooks/eulen` | POST sem credencial | **401** |
| `webhooks/lwk-deposit` | POST sem credencial | **401** |
| `webhooks/lwk-deposit` | assinatura **forjada** | **401** |
| API parceiros `/deposits` | POST sem chave | **401** |
| API parceiros `/withdrawals` | POST sem chave | **401** |
| API parceiros | chave **falsa** | **401** |
| API parceiros `/transactions/:id` | GET sem chave | **401** |
| `depixTransaction.createWithdraw` | como operador | **403** |
| isolamento entre tenants | cancel cross-tenant | **404** (RLS) |

Todos testados **contra produção real**, não em mock.

Outros pontos sólidos:

- **`depix-withdraw.create/update` estão desativados** com `FORBIDDEN` e a razão
  escrita no código: expunham o mesmo service de saque sem admin nem 2FA. Em vez
  de duplicar mal a cadeia de proteção num caminho morto, fecharam a porta.
- **Token de link de pagamento**: 16 chars alfanuméricos ≈ **82 bits**.
  Enumeração inviável.
- **Rate limit do `/pay`**: existe na *ação* que gera o QR (12/10min por IP), e
  **degrada fechando** — sem Redis o teto cai de 12 para 3, não abre.
- **Nenhuma procedure pública** nos 9 routers DePix; os 3 routers admin usam
  `adminProcedure` em 100% das procedures (15/15).
- **`searchRecipients` é admin** com rate-limit, mínimo de 3 chars e CPF/CNPJ
  mascarado — a proteção contra enumeração de destinatários está pensada.

## Achados descartados

Registro porque o método importa mais que o placar:

1. **`redisFailed` nunca reseta** (`rate-limit.ts:35`) — a leitura inicial
   sugeria que uma falha transitória degradaria o rate limit até o deploy.
   **Falso**: a flag só é setada no `catch` do *construtor*; erro em runtime cai
   no handler `redis.on("error")`, que apenas loga, e o ioredis reconecta.
   Medido: **0 ocorrências em 72h** de log e `redis-cli ping` → `PONG`.
2. **`/pay/<token>` sem rate limit na página** — 12 requisições seguidas deram
   404 sem bloqueio. Mas o rate limit está na **ação** que gera cobrança, que é
   onde importa, e 82 bits de entropia tornam a enumeração inviável.

---

## Baixa confiança

- **Não auditei `depix-swap`, `depix-byow` e `depix-fee-wallet-admin` a fundo.**
  Verifiquei o nível de acesso das procedures (todos corretos), não a lógica.
  O `depix-byow` tem 0 procedures — é só tipos.
- **Não testei a corrida do `cancel` com duas transações concorrentes reais.**
  O teste é estático; afirma que o CAS está lá, não que ele segura sob
  concorrência.
- **Não conferi se a taxa do split chegou à carteira `arena-fees`.** Ver a
  seção abaixo: o mecanismo está correto no código, mas a confirmação on-chain
  do recebimento não foi feita nesta passada.

---

## Uma hipótese que investiguei e caiu

Comecei a escrever isto como achado: **`fee_arena_tech_cents = R$ 0,00` nas 517
transações**, com `tenant_depix_fee_ledger` vazio, enquanto a taxa da Pixpay
(R$ 554,08) aparece cobrada. Parecia receita do produto não sendo cobrada.

Fui atrás e não é. A explicação tem duas partes:

**1. O `arena-tech` é isento por configuração.** É a central, e
`tenant_depix_fee_configs` traz `0/0.00` para ela — deliberado.

**2. Nos demais, a taxa sai por SPLIT NATIVO da Eulen, na origem.** O código é
explícito (`depix-transaction.service.ts:598-640`): a Eulen manda o líquido para
o endereço do tenant e a taxa direto para a carteira `arena-fees`, **já dividido
on-chain**. O dinheiro da taxa nunca passa pela transação — por isso o campo
fica zero, e ficar zero é o comportamento **correto**.

| tenant | config | 127 transações |
|---|---|---|
| `arena-tech` | 0 / 0,00% | isento (central) |
| `pdv-06a429b8` | R$ 0,99 + 1,5% | taxa via split, fora do registro |

**O que eu deveria ter feito antes de quase reportar:** ler o serviço de
depósito, não só o schema. O campo com nome de dinheiro parecia prova suficiente
e não era — é o mesmo erro de "confiar no nome da coluna" que a auditoria já
registrou como armadilha.

**O que fica em aberto:** não confirmei on-chain que a carteira `arena-fees`
recebeu o que o split mandou. É a verificação que fecharia o ciclo, e ela exige
consultar a Liquid — fora do escopo desta passada.
