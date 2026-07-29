# Módulo 3 — Estoque / Compras / Fornecedores

**Passada A (backend):** concluída em 2026-07-29.
**Passada B (frontend):** concluída em 2026-07-29.

## Superfície

| | |
|---|---|
| Router | `src/server/api/routers/stock.ts` — **70 procedures** (eram 82) |
| Serviços | `stock-item.service.ts`, `product.service.ts`, `product-brand.service.ts`, `product-sku-barcode.service.ts`, `os-stock.service.ts`, **`stock-position.service.ts` (novo)** |
| Rotas REST | `/api/reports/stock/[type]` (PDF), `/api/stock/labels`, `/api/products/upload`, `/api/purchases/[id]/termo-responsabilidade`, `/api/whatsapp-media/purchase/pdf/[token]` |
| Telas | `/stock/*` (24 telas) |

## Invariantes que o módulo promete

1. O saldo de um produto obedece ao **regime** dele: serializado = `COUNT(StockItem disponível)`, com variações = soma das variações, simples = `currentStock`.
2. Nenhum caminho grava saldo em produto que não é do regime simples.
3. Movimento de estoque é append-only e encadeado (`quantityBefore` do próximo == `quantityAfter` do anterior).
4. Compra cancelada devolve o estoque exatamente uma vez.
5. Relatório de estoque mostra o que existe fisicamente.
6. Filtro por período respeita o fuso de quem opera.

Quebraram a **5** e a **6**.

## Prova de dados (snapshot de produção, 2026-07-29)

| Medição | Valor |
|---|---|
| Produtos ativos | 784 |
| Serializados cujo `currentStock` diverge do saldo real | **22** |
| …aparelhos que somem do relatório | **34** (R$ 3.000,00) |
| Com variações cujo `currentStock` diverge | **35** |
| …unidades que somem do relatório | **596** (relatório mostra 98, real 694) |
| Movimentos de estoque feitos depois das 21h BRT | **531 de 2.757 (19%)** |
| Procedures sem nenhuma tela chamando | **12** (8 mutações, nenhuma com gate de admin) |
| Saldos negativos | 0 |

## Achados

### EST-1 — o PDF de estoque mostrava saldo que não existe (P0)

O saldo tem três regimes e existe um resolvedor para isso
(`resolveCurrentStockByProduct`). O **procedure** `stock.reportPosicao` usa o
resolvedor. A **rota REST que gera o PDF** dos mesmos relatórios — a que a tela
de relatórios abre — lia `product.currentStock` cru.

Consequência medida: o PDF de **Posição de Estoque** some com **34 aparelhos
serializados (R$ 3.000)** e **596 unidades** de produtos com variação. É o
documento usado para conferir inventário físico.

Pior é o de **Estoque Mínimo**: ele *filtra* por esse número. Produto cheio
aparece como abaixo do mínimo — o relatório manda comprar o que já está na
prateleira.

**É o mesmo padrão do Módulo 1 (relatório de caixa) e do Módulo 2 (recibo
público): duas implementações, o endurecimento numa e os usuários na outra.**
Terceiro módulo seguido.

**Correção estrutural:** `stock-position.service.ts` passa a ser a fonte única
das linhas desses dois relatórios, com o resolvedor dentro. A rota consome o
serviço — não há mais uma segunda implementação para divergir.

### EST-2 — nenhum filtro de data do módulo respeitava o fuso (P1)

O router **não importava** `date-range`. Todos os filtros usavam
`new Date(dateFrom)` (meia-noite **UTC** = 21h BRT do dia anterior) com
`dateTo + "T23:59:59"` (hora do processo). Atingia o kardex (`listMovements`), a
lista de compras, o relatório de movimentações, a curva ABC e as vendas por
período.

**531 dos 2.757 movimentos de estoque — 19% — foram feitos depois das 21h BRT**
e caíam no dia seguinte. Quinto e sexto lugares do sistema com o mesmo defeito
(DRE, relatório de NF, fluxo de caixa, caixa e PDV já corrigidos).

