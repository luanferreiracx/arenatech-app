# Módulo 8 — Comissões

**Passada A (backend):** concluída em 2026-07-30.
**Passada B (frontend):** pendente (5 telas, nenhum E2E hoje).

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

O backend **já entrega o sinal** (`memoryJson` volta no `getDetail`), então a
correção é de tela: mostrar o aviso e, idealmente, os baldes descartados por
falta de regra. **Fica para a passada B**, que é onde se decide o que o olho vê.

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
