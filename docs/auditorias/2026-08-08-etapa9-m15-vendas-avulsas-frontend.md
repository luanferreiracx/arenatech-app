# Etapa 9 · Módulo 15 — Vendas Avulsas (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/quick-sales`, `/quick-sales/new`, `/quick-sales/[id]`
**Provas:** código · dado de produção · navegador real

---

## Sumário

Módulo pequeno (981 linhas) com dinheiro real: **21 vendas, 16 pagas,
R$ 7.555,52**. O uso parou em 27/06 — há seis semanas.

Dois achados, ambos corrigidos. O primeiro é o mais grave da etapa até aqui: uma
cobrança PIX podia ser criada **zerada**.

---

## QSL-1 — o desconto podia zerar a cobrança · **corrigido**

### O defeito

`unitPrice` já exigia `min(1)` — *"Valor deve ser maior que zero"*. **A intenção
de não cobrar zero existia.** O desconto furava a regra por outro caminho: tela e
servidor usavam `Math.max(0, subtotal - desconto)`, que **zera em silêncio** em
vez de recusar.

Medido no navegador — 2 × R$ 100 com R$ 500 de desconto:

```
venda QS202600001 criada
total_amount = 0.00
status       = AWAITING_PAYMENT
```

Só não gerou o PIX porque a credencial local da Eulen é inválida. **Em produção
teria ido à API externa cobrar R$ 0,00.**

Produção está limpa: 21 vendas, **0 zeradas**, menor valor R$ 2,00. O defeito é
real e nunca ocorreu.

### O buraco da edição parcial

O `superRefine` do schema só enxerga o payload, e no `update` todo campo é
opcional: editar apenas o `discount` chegaria com `quantity`/`unitPrice`
indefinidos e passaria batido. **Mesma armadilha do CAT-1 (M12)** — desta vez fui
procurá-la de propósito.

A mutation já resolvia os valores efetivos (`input.x ?? existing.x`) para
calcular o total; a guarda entrou logo antes. Verificado pela API:

| payload | resultado |
|---|---|
| `{ discount: 50000 }` (subtotal 200) | **400 barrado** |
| `{ discount: 5000 }` | 200 passa |
| `{ unitPrice: 20 }` (deixaria desconto > subtotal) | **400 barrado** |

O último é o caso **simétrico**: baixar o preço unitário em vez de subir o
desconto.

### Onde a guarda vive

O formulário usa `zodResolver(createQuickSaleSchema)`, então o `superRefine`
protege a tela **automaticamente** — não foi preciso duplicar a regra no
componente. Verificado: desconto abusivo nem chega ao servidor, e o aviso some
quando o valor volta a ser válido.

`>=` e não `>`: desconto igual ao subtotal também zera. Uma venda de R$ 0,00 não
é "grátis" — é um PIX que a Eulen não tem como cobrar.

---

## QSL-2 — a lista escondia o valor e o status · **corrigido**

A tabela mede **741px** numa área de **270** a 320px:

| coluna | começava em | visível? |
|---|---|---|
| Numero | 25px | sim |
| Data | 142px | sim |
| Pagador | 241px | sim |
| CPF/CNPJ | 312px | **não** |
| **Valor** | **420px** | **não** |
| **Status** | **540px** | **não** |
| Acoes | 709px | **não** |

Num módulo de cobrança, "quanto" e "pago ou não" são exatamente o que a lista
existe para mostrar.

**Correção:** `Numero | Valor | Status | Data | Pagador | CPF/CNPJ | Acoes`, no
cabeçalho **e** no corpo. Depois: `Valor` em 142px, `Status` em 261px.

### Quarta ocorrência da mesma classe nesta etapa

| módulo | coluna escondida | começava em |
|---|---|---|
| M8 — Comissões (CMU-9) | Valor da alíquota | 356px |
| M10 — Comunicação (CMN-1) | Status do envio | 707px |
| M11 — Interesses (INT-1) | Status do lead | 475px |
| **M15 — Vendas Avulsas (QSL-2)** | **Valor e Status** | **420px / 540px** |

O padrão é estável: a coluna que **decide a ação** é declarada por último e nasce
fora da tela. Sempre passa no teste de reflow da página, porque `overflow-x-auto`
é estratégia válida da WCAG 1.4.10 — a norma é cumprida e a informação se perde.

---

## Guardião

`__tests__/unit/venda-avulsa-desconto-nao-zera.test.ts` — 11 asserções, incluindo
a comparação contra valores efetivos (o buraco da edição parcial) e a ordem do
corpo espelhando o cabeçalho.

Visto falhar antes de aceito: **8 de 11 vermelhas**.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2575 testes** verdes.

---

## O que foi verificado e está correto

- **CPF/CNPJ obrigatório** — o servidor recusa sem ele, com a razão registrada no
  código: a Eulen passou a exigir para qualquer valor (mudança de 2026-06-30).
- **Teto de R$ 5.000 por transação por CPF/CNPJ** — validado antes de abrir a
  transação.
- **Reflow das três telas** — rolagem horizontal da página **0** em todas; o
  transbordo era interno à tabela, em container com `overflow-x-auto`.
- **Resumo ao vivo no formulário** — subtotal e total recalculam a cada mudança,
  o que foi o que me permitiu ver o total zerando.

---

## Registro sem proposta

### R1 — o módulo está sem uso desde 27/06

21 vendas entre 23/05 e 27/06, nenhuma depois. Seis semanas de silêncio num
módulo que movimentou R$ 7.555,52.

Não sei dizer se foi substituído pelo link de pagamento fixo (#884, mergeado
ontem), se o fluxo deixou de fazer sentido, ou se apenas não houve demanda. A
resposta muda o que fazer com o código — e é sua.

---

## O que preservar

1. **`zodResolver` com o schema compartilhado** — a guarda que escrevi no
   validador passou a proteger a tela sem uma linha a mais no componente. É o que
   impede tela e servidor de divergirem.
2. **A validação de CPF/CNPJ com a razão documentada** — o comentário explica que
   é exigência da Eulen desde 2026-06-30. Sem isso, alguém "simplificaria" a
   regra no futuro.
3. **`Math.max(0, ...)` mantido** — agora como rede de segurança depois da
   guarda, não como política. Zerar em silêncio era o defeito; zerar como último
   recurso contra número negativo continua correto.
