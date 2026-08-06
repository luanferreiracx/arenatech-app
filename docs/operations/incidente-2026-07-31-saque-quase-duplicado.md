# Incidente 2026-07-31 — saque DePix quase pago duas vezes (2ª ocorrência)

**Relato do dono:**

> Mais uma vez quase fiz um saque duplicado no depix. Ao tentar sacar fechei a
> janela e abri novamente, deu um erro e apareceu o botão verde novamente para
> sacar, porém como isso já tinha acontecido por precaução não apertei — e como
> eu esperava o saque aconteceu e o recebedor recebeu o valor.

Ninguém perdeu dinheiro **porque o dono desconfiou e não clicou**. Não foi o
sistema que impediu. Um operador que confiasse na tela teria pago duas vezes.

## Causa raiz

O servidor deduplica saques por `idempotencyKey`, e o cabeçalho do
`depix-transaction.service.ts` promete isso literalmente:

> *createWithdraw: aceita idempotencyKey client-side (UUID). 2a chamada com mesma
> key retorna o registro existente sem efeito.*

A promessa era real. O que faltava era a chave chegar duas vezes igual — e a tela
garantia que isso nunca acontecesse:

```ts
const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
```

A chave vivia **enquanto o componente estivesse montado**. Fechar a janela e
abrir de novo cunhava outra. Ou seja: a proteção evaporava exatamente no gesto de
quem ficou na dúvida se o saque saiu — que é quando ela mais importa.

**Medido em produção:** 61 saques, **61 chaves distintas**, 0 nulas. A
deduplicação nunca deduplicou nada em toda a história do sistema. Ela não estava
quebrada; estava inalcançável.

É a oitava vez que este programa encontra a mesma forma: **duas metades do mesmo
controle, o endurecimento numa e os usuários na outra.**

O segundo defeito é de honestidade da UI. `onError` era:

```ts
onError: (err) => toast.error(err.message),
```

Todo erro virava "não deu certo", e o formulário voltava armado. Num timeout a
resposta correta não é "não saiu" nem "saiu": é **não sei**. E foi justamente o
caso — o saque tinha saído.

## O que mudou

**1. A chave nasce da intenção, não da montagem da tela**
(`src/lib/depix/withdraw-retry-safety.ts`)

Ela é derivada de destino + valor e mora no `sessionStorage`. Fechar e reabrir
reenvia a mesma chave, e aí a deduplicação que o servidor já tinha finalmente
vale. `onSuccess` descarta a chave, para que um segundo saque *deliberado* ao
mesmo destino continue possível.

O padrão já existia na casa — `depix-fee-wallet-admin.ts:152` deriva a chave de
`(admin + valor + minuto)` para transferências de taxa. O caminho do cliente, que
move mais dinheiro, não tinha.

**2. Erro de rede para de mentir**

A tela agora distingue "o servidor recusou" de "não obtive resposta". No segundo
caso o formulário **sai de cena** e a única saída é conferir a lista de
transações. Códigos desconhecidos contam como incertos: o default é o seguro.

**3. Guarda de quase-duplicata no servidor** (SQ-1)

Rede de segurança para quando a chave não ajuda (outro navegador, outro
dispositivo, storage limpo): um segundo saque com **mesma chave PIX e mesmo
valor** dentro de 10 minutos é recusado com `CONFLICT`, nomeando a transação
anterior e há quantos minutos ela nasceu. Recusa em vez de deduplicar em
silêncio — se o operador quer mesmo mandar de novo, a decisão é dele, com o
número na mão.

Roda **antes** de qualquer efeito: com a guarda desligada, o erro que aparece no
lugar é "Saldo insuficiente", o que prova a ordem.

**4. Registro falho devolvido pela dedupe não vira "Saque enviado!"**

Buraco que a própria correção 1 abriu, e que só apareceu ao medir os FAILED de
produção: a dedupe devolve o registro existente **inclusive quando ele nasceu
falho** (limite diário, compliance). Sem esta checagem o operador veria um toast
verde sobre um saque que nunca saiu. Agora a chave é descartada e a mensagem diz
a verdade.

## Prova de dados (produção, leitura)

| | |
|---|---|
| Saques | 61 |
| Chaves de idempotência distintas | **61** (0 nulas) |
| Pares de saques idênticos em ≤10 min | **1** |

