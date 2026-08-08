# Etapa 9 · Módulo 4 — Financeiro (frontend)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-frontend`.

## Escala

1.341 obrigações, 249 recebíveis, **R$ 123.138 a receber**. Seis telas.

---

## E9-4 — O DRE rolava horizontalmente — ✅ CORRIGIDO

Medido no navegador com o admin:

```
/financial/dre  320px -> rola 33px    (viola WCAG 1.4.10)
/financial/dre  640px -> rola 33px
```

### A tabela foi acusada injustamente

Meu primeiro detector apontou `TABLE.w-full` — e estava **errado**. O componente
`Table` fica num wrapper com `overflow-x-auto`, e **scroll dentro de container é
estratégia válida da 1.4.10** para dado tabular.

A prova por eliminação fechou a questão: **removi a tabela do DOM e o
`scrollWidth` continuou em 353px**.

### O culpado real

Isolado por bissecção nos filhos do `<main>`: o **grid de cartões-resumo**.

```
div.grid.grid-cols-2.sm:grid-cols-5   w=272  right=296
"Receita R$ 1.556.378,58 Custo das Pecas R$ ..."
```

`grid-cols-2` fixo, com valores de 15 caracteres em `text-lg font-mono`. Dois
cartões não cabem em 320px.

### O fix, e o segundo defeito que ele revelou

```
grid-cols-2 sm:grid-cols-5
  →  grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 [&>*]:min-w-0
```

A primeira tentativa manteve `sm:grid-cols-5` e **640px continuou rolando** — o
breakpoint `sm` (640px) ativa 5 colunas cedo demais para valores deste tamanho.
Movido para `lg`.

O `[&>*]:min-w-0` é o que permite o cartão encolher: sem ele, o conteúdo define
o piso da coluna.

Os **dois** grids mudaram juntos (skeleton e conteúdo) — se só um mudasse, o
layout saltaria ao terminar o carregamento.

### Verificado em 7 breakpoints

| viewport | rola? | colunas |
|---|---|---|
| 320px | **0** | 1 |
| 375px | **0** | 1 |
| 420px | **0** | 2 |
| 640px | **0** | 2 |
| 768px | **0** | 2 |
| 1024px | 1px* | 5 |
| 1280px | **0** | 5 |

*\* borda exata do gatilho, sem impacto visual.*

E as **seis telas** do Financeiro terminaram com 0 rolagem a 320px e 640px.

---

## O guardião passou cego DUAS vezes antes de eu aceitá-lo

Este é o registro mais útil deste módulo.

**Tentativa 1 — `loginAs(page, "manager")`:** o manager do seed **não existe** na
cópia de produção. O login falha, a tela vem vazia, o teste mede uma página em
branco e passa.

**Tentativa 2 — `loginAs(page, "owner")`:** superadmin é **redirecionado para
`/admin`** e nunca chega ao DRE. Mediu a tela errada e passou.

**Tentativa 3 — login direto com admin de tenant:** falha sem o fix, apontando
`rola 33px`.

A lição vale além deste teste: **helper de login compartilhado esconde qual
usuário realmente chegou na tela.** Registrei os dois modos de falha no próprio
arquivo.

---

## O que ataquei e resistiu

### O gate do M9-1 funciona na UI, sem quebrar

| tela | ADMIN | OPERADOR |
|---|---|---|
| `/financial` | 53 valores | 53 valores |
| `/financial/dre` | 70 valores | **negado** |
| `/financial/cash-flow` | 99 valores | **negado** |
| `/financial/projected-cash-flow` | 81 valores | **negado** |
| `/financial/receivables` | 41 valores | 41 valores |
| `/financial/card-receivables` | 203 valores | 203 valores |

Zero erros de JS nas 12 combinações. A negação é explícita ("Disponível apenas
para administradores"), não tela quebrada.

### Recebíveis de cartão: tela e resolver concordam

O operador **vê** os dados (informação de trabalho) mas não age:

```
ADMIN:    settle -> 200
OPERADOR: settle -> 403 "Acao restrita a administradores do tenant"
```

E a UI já reflete isso: as colunas de ação só renderizam com `isAdmin`.

### Nenhum God component

O maior é `transaction-detail.tsx` com **703 linhas** — menos da metade do PDV
(1.570) e da OS (1.968).

---

## Um comportamento que investiguei e está correto

`settle` com um ID inexistente devolveu **200**. Verifiquei: os 249 recebíveis
seguem `PENDING`, intactos. O código faz `if (!row) continue` — ignora ids que
não são do tenant ou não estão pendentes, por design. Não é falha silenciosa; é
a defesa em profundidade descrita no E8-2.

---

## Registro sem proposta

1. **`transaction-detail.tsx` (703 linhas)** está confortável, mas é o maior do
   módulo. Não proponho quebrar.
2. **O seed do CI não cria dados financeiros**, então o novo teste de reflow
   **passa sem exercitar** num banco vazio. É o mesmo limite já documentado em
   `reflow-320.spec.ts` — e foi por isso que este defeito sobreviveu: ele só
   aparece com valores longos como `R$ 1.556.378,58`.
3. **O `min-[420px]` é um breakpoint arbitrário** fora da escala do Tailwind.
   Escolhi por medição (é onde dois cartões passam a caber), não por convenção.
   Se o time preferir padronizar, `sm:` exigiria encurtar os valores.

---

## Baixa confiança

- **Não medi WCAG 1.4.4 (zoom 200%) nem 1.4.12 (text spacing)** nas telas do
  Financeiro — cobri o 1.4.10.
- **Não exercitei o fluxo de conciliação** (`settle`/`unsettle`) com um
  recebível real. Testei o gate de papel, não a operação.
- **`/financial/[id]`, `/financial/categorias` e `/financial/recorrentes` não
  foram abertas** — foquei nas seis telas de maior volume.
