# Bloco C — triagem (17 P2 + 6 P3)

> 2026-08-06. Feita com a skill `reviewing-code`, cuja regra é explícita:
> **não revisar sem rodar o código** e **não bloquear em não-crítico**.
>
> Nenhum item do Bloco C tem urgência de comercialização — os 2 P0 e os 9 P1
> técnicos já estão em produção. A pergunta aqui não é "dá para corrigir?", é
> **"corrigir isto muda alguma coisa para alguém?"**

## Corrigido (4)

### C2 — Status DePix divergente dentro do mesmo arquivo

**Único do bloco com efeito visível para o cliente.** `quick-sale.ts:294` usava a
fonte única `isSettledForSaleDepixStatus` (que aceita `PROCESSING`); a linha 464
reimplementava o mapeamento à mão e **não** aceitava.

`PROCESSING` num depósito de venda só é gravado depois do PIX cair — a fonte
única documenta isso. O resultado da divergência: o cliente pagava, o `markPaid`
liberava a venda por um caminho, e a tela de status dizia "pendente" pelo outro.

Passa a usar a fonte única. O teste-guardião afirma a **regra**, não a chamada:
se alguém reintroduzir uma lista de status escrita à mão, ele quebra. Verificado
revertendo o fix.

### C4 — 25.277 webhooks do Chatwoot mascarando sinal

O chatwoot era o **único** provider que gravava evento e nunca chamava
`markWebhookProcessed`.

Não era só métrica morta: **foi esse ruído que escondeu o P0 da Etapa 1**. Uma
consulta de "webhooks não processados" devolvia 25 mil linhas, e os 83 de saque
da Eulen em `not_found` — que representavam dinheiro — sumiam no meio.

Marca ao fim do processamento, quando a mensagem foi persistida. O agendamento do
Talison é fire-and-forget de propósito, então o sucesso dele não é condição.

### C3 — Código morto que discordava da fonte única

`calculateCashOnHand` e `getPaymentMethodSummary`: **zero call sites**, e a
primeira filtrava `paymentMethod = 'dinheiro'` literal, em reais, sem passar por
`affectsCashDrawer` — ignorava `ajuste_manual` e a normalização de token que
`computeCashDrawerCents` faz.

Duas respostas para "quanto tem na gaveta", e a errada esperando alguém importar
por engano. Removidas, com o porquê registrado no lugar.

---

## Não corrigido, com razão declarada

### `decimalToCents` em 15 cópias — **fica**

15 definições byte-idênticas de `Math.round(Number(v) * 100)`. A tentação é
extrair para um módulo comum.

**Por que não:** as 15 são idênticas *hoje* e o risco declarado na auditoria é
uma correção futura ser aplicada em 14 lugares e esquecida no 15º. Mas extrair
significa tocar 15 arquivos de dinheiro para **zero mudança de comportamento** —
exatamente o tipo de refactor de baixo retorno e risco não-zero que a skill
`software-engineering` chama de over-engineering.

**O que fazer em vez disso:** quando *houver* uma mudança real na conversão
(arredondamento bancário, tratamento de negativo), aí sim extrair — a mudança
paga a extração. Registrado como gatilho, não como tarefa.

### 204 vendas antigas sem recebível — **fica**

R$ 146 mil em vendas de cartão sem `CardReceivable`, todas anteriores a agosto. O
buraco **já foi estancado** (agosto tem 0). Não é dinheiro perdido: as vendas
existem; o que está incompleto é o DRE e a conciliação por adquirente daqueles
meses.

**Por que não:** backfill de recebível exige inventar a taxa vigente de cada
venda, e taxa errada é pior que ausência — envenena a conciliação em vez de
consertá-la. O dono sabe que aqueles meses estão incompletos.

### IDOR em `subscriptionChargeStatus` — **fica, com gatilho**

Admin de um tenant lê `{status, paid, expiresAt}` de cobrança de assinatura de
outro. **0 cobranças de assinatura em produção** — não há dado para vazar.

**Gatilho:** corrigir *antes* de ligar o billing automático (ADR 0058). Uma linha
(`tenantId: ctx.tenantId` no `where`), mas hoje seria correção de superfície
inexistente.

### PII sem DPA nos provedores de LLM — **fica, é decisão de negócio**

CPF e histórico vão para DeepSeek (China), imagens para Anthropic, áudio para
Groq. Sem redação, sem DPA, sem opt-out de treinamento. O `Customer.unsubscribed`
existe e o bot não o consulta — mas **0 de 1.407 clientes** optaram.

**Por que não é código:** contratar DPA e definir política de retenção é decisão
do dono, não do desenvolvedor. O que dá para fazer em código (consultar o opt-out
no pipeline do Talison) é pequeno; o que falta é a decisão jurídica.

**Vira P0 de conformidade ao vender para terceiros** — processar PII de clientes
*deles* sem contrato é a primeira pergunta de um cliente corporativo.

### Sem rate limit no bot — **fica, com número**

Atacante persistente por 24h custaria ~US$ 220. Não é ruinoso hoje (o bot inteiro
custa ~US$ 12/mês), mas escala com o número de atacantes.

**Gatilho:** quando o custo mensal do bot passar de ~US$ 50, ou no primeiro
cliente que não seja o dono.

### Navegação truncada sob WCAG 1.4.12 — **fica**

Três itens de menu truncam com o override de espaçamento de texto, sem `title`
nem `aria-label`. P2 real, correção pequena.

**Por que não agora:** é o item de menor consequência do bloco e a correção mexe
no layout do menu — vale fazer junto da próxima mudança de navegação, não isolado.

### Disco em 81% — **fica como pendência de operação**

~13 GB recuperáveis identificados (volume do Esplora abandonado, builder órfão,
imagens). **Não é código.**

Não removi porque o Esplora próprio está em andamento pelo dono e o volume de
5,1 GB pode ser reaproveitado no cutover. Apagar agora poderia jogar fora índice
que ele vai querer.

---

## O que a triagem ensinou

Dos 23 itens, **4 mudavam algo para alguém**. Os outros 19 são de três tipos:

1. **Risco sem incidência** (IDOR sem dados, PII sem opt-out) — corrigir agora é
   trabalho especulativo; o certo é registrar o gatilho.
2. **Dívida honesta já estancada** (vendas sem recebível) — o custo de "consertar"
   é maior que o de conviver.
3. **Decisão de negócio disfarçada de bug** (DPA dos LLMs) — não é o
   desenvolvedor que decide.

A skill `reviewing-code` diz para não bloquear em não-crítico. A leitura útil
aqui é a inversa: **não trabalhar em não-crítico só porque está na lista.**