O par: `TXW20260614-00004` seis minutos depois de `TXW20260614-00003`, mesma
chave PIX, **R$ 150,00 cada, ambos COMPLETED**. Os dados não dizem se foi
acidente ou intenção — mas é exatamente a assinatura do incidente, e a guarda o
teria recusado nomeando o anterior, deixando a decisão com o operador.

## Prova de uso (navegador real)

Reproduzido em Chromium contra o app rodando, derrubando a chamada de
`createWithdraw` no meio (`abort("connectionreset")`) — o timeout do incidente:

| | Antes | Depois |
|---|---|---|
| Botões na tela após a queda | `["Voltar", "Confirmar saque"]` | `[]` |
| Chave na 1ª tentativa | `cf5b4330…` | `27f55a7c…` |
| Chave após fechar e reabrir | `298bb16c…` **(outra)** | `27f55a7c…` **(a mesma)** |

O botão verde some, e a 2ª tentativa passa a ser deduplicada em vez de virar um
segundo saque.

O saldo e o 2FA do ambiente local não existem; foram injetados **reescrevendo a
resposta HTTP no navegador**, sem alterar uma linha do app.

## Segunda rodada — o buraco do `FAILED` (SQ-2)

A primeira correção deixou um buraco declarado, e o dono mandou fechar.

A guarda não bloqueava sobre `FAILED`, porque um saque que a Eulen recusou
(limite diário, chave inválida) precisa poder ser refeito na hora. Só que
`FAILED` no nosso banco **nunca provou que o dinheiro não saiu**: o incidente de
2026-07-27 foi exatamente um saque transmitido e gravado como FAILED, e o
operador pagou duas vezes confiando no registro.

Medido em produção: dos 9 saques FAILED, **dois têm causa indeterminada** —
`Erro ao solicitar saque: HTTP 520` e `Resposta invalida: sem id`.

**A distinção virou um fato de primeira classe do saque.** Enum
`DepixWithdrawFailureKind { REJECTED, UNKNOWN }` gravado junto com o `FAILED`,
classificado onde o sistema realmente sabe:

| Situação | Classificação | Por quê |
|---|---|---|
| Validação local (CPF, chave PIX) | `REJECTED` | Nem chegamos a chamar a Eulen |
| HTTP 4xx (exceto 408/429) | `REJECTED` | Ela entendeu o pedido e disse não |
| HTTP 5xx, 408, 429 | `UNKNOWN` | Pode ter processado antes de falhar em responder |
| 200 com erro de negócio | `REJECTED` | Recusa explícita |
| 200 sem `withdrawalId` | `UNKNOWN` | Pode ter criado o saque do lado dela |
| Timeout / rede | `UNKNOWN` | O clássico |
| Saldo insuficiente após cotação | `REJECTED` | Abortado antes de transmitir |
| Janela expirada antes do sweep | `REJECTED` | Abortado antes de transmitir |
| LWK transfer falhou | `UNKNOWN` | O lock não cobre o broadcast |

`408` e `429` são 4xx de nome, mas não recusam nada — um é timeout, o outro é
"pergunte depois". Classificá-los como recusa reabriria o buraco.

**A guarda passou a bloquear `FAILED` com causa incerta**, com mensagem própria:
o operador vê "falhou" na lista, e se a recusa não explicasse o porquê ele leria
como bug e procuraria um contorno.

`failureKind` nulo (registros anteriores a esta migration) conta como **incerto**.
Tratar nulo como recusa reabriria o buraco justamente no histórico do incidente.

### A tela parou de mentir junto

O bloqueio no servidor não bastava: a lista mostrava esse saque **riscado e
cinza**, e o detalhe dizia **"Valor (não creditado)"**. Foi essa leitura que
produziu o pagamento em dobro. Agora:

| | Recusa definitiva | Causa incerta |
|---|---|---|
| Etiqueta | `Falhou` | `Verificar` |
| Linha na lista | riscada, cinza | destaque de atenção |
| Rótulo do valor | "Valor (não creditado)" | "Valor (envio não confirmado)" |
| Aviso | erro do provedor | *"Este saque consta como falho, mas o envio não foi confirmado. Confirme com o destinatário antes de enviar de novo."* |

