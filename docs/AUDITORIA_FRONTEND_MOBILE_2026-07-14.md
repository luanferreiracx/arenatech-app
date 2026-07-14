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

## Lote 1 — Shell compartilhado ✅ (PR #566 mergeado)

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

## Lote 3a — Fiscal ✅ (PR #567 mergeado)

Maior concentração de grids de coluna fixa (9). Todos eram **campos de
formulário** ou **exibição** — a 320px, `grid-cols-3` dá ~90px/input (CEP,
Número, CFOP, Valor ilegíveis).

| Arquivo | Problema | Correção |
|---------|----------|----------|
| `fiscal/[id]/edit/page.tsx` | 6 grids fixos (endereço do destinatário + item da NF): `grid-cols-2`/`grid-cols-3` sem breakpoint. | 3-col → `grid-cols-2 sm:grid-cols-3` (col-span-2 preservados); 2-col de pares → `grid-cols-1 sm:grid-cols-2`. |
| `fiscal/inutilizar/page.tsx` | 2 grids `grid-cols-2` (Modelo/Série, Nº Inicial/Final). | `grid-cols-1 sm:grid-cols-2`. |
| `fiscal/_components/invoice-detail.tsx` | Grid de exibição `grid-cols-2` + **tabela de itens sem wrapper de scroll** (4 colunas monetárias esmagadas a 320px). | Grid → `sm:grid-cols-2`; tabela → `overflow-x-auto` + `min-w-[26rem]`. |

Demais telas do fiscal (new, entrada, listagem): sem grids fixos, sem tabelas
descobertas. Typecheck ✅.

## Lote 3b — Tabelas sem scroll + grids restantes ✅ (PR #568 mergeado)

Scan global do restante encontrou **6 tabelas** (5–12 colunas) **sem wrapper de
scroll** → a 320px, colunas monetárias/texto esmagam ou quebram feio; e 2 grids
de formulário ainda apertados.

| Arquivo | Problema | Correção |
|---------|----------|----------|
| `admin/reports/_components/admin-reports.tsx` | Tabela 7 col sem scroll. | `CardContent` → `overflow-x-auto` + `min-w-[44rem]`. |
| `pdv/[id]/_components/sale-detail.tsx` | Tabela de itens da venda (5 col). | `overflow-x-auto` + `min-w-[32rem]`. |
| `stock/nfe/[id]/page.tsx` | Tabela de itens da NF-e (8 col, inclui célula `w-72`). | `overflow-x-auto` + `min-w-[52rem]`. |
| `stock/nfe/page.tsx` | Listagem de NF-e (7 col). | Wrapper `overflow-x-auto` + `min-w-[48rem]`. |
| `simulator/_components/simulator-form.tsx` | Tabela de parcelas (6 col); div é capturada p/ PDF. | `overflow-x-auto` no div + `min-w-[40rem]` (inócuo no PDF, página cheia). |
| `my-commission/_components/my-commission.tsx` | 2 tabelas (6 e 4 col) — 1ª só tinha `overflow-y`; form-row `flex` sem wrap. | `overflow-auto` + `min-w`; 2ª envolvida; form-row `flex-wrap`. |
| `service-orders/new/_steps/step-items.tsx` | Grid `grid-cols-3` (Qtd/Valor/Subtotal) — MoneyInput cortava a 90px. | `grid-cols-2 sm:grid-cols-3`. |

**Avaliados e mantidos (aceitáveis a 320px):**
- `settings/card-acquirers` receiving-accounts — grid Banco/Agência/Conta é o
  layout clássico de conta bancária; agência (4 díg.) cabe em ~90px. Mexer
  quebraria os `col-span`.
- `service-order-detail:869` (3 valores monetários curtos), `catalog/[id]:116`
  (3 badges desenhados), `payment-dialog:705` (3 botões num dialog `max-w-lg`) —
  elementos curtos, legíveis a 320px.

Typecheck ✅.

## Lote 4 — Telas públicas (voltadas ao cliente) ✅ (PR #569 mergeado)

Priorizadas por serem de maior tráfego mobile.

| Tela | Achado | Correção |
|------|--------|----------|
| `quote/[link]/page.tsx` | Cards "Valor Anterior/Novo Valor" em `grid-cols-2` com valores `text-2xl`: a 320px cada card (~140px) não comporta "R$ 1.234,56" (~155px) → estoura. Tela crítica de conversão. | `grid-cols-1 sm:grid-cols-2` (empilha no mobile). |

**Auditadas e OK:** `/pay` (checkout QR DePix — sem grids/tabelas problemáticos);
login/auth (os `w-[800px]` são glows decorativos `pointer-events-none` dentro de
`overflow-hidden`); `/os/[publicLink]` (grid 2-col de texto pequeno, legível);
catálogo (grids/badges desenhados).

---

## Verificação global final

Após os 4 lotes, `grep` em todo `src/app` confirma:
- **0 tabelas `<table>` sem wrapper de scroll** (antes: 7).
- **0 grids `grid-cols-{3..6}` fixos problemáticos** — os 4 remanescentes foram
  avaliados e são legíveis a 320px (conta bancária, 3 valores curtos na OS,
  botões num dialog, badges do catálogo).
- Nenhuma altura `100vh`/`h-screen` travando scroll (as `min-h-screen` crescem;
  o único `h-screen` é a sidebar sticky do catálogo, intencional).

### Fundação corrigida (propaga para todo o app)
- **PageHeader** (121 páginas), **DataTable**, **DataTableToolbar**, **Dialog** —
  agora com `flex-wrap`, scroll-x e `max-h`/`overflow-y`. A causa raiz do sintoma
  relatado (botões fora da tela no mobile) estava aqui e no PDV.

### Cobertura por lote
| Lote | Escopo | PR |
|------|--------|----|
| 1 | Shell compartilhado | #566 |
| 2 | PDV + OS/Estoque/Financeiro/Caixa | #566 |
| 3a | Fiscal | #567 |
| 3b | Tabelas densas + grids restantes | #568 |
| 4 | Telas públicas | #569 |

### Trava de prevenção — implementada ✅

`scripts/check-responsive.ts` (rode com `pnpm check:responsive`) roda no CI no job
**Typecheck** (após `openapi:check`) e bloqueia o PR se reintroduzir:

- **`grid-cols-{3..6}` sem breakpoint** — só sinaliza quando **não há** nenhuma
  variante `:grid-cols-` na mesma className. Assim `grid-cols-3 sm:grid-cols-5`
  (base pequena deliberada p/ ícones/thumbs) passa; `grid-cols-3 gap-3` cru é o
  smell e é barrado.
- **`<table>` sem ancestral `overflow-x-auto`/`overflow-auto`** no arquivo.

**Exceção pontual:** comentário `responsive-audit-ignore` na linha (ou acima),
com o motivo. Casos já marcados (legíveis a 320px): `payment-dialog` (3 botões
num dialog), `service-order-detail` (3 valores curtos), `receiving-accounts-tab`
(layout de conta bancária), `catalog/[id]` (3 badges desenhados).
