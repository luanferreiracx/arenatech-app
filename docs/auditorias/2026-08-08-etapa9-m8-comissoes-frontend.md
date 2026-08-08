# Etapa 9 · Módulo 8 — Comissões (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/commissions/providers`, `/commissions/providers/new`, `/commissions/providers/[id]`
**Provas:** código · dado de produção · navegador real

---

## Sumário

Módulo pequeno (1.864 linhas em 9 arquivos) e **em uso real**: 7 prestadores,
3 contratos, 15 regras de alíquota, 9 apurações.

Três defeitos de reflow corrigidos, todos na ficha do prestador. Um achado
operacional registrado sem proposta — e é o de maior valor: **R$ 16.903,57 em
comissão apurada nunca virou conta a pagar.**

O servidor não entra na lista de problemas. `closeApuracao` recomputa antes de
gerar o PAYABLE (C2), fecha com CAS `updateMany(where: status=OPEN)` e desfaz em
conflito. As auditorias anteriores deixaram essa parte sólida.

---

## CMU-8 — botões com rótulo longo empurravam a página · **corrigido**

Medido a 320px, com uma apuração carregada:

| botão | terminava em | viewport |
|---|---|---|
| "Fechar apuracao e gerar conta a pagar" | **333px** | 320 |
| "Marcar/Desmarcar" | **389px** | 320 |

O segundo é o pior: 69px fora da tela, **inalcançável**.

Duas causas somadas:

1. O `Button` base traz `shrink-0` + `whitespace-nowrap`. Ótimo para rótulo
   curto; para 37 caracteres vira uma linha irredutível de ~309px.
2. A linha de ações dos "dias não cobertos" era `flex gap-2` **sem
   `flex-wrap`** — a última das quatro linhas de ação do arquivo sem ponto de
   quebra. As outras três ganharam no CMU-4. **Irmão esquecido, de novo.**

**Correção:** `whitespace-normal` + `shrink` + `h-auto` nos dois botões longos;
`flex-wrap` na linha de ações; `basis-40` no campo "Motivo" (com `flex-1`
sozinho ele colapsaria ao quebrar — trocar um defeito por outro).

---

## CMU-9 — a coluna do valor nascia fora da vista · **corrigido**

O mais traiçoeiro dos três, porque **não viola a WCAG 1.4.10**. As tabelas ficam
em `overflow-x-auto`, e scroll dentro de container é estratégia válida para dado
tabular. Medido:

| tabela | largura | visível | coluna do valor começava em |
|---|---|---|---|
| Alíquotas do contrato | 362px | 238px | **356px** |
| Memória de cálculo | 507px | 238px | **474px** |
| Prévia por período | ~507px | 238px | (mesma estrutura) |

Consequência concreta: a 320px o operador via **`R$` solto** em três linhas de
alíquota e concluía que não havia nada cadastrado. Os `5%`, `10%` e `7%` estavam
no DOM — nunca na tela. Norma cumprida, informação perdida.

**Correção:** o valor passa a ser a **segunda** coluna, logo após Categoria/Data.
As duas colunas que respondem *"quanto ele ganha em quê"* cabem juntas na área
visível; escopo, origem e faixas ficam para quem rolar. Aplicado nas **três**
tabelas — a memória e a prévia são a mesma tabela em dois lugares, e corrigir só
uma repetiria o padrão que este módulo já exibiu no CMU-4.

Verificado depois: `5%` termina em 182px e `R$ 2,30` em 200px.

---

## CMU-10 — cartão de resumo transbordava sobre o vizinho · **corrigido**

`grid-cols-2` fixo a partir de 320px dá **96px** de caixa para `text-2xl`:

| cartão | texto precisa | caixa tem | transborda |
|---|---|---|---|
| Ajuda de custo `+R$ 1.000,00` | 158px | 96px | **62px** |
| Líquido `R$ 1.519,55` | 135px | 96px | **39px** |
| Comissão bruta `R$ 519,55` | 118px | 96px | **22px** |

Três dos quatro estouravam, e o texto de um invadia o outro visualmente.

Defeito **preexistente** — confirmei no diff que não toquei nesse grid. Só ficou
visível quando passei a carregar um mês **com dados**.