### EST-3 — 12 procedures que nenhuma tela chama (P2)

`updatePurchaseDate`, `createBrand`, `stockEntry`, `getCsvImportTemplate`,
`createVariation`, `getNcmByCode`, `getStockItem`, `entrySerializedItems`,
`entryQuantity`, `adjustInventory`, `getImeiHistory`, `getAvailableQuantity`.

**8 são mutações, nenhuma com gate de admin**, e várias escrevem estoque direto.
Procedure sem tela continua chamável por HTTP por qualquer usuário logado: é
superfície sem teste, sem auditoria e sem dono.

Detalhe que vale registrar sobre método: a auditoria de 2026-07-25 tratou
`stock.entryQuantity` como **P0** e o corrigiu — **sem notar que nenhuma tela a
chama**. A severidade estava superestimada porque ninguém perguntou "quem chama
isto?". A varredura de superfície morta é barata e responde essa pergunta.

**Decisão do dono:** apagar as 12.

Dois testes existentes apontavam para procedures removidas. Nenhum foi apagado —
os dois foram **repontados para o caminho vivo**, porque o que precisa continuar
valendo é a invariante, não a procedure:

| Teste | Antes | Agora |
|---|---|---|
| `stock-entry-quantity-regime` | `stock.entryQuantity` | `stock.stockEntryBatch` |
| `stock-adjust-cancel-concurrency` | `stock.adjustInventory` | `stock.bulkAdjust` (que chama o **serviço** `adjustInventory`, vivo) |

## Verificado e descartado (não viraram achado)

Registrado para não ser re-investigado:

- **`/api/whatsapp-media/purchase/pdf/[token]`** — token assinado com expiração (`verifyPublicPdfToken`). Correto.
- **`/api/reports/stock/[type]`** seleciona `costPrice`, mas **não** o emite em nenhuma coluna. Sem vazamento de custo para não-admin.
- **Picker de produto da OS** (`service-order.ts`) lê `p.currentStock` cru, mas filtra `isSerialized: false` e devolve estoque por variação quando há variações. Correto para o escopo dele.
- **0 saldos negativos** em produção.

## Achados da passada de frontend

Varredura das **22 telas** × admin/operador × desktop/mobile = 88 combinações.
0 quebradas; 10 de atenção, com três defeitos distintos por trás.

### EST-4 — a lista de atributos perdia a identidade das linhas (P1)

`/stock/attributes` fazia `attributes.map(attr => <>…</>)`: a `key` estava nas
`TableRow` de dentro, e o **fragmento que o `map` devolve** saía sem key. O React
avisa isso no console — e o aviso aparecia nas quatro combinações.

Não é cosmético: a página tem expandir/recolher (`expandedId`) e edição inline
de valores. Sem identidade estável, o estado preso à posição — a linha aberta, o
campo em edição — pode saltar para outro atributo quando um é criado ou apagado.

Varri o resto do app pelo mesmo padrão: **era o único caso**.

### EST-5 — a tela de estoque não cabia no celular (P1)

Os cards do painel (`Alertas de Estoque Baixo`, `Top Produtos da Semana`) são
itens de grid, e item de grid nasce com `min-width: auto` — **não encolhe abaixo
do conteúdo**. A tabela de dentro (que já rola sozinha) empurrava o card para
**613px numa viewport de 390**, e a página inteira ganhava scroll horizontal.

`/stock/import` tinha causa própria: `input[type=file]` tem largura intrínseca
larga e não tinha teto (444px em 390 de tela).

### EST-6 — a trilha de navegação empurrava a página em rota profunda (P1, transversal)

`Estoque › Fornecedores › Detalhe › Editar` não cabe em 390px, e o breadcrumb não
tinha estratégia de overflow. **Vale para qualquer rota profunda do app no
celular**, não só o estoque. A trilha passou a rolar sozinha, mantendo todos os
níveis alcançáveis sem mexer no resto da tela.

