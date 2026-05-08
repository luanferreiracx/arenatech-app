# ADR 0004 — Design System Arena Tech

**Data:** 2026-05-08
**Status:** Aceito
**Autores:** Claude Code (Fase 4)

---

## Contexto

O sistema Arena Tech é usado 8+ horas/dia por técnicos de assistência técnica e operadores de loja. A interface precisa ser:

1. **Funcional e densa** — tabelas com muitos dados, formulários complexos, navegação frequente
2. **Coerente com a marca** — Arena Tech tem identidade visual de tech premium (preto, dourado, prata)
3. **Confortável para uso prolongado** — densidade de informação sem fadiga visual
4. **Tema dark por padrão** — ambientes de assistência técnica frequentemente têm iluminação variável

---

## Decisões

### 1. Paleta: Preto + Dourado #c9a55c + Prata #8e8e8e

**Decisão:** Usar `#0a0a0a` como background, `#c9a55c` como primary (dourado), `#8e8e8e` como secondary (prata).

**Alternativas consideradas:**
- Slate/neutral (padrão shadcn) — descartado, genérico demais
- Azul corporativo — descartado, não alinha com a marca Arena Tech
- Verde/teal — descartado, remete a saúde/financeiro

**Justificativa:** O dourado `#c9a55c` é a cor identitária da Arena Tech. O preto `#0a0a0a` cria contraste premium. O prata `#8e8e8e` complementa com tom de tecnologia.

### 2. Tema dark como padrão

**Decisão:** `defaultTheme="dark"` no ThemeProvider, tema light disponível via toggle.

**Justificativa:**
- Técnicos trabalham em bancadas com múltiplos monitores, frequentemente com iluminação mista
- Dark mode reduz cansaço visual em uso prolongado
- Combina melhor com o branding preto/dourado

### 3. Geist Sans como fonte (mantido do scaffold)

**Decisão:** Manter Geist Sans como fonte principal (já estava no projeto).

**Alternativas consideradas:**
- Inter — mais comum, boa legibilidade, mas muito genérica
- JetBrains Mono para tudo — descartado, código ≠ UI
- Geist Sans — levemente mais distinta que Inter, moderna, boa para dados técnicos

### 4. Sonner sobre Radix Toast nativo

**Decisão:** Usar `sonner` para toasts em vez do `<Toaster>` do shadcn/radix.

**Alternativas consideradas:**
- `@radix-ui/react-toast` (via shadcn) — mais verboso, API menos amigável para promises

**Justificativa:**
- `toast.promise(fn, { loading, success, error })` é idiomático para operações async (criar OS, salvar venda)
- API simples: `toast.success("msg")` vs stack de hooks do Radix
- `richColors` mode funciona bem com nossa paleta

### 5. TanStack Table v8 para DataTable

**Decisão:** Usar `@tanstack/react-table` v8 diretamente, sem abstrações.

**Alternativas consideradas:**
- `ag-grid` — licença paga para features avançadas
- `react-table` v7 — versão antiga, API diferente
- shadcn DataTable sem TanStack — limitado para server-side pagination

**Justificativa:**
- Tipagem forte com generics `ColumnDef<TData, TValue>`
- Suporte nativo para paginação server-side (necessário para listas de OS, clientes, estoque)
- `getCoreRowModel` + `manualPagination` é o padrão da nossa stack tRPC

### 6. Densidade confortável (row-height ~52px via py-4)

**Decisão:** Padding `py-4` nas TableCells, resultando em ~52px por linha.

**Alternativas consideradas:**
- Compact (~32px) — cansativo em uso prolongado
- Comfortable (~64px) — desperdício de espaço, menos itens por tela

**Justificativa:** 52px é o sweet spot entre densidade e legibilidade. Técnicos fazem muita leitura sequencial de listas — compacto demais aumenta erros de leitura.

### 7. Sidebar colapsável com persistência por cookie

**Decisão:** Cookie `arena_sidebar_collapsed` persiste estado entre sessões/reloads.

**Justificativa:**
- Usuários que preferem mais espaço para conteúdo (ex: tabelas largas no PDV) não querem reconfigurar a cada sessão
- Cookie lido no servidor (SSR) evita flash de estado incorreto no hidrate

---

## Consequências

**Positivas:**
- Identidade visual consistente com a marca
- Componentes reutilizáveis (DataTable, inputs especializados) aceleram desenvolvimento das Fases 5+
- `/dev/components` funciona como storybook leve para referência

**Negativas:**
- Paleta custom exige manutenção manual ao atualizar shadcn (tokens em globals.css)
- Toast helper (`src/lib/toast.ts`) adiciona uma camada de indireção sobre sonner

---

## Referências

- shadcn/ui: https://ui.shadcn.com
- Tailwind v4 CSS Variables: https://tailwindcss.com/docs/v4-upgrade#using-css-variables
- Sonner: https://sonner.emilkowal.ski
- TanStack Table v8: https://tanstack.com/table/v8
