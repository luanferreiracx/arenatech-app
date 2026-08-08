# Etapa 9 — cobertura total do frontend

**Data:** 2026-08-08
**Skill:** `audit-frontend`

---

## Cobertura final

```
rotas em src/app/(app):        122   (124 menos as 2 do iPhone Hunter, removido)
medidas a 320px:               118
não medidas:                     4
```

As 4 restantes e por quê:

| rota | motivo |
|---|---|
| `/dev/components` | showcase de componentes, não é tela de produto |
| `/depix-wallet/transactions/[id]` | exige transação DePix real — não há em ambiente local |
| `/depix/withdrawals/[id]` | idem (saque) |
| `/stock/nfe/[id]` | exige importação de NF-e processada |

As três últimas dependem de integração externa (Eulen, SEFAZ). Registro como
descoberto em vez de contar como verificado.

---

## As 18 rotas de detalhe (`[id]`)

Nenhuma varredura anterior as tinha medido — rota com parâmetro não renderiza
sem um registro real. Criei OS, serviço, fornecedor e venda avulsa no banco local
para não medir tela de "não encontrado" (a armadilha do M8).

```
medidas:      18
limpas:       12
com achado:    6
```

### `/pdv/[id]` — rolava 30px, o pior caso

Duas causas na mesma tela:

1. O `title` do `PageHeader` era `flex gap-3` sem quebra com botão + ícone +
   `"Venda VND202603242"` + badge. O badge "Rascunho" terminava em **350px**.
2. A tabela de itens tinha `min-w-[32rem]` — **512px forçados** numa área de
   ~270. Valor arbitrário e desnecessário com 4 colunas.

Corrigido: cabeçalho com `flex-wrap`, tabela sem piso, `Total` antes do unitário.

### `/interests/[id]` — rolava 1px

`flex-row justify-between` sem quebra empurrava "Nova interação" para 321px.
Mesma classe do CMU-8 (M8) — sétima ocorrência de linha de ação sem quebra.

### `/service-orders/[id]/edit` — o checklist ilegível

Os rótulos do checklist de saída eram cortados: *"Aparelho liga"*, *"Aparelho
vibra"*, *"Vidro traseiro"*. São itens que o técnico **marca** — cortado, ele não
sabe o que está confirmando.

`grid-cols-2` já a 320px, com ícone + rótulo no mesmo botão. Uma coluna no
celular resolve.

### Os três que ficaram como registro

| rota | o que ficou | por quê |
|---|---|---|
| `/cashier/[id]` | descrição cortada em 22px | texto gerado pelo servidor (`"Baixa parcela #1 - CR#493bd47d"`); ainda se lê o essencial |
| `/customers/[id]` | coluna `Total` fora | tabela de compras do cliente; a data e o número aparecem |
| `/financial/[id]` | coluna `Status` fora | tabela de parcelas; o valor e o vencimento aparecem |

---

## Placar da Etapa 9 inteira

| | |
|---|---|
| rotas medidas a 320px | **118 / 122** |
| achados corrigidos | **38** |
| guardiões escritos | **21** |
| testes | 2.589 (eram ~2.480) |
| módulo removido | iPhone Hunter (ADR 0070) |

### O padrão dominante

**Sete ocorrências** da coluna decisiva nascendo fora da tela (M8, M10, M11, M15,
M18, varredura, detalhe) e **sete** de linha de ação sem quebra (CMU-8 e
derivados).

Ambos passam no teste ingênuo de reflow — a página não rola, porque o container
tem `overflow-x-auto`. Achar exigiu medir **onde cada coluna começa** e **o que
escapa do próprio pai**.

---

## O que não foi auditado

Registro para não inflar a cobertura:

- **4 rotas** sem dado local (acima).
- **Leitor de tela e navegação por teclado** — a auditoria mediu reflow, corte e
  transbordo; não anúncio de ARIA nem ordem de foco.
- **Aparelho real** — tudo em Chromium a 320px, o piso da WCAG 1.4.10. Não
  substitui um iPhone SE na mão do operador.
- **Zoom 200% e text-spacing** (WCAG 1.4.4 e 1.4.12) — fora do escopo desta
  etapa, que focou 1.4.10.