> **Terceira vez que o mesmo mecanismo aparece**: um componente compartilhado sem
> `min-w-0`/estratégia de overflow empurrando a página. Módulo 2: `PageHeader`
> (`shrink-0` anulando o `flex-wrap`). Aqui: itens de grid e o breadcrumb. Vale
> tratar como classe, não como caso isolado — está registrado no checklist de
> frontend.

## Reconciliação tela × banco

O impacto do EST-1 medido pelo que a loja veria:

| | Pelo regime correto | Pelo campo cru (o que o PDF fazia) |
|---|---|---|
| Produtos abaixo do mínimo | **132** | **147** |

O relatório de Estoque Mínimo listava **15 produtos a mais** — itens que estão na
prateleira. A loja compraria o que já tem.

## Checklist de frontend

| Eixo | Situação |
|---|---|
| 1. Erro visível | ✅ (correção transversal do Módulo 1) |
| 2. Carregando / disabled | ✅ |
| 3. Invalidação após mutação | ✅ |
| 4. Estado vazio | ✅ |
| 5. Permissão | ✅ criar atributo/valor é gerência; a página esconde do operador |
| 6. Formatação pt-BR | ✅ |
| 7. Mobile 390px | ✅ corrigido (EST-5, EST-6) — 88 combinações limpas |
| 8. Acessibilidade | ✅ trilha rolável mantém todos os níveis; sem dependência de cor |
| 9. Reconciliação | ✅ 132 vs 147 medido |
| 10. Console e rede | ✅ corrigido (EST-4) |
| 11. Fluxo incompleto | ✅ resolvido no backend (EST-3) |

## Nota honesta sobre cobertura de teste

O E2E novo cobre **um** dos três achados de frontend: o estouro de largura em
320px (piso da WCAG 1.4.10), que é independente de dado e **falha sem a
correção**.

Os outros dois não viraram E2E de propósito. No banco de seed as telas nascem
vazias — sem produto abaixo do mínimo não há card, sem atributo não há lista — e
um teste que passa **por falta de conteúdo** não guarda nada. Quem guarda esses
dois é a **varredura de navegador**, que foi quem os encontrou: ela roda contra a
cópia de produção e lê o console de todas as telas do módulo. Preferi registrar
isso a entregar teste decorativo.

## Checklist de backend

| Eixo | Situação |
|---|---|
| 1. RBAC | ✅ `bulkAdjustPrice`/`deleteByType` já eram admin (auditoria anterior); as mutações sem gate removidas com EST-3 |
| 2. Gating de módulo | ⚠️ rotas REST fora do tRPC sem gate — cross-cutting, Módulo 10 |
| 3. Validação de entrada | ✅ |
| 4. Tenant/RLS | ✅ `withTenant` em tudo; `withAdmin` só onde é global por design |
| 5. Concorrência | ✅ CAS em saída, lock `FOR UPDATE` no ajuste, CAS no cancelamento de compra |
| 6. Dinheiro | ✅ média ponderada isolada em `lib/stock/weighted-average.ts` |
| 7. Estoque | ✅ corrigido (EST-1) |
| 8. Tempo (BRT) | ✅ corrigido (EST-2) |
| 9. Soft delete | ✅ |
| 10. Performance | ✅ `resolveCurrentStockByProduct` agrega em lote (sem N+1) |
| 11. Erro e observabilidade | ✅ |
| 12. Transação | ✅ |
| 13. Superfície morta | ✅ corrigido (EST-3) |

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit    # 2007 verdes
pnpm test:integration                             # 87 arquivos, 277 testes verdes
```

Testes:
- `__tests__/integration/stock-report-uses-real-balance.test.ts` — o primeiro caso prova a divergência que a rota consumia (resolvedor diz 3, o campo cru diz 0); os demais travam o comportamento corrigido. **Não é um "falha antes"** no sentido literal, porque a correção foi extrair o serviço; está registrado assim de propósito.
- `stock-entry-quantity-regime` e `stock-adjust-cancel-concurrency` — repontados para o caminho vivo, verdes.
