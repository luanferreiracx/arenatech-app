# Módulo 8 — Comissões

**Passada A (backend):** concluída em 2026-07-30.
**Passada B (frontend):** concluída em 2026-07-30 (5 telas × 2 papéis × 2 viewports; primeiro E2E do módulo).

## Superfície

| | |
|---|---|
| Router | `provider-commission.ts` (855) — 16 procedures |
| Serviço | `commission-preview.service.ts` — coleta de eventos, prévia e **apuração persistida** |
| Núcleo puro | `lib/commission/`: faixas progressivas, baldes, ajuda de custo, memória, janela do mês |
| Tabelas | `providers`, `provider_contracts`, `provider_commission_rules`, `provider_apuracoes`, `provider_reversals`, `provider_uncovered_days` |
| Telas | `/commissions/providers`, `/commissions/providers/[id]`, `/my-commission` |

## O que a produção diz (medido em 2026-07-30)

| | |
|---|---|
| Prestadores | 7 |
| Contratos | **3** |
| Regras | 15 — todas percentuais, **faixa única** |
| Apurações | 9, de abril a julho — **todas `OPEN`** |
| Estornos | 0 |
| Dias não cobertos | **0** |

Dinheiro real: R$ 2.661,94 em abril, R$ 2.557,32 em maio, três apurações em junho
e três em julho.

Três leituras que orientaram a passada:

1. **Ninguém nunca fechou uma apuração.** `closeApuracao` — o caminho que gera o
   PAYABLE — não rodou uma vez em produção em quatro meses. Toda a blindagem que
   as auditorias anteriores puseram ali (CAS, recomputa sob o lock, vínculo dos
   estornos) está correta e **inexercitada em produção**.
2. **Zero dias não cobertos.** Foi o que manteve o CM-1 invisível: com zero, a
   conta errada dá o resultado certo.
3. **4 dos 7 prestadores não têm contrato**, e um deles tem 60 OS.

## Achados

### CM-1 — a ajuda de custo zerava o mês inteiro por um dia de falta (P1)

`calculateAllowance` derivava os dias do mês de `periodEnd.getDate()`.
`periodEnd` é 23:59:59.999 **BRT** do último dia — ou seja, 02:59 **UTC** do dia
1º do mês seguinte. `getDate()` lê no fuso do **processo**:

| Onde | `getDate()` | `daysInMonth` |
|---|---|---|
| Mac do desenvolvedor (America/Sao_Paulo) | 31 | certo |
| Container de produção (UTC) | **1** | **errado** |

Confirmado na VPS, não inferido:

```
$ docker exec arenatech-app date
Thu Jul 30 13:33:50 UTC 2026
$ node -e '...' "2026-07-31T23:59:59.999-03:00"   # getDate()
1
```

Com `daysInMonth = 1`, `calcAllowance` faz `effectiveDays = max(0, 1 - N)`:

- **N = 0** → proporção 1/1 → valor integral. **Certo por acidente** — e é por
  isso que ninguém viu.
- **N ≥ 1** → `effectiveDays = 0` → proporção 0 → **ajuda de custo R$ 0,00**.

Nos contratos de produção a ajuda é R$ 1.000 e R$ 1.111 por mês, e representa a
maior parte do líquido de alguns prestadores (o David tem R$ 56,89 de comissão e
R$ 1.111 de ajuda em julho). O primeiro dia não coberto que alguém marcasse
apagaria o valor inteiro — e **o próprio prestador pode marcar**, pelo
self-service em `/my-commission`.

Latente hoje só porque a produção tem **zero** dias não cobertos.

**Correção:** `monthRange` passa a devolver `daysInMonth`, calculado com
`getUTCDate` sobre `Date.UTC` — aritmética de calendário, independente de fuso.
As três derivações do mês (início, fim, quantidade de dias) saem da mesma fonte.

> Vale registrar a ironia: o comentário do próprio `monthRange` **documenta** que
> o container roda UTC — foi o achado J3 da auditoria de 2026-07-11. A janela foi
> ancorada em BRT; a contagem de dias, dez linhas adiante, ficou para trás.

### CM-5 — a guarda de mês fechado existia só no caminho do prestador (P2)

`toggleMyUncoveredDay` (self-service) recusava mexer num dia cujo mês já estava
apurado e fechado. `toggleUncoveredDay` — **o caminho do admin, o que a loja
usa** — não tinha guarda nenhuma.

O valor pago não muda (`calculate` recusa fora de `OPEN`), mas os dias não
cobertos **são a justificativa do rateio da ajuda de custo**: mexer neles depois
do fechamento faz o registro discordar do que foi pago. Numa apuração de
prestador, a memória do porquê vale tanto quanto o número.

