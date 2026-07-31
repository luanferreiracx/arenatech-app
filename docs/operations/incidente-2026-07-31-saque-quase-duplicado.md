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

## Limite conhecido, declarado

A guarda **não** bloqueia quando o saque anterior está `FAILED` — um saque que a
Eulen recusou (limite diário, chave inválida) precisa poder ser refeito na hora.

Mas `FAILED` no nosso banco **não prova que o dinheiro não saiu**. Dos 9 saques
FAILED em produção, dois têm causa indeterminada: `HTTP 520` e
`Resposta invalida: sem id`. O incidente de 2026-07-27 foi exatamente isso — a
transação tinha sido transmitida e o app gravou FAILED.

Nesse caminho quem protege é a chave estável (a 2ª tentativa da mesma intenção é
deduplicada), não a guarda. Se o operador limpar o storage ou trocar de
dispositivo, a proteção não existe.

**Decisão do dono, em aberto:** vale registrar no saque se a falha foi *recusa
definitiva* ou *resultado desconhecido*, e bloquear repetição no segundo caso?
Custa uma coluna e uma migration; fecha o último buraco.

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
pnpm test:unit                       # 2051 verdes (+11)
pnpm test:integration                # 310 verdes (+6)
```
