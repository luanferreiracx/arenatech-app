# ADR 0066 — Aprovar um cliente só-carteira é um ato só

- **Status:** Aceito
- **Data:** 2026-08-03
- **Contexto:** [ADR 0064](0064-plano-escolhido-no-cadastro.md) (plano escolhido no cadastro), [ADR 0062](0062-depix-multicarteira-e-saque-por-autorizacao.md) (gate `depixEnabled`), [ADR 0061](0061-comercializacao-self-service.md) (comercialização self-service)

## Contexto

Existem clientes que vêm **exclusivamente pela carteira DePix** e nunca vão tocar
em PDV nem em ordem de serviço (decisão do dono, 2026-08-03). Para eles não há
plano a vender: a receita vem da taxa das transações.

O caminho já existia — aprovar sem plano. O ADR 0064 preservou isso de propósito:
`planId` nulo é estado válido, e sem plano não se abre assinatura (não há o que
cobrar nem o que expirar).

Só que ele tinha uma armadilha. O gate `Tenant.depixEnabled` nasce `false` desde
o ADR 0062, por um bom motivo: não impor a superfície mais frágil do sistema
(Esplora pública, cache do LWK, off-ramp de terceiro) a quem contratou o sistema
para vender celular e nunca vai tocar em DePix.

O resultado é que aprovar um cliente só-carteira eram **dois atos**:

1. aprovar sem plano;
2. abrir a ficha do tenant e ligar o toggle DePix.

Esquecer o passo 2 entrega uma tela **vazia**. Medido: com o gate desligado e sem
plano, os módulos visíveis são `["settings"]` — nem PDV, nem carteira. Com o gate
ligado, `["wallet", "depix-ops", "settings"]`. Quem pagava o esquecimento era
justamente o cliente que só veio pela carteira.

Havia ainda uma ambiguidade no contrato: `planId: null` significava tanto "não
mandei nada, usa o que o cliente escolheu na vitrine" quanto "não quero plano
nenhum". Aprovar só-carteira um cadastro vindo da página de preços daria o plano
escolhido do mesmo jeito.

## Decisão

**1. `walletOnly: boolean` no `approvePreRegistration`.**
Flag própria, não `planId: null`. Quando `true`, descarta qualquer plano —
inclusive o que o cliente escolheu na vitrine. A intenção explícita do superadmin
vence a escolha do cliente, e o contrato deixa de ser ambíguo.

**2. Aprovar só-carteira liga `depixEnabled` no mesmo ato.**
Um passo, sem esquecimento possível. O gate continua nascendo `false` para todo
o resto: quem aprova com plano **não** ganha carteira por engano (o ADR 0062
segue valendo integralmente).

**3. Sem assinatura.**
Não há plano, logo não há o que cobrar nem o que expirar. Criar uma assinatura
zerada faria o tenant aparecer em métricas de receita e no funil de cobrança sem
nunca ter comprado nada.

**4. A tela de aprovação passa a ter modo explícito.**
Dois modos: *Com plano — inicia o teste grátis* (com seletor de plano) e *Só a
Carteira DePix — sem plano, sem cobrança*. O default é "com plano", que já vem
certo quando o cliente escolheu na vitrine. Quando não há plano escolhido **e** o
modo é "com plano", o botão fica **desabilitado** até selecionar um: não existe
caminho silencioso para criar a tela vazia.

**5. Ligar o gate fica no audit log** (`tenant.depix.enable`).
Ligar o DePix é mudança de postura de risco. O caminho manual (`updateTenant`) já
deixava rastro; o automático não podia ser o único que não deixa.

## Consequências

**Boas**
- O cliente só-carteira entra e **vê a carteira**. Antes, dependia de o
  superadmin lembrar de um segundo passo numa outra tela.
- O superadmin decide caso a caso, olhando o cadastro. A intenção fica registrada
  (audit log) e visível (o botão muda de rótulo: "Aprovar só com carteira").
- O ADR 0062 é preservado: aprovar com plano continua **não** ligando a carteira.

**Custos e riscos**
- Aprovar ficou uma decisão de duas opções em vez de um botão. É deliberado — a
  decisão sempre existiu, só era invisível e tomada por omissão.
- O cliente só-carteira **não aparece na vitrine**: é um caminho de venda
  assistida dentro de um sistema self-service. Se um dia esse público crescer, o
  passo natural é um plano "Carteira" no catálogo (avaliado e descartado agora —
  ver abaixo).

## Alternativas descartadas

- **Plano "Carteira" no catálogo, com zero módulos de plano.** O cliente se
  auto-selecionaria na página de preços, sem passar pela mesa do superadmin. Boa
  ideia quando o volume justificar; hoje anunciaria na vitrine um produto
  gratuito ao lado de quatro pagos, competindo com eles por atenção. O dono optou
  por manter fora da vitrine.
- **Ligar `depixEnabled` para todo tenant novo.** Resolveria o esquecimento e
  desfaria o ADR 0062: jogaria 100% dos clientes novos na superfície mais frágil
  do sistema, inclusive quem nunca vai tocar em DePix.
- **Usar `planId: null` como sinal de só-carteira.** Sem flag separada, aprovar
  só-carteira um cadastro vindo da vitrine daria o plano escolhido do mesmo
  jeito — o `??` cairia em `pr.planId`.

## Verificação

- `__tests__/integration/funil-self-service.test.ts` — 4 casos: liga o gate sem
  plano e sem assinatura; **descarta** o plano escolhido na vitrine; registra no
  audit log; e aprovar **com** plano não liga a carteira por engano. Verificado
  que 2 deles falham quando a linha que liga o gate é removida.
- Navegador real (superadmin logado, pré-cadastro pendente): os dois modos com
  rótulos associados, botão desabilitado sem plano, rótulo mudando para "Aprovar
  só com carteira", 320px e 200% de zoom sem reflow, zero erros de console.
  Conferido no banco depois de aprovar: `depix_enabled = t`, sem plano, 0
  assinaturas, 1 registro de `tenant.depix.enable`.
