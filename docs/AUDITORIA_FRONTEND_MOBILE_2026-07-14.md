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

## Próximos lotes (pendentes)

- **Lote 2** — Módulos de uso diário: PDV, Ordens de Serviço, Estoque,
  Financeiro, Caixa.
- **Lote 3** — Settings, Comissões, DePix/Wallet, Admin, e o restante.

Cada lote: auditar → corrigir → PR → atualizar este doc.