É o padrão que este programa já encontrou em cinco módulos: **duas implementações
do mesmo recurso, o endurecimento numa e os usuários na outra.** A correção não
foi copiar a guarda para o segundo lugar — foi extrair `assertApuracaoAberta` e
apagar a cópia.

De quebra, a versão que existia lia o mês com `day.getFullYear()/getMonth()`:
`"2026-07-01"` vira meia-noite UTC, e num processo em BRT cairia em **junho** —
a guarda consultaria o mês errado. Mesma família do CM-1, agora em `getUTC*`.

### CM-3 — o corte pelo teto da ajuda era invisível (P2)

`ProviderApuracao.capReduction` existe no schema, é lido pelo `getDetail` e
aparece na ficha do prestador. **Nenhum código o escrevia.** O corte acontece
dentro de `calcAllowance` (`Math.min(total, cap)`) e era descartado ali.

Efeito: contrato com teto de R$ 600 e ajuda de R$ 1.000 paga R$ 600 e a tela diz
"Redução por teto: R$ 0,00". O prestador recebe menos e o sistema não explica.

**Correção:** `calcAllowanceBreakdown` devolve total e corte — quem decide o
corte é quem o mede. Calcular de novo do outro lado seria a segunda
implementação. `calcAllowance` continua existindo como fachada fina, para não
mexer nos 9 casos de teste do núcleo puro.

### CM-4 — recalcular sem contrato vigente preservava o valor antigo (P2)

O ramo "sem contrato vigente" de `recomputeProviderApuracao` fazia `update: {}` —
ou seja, recalcular um período que perdeu a cobertura do contrato **mantinha os
valores antigos**.

Por que isso é dinheiro, e não estética: `closeApuracao` chama esse mesmo
recompute **sob o lock, imediatamente antes de gerar o PAYABLE** (foi o fix C2 da
auditoria de 2026-07-11, para não selar valor stale). Basta um admin ajustar a
vigência do contrato para fora do mês e a apuração de R$ 1.000 vira pagamento de
R$ 1.000 sem contrato que a sustente.

**Correção:** o ramo grava zeros e o aviso, nos dois caminhos do upsert.
"Recalcular" tem que recalcular.

### CM-6 — apuração de R$ 0,00 não se distingue de "sem contrato" (P3, medido)

`recomputeProviderApuracao` grava `memoryJson.aviso = "Sem contrato vigente"`,
mas os campos da apuração ficam todos zerados — iguais aos de quem trabalhou e
não gerou comissão. E no motor, evento cujo balde não tem regra é **descartado em
silêncio** (`if (matchingRules.length === 0) continue`).

Medido em produção:

| Prestador | Contratos | Vendas | OS como técnico | Apuração |
|---|---|---|---|---|
| RODRIGO LIMA | 0 | 0 | **60** | R$ 0,00 (junho) |
| CARLOS FRANÇA | 0 | 0 | 2 | — |
| Luan Oliveira Ferreira | 0 | 656 | 20 | — |

Um técnico com 60 OS aparece com R$ 0,00 e nada na linha diz por quê.

O backend **já entregava o sinal** (`memoryJson` volta no `getDetail`); faltava a
tela usá-lo. **Resolvido na passada B** por CMU-5 (o aviso aparece em
`/my-commission`, a tela de quem recebe) e CMU-7 (o aviso da ficha passou a cobrir
também o contrato sem alíquota).

Fica aberto o pedaço menor: os baldes **descartados por falta de regra** seguem
invisíveis. Mostrá-los exigiria o motor devolver o que descartou — mudança de
contrato do `memoryJson`, sem incidência medida hoje. Registrado, não feito.

## Achados da passada de frontend

### CMU-6 — cadastrar o PRIMEIRO prestador dava 500 (P1)

`listAvailableUsers` excluía quem já era prestador com
`id: { notIn: existingProviderUserIds.length > 0 ? existingProviderUserIds : ["__none__"] }`.

`users.id` é **UUID**. Quando ainda não havia nenhum prestador, o sentinela
`"__none__"` ia para o `notIn`, o Postgres recusava o cast e a procedure devolvia
**500**. A tela de cadastro ficava presa no esqueleto, sem erro visível.

Ou seja: **a porta de entrada do módulo quebrava exatamente para quem ainda não
tinha entrado.** Invisível no `arena-tech` (7 prestadores, o `notIn` sempre
populado) e certeiro em qualquer tenant novo — **6 dos 7 tenants de produção têm
zero prestadores**.

Achado ao rodar o E2E contra o banco de seed, que também tem zero prestadores. A
cópia de produção mascarava o defeito; o banco limpo o expôs na primeira tentativa.