**Correção:** `grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-4` +
`[&>*]:min-w-0`. Mesmo defeito e mesma correção do DRE (E9-4, PR #873).
Transbordo depois: **zero nos quatro**.

---

## Guardião

`__tests__/unit/comissoes-reflow-320.test.ts` — afirma a **classe**: nas tabelas
de dinheiro do módulo o valor não é a última de seis colunas; rótulos longos
podem quebrar; o grid de resumo começa em uma coluna com filhos encolhíveis.

Visto falhar antes de aceito: **7 de 8 asserções vermelhas** contra o código não
corrigido, 8/8 verdes depois.

`pnpm typecheck` limpo · **248 arquivos / 2510 testes** verdes.

---

## Duas medições erradas antes da certa

Registro porque as duas são armadilhas de método, não de código.

**1. Medi o mês vazio.** A primeira passada a 320px acusou só um botão. Eu media
**agosto**, o mês corrente, que não tem apuração — e sem apuração não existe o
botão "Fechar" nem a memória de cálculo. Dois dos três defeitos ficaram
invisíveis. É a armadilha do banco vazio do CI, aqui na forma de *mês* vazio: a
tela passa limpa porque não há o que quebrar.

**2. Comparei tela local contra banco de produção.** Vi julho com gross
R$ 519,55 na tela e R$ 1.597,69 no banco da VPS, e quase escrevi um achado de
divergência de motor de cálculo. Abril batia exatamente — o que **descartou** a
hipótese, porque bancos diferentes divergiriam nos dois. A explicação estava no
`updated_at`: produção recalculou julho em 06/08; a cópia local parou em 08/07.
As três provas exigem que tela e banco venham da **mesma** fonte.

Também levantei e **refutei** a hipótese de que o seletor de mês não alcançaria
apurações antigas: ele oferece 12 meses (set/2025 a ago/2026) e abre abril
normalmente.

---

## Registro sem proposta

### R1 — R$ 16.903,57 de comissão apurada fora do financeiro

| | |
|---|---|
| apurações abertas | **9** |
| apurações fechadas | **0** |
| soma em aberto | **R$ 16.903,57** |
| mais antiga | **abril/2026** |
| contas a pagar de comissão | **0** |

Nenhuma apuração jamais foi fechada, em 4 meses de operação. Como o PAYABLE só
nasce no fechamento, **nenhuma comissão aparece como passivo**.

Verifiquei a hipótese alternativa — pagamento lançado manualmente por outro
caminho — e ela **não se sustenta**: zero `financial_transactions` do tipo
PAYABLE mencionando comissão, apuração, prestador ou o nome de qualquer um dos
três prestadores ativos. O dinheiro provavelmente saiu; o financeiro não sabe.

Não é defeito de código: o botão "Fechar apuracao e gerar conta a pagar" existe,
está visível para admin e o servidor executa corretamente. É escolha
operacional — ou desconhecimento de que o fechamento é o que alimenta o
financeiro.

Não proponho porque as saídas são de produto, e mutuamente excludentes:
fechar os 4 meses retroativos (gera 9 contas a pagar de uma vez, algumas já
quitadas por fora), passar a fechar mensalmente daqui pra frente, ou assumir que
o módulo é só de consulta e que a comissão entra no financeiro por lançamento
manual — caso em que a tela deveria dizer isso.

### R2 — a tela não avisa que "Aberta" significa "fora do financeiro"

O selo diz `Aberta`, o que soa como estado normal de mês em curso. Nada indica
que apuração aberta **não gera conta a pagar** — e é exatamente essa a diferença
entre o passivo aparecer ou não no DRE.

Relacionado ao R1: se a causa for desconhecimento, isto é o que o produziu.

### R3 — duas tabelas de fornecedor coexistem

`providers` (7 registros, usada por este módulo) e `service_providers` (**0
registros**). Nomes quase idênticos para conceitos diferentes. Não gera erro
hoje; gera a chance de alguém cadastrar no lugar errado, ou de um código futuro
ler a tabela vazia e concluir que não há prestadores.

Fora do escopo de frontend — registro para a auditoria de backend.

---

## O que preservar

1. **`closeApuracao` recompõe antes de gerar o PAYABLE** (C2, auditoria
   2026-07-11). Sem isso, o valor da conta a pagar seria o do último `calculate`
   — pagando a mais ou a menos se algo mudou desde então.
2. **CAS no fechamento** — `updateMany(where: { status: "OPEN" })` com
   `count === 0` abortando e desfazendo o PAYABLE recém-criado. Duas sessões
   fechando o mesmo mês não geram duas contas a pagar.
3. **O aviso de contrato sem alíquota** (CMU-7) cobre o vão real: o motor trata
   "contrato sem regras" como "sem contrato", e `createProvider` já cria um
   contrato vazio. Sem o aviso, todo prestador recém-cadastrado ficava com
   cálculo zerado e nenhuma explicação na tela.
4. **A prévia por período é honesta sobre o que não faz** — o texto diz, sem
   rodeio, que não inclui ajuda de custo nem estornos e que não fecha nada. Raro
   e valioso numa tela de dinheiro.
