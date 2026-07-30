# Módulo 6 — DePix Wallet / Vendas Avulsas / pagamento público

**Passada A (backend):** concluída em 2026-07-29.
**Passada B (frontend):** pendente.

> É o módulo do dinheiro **irreversível**: transação on-chain na Liquid não tem
> estorno. Também é o que mais auditoria já recebeu (incidentes de cache LWK,
> saldo inflado, saque duplicado). A pergunta desta passada não era "onde está o
> bug óbvio" — era "o que ainda ninguém olhou".

## Superfície

| | |
|---|---|
| Routers | `depix-wallet` (388), `depix-transaction` (500), `depix-withdraw` (328, túmulo), `depix-byow` (200), `quick-sale` (533), `payment-link` (112) |
| Router desativado | `depix-swap` — não registrado no root, com o motivo documentado no arquivo |
| Página pública | `/pay/[token]` → `pay-public.service.ts` |
| Telas | `/depix-wallet/*`, `/depix/*` (redirects), `/quick-sales/*` |

## Invariantes que o módulo promete

1. Nenhuma operação de dinheiro roda duas vezes (chave de idempotência por tenant).
2. Todo saque concluído tem txid on-chain, e nenhum txid se repete.
3. Todo depósito concluído tem txid.
4. Link de pagamento público expõe só o necessário e expira.
5. O extrato mostra o que aconteceu no período pedido.

Quebrou a **5**.

## Prova de dados (snapshot de produção, 2026-07-29)

Invariantes de dinheiro, todas conferidas:

| Invariante | Resultado |
|---|---|
| Chaves de idempotência duplicadas | **0** |
| Saque `COMPLETED` sem txid | **0** |
| Depósito `COMPLETED` sem txid | **0** |
| Txid de saque reaproveitado (gasto duplo) | **0** |

Volume: 353 depósitos concluídos (R$ 80.699,36), 43 saques concluídos
(R$ 31.472,15), 5 carteiras provisionadas (1 custodial, 2 non-custodial, 1
external, 1 de taxas).

## Achados

### DPX-1 — o extrato da carteira não filtrava por dia (P1)

`depixTransaction.list` fechava a faixa com `lte: new Date(dateTo)` — **sem fim
de dia nenhum**. Filtrar um único dia deixava `gte` e `lte` no **mesmo instante**
(meia-noite UTC), então a tela onde o lojista confere o próprio dinheiro voltava
**vazia**.

Medido na cópia de produção, filtrando 2026-07-28:

| | Transações |
|---|---|
| Filtro antigo | **0** |
| Correto (dia BRT) | **11** |

O mesmo defeito, em variações mais brandas, em `quick-sale.list` (misturava
meia-noite UTC com `setHours` do processo) e na leitura do túmulo
`depixWithdraw.list` (`T23:59:59Z` fechava o dia às 20h59 BRT).

Corrigido com `instantRange` — o helper criado no Módulo 5 justamente para
distinguir instante de data pura. `createdAt` é instante nos três casos.

## Verificado e descartado (não viraram achado)

Registrado para não ser re-investigado:

- **As quatro invariantes de dinheiro** acima: todas em zero. O trabalho das auditorias anteriores neste módulo se sustenta.
- **`/pay/[token]`** — a melhor superfície pública do sistema até agora: delega a um serviço compartilhado (`getPublicCharge`), com lista branca de campos (não vaza `tenantId`), expiração aplicada **na leitura** com CAS (`updateMany` guardado por `status: "ACTIVE"`, então não depende do cron) e nada além do nome do comerciante. **Nenhuma duplicação de implementação** — o padrão que mordeu nos Módulos 1, 2 e 3 não aparece aqui.
- **`depix-swap`** — router **não registrado no root**, portanto não alcançável por HTTP, com o motivo escrito no topo do arquivo (LWK 0.17 não assina o PSET que o Sideswap aceita). É código parado com justificativa, não superfície morta.
- **`depix-withdraw`** — túmulo deliberado: as escritas lançam `FORBIDDEN` apontando para o fluxo correto. Confirmado presente e intacto.

## Observação sobre uma cerca que envelheceu

A auditoria de 2026-07-25 registrou o túmulo do `depix-withdraw` na lista de
"decisões a preservar", justificando que **"as leituras seguem"** porque as telas
legadas usavam.

Verifiquei: `/depix`, `/depix/withdrawals` e `/depix/withdrawals/new` são hoje
**três `redirect()` de 9 linhas** para `/depix-wallet`. As leituras do túmulo
(`list`, `getById`, `stats`, `searchRecipients`, `checkStatus`) **não têm mais
nenhum chamador** — a justificativa expirou quando as telas viraram redirect.

**Não removi**, de propósito: a auditoria anterior marcou explicitamente
"não apagar sem ler o comentário", e as escritas (a parte que realmente protege)
continuam valendo. Fica como decisão do dono no fim do programa. O ponto de
método vale mais que o item: **cerca preservada precisa de revalidação
periódica** — o motivo que a justificava pode ter deixado de existir sem que
ninguém atualize a nota.

## Checklist de backend

| Eixo | Situação |
|---|---|
| 1. RBAC | ✅ saque exige admin + 2FA; `updateFeeConfig` é superadmin |
| 2. Gating de módulo | ✅ `wallet`/`depix-ops` mapeados |
| 3. Validação de entrada | ✅ |
| 4. Tenant/RLS | ✅ `withAdmin` só no caminho público por design |
| 5. Concorrência | ✅ advisory lock anti-saque-concorrente, nonce idempotente, CAS na expiração do link |
| 6. Dinheiro | ✅ 4 invariantes em zero |
| 7. Estoque | n/a |
| 8. Tempo (BRT) | ✅ corrigido (DPX-1) |
| 9. Soft delete | n/a |
| 10. Performance | ✅ |
| 11. Erro e observabilidade | ✅ |
| 12. Transação | ✅ HTTP externo fora da transação — decisão a preservar |
| 13. Superfície morta | ⚠️ 5 leituras do túmulo sem chamador — decisão do dono (acima) |

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit    # 2013 verdes
pnpm test:integration                             # 89 arquivos, 281 testes verdes
```

Teste que **falha antes** da correção:
`__tests__/integration/depix-statement-day-filter.test.ts` — antes do fix
devolvia `[]` onde deveriam estar 2 transações do dia.