**Correção:** lista vazia = nenhum filtro.

### CMU-1 — a lista de usuários com CPF estava aberta a qualquer papel (P1)

`listAvailableUsers` era `tenantProcedure` e devolve `{ id, name, cpf }` de todos
os usuários do tenant. Qualquer operador podia enumerar o CPF dos colegas.

O comentário na própria procedure conta metade da história: *"SEGURANCA
(isolamento cross-tenant): so usuarios VINCULADOS ao tenant ativo. Antes listava
TODOS os usuarios do sistema (incl. CPF) de outros tenants."* Uma auditoria
anterior fechou o eixo **tenant** e deixou o eixo **papel** aberto — endurecimento
pela metade, o mesmo padrão do CM-5.

Único consumidor é o formulário de novo prestador, que é de admin. Virou
`tenantAdminProcedure`.

### CMU-2 — lista bloqueada se disfarçava de lista vazia (P2)

`ProvidersList` fazia `listQuery.data ?? []` e nunca olhava `isError`.
`listProviders` é admin-only, então para o operador a query dava 403, `data` vinha
indefinido e a tela afirmava **"Nenhum prestador cadastrado"** — com botão de
cadastrar — enquanto existiam 7.

Não é ausência de mensagem: é a tela **afirmando um fato falso** sobre o dado.
Passou a usar o `QueryErrorState` do Módulo 1, que é o que `/cashier/reviews` já
fazia certo.

### CMU-3 — o cadastro de prestador renderizava inteiro para o operador (P2)

`/commissions/providers/new` mostrava o formulário completo, com o seletor
listando nome e CPF de todo mundo e um "Cadastrar prestador" que só podia terminar
em 403. Sem os dados não há formulário a oferecer: agora resolve para o estado
bloqueado.

### CMU-7 — o aviso de "sem contrato" não cobria contrato sem alíquota (P2)

A tela avisava por `!currentContract`. O motor trata **contrato sem regras**
exatamente como sem contrato (`!contract || contract.rules.length === 0`) e grava
`aviso: "Sem contrato vigente"`.

E `createProvider` **já cria um contrato vazio**. Então todo prestador
recém-cadastrado caía no vão entre as duas condições: o motor não comissionava
nada e a tela não avisava nada. Descoberto porque o E2E do fluxo principal
esperava o aviso e não o encontrou — o teste estava certo e a tela errada.

### CMU-5 — o prestador via zeros sem explicação na PRÓPRIA tela (P2)

`/my-commission` ignorava o `memoryJson.aviso` que o motor grava. Um prestador sem
contrato via R$ 0,00 nos quatro cartões e a memória de cálculo vazia, sem nada
dizendo por quê. A ficha do **admin** avisava; a de quem **recebe**, não.

Não é hipótese: produção tem um técnico com **60 OS** e nenhum contrato.

### CMU-4 — a ficha empurrava a página no celular (P2)

615px de conteúdo em tela de 390. Três causas, todas do mesmo tipo — construção
sem estratégia de quebra declarada:

1. o formulário de estorno era `grid-cols-[130px_1fr_120px_1fr_auto]` **sem ponto
   de quebra** (só as duas colunas fixas e o botão já passam de 390px, e `1fr` tem
   mínimo automático);
2. a barra de mês + Calcular/PDF/CSV era `flex` sem `flex-wrap`;
3. três das quatro tabelas declaravam só `overflow-y` — uma delas não tinha
   contêiner nenhum. A quarta já fazia certo com `overflow-x-auto`.

Sexta vez que este mecanismo aparece no programa. Medido depois: `scrollWidth`
390 em tela de 390, zero elementos fora.

> Registro de método: minha primeira sonda apontou as tabelas como culpadas
> porque o retângulo delas ultrapassa a viewport. Só que elas estavam **dentro de
> um contêiner que rola** — falso positivo. Passei a descartar todo elemento com
> ancestral `overflow-x` auto/scroll/hidden, e aí o culpado real apareceu.

## Primeiro E2E do módulo

`__tests__/e2e/commissions.spec.ts`, 5 casos `@business`: o admin cadastra e
calcula; o operador é bloqueado na lista e no cadastro (sem ver CPF nenhum); o
prestador abre a própria apuração. Serial de propósito — os cinco compartilham um
prestador, e em paralelo dois workers tentavam cadastrar o mesmo usuário.

Verificado nos dois estados que o CI vê: banco limpo (exercita o cadastro) e
reexecução (exercita o reuso).

## Reconciliação tela × banco

Ficha do Rômulo, três meses, contra a cópia de produção:

