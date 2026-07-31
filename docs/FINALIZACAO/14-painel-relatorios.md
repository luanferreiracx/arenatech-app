# Módulo 14 — Painel / Relatórios

**Passada A (backend):** concluída em 2026-07-31.
**Passada B (frontend):** concluída em 2026-07-31.

## Superfície

| | |
|---|---|
| Routers | `dashboard.ts` (516, 8 procedures), `report.ts` (151, 1) |
| Rotas REST | `/api/reports/[type]/pdf`, `/api/reports/stock/[type]`, `/api/service-orders/technician-report/pdf` |
| Telas | `/painel`, `/reports`, `/stock/reports` |

## Reconciliação tela × banco

O risco próprio deste módulo não é corromper dado — é **mostrar número que mente**.
Então a passada foi de reconciliação, contra a cópia de produção:

| Indicador | Painel | Banco | |
|---|---|---|---|
| Clientes | 1.382 | 1.382 | ✅ |
| OS abertas | 10 | 10 | ✅ |
| Vendas no mês | 284 | 284 | ✅ |
| Faturamento do mês | R$ 208.002,43 | R$ 208.002,43 | ✅ |

Exato nos quatro.

### A divergência que era minha, não do sistema

Na primeira conferência o faturamento deu **R$ 178.022,96** contra os
R$ 208.002,43 do painel — R$ 29.979,47 de diferença, com a **mesma** contagem de
284 vendas. Contagem batendo e soma não é a assinatura clássica de "somando a
coluna errada", e eu estava a um passo de escrever um achado de ~17% de
superfaturamento na tela mais vista do sistema.

Fui ler o código antes. O painel usa **deliberadamente a mesma definição de
receita do DRE**, documentada no próprio arquivo:

```
receita = GREATEST(subtotal − desconto, 0) − taxa da operadora,
          escalada pela fração de itens MANTIDOS (estorno parcial),
          por sale_date, incluindo COMPLETED e PARTIALLY_REFUNDED
```

Eu havia somado `SUM(totalAmount)` de `COMPLETED` por `createdAt` — que é
exatamente a definição **antiga**, corrigida na auditoria financeira de
2026-07-10 (D2) justamente porque divergia do DRE e a loja via dois faturamentos
diferentes. Refeita a query com a regra certa: **208.002,43 / 284**, idêntico.

Fica o registro: a auditoria anterior não só corrigiu o número como deixou a
regra escrita ao lado do código. Foi o que impediu um achado falso.

## O que auditei e está íntegro

- **Fusos ancorados em BRT** (`startOfMonthBrt`, `startOfTodayBrt`,
  `endOfPrevMonthBrt`, `brtDayKey`), com o comentário explicando o defeito que
  motivou: o container roda UTC, e sem isso uma venda de 21h-24h BRT aparecia no
  dia seguinte.
- **Nada de N+1 no card de estoque baixo.** Suspeitei: a consulta carrega os 206
  produtos com mínimo definido **sem `take`** (deliberado — cortar antes no banco
  esconderia os baixos). Mas `resolveCurrentStockByProduct` resolve o saldo em
  **dois `groupBy`** (serializados e variações), não em 206 consultas.
- **Fonte única de receita** compartilhada com o DRE — a razão de a reconciliação
  fechar.

## Achados da passada de frontend

Crawler: `/painel` e `/reports` × 2 papéis × 2 viewports, **0 quebradas, 0
atenção** — o overflow de celular que estava aqui já tinha sido corrigido durante
o Módulo 11 (CMN-1, 932px → 390px).

Os dois achados vieram do eixo em que um painel mente melhor: **ausência lida como
informação**.

### PN-1 — os indicadores sumiam em silêncio quando a query falhava (P2)

O bloco era `statsLoading ? <Skeleton> : stats ? <KPIs> : null`.

Com a query de `stats` falhando, a **linha inteira de números desaparecia** — e o
painel continuava renderizando saudação, cartão de caixa, atalhos, alertas,
gráficos e tabelas. A tela parecia completa. Quem olhasse não via erro nenhum;
via um painel sem números, que se lê como *"não há nada hoje"*.

É o eixo 1 do checklist de frontend — erro tem que ser visível — na tela mais
aberta do sistema. E some com a política de retry do Módulo 1: um 4xx não é
retentado, então a falha dura a sessão inteira.

### PN-2 — "Requer atenção" vazio afirmava que não havia nada (P2)

Mesmo desenho no bloco de alertas: `if (!alerts) return null`.

Aqui a leitura errada é pior, porque **ausência de alerta é uma afirmação**:
"nada precisa de você agora". Sumir em silêncio fazia o painel afirmar isso sem
ter checado — com 15 contas vencidas e 154 produtos abaixo do mínimo no banco.

Os dois passaram a usar o `QueryErrorState`.

### E2E novo

`painel.spec.ts`, 2 casos: os quatro indicadores que resumem a operação aparecem
(se o bloco voltar a ser `null`, o teste cai), e o painel não rola na horizontal a
390px — guardando também o CMN-1 corrigido no Módulo 11.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit        # verde
pnpm test:e2e __tests__/e2e/painel.spec.ts           # 2 verdes (novo)
pnpm tsx scripts/audit/crawl-module.ts painel        # 0 quebradas · 0 atenção
```

Reconciliação contra a cópia de produção registrada acima. **A passada de backend
não alterou código** — não encontrei defeito nele.
