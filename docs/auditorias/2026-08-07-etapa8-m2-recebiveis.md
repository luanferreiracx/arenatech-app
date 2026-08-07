# Etapa 8 · Módulo 2 — Recebíveis de cartão

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-backend`.

## Escala

**249 recebíveis, R$ 123.138,08 a receber.** É dinheiro de terceiro (a
adquirente deve à loja) — erro aqui não some do caixa, some do *futuro* do
caixa.

---

## O que resistiu

O invariante central passou íntegro nos 249 registros:

| verificação | resultado |
|---|---|
| `gross − fee = net` | **0 divergências** |
| líquido > bruto | 0 |
| taxa negativa | 0 |
| bruto ≤ 0 | 0 |

E os dois caminhos de estado estão bem construídos:

- **`settle`** é `tenantAdminProcedure`, valida ownership da conta, usa **CAS**
  (`updateMany` com `status: "PENDING"`) e escreve audit log. A razão do CAS
  está no código: sem ela, dois settles concorrentes passavam ambos o `findMany`
  e o segundo sobrescrevia a conciliação do primeiro.
- **`unsettle`** cobre um caso que quase ninguém lembra: se a venda de origem
  foi cancelada, o recebível volta para `CANCELLED`, não `PENDING` — senão
  viraria "dinheiro fantasma a receber numa venda que não existe mais".
- **Fonte única de criação**: só `card-receivable-writer.service.ts` cria
  recebível, e ele resolve a taxa pelo mesmo `resolveAcquirerRate` do breakdown
  da venda — sem drift entre DRE e recebível.

---

## E8-2 — Venda no cartão sem recebível falhava em silêncio — ✅ CORRIGIDO

`generateCardReceivables` tem dois `return 0`:

```ts
if (!acquirer) return 0;   // adquirente não é do tenant
if (!rate)     return 0;   // sem taxa cadastrada p/ a combinação
```

O fallback **está certo** e é decisão de projeto documentada: não bloquear a
finalização da venda por causa de configuração ausente. O problema é o
**silêncio** — o chamador (`sale.ts:1874`) descarta o retorno, e nada em log,
métrica ou tela registra que aquela venda ficou sem recebível.

Dinheiro que a loja tem a receber simplesmente não existe no sistema, e ninguém
descobre até conferir o extrato da adquirente.

### O que a medição mostrou

| período | vendas no cartão | sem recebível |
|---|---|---|
| mai/26 | 21 | 21 |
| jun/26 | 134 | 134 |
| jul/26 | 196 | 49 |
| **ago/26** | 32 | **0** |

O corte é limpo em **08→09/07** — o deploy do writer. Antes, nenhuma venda
gerava recebível; depois, todas. **179 vendas pós-writer, zero lacunas.**

As 204 antigas (R$ 124.039) são o passivo já conhecido e registrado no
consolidado como "já estancado" — confirmado aqui com dado, não com memória.

### Por que ainda importa

O gatilho está armado: o adquirente **`stone` do tenant `pdv-09ed1f82` está
ATIVO com ZERO taxas cadastradas**. A primeira venda no cartão dele cai no
`if (!rate) return 0` e some sem deixar rastro.

### As defesas que já existiam

Verifiquei antes de propor — e elas são boas:

- a tela de configuração **avisa** "Sem taxas cadastradas" quando
  `rateCount === 0` (`acquirers-tab.tsx:238`);
- o PDV **só oferece** bandeiras e parcelas que têm taxa ativa
  (`availableBrands`, `availableInstallments`).

Nenhuma cobre o **instante da falha**. É defesa em profundidade: prevenir na
configuração **e** gritar quando escapar.

### O fix

`logger.error` nos dois pontos, com `tenantId`, `saleId`/`serviceOrderId`,
`acquirerId` e `grossCents` — sem o contexto o alerta é inútil (sabe-se que
falhou, não em quê). Nível `error` porque é dinheiro a receber, não aviso de
rotina.

**O comportamento não muda**: continua não bloqueando a venda. O teste afirma as
duas metades do contrato — não lança, mas avisa.

---

## O guardião errou primeiro (de novo)

A primeira versão deste teste **passou verde contra o código defeituoso**. O
detector procurava `/^\s*return 0;/` — `return` isolado na linha. Mas o código
com o bug escrevia inline:

```ts
if (!acquirer) return 0;
```

...que o regex não reconhecia. Corrigido para `/\breturn 0;/`, e então aponta as
linhas **61 e 71**.

É a terceira vez neste programa que um teste-guardião falha no mesmo modo: **ele
não foi visto falhar contra o bug antes de ser aceito**. A regra que adotei
desde o M7 — rodar o teste contra o código sem o fix — foi o que pegou.

---

## Achado descartado

**"187 recebíveis vencidos, R$ 103.961, nenhum liquidado"** — parecia
inadimplência ou baixa quebrada. Não é defeito: **a baixa é manual por
projeto** (`settle` é `tenantAdminProcedure`, e não existe cron de liquidação
entre os 13 do sistema). O admin concilia contra o extrato da adquirente quando
o dinheiro cai.

Registro porque é uma **decisão de produto que vale revisitar**: 187 recebíveis
vencidos, o mais antigo de 10/07 (quase um mês), significa que a conciliação não
está sendo feita. O sistema está correto; o processo é que não acontece.

---

## Baixa confiança

- **Não testei o `settle` sob concorrência real.** O CAS está no lugar e a
  razão documentada, mas não reproduzi dois settles simultâneos.
- **Não auditei `previewCardSettlement` nem os subdomínios de configuração**
  (contas de recebimento, bandeiras) com a mesma profundidade — verifiquei o
  nível de acesso de todas as procedures (todos corretos: leitura
  `tenantProcedure`, escrita `tenantAdminProcedure`), não a lógica.
- **Não confirmei se as 204 vendas antigas sem recebível terão tratamento.**
  São R$ 124.039 que a loja recebeu (ou vai receber) da adquirente sem registro
  no sistema — o DRE e o fluxo de caixa não os enxergam. **Decisão sua**:
  backfill ou aceitar como passivo histórico.
