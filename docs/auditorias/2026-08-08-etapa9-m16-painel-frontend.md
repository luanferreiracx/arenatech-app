# Etapa 9 · Módulo 16 — Painel (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/painel` (`dashboard-content.tsx`, 687 linhas, 8 consultas)
**Provas:** código · dado de produção · navegador real

---

## Sumário

A **primeira tela que o operador vê ao entrar** tinha 11 elementos cortados a
320px.

Este módulo é diferente dos anteriores: não há tabela transbordando nem coluna
nascendo fora da vista. O defeito é de **densidade** — grids de duas colunas numa
tela de 320px, com rótulos que não cabem no que sobra.

```
antes:  11 elementos cortados
depois:  1 ("Contas venci…", -7px, ainda legível)
rolagem da página: 0 · nada fora da viewport · botão de abrir caixa intacto
```

---

## PNL-1 — seis dos oito indicadores com rótulo cortado · **corrigido**

```
FATURAM…   VENDAS H…   TICKET MÉ…   OS ABERT…   CONTAS V…   ESTOQUE …
```

O `truncate` estava correto — faltava espaço. Três causas somadas numa caixa de
**72px**:

| causa | efeito |
|---|---|
| `uppercase` | maiúsculas são mais largas |
| `tracking-wide` | espaçamento extra entre letras |
| ícone + gap na mesma linha | consome 16px + 8px |

**Correção:** no celular o rótulo vem em caixa normal, sem espaçamento extra, com
gap e padding menores. A partir de `sm` volta o visual original, onde há espaço.

Note o que **não** foi feito: o valor (`R$ 0,00`) sempre coube. O layout já
privilegiava o número — o que faltava era dizer *de que* número se tratava.

---

## PNL-2 — dois cartões idênticos lado a lado · **corrigido**

O mais grave dos quatro. "Faturamento hoje" e "Faturamento mês (N)" **ambos
viravam "Faturamento …"** — dois cartões com valores diferentes e nada dizendo
qual era qual.

O que os distingue ("hoje"/"mês") era exatamente o que o corte comia.

**Correção:** "Vendido hoje" e "Vendido no mês". Cabem inteiros, e "vendido"
mantém claro que é dinheiro — só o ícone não bastaria.

Cheguei a tentar "Hoje" e "No mês", que cabem folgado, mas perdem a informação de
que aquilo é faturamento. Rótulo curto não pode custar o significado.

O sufixo `(N)` saiu: era a **contagem** de vendas do mês, que o cartão "Vendas
hoje" já cobre para o dia, e empurrava a palavra decisiva para fora.

---

## PNL-3 — cinco atalhos de navegação cortados · **corrigido**

```
"Histórico d…"  (-49px)    "Ordens de …"  (-38px)    "Posição d…"  (-48px)
"Carteira D…"   (-14px)    "Buscar iPh…"  (-22px)
```

São botões de **navegação**: o operador precisa saber para onde vai.

Diferente dos KPIs — onde o valor é o conteúdo e o rótulo acompanha —, aqui o
rótulo é tudo. **Uma coluna no celular** resolve sem espremer nada; a partir de
`min-[420px]` voltam as duas.

---

## PNL-4 — a instrução do caixa fechado · **corrigido**

`"Abra o caixa para inicia…"` (-46px). É texto de **orientação**, não dado
tabular — pode ocupar duas linhas.

`line-clamp-2` mantém o teto (não empurra o botão "Abrir caixa" para fora) sem
comer a instrução.

---

## Guardião

`__tests__/unit/painel-rotulos-legiveis.test.ts` — 8 asserções sobre a **classe**:
rótulo sem `uppercase` no celular, cartão com padding reduzido e `min-w-0`,
rótulos de faturamento distinguíveis, atalhos em uma coluna, instrução com
`line-clamp`.

Visto falhar antes de aceito: **6 de 8 vermelhas**.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2583 testes** verdes.

---

## O que foi verificado e está correto

- **Nenhum valor foi cortado**, nem antes nem depois. O layout sempre priorizou o
  número — o defeito era o rótulo.
- **Rolagem horizontal da página: 0**, antes e depois. Nada transbordava a
  viewport; o corte era interno aos cartões.
- **8 consultas, 0 erros de JS, 0 respostas HTTP ≥ 400.**
- **`[&>*]:min-w-0` já estava nos dois grids** — quem escreveu sabia do risco de
  filho de grid não encolher. O que faltou foi medir o rótulo dentro do espaço
  resultante.

---

## Registro sem proposta

### R1 — "Contas vencidas" ainda perde 7px

Sobra do PNL-1: o rótulo mais longo dos oito continua cortado em `"Contas
venci…"`. Espremer mais comprometeria o respiro do cartão, e encurtar para
"Vencidas" perderia a informação de que são contas.

Registro por honestidade de medição — 7px não impedem a leitura, mas o cartão não
está perfeito.

---

## O que preservar

1. **O valor sempre teve prioridade no layout.** `truncate` no valor e `tabular-nums`
   garantem que o número — que é o que o painel existe para mostrar — nunca some.
2. **`[&>*]:min-w-0` nos grids** — sem isso, nenhum `truncate` dos filhos teria
   efeito, e o defeito seria transbordo em vez de corte.
3. **Ícone monocromático com cor no hover** — o comentário no código diz "sem
   rainbow". Oito indicadores coloridos seriam ruído; a cor está reservada para
   o valor (positivo/alerta).
4. **Breakpoints progressivos nos grids** (`sm:` → `lg:` → `xl:grid-cols-8`) — o
   painel se adapta de 320px a desktop largo sem quebrar.
