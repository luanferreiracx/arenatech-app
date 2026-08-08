# Etapa 9 · Módulo 2 — Ordens de Serviço (frontend)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-frontend`.

## Escala

255 OS em produção. `service-order-detail.tsx` tem **1.968 linhas** — maior que
o PDV.

---

## E9-2 — A barra de paginação estoura a 320px — ✅ CORRIGIDO

Medido no navegador, na lista de OS:

```
320px -> ESTOURA (347 > 320)   ← WCAG 1.4.10 violado
375px -> ok
640px -> ok
```

### Rastreando até a origem

O primeiro suspeito era a **tabela** (1.278px de largura). Falso: o componente
`Table` base tem `overflow-x-auto`, e scroll horizontal dentro de container é
estratégia **válida** da WCAG 1.4.10 para dado tabular.

Filtrando os elementos que estouram **e não têm ancestral com scroll**, sobraram
SVGs de 16px — filhos da tabela, herdando a largura dela. Também não eram.

O culpado real, achado pelo elemento **mais raso** que estoura:

```
div.flex.items-center.gap-4  |  left 76  right 347  w 271
texto: "Linhas por página10"
```

A barra de paginação: flex rígido de 271px que, somado ao recuo de 76px,
termina em 347px.

### O fix

`flex-wrap` + `gap-y` nos dois níveis. Os blocos empilham em vez de empurrar a
página.

Verificado:

```
antes:  scrollWidth 347, viewport 320, estoura
depois: scrollWidth 320, viewport 320, NÃO estoura
        paginação visível e usável ("Linhas por página" presente)
```

---

## Por que o guardião não pegou — e por que ele NÃO é o culpado

`__tests__/e2e/reflow-320.spec.ts` mede exatamente isso, e `/service-orders`
está na lista de telas **desde a criação da suíte**. Mesmo assim, os últimos 8
runs do full pós-merge ficaram **verdes**.

Minha primeira hipótese foi "guardião cego", como nos casos anteriores. **Estava
errada** — rodei o teste contra a cópia de produção:

| | resultado |
|---|---|
| sem o fix | **falha**, e aponta o elemento culpado |
| com o fix | passa |

O teste é bom. O problema é outro: **o seed do CI não cria ordens de serviço**
(`grep serviceOrder prisma/seed.ts` → 0). Sem linhas, a tabela e a paginação
**não renderizam**, e a tela é medida vazia.

**Falta dado, não asserção.** Documentei o limite no próprio arquivo, para que
quem for confiar na suíte saiba o que ela não cobre.

Vale notar que o teste já foi endurecido antes: o commit `70a655f7` removeu um
caso *"que não podia falhar"* depois de um controle negativo reprová-lo. A
disciplina existe — o furo é de dados.

Rodada completa contra a cópia de produção (255 OS reais): **8/8 passam**.

---

## O que verifiquei e está correto

### O achado do M1 (backend) está de pé na tela

A Etapa 7 encontrou botões admin-only visíveis ao operador. Testado agora no
navegador:

| perfil | botões visíveis |
|---|---|
| ADMIN | Reenviar Recibo \| **Estornar** |
| OPERADOR | Reenviar Recibo |

A guarda funciona onde importa.

### Sem erros de JS

Detalhe da OS carregado com os dois perfis: **0 erros de página, 0 no console**.

### Reflow nas outras telas

`/service-orders/[id]` e `/service-orders/new` passam a 320px, 375px e 640px.

### Frame integrity

Três arquivos com valores arbitrários, todos legítimos:

- `status-stepper.tsx:89` usa `style={{ width: calc(...) }}` — é **largura
  calculada dinamicamente** (progresso percentual), não framing hardcoded. O
  único jeito de expressá-la.
- `min-w-[64px]` e `text-[10px]` em rótulos de passo — layout primitivo.

---

## Baixa confiança

- **Não auditei `service-order-detail.tsx` por dentro** (1.968 linhas, maior que
  o PDV). Verifiquei as guardas de papel e o carregamento, não a lógica de
  estado nem os ~20 diálogos.
- **Não testei o fluxo de criação de OS ponta a ponta** (device → itens →
  conclusão). Testei que a tela carrega e cabe em 320px.
- **Não medi WCAG 1.4.12 (text spacing) nem 1.4.4 (zoom 200%)** nas telas de OS
  — cobri só o 1.4.10. Fica para a próxima passada.
