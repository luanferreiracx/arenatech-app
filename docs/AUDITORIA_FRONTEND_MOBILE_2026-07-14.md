# Auditoria de Frontend — Responsividade cross-browser / mobile (2026-07-14)

> Objetivo: garantir que **todos os módulos** funcionem de forma satisfatória em
> qualquer navegador, desktop ou mobile. Gatilho: no mobile alguns botões
> desaparecem por ficarem fora da parte visível da tela.
>
> Skill autoritativa: `audit-frontend` (protocolo de 4 rodadas). Trabalho feito
> **módulo a módulo, em lotes pequenos**, com PR por lote.

## Método

Responsividade quebra quase sempre no **scaffolding compartilhado** (app shell,
cabeçalho de página, tabelas, dialogs, barras de ação), não em cada página. Por
isso a auditoria começa pelo shell — um conserto ali propaga para dezenas de
páginas — e depois desce módulo a módulo.

Cada achado é testado mentalmente contra os critérios da skill:
- WCAG 1.4.10 (reflow a 320px), 1.4.4 (zoom 200%), 1.4.12 (text-spacing).
- Anti-patterns de frame integrity: viewport-only responsiveness, truncate ghost
  (falta `min-w-0`), overflow gambit (`overflow:hidden` sem estratégia), botões
  empurrados para fora por `justify-between` sem `flex-wrap`.

---

## Lote 1 — Shell compartilhado ✅ (PR pendente)

Estes componentes são a fundação de praticamente todas as telas.

| # | Arquivo | Problema | Impacto | Correção |
|---|---------|----------|---------|----------|
| 1 | `components/domain/page-header.tsx` | `flex justify-between` **sem `flex-wrap`**; bloco de `actions` com `shrink-0`. Em telas estreitas o título ocupa a largura e os botões de ação são empurrados para **fora da viewport**. | **Alto** — usado em **121 páginas**. É a causa raiz do sintoma relatado (botões sumindo no mobile). | `flex-wrap` + `gap-x-4 gap-y-3`; `min-w-0` no bloco de título; actions passam a quebrar para a linha de baixo. |
| 2 | `components/domain/data-table/data-table-toolbar.tsx` | `flex justify-between` sem wrap; busca (`max-w-sm`) e actions competem por espaço no mobile. | Médio — toolbar das listas. | Busca vira `w-full` no mobile e `max-w-sm` a partir de `sm:`; toolbar e actions com `flex-wrap`. |
| 3 | `components/domain/data-table/data-table.tsx` | Wrapper da `<Table>` com `overflow-hidden` → colunas **cortadas** em telas estreitas, dados inacessíveis (viola WCAG 1.4.10 reflow). | **Alto** — tabela é o núcleo de quase todo módulo. | Troca por `overflow-x-auto` → scroll horizontal preserva acesso a todas as colunas. |
| 4 | `components/ui/dialog.tsx` | `DialogContent` sem `max-h`/`overflow` → dialog com muitos campos empurra o **footer (botões confirmar/cancelar) para fora da tela** em viewports baixos. | **Alto** — todos os modais de formulário. | `max-h-[calc(100dvh-2rem)]` + `overflow-y-auto`. |

**Preservado (bom padrão, não mexer):**
- `mobile-sidebar.tsx` — já usa `flex-1 overflow-y-auto` no `<nav>` com footer fixo;
  scroll da navegação correto.
- `components/ui/sheet.tsx` — não alterado: o único consumidor real
  (mobile-sidebar) gerencia o próprio scroll com `flex flex-col`; forçar
  `overflow` no content quebraria o layout `flex-1`.

Typecheck: ✅ limpo.

---

## Lote 2 — Módulos de uso diário (em andamento)

### PDV (`pdv/_components/pdv-screen.tsx`) — corrigido

| # | Problema | Impacto | Correção |
|---|----------|---------|----------|
| 1 | Container com `h-[calc(100vh-80px)]` **fixo em todos os breakpoints**. No mobile (1 coluna) a coluna direita (resumo + **Finalizar Venda** + Reiniciar) empilha abaixo do carrinho, mas a altura travada em `100vh` **impede o scroll da página** → botões de ação ficam abaixo da dobra e **inalcançáveis**. Causa direta do sintoma relatado, na tela mais crítica. | **Alto** | Altura fixa só a partir de `lg:` (`lg:h-[calc(100dvh-80px)]`). No mobile a página cresce e rola naturalmente. `100vh` → `100dvh` (barra de URL do Safari iOS). |
| 2 | Tabela do carrinho (`w-full`) com colunas de largura fixa (`w-24/w-32/w-28`) dentro de wrapper só com `overflow-y-auto`. Em 320px a coluna Produto é esmagada / estoura sem scroll horizontal. | Médio | `overflow-auto` + `min-w-[32rem]` na tabela → scroll horizontal preserva legibilidade. |
| 3 | Card do carrinho com `flex-1` sem altura-pai no mobile → colapsa. | Baixo | `min-h-[16rem]`. |

**payment-dialog:** já responsivo — `max-h-[85vh] overflow-y-auto` no DialogContent (o autor antecipou o problema que o fix do `dialog.tsx` base agora resolve para todos). Sem ação.

Restante do PDV (history) e demais módulos: pendente.

### Achado sistêmico — grids de coluna fixa sem breakpoint

`grep` encontrou **43** ocorrências de `grid-cols-{2..6}` **sem** prefixo
responsivo (`sm:`/`md:`/`lg:`) em `src/app`. Um `grid-cols-3` fixo a 320px
espreme 3 colunas em ~100px cada, cortando rótulos/valores. Concentração:
fiscal (9), pdv (6), service-orders (4), imei (4), admin (4), settings (3).

Nem todos são bugs (um `grid-cols-2` de campos curtos num dialog é aceitável),
então a correção é **triada módulo a módulo** nos lotes seguintes — não em massa,
para não quebrar layouts que dependem de 2 colunas. Regra ao corrigir: começar
em 1 coluna no mobile e subir (`grid-cols-1 sm:grid-cols-3`).

### OS, Estoque, Financeiro, Caixa — auditados

- **Ordens de Serviço** — wizard de criação já responsivo: stepper com
  `overflow-x-auto`, labels ocultos no mobile (`hidden sm:inline`), navegação
  Anterior/Próximo (2 botões) segura; `status-stepper` do detalhe já usa
  `overflow-x-auto`. `detail-sections` são pares label/valor (seguros).
  **Sem ação.**
- **Estoque** — sem alturas fixas, sem grids fixos; todos os `overflow-hidden`
  são thumbnails de imagem (corretos). Único ajuste: `bulk-adjust` — tabela com
  colunas `w-32` dentro de `overflow-hidden` → `overflow-x-auto` + `min-w`.
- **Financeiro** — só o **skeleton** de `projected-cash-flow` tinha `grid-cols-3`
  fixo (o conteúdo real já era `sm:grid-cols-3`); alinhado. Resto OK.
- **Caixa** — limpo, sem achados.

## Próximos lotes (pendentes)

- **Lote 3** — Fiscal (9 grids fixos — maior concentração), Settings, Comissões,
  DePix/Wallet, Admin, IMEI, e o restante.

Cada lote: auditar → corrigir → PR → atualizar este doc.