| Mês | Tela | Banco |
|---|---|---|
| abr/2026 | R$ 1.661,94 + R$ 1.000,00 = **R$ 2.661,94** | 1661.94 / 1000.00 / 2661.94 |
| jun/2026 | R$ 1.391,82 + R$ 1.000,00 = **R$ 2.391,82** | 1391.82 / 1000.00 / 2391.82 |
| jul/2026 | R$ 519,55 + R$ 1.000,00 = **R$ 1.519,55** | 519.55 / 1000.00 / 1519.55 |

Exato nos três.

> Antes disso eu tinha "achado" que a tela mostrava julho para todos os meses. Era
> **erro da minha sonda**: o mês é `useState`, não vai para a URL, e eu navegava
> com `?month=` que a página não lê. Fica a observação de usabilidade, sem virar
> achado: a seleção de mês não é compartilhável nem sobrevive a um refresh.

## Decisão pendente do dono

**CM-2 — estorno maior que o mês some.** `netAmount` é
`max(0, bruto − estornos + ajuda)`. Se os estornos passarem do que o prestador
ganhou no mês, o excedente **evapora**: não há carry-forward em lugar nenhum do
módulo (procurei por saldo devedor, resíduo, mês anterior — não existe). No mês
seguinte a conta recomeça limpa.

Os tipos de estorno incluem `CHARGEBACK_FRAUD`, `DEFAULT_60D` e
`WARRANTY_REFUND` — justamente os casos em que o valor pode passar do mês.

Não mexi: **é decisão de negócio, não bug**. Três caminhos possíveis:

1. **Manter** — o clamp é a política (não se cobra do prestador MEI), e o
   excedente é perda da loja. Nesse caso vale registrar a decisão em ADR.
2. **Transportar** — o resíduo vira saldo devedor e desconta do mês seguinte.
3. **Registrar sem cobrar** — paga zero, mas grava o excedente para a loja saber
   o tamanho do buraco.

Hoje é a 1, por omissão, e ninguém escolheu. Latente: **0 estornos em produção**.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit      # 2030 verdes
pnpm test:integration                              # 291 verdes
pnpm test:e2e __tests__/e2e/commissions.spec.ts    # 5 verdes (novo)
pnpm tsx scripts/audit/crawl-module.ts comissoes   # 0 quebradas · 0 atenção
```

**Falha antes do fix, verificada** — restaurei as três derivações antigas e os
testes reprovaram com a assinatura exata de cada defeito:

```
× um dia descoberto desconta UM dia, nao o mes inteiro
    expected +0 to be close to 967.74            ← CM-1: a ajuda inteira sumia
× grava capReduction quando o teto corta a ajuda
    expected +0 to be 400                        ← CM-3: corte invisível
× periodo que perdeu a cobertura do contrato volta a zero
    expected 600 to be +0                        ← CM-4: valor antigo preservado
× o admin é recusado depois do fechamento
    promise resolved "{ action: 'removed' }"     ← CM-5: removeu de mês fechado
```

## Uma extração que a testabilidade exigiu

`recomputeProviderApuracao` (120 linhas, o motor de dinheiro do módulo) vivia
**privada dentro do router**. O núcleo puro — faixas, baldes, ajuda de custo —
tinha 66 testes unitários; a função que os costura e grava no banco não tinha
nenhum. Os três defeitos CM-1, CM-3 e CM-4 estavam exatamente na costura.

Ela foi para `commission-preview.service.ts`, que já era dono da coleta de
eventos e da prévia — o serviço passa a responder por "calcular a comissão de um
prestador num período", persistido e prévia, com a matemática saindo do mesmo
lugar. Não foi refactor de gosto: era a única forma de testar o caminho sem
replicá-lo, e testar a réplica não prova nada sobre o original.

## Uma hipótese que não sobreviveu à medição

Suspeitei de faixas progressivas sobrepostas ou com buraco: `applyProgressiveBrackets`
soma `portion × rate` faixa a faixa, e duas faixas sobrepostas contariam o trecho
comum duas vezes. Fui verificar — **`validateBracketSet` já cobre contiguidade na
escrita**, e a checagem de um-modo-por-balde entrou na auditoria de 2026-07-25.

Restava a dúvida boa: o validador protege escritas novas; e as 15 regras que já
estão lá? Baixei todas de produção e passei pelo validador de hoje — **todas
válidas**. Sem achado.

Sobra uma observação de risco: o motor de faixas progressivas, descrito no código
como "núcleo financeiro", **não tem nenhuma faixa múltipla em produção**. As 15
regras são percentual único. O caminho mais elaborado do módulo é o menos
exercitado.
