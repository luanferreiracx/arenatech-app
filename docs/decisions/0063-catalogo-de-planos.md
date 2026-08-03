# ADR 0063 — Catálogo comercial: quatro planos e a divisão do PDV

## Status

Aceito — 2026-08-03. Complementa o [ADR 0061](./0061-comercializacao-self-service.md),
que montou a máquina de cobrança; este define o que se vende nela. Convive com o
[ADR 0062](./0062-depix-multicarteira-e-saque-por-autorizacao.md), que tornou o
piso da carteira condicional a `Tenant.depixEnabled` — os dois mexem no gating de
módulo e foram escritos em paralelo.

## Contexto

Produção tinha dois planos: FREE (R$ 0, só carteira) e PRO (R$ 299,99, tudo).
Preço único, sem escada. O dono definiu quatro degraus:

1. assistência técnica e o que ela precisa para funcionar, até 3 pessoas;
2. PDV e o que ele precisa para funcionar, até 3 pessoas;
3. tudo do 2 mais fiscal;
4. completo.

E pediu para aposentar a consulta de IMEI, preservando o código.

### O conflito que apareceu ao montar

O grafo de dependências dizia `service-orders → pdv`, porque a OS é paga pelo
PDV (`sale.createFromOS`). Com "PDV" sendo um módulo só, o plano de assistência
arrastava a venda de balcão junto — e o plano 2 virava subconjunto do plano 1.
Dois planos, um deles sem razão de existir.

## Decisão

### `pdv` vira dois módulos

- **`pdv`** — a base: caixa, histórico e **recebimento de OS**.
- **`pdv-retail`** — abrir venda do zero (venda de balcão).

A divisão está onde os dois fluxos já divergiam no código: `/pdv` sem `?saleId`
chama `sale.createDraft` e abre venda livre; com `?saleId` está pagando uma OS,
e o rascunho veio de `createFromOS`. O gate por módulo, que resolvia por ROUTER,
ganhou um override por PROCEDURE (`PROCEDURE_MODULE`) para poder gatear
`sale.createDraft` sem tirar do plano de assistência o recebimento da própria OS.

Consequência: assistência e varejo deixam de ser comparáveis por inclusão. Cada
um tem algo que o outro não tem, que é o que justifica vender os dois.

### Aposentadoria de módulo

`RETIRED_MODULES` é uma lista de módulos cujo código fica inteiro e cujo recurso
não é oferecido a ninguém — nem por plano, nem pelo tenant de acesso total, nem
por plano legado que ainda cite a chave (o filtro é na leitura). Voltar a
oferecer é tirar a chave da lista.

Primeiro item: `imei-lookup`. Medição que sustenta: **3 consultas em produção, a
última em 29/05**.

O tenant de acesso total entra na regra de propósito. "Morto" que continua vivo
na loja do dono não é morto, é exceção esquecida — e exceção esquecida é o que
faz o recurso voltar sem ninguém decidir.

### O catálogo

| Plano | Preço | Equipe | Módulos escolhidos |
|---|---|---|---|
| Assistência | R$ 149 | 3 | `service-orders` |
| Varejo | R$ 149 | 3 | `pdv-retail`, `tools` |
| Varejo + Fiscal | R$ 199 | 5 | `pdv-retail`, `tools`, `fiscal`, `commissions` |
| Completo | R$ 279 | 10 | os quatro acima + `tools` |

Só o escolhido aparece; os pré-requisitos entram na gravação
(`withModuleDependencies`), como no editor de plano. Por isso Assistência cita
apenas `service-orders` e ainda assim recebe caixa, estoque, financeiro e
clientes.

Carteira DePix, link de cobrança e configurações não aparecem em plano nenhum:
são sempre-ligados desde o ADR 0061.

A definição mora em `lib/plans/catalog`, lida pelo seed de desenvolvimento e pelo
script de sincronização de produção. Cadastrar plano em dois lugares vira duas
verdades.

## Alternativas consideradas

**Deixar `service-orders → pdv` e vender assistência com venda livre junto.**
Rejeitada: o plano de varejo perde a razão de existir, e o dono estaria dando de
graça o recurso que quer cobrar no degrau ao lado.

**Quebrar a dependência técnica e dar à OS um caminho de pagamento próprio.**
Rejeitada por custo e risco: duplicaria finalização, caixa, recebíveis e fiscal.
A trava por procedure entrega o mesmo resultado comercial sem tocar em dinheiro.

**Flag `pdvOsOnly` no `features` do plano.** Rejeitada: seria um segundo
mecanismo de gating ao lado do de módulos, e o padrão "duas implementações da
mesma regra" já custou caro sete vezes neste projeto.

**Apagar o código da consulta de IMEI.** Rejeitada pelo dono: aposentar preserva
router, telas, schema e histórico, e a volta é uma linha.

## Consequências

**Positivas.** Quatro produtos distintos em vez de preço único. O grafo de
dependências deixa de ditar o empacotamento. Aposentar recurso passa a ter um
mecanismo, em vez de virar código órfão que ninguém sabe se está vivo.

**Negativas e a vigiar.** `pdv` e `pdv-retail` são fáceis de confundir no editor
de plano; os rótulos ("Vendas — base" e "Venda livre no PDV") carregam a
distinção, e um teste garante que nenhum plano do catálogo é subconjunto do
outro. Um módulo novo que precise de venda livre tem de declarar `pdv-retail`,
não `pdv`.

Planos que já existiam tinham `pdv` significando PDV completo. A migration
`20260802180000_pdv_retail_backfill` acrescenta `pdv-retail` a todos eles — sem
isso, quem já paga perderia a venda de balcão no deploy, em silêncio, no meio do
expediente.

**Ferramentas acompanham quem vende.** Simulador de parcelamento e avaliação de
aparelho entram nos planos com venda de balcão (decisão do dono). A assistência
fica de fora: o PDV dela existe só para receber a OS. Um teste garante a regra —
todo plano com `tools` tem `pdv-retail`.
