# Módulo 6 — DePix Wallet / Vendas Avulsas / pagamento público

**Passada A (backend):** concluída em 2026-07-29.
**Passada B (frontend):** concluída em 2026-07-29.

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

## Passada de frontend

Varredura das 13 telas × admin/operador × desktop/mobile = 52 combinações:
**0 quebradas, 0 de atenção.** Os 12 "redirects" são os stubs legados de
`/depix/*`, esperados.

O módulo chegou limpo. Herdou as correções de primitivo dos Módulos 2 a 4
(`PageHeader`, breadcrumb, grid, `TabsList`) sem precisar de nada novo — quarto
módulo seguido em que corrigir na raiz poupou trabalho por tela.

### Página pública de pagamento, medida no navegador

É a tela que o cliente final abre no celular, fora de qualquer sessão nossa.
Verificada em 390px **e** em 320px (piso da WCAG 1.4.10):

| Cenário | Resultado |
|---|---|
| Link expirado | HTTP 200, tela de "cobrança indisponível", **0** de overflow |
| Token inexistente | HTTP **404**, sem vazar nome de comerciante |

### O que este módulo ganhou: o primeiro E2E

Até aqui a carteira DePix — **o dinheiro irreversível do sistema** — não tinha
**nenhum** teste de fluxo real. Agora tem 4 casos, todos independentes de dado
(valem no seed e em produção):

1. a carteira abre e cabe em 320px;
2. as rotas legadas de saque levam para a carteira — se uma delas voltar a
   renderizar tela própria, é sinal de que o saque ganhou uma **segunda porta**,
   que é exatamente o padrão que este programa encontrou em três módulos;
3. token de pagamento inexistente responde 404 sem expor nada;
4. a página de pagamento cabe em 320px.

## Checklist de frontend

| Eixo | Situação |
|---|---|
| 1. Erro visível | ✅ (correção transversal do M1) |
| 2. Carregando / disabled | ✅ `payment-dialog` com guard de reentrância — decisão a preservar |
| 3. Invalidação após mutação | ✅ |
| 4. Estado vazio | ✅ carteira não provisionada cai na tela de setup |
| 5. Permissão | ✅ saque exige admin + 2FA |
| 6. Formatação pt-BR | ✅ |
| 7. Mobile 390px e 320px | ✅ 52 combinações limpas + página pública |
| 8. Acessibilidade | ✅ |
| 9. Reconciliação | ✅ invariantes de dinheiro conferidas na passada de backend |
| 10. Console e rede | ✅ 0 erro |
| 11. Fluxo incompleto | ⚠️ 5 leituras do túmulo (decisão do dono) |

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

## Adendo — 2026-07-31: o histórico da carteira era inalcançável (DPX-7, P2)

**Reportado pelo dono depois do fechamento do módulo, e ele estava certo.**

O cartão "Atividade recente" mostra as **8 últimas** transações e oferece um botão
"Ver tudo" apontando para `/depix-wallet?view=all`. **Nenhuma página lia esse
parâmetro.** O clique navegava para a mesma tela e nada mudava — não havia lista
completa, paginação nem filtro em lugar nenhum.

Medido em produção no momento do conserto: **474 transações** (413 depósitos, **61
saques**) em dois meses. A loja enxergava **1,7%** do próprio histórico e não tinha
caminho para o resto. Nas palavras do dono: *"ficamos presos nos últimos saques e
só."*

O mais revelador: **`depixTransaction.list` já aceitava `page`, `pageSize`, `kind`,
`status` e intervalo de datas, e já devolvia `total` e `pageCount`.** A paginação
existia no backend desde sempre. Faltava a tela — e o link apontava para um lugar
que não existia.

**Correção:** `/depix-wallet/transactions`, com paginação de 25 por página e os
filtros de tipo e situação que a procedure já suportava. O "Ver tudo" passou a
apontar para lá. A linha de transação foi **extraída** para um componente
compartilhado (`transaction-row.tsx`) em vez de duplicada — renderizar a mesma
linha em dois lugares com dois códigos é o padrão que este sistema já pagou caro
sete vezes.

Verificado no navegador contra a cópia de produção: **1–25 de 322, página 1 de
13**; a página 2 traz conteúdo diferente; o filtro "Só saques" mostra **1–25 de
53** em 3 páginas.

### Por que a minha passada não pegou

O crawler visita `/depix-wallet`, a tela renderiza, não há erro de console nem
request falho — **passa como `ok`**. Um link que navega para a própria página com
um parâmetro ignorado é indistinguível de um link que funciona, para um detector
que só olha se a tela quebrou.

O checklist de frontend tem o eixo certo (nº 11: *"botão que não faz nada, feature
meia-implementada"*), e eu não o apliquei aqui: não cliquei no "Ver tudo". A lição
é específica e vale registrar — **em toda tela com "ver mais/ver tudo/histórico
completo", seguir o link e conferir se ele leva a algo diferente do que já estava
na tela.**

### Cobertura

Quatro casos novos em `depix-wallet.spec.ts`. Dois deles usam `test.skip()`
**explícito** quando o seed não tem carteira provisionada nem transação — um teste
que passa por falta de dado não guarda nada, e esconder isso já foi erro deste
programa antes.