Verificado em navegador, 1440px e 390px, com um saque de cada tipo: a recusa
comum continua discreta (senão o aviso vira ruído e ninguém lê) e a incerta salta.
A etiqueta é a mesma nas duas telas — "Falhou" na lista e "Verificar" no detalhe
seria a mesma transação com dois nomes.

### Testes que reprovam antes

```
Integração:
  × bloqueia quando a falha anterior foi INDETERMINADA
  × a mensagem explica POR QUE bloqueia um saque que consta como falho
  × registro antigo, sem classificação, conta como incerto
      → 'Saldo disponivel insuficiente…'   (a guarda não chegou a rodar)

Unit:
  × falha de comunicação fica marcada para verificação
  × registro antigo, sem classificação, também fica marcado
```

Controles negativos que seguem passando: recusa definitiva **não** bloqueia e
**não** polui a tela; falha incerta fora da janela de 10 min não bloqueia.

### Migration

`20260731150000_depix_withdraw_failure_kind` — enum, coluna nullable, índice
parcial (só saques falhos de causa incerta) e backfill que classifica apenas o
que a mensagem torna inequívoco. `HTTP 520`, `Resposta invalida: sem id` e
`falha ao transferir` ficam deliberadamente sem classificação, ou seja, incertos.

Verificada aplicando **todas** as migrations num banco vazio — é o que o CI faz.

## Testes que reprovam antes da correção

```
Integração — __tests__/integration/depix-withdraw-duplicado.test.ts
  × é recusado quando já existe um PENDING recente
  × é recusado quando já existe um PROCESSING recente
  × é recusado quando já existe um COMPLETED recente
  × a mensagem nomeia a transação anterior
      → 'Saldo disponivel insuficiente…'   (a guarda nem chegou a rodar)

Unit — __tests__/unit/depix-withdraw-retry-safety.test.ts
  × fechar e reabrir a janela reenvia a MESMA chave
      → expected 'uuid-2' to be 'uuid-1'
  × timeout, queda de rede e 5xx deixam o estado INDETERMINADO
  × código desconhecido conta como incerto
```

Controles negativos que continuam passando (a guarda não pode ser cega): saque
`FAILED` não bloqueia nova tentativa; fora da janela de 10 min não bloqueia.

## Verificação

```bash
pnpm typecheck && pnpm lint          # 0 erros
pnpm test:unit                       # 2059 verdes (+19)
pnpm test:integration                # 314 verdes (+10)
```

---

## Estado do TXW20260727-00002 antes da correção (registro histórico)

Durante o incidente foi criada a tabela `_fix_txw20260727_00002_backup` no banco
de produção, com a linha original antes de o status ser corrigido.

A auditoria de 2026-08-05 (P1-B5) encontrou essa tabela **ainda em produção, com
RLS desabilitado** — 1 de 2 exceções entre 113 tabelas com `tenant_id`. Ela
guarda `pix_key`, `recipient_name` e `recipient_tax_id` (CPF), e `app_user` — o
role que a aplicação usa em toda requisição — a lia sem filtro de tenant.

O estado que importava foi preservado aqui, **sem os campos pessoais**, e a
tabela foi removida:

| campo | valor |
|---|---|
| `number` | TXW20260727-00002 |
| `status` (antes da correção) | **FAILED** |
| `status` (atual, correto) | **COMPLETED** |
| `gross_amount_cents` | 39394 |
| `net_amount_cents` | 39000 |
| `pix_key_type` | PHONE |
| `withdraw_tx_id` | (vazio — o app não tinha registrado o broadcast) |
| `created_at` | 2026-07-27 19:03:52 |

O `withdraw_tx_id` vazio com a transação de fato transmitida é a assinatura do
incidente: **o banco dizia que o saque falhou e a transação estava na rede.** Foi
o `idempotency.json` do LWK que desempatou — o mesmo arquivo que passou a ter
backup automatizado em 2026-08-05 (ver [backup.md](./backup.md)).

**Lição de operação:** tabela de socorro criada durante incidente precisa de
prazo de validade. Esta viveu 9 dias em produção, fora do modelo de isolamento,
guardando CPF — e ninguém teria notado sem a auditoria.
