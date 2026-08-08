# Etapa 9 · Módulo 13 — Avaliações (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/valuations`
**Provas:** código · dado de produção · navegador real

---

## Sumário

Módulo bem usado e de propósito estreito: **228 preços ativos, 37 modelos**,
alimentando **131 compras de aparelho** registradas.

Um defeito de reflow corrigido. O formulário, a validação de duplicata e o
isolamento por tenant passaram limpos.

### Correção de leitura minha

Comecei assumindo que `device_valuations` guardava avaliações individuais. É uma
**tabela de preços de referência**: cada linha é a combinação
`modelo + armazenamento + saúde da bateria → valor`. As transações reais vivem em
`device_purchases` (131). Registro porque cheguei a contar "232 avaliações" antes
de ler o schema.

---

## AVL-1 — a matriz escondia os preços à direita · **corrigido**

### O defeito

A tela é uma matriz por modelo: bateria nas linhas, capacidade nas colunas.
Medido a 320px com o **pior caso real de produção** — o "Playstation 5 Slim",
que tem 4 capacidades com rótulos longos ("825GB - COM DISCO"):

```
tabela  533px   área visível  270px   ->  3 dos 4 preços fora da vista
```

O operador via **um** preço e não tinha como saber que havia mais três. A tabela
simplesmente some na borda do cartão.

E não é caso isolado: **já com duas capacidades** a tabela transborda (285-299px
numa área de 270) e esconde o segundo preço. Dos 5 modelos no teste, **4
transbordavam**.

### O que NÃO era a causa

Meu primeiro palpite foi o `min-w-[110px]` fixo por coluna — valor arbitrário,
proibido pelo padrão do projeto. Trocá-lo por `w-auto` levou a tabela de 533px
para **506px**: 3 preços continuavam fora.

O limite é o **conteúdo**. "825GB - COM DISCO" precisa de 103px, e
4 × 103 + 93 (coluna Bateria) = 506px. Espremer mais tornaria o rótulo ilegível —
trocaria um defeito por outro.

### A correção

Scroll horizontal é estratégia **válida** da WCAG 1.4.10 para dado tabular, a
matriz é o formato certo para este dado, e a coluna Bateria já era `sticky`
(o design antecipou o scroll). O que faltava era o operador **saber** que há mais
à direita.

Aviso `Arraste a tabela para ver as N capacidades →`, com três decisões:

| decisão | por quê |
|---|---|
| **fora** do `overflow-x-auto` | dentro dele rolaria junto com a tabela e sumiria com ela |
| `sm:hidden` | no desktop a matriz cabe; o aviso seria ruído |
| dentro de `!collapsed` | sem tabela visível, "arraste a tabela" não faz sentido |

O `min-w-[110px]` saiu de qualquer forma: é valor arbitrário e forçava 4 × 110
mesmo quando o rótulo cabia em menos. Como efeito colateral bom, o rótulo longo
agora quebra em duas linhas.

### O limiar: `> 1`, não `> 2`

Meu primeiro palpite foi avisar a partir de 3 capacidades. A medição mostrou que
**já com duas** a tabela transborda — o palpite deixava **3 dos 5 modelos sem
aviso**, justamente os casos mais comuns.

Verificado depois: **4 tabelas transbordam, 4 avisos**. A de 1 capacidade
(a única que cabe) não tem aviso.

---

## Guardião

`__tests__/unit/avaliacoes-matriz-scroll.test.ts` — 7 asserções, incluindo uma
que verifica que o aviso está **fora** do container que rola (o erro que cometi
na primeira versão) e outra que fixa o limiar em `> 1`.

Visto falhar antes de aceito: **5 de 7 vermelhas**. As duas que passam nos dois
lados são de não-regressão (coluna `sticky`, ausência do `min-w`).

Duas asserções falharam **contra o código já corrigido** e precisaram de conserto:

1. o detector de `min-w-[110px]` acusou o **próprio comentário** que cita o valor
   removido — mesma armadilha do guardião do M7;
2. a busca por "Bateria" casava com o campo `saudeBateria` do tipo, 150 linhas
   antes da tabela.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2559 testes** verdes.

---

## O que foi verificado e está correto

### Duplicata é barrada com mensagem exemplar

O índice único `device_valuations_ativa_unica` (tenant + modelo + armazenamento +
bateria, `WHERE deleted_at IS NULL`) impede duas linhas ativas para a mesma
combinação. E a mensagem na tela é das melhores do sistema:

> *"Ja existe avaliacao ativa para AUDIT-M13 32GB com bateria > 90%. Edite a
> existente em vez de criar outra."*

Diz **o que** colidiu, **qual** configuração e **o que fazer**. Cheguei a
registrar como defeito ("barra sem avisar") porque meu detector buscava "Já" com
acento e o toast já tinha sumido — a mensagem usa "Ja". **Falso positivo meu.**

### Formulário bem construído

Modelo é texto livre (correto: nomes de aparelho são abertos), mas armazenamento
e saúde da bateria são `Select` de lista fechada — exatamente o padrão que o dono
pediu para o catálogo no M12, aqui já aplicado.

### Reflow da página

Rolagem horizontal da **página** é 0 em todos os casos. O transbordo é interno à
tabela, em container com `overflow-x-auto` — conforme a norma.

---

## Registro sem proposta

### R1 — `checklists` está vazia (0 registros)

A tabela existe e nunca recebeu nada. A memória do projeto registra que o dono
decidiu **não unificar** o checklist da OS com o módulo `/checklist` (avaliação
para compra) — são sistemas distintos.

Não proponho porque a decisão já foi tomada e é sua; registro apenas que a tabela
segue sem uso, caso isso mude a leitura.

### R2 — a validade do preço não aparece na listagem

Cada preço tem `validade_dias` (padrão 7), mas a matriz não mostra desde quando o
preço vale nem se já venceu. O operador que abre a tela vê um número sem saber se
é de hoje ou de três semanas atrás.

Não proponho porque envolve decisão de produto: mostrar idade do preço em cada
célula competiria com o próprio valor pelo espaço — que, como o AVL-1 mostrou, já
é escasso.

---

## O que preservar

1. **O índice único parcial** (`WHERE deleted_at IS NULL`) — permite recriar uma
   combinação que foi removida, sem abrir espaço para duas ativas. É a forma
   correta de unicidade com soft delete.
2. **A coluna Bateria `sticky`** — mantém a referência de linha ao rolar na
   horizontal. Sem ela, o operador perderia de vista a qual faixa o preço
   pertence, e o scroll ficaria inutilizável.
3. **A mensagem de duplicata** — nomeia a colisão e indica a ação. Padrão que
   vale copiar para outros módulos.
4. **Célula vazia como `+` clicável** — a matriz mostra o que falta preencher sem
   precisar de tela separada; o operador vê a lacuna e age nela.
