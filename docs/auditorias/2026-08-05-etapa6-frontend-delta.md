# Etapa 6 — Frontend (passada delta)

> Programa de comercialização, etapa 6 de 6. Skill `audit-frontend`. Data:
> 2026-08-05.
>
> **Escopo deliberadamente reduzido.** A auditoria completa de frontend foi
> encerrada ontem (#809→#819). Reauditar em 24h o que acabou de ser auditado é
> teatro. Esta passada responde as **4 perguntas que ficaram em aberto** naquele
> relatório e mede o delta das etapas 1-5.

## Método

Medido em **navegador real** contra a cópia de produção, logado como **operador
do segundo tenant** (`audit-loja-2`) — não como o tenant do dono. Dev server
limpo, com o processo confirmado na porta (`lsof -nP -iTCP:3000`) antes de
qualquer medição.

---

## As 4 perguntas em aberto — respondidas

### 1. Zoom 200% (WCAG 1.4.4) — ✅ **passa**

| rota | overflow horizontal |
|---|---|
| /painel, /pdv, /customers, /stock, /service-orders, /financial, /cashier | **0px** em todas |

Não parei na medição: capturei o PDV a 200% e **olhei**. O layout não só não
estoura como permanece legível e bem hierarquizado — a lição do "1 letra por
linha a 320px" (que tinha overflow zero e estava absurdo) foi aplicada.

### 2. Espaçamento de texto (WCAG 1.4.12) — ⚠️ **passa a medição, falha na leitura**

Overflow de página: **0px** em todas as 7 rotas. Mas a contagem de elementos com
texto cortado sobe de **7 para 13** com o override ativo.

Os 7 originais são `truncate` intencionais (descrição de venda, nome de usuário).
Os **6 novos** incluem 3 itens de **navegação** — ver achado F1.

### 3. Leitor de tela — ✅ **semântica sólida** (sem NVDA/VoiceOver)

| rota | h1 | landmarks | botão sem nome | img sem alt | live region |
|---|---|---|---|---|---|
| /painel | 1 | 5 | 0 | 0 | 1 |
| /pdv | 1 | 5 | 0 | 0 | 1 |
| /customers | 1 | 5 | 0 | 0 | 1 |
| /financial | 1 | 5 | **2** | 0 | 1 |
| /service-orders | 1 | 5 | 0 | 0 | 1 |

Exatamente um `h1` por página, 5 landmarks, zero imagem sem `alt`, live region
presente. Isso é resultado real do trabalho de a11y de #813/#817.

**Ressalva honesta:** medi o **DOM renderizado**, não escutei com NVDA/VoiceOver.
A pergunta original continua parcialmente aberta — mas o que era mensurável está
medido.

### 4. Performance com volume — ✅ **risco não se materializa na escala atual**

Dado real: **787 produtos**, 2.316 variações, 1.407 clientes, 2.571 vendas. A
pergunta original falava em 5.000 produtos — ainda não é o caso.

Há **49 `findMany` sem `take`** em `report.ts` e `stock.ts`, mas os relatórios
filtram por período. Pior caso medido: relatório de 12 meses devolveria **2.546
linhas**. Combinado com a Etapa 2 (`pg_stat_statements`: query mais cara = 5s
acumulados, **1** query acima de 50ms de média), **o banco não é o gargalo**.

O risco é de renderização no cliente, não de query — e ele chega junto com o
primeiro cliente grande, não hoje.

---

## Achados

### F1 — Navegação trunca sob WCAG 1.4.12, sem fallback acessível

Com o override de espaçamento de texto ativo, três itens do menu lateral truncam:

- **"Relatório de Técnicos"**
- **"Compra de Aparelhos"**
- **"Recebíveis de Cartão"**

Medido: `title=null`, `aria-label=null` nos três. **Não há fallback nenhum.**

Por que importa mais que os outros truncados: descrição de venda cortada numa
tabela é inconveniente; **navegação cortada tira do usuário a capacidade de saber
para onde está indo**. E o público do 1.4.12 é justamente quem aumenta espaçamento
por dislexia ou baixa visão.

Não estoura a página (`scrollWidth == clientWidth`), por isso a medição de
overflow devolvia zero. **Overflow zero não é sinônimo de legível** — é o mesmo
padrão que produziu o falso negativo do "1 letra por linha".

**Severidade: P2.** Correção provável: `title` nos itens de menu, ou permitir
quebra em duas linhas.

### F2 — Dois botões só-ícone sem nome acessível (`/financial`)

Dois `<button>` contendo apenas SVG 24×24, sem texto, `aria-label` ou `title`.
Um leitor de tela anuncia "botão" e nada mais.

Pela estrutura (`flex items-center gap-2`, dentro do filtro de período), vêm do
`src/components/ui/calendar.tsx` — os controles de navegação de mês do shadcn,
que não trazem rótulo por padrão.

**Severidade: P3.** Impacto restrito, mas é componente **compartilhado** — a
correção num lugar vale para todas as telas com seletor de data.

---

## O que NÃO reportei (e por quê)

Registro para não inflar o backlog com achados especulativos:

- **130 arquivos usando `isLoading` contra 16 com `QueryErrorState`.** Contagem
  de grep não é medida de defeito — `isLoading` legítimo coexiste com tratamento
  de erro. Reportar isso seria repetir o erro que a auditoria de ontem nomeou:
  *"contagem de classe no fonte não é medida de layout"* (a pendência de "~30
  caixas sem overflow" virou **1** quebra real quando medida).
- **49 `findMany` sem `take`.** Medi o pior caso (2.546 linhas) e cruzei com o
  `pg_stat_statements` de produção. Não é problema hoje; virou linha na seção de
  "o que monitorar".
- **Os 7 truncados pré-existentes.** São `truncate` intencionais em coluna de
  tabela — comportamento correto, não defeito.

---

## Decisões a preservar

1. **`PageHeader`, breadcrumb e `TabsList` corrigidos como primitivos** nos
   primeiros módulos do programa de finalização — é o que faz as 7 rotas
   passarem no zoom 200% de uma vez, sem correção por tela.
2. **`e2e/label-association.spec.ts` mede o DOM renderizado**, não o fonte. Foi
   assim que o defeito do `EntitySelector` apareceu (um `htmlFor` apontando para
   id inexistente soa igual ao leitor de tela e parece certo no código).
3. **Um `h1` e 5 landmarks consistentes em todas as rotas** — não é acidente,
   é estrutura de layout compartilhada.

---

## Áreas de baixa confiança

- **Não escutei com leitor de tela real.** A semântica está medida no DOM; a
  experiência auditiva não.
- **Não medi as rotas de admin/superadmin** nem os fluxos de wizard (nova OS,
  entrada de estoque) neste delta.
- **Não testei com 5.000 produtos.** A conclusão de performance vale para o
  volume atual (787) e para o pior caso de relatório medido (2.546 linhas).
- **Não repeti a varredura de frame integrity** a 320px — foi feita ontem e
  fechada no #819.
