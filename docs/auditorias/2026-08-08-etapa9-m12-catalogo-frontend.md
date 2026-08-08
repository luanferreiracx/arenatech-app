# Etapa 9 · Módulo 12 — Catálogo (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/catalog` e `/catalog/[id]` (público, sem login) · `/aparelhos-catalogo` (admin)
**Provas:** código · dado de produção · navegador real

---

## Sumário

O módulo tem duas faces, e a pública é a **única superfície do sistema que um
cliente vê sem login** — a vitrine da loja.

| | |
|---|---|
| produtos na vitrine (arena-tech) | **312** |
| aparelhos no catálogo admin | 23 |
| aparelhos usando preço PIX | **8** |

Um achado corrigido, no lado admin, com impacto no que o bot diz ao cliente. A
vitrine pública passou limpa em tudo que medi.

---

## CAT-1 — o "Preço PIX" aceitava valor MAIOR que o do cartão · **corrigido**

### O defeito

O campo é, por definição, o valor **com desconto** — o próprio diálogo diz
*"deixe em branco se não houver desconto"*. Não havia nenhuma validação da
relação entre os dois preços.

Medido no navegador: **cartão R$ 1.000 + PIX R$ 1.500 salvava em silêncio.**

E não é decorativo. O rótulo na tela diz **"(bot usa este)"**:
`promotionalPrice` é o preço que o Talison responde ao cliente. Um dígito a mais
faz o bot anunciar PIX mais caro que o cartão, contradizendo a própria oferta da
loja.

**Em produção:** 23 aparelhos, **8 usando preço PIX**, zero inválidos hoje. O
defeito não aconteceu ainda — mas o campo está em uso real.

### A primeira correção tinha buraco

Comecei com `superRefine` nos dois schemas. Passou no navegador: criação barrada,
edição pela tela barrada. **E ainda tinha buraco.**

No `updateCatalogDevice` todo campo é opcional, então um PATCH com **apenas**
`promotionalPrice` chega com `price === undefined` e o refine não dispara:

```
PATCH { promotionalPrice: 99999 }  num aparelho de R$ 1.000  ->  HTTP 200
```

A guarda tem de comparar o valor **efetivo pós-edição**: o do payload quando
veio, o persistido quando não veio. Verificado nos quatro cenários:

| payload | resultado |
|---|---|
| `{ promotionalPrice: 99999 }` | **400 barrado** |
| `{ promotionalPrice: 800 }` | 200 passa |
| `{ price: 500, promotionalPrice: 400 }` | 200 passa |
| `{ price: 300 }` (deixaria PIX 400 > 300) | **400 barrado** |

O último é o caso **simétrico** — baixar o preço do cartão e deixar o PIX acima.
Comparar só o campo enviado não o pegaria.

### Onde a guarda vive

Nas três camadas, cada uma com seu papel:

1. **Tela** — avisa antes de enviar, apontando o campo (erro de servidor num
   campo de preço é ruim de ler).
2. **Schema** (`superRefine`, criação e edição) — a API é chamável direto.
3. **Mutation de edição** — compara contra o persistido, fechando o buraco da
   edição parcial.

Nenhuma delas dispara quando um dos preços está vazio: *"deixe em branco se não
houver desconto"* continua valendo.

---

## Guardião

`__tests__/unit/catalogo-preco-pix-desconto.test.ts` — 6 asserções, incluindo uma
específica para a comparação contra o valor efetivo (o buraco que quase escapou)
e outra que garante que a regra não bloqueia o cadastro sem preço PIX.

Visto falhar antes de aceito: **6 de 6 vermelhas** contra o código não corrigido.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2535 testes** verdes.

---

## O que foi verificado e está correto

### A vitrine pública — o filtro é a parte mais bem feita do módulo

`buildCatalogWhere` é **fonte única**, usada nas três consultas (lista, contagem
e busca por ID — esta última é onde vazamentos costumam acontecer). Filtra por
tenant, ativo, não-deletado, não-device, **com foto** e **com estoque real**,
cobrindo os três modelos de produto:

```ts
{ isSerialized: true,  stockItems: { some: { status: "AVAILABLE", deletedAt: null } } }
{ hasVariations: true, variations: { some: { active: true, currentStock: { gt: 0 } } } }
{ isSerialized: false, hasVariations: false, currentStock: { gt: 0 } }
```

Nenhum produto sem estoque aparece na vitrine, em nenhum dos três casos.

### Reflow a 320px — limpo nas três telas

`/catalog`, `/catalog/[id]` e `/aparelhos-catalogo`: rolagem horizontal **0px**,
nada fora da viewport, nenhum erro de JS. Dois cards por linha, preço e
parcelamento legíveis.

### Um falso positivo e um corte irrelevante

- **"Ordenar por" cortado em 88px** — é `sr-only` (largura 1px), rótulo de
  acessibilidade. Falso positivo do meu detector.
- **"Tudo disponível" cortado em 2px** a 320px — `truncate` declarado
  funcionando como projetado; some a 360px. Descartado.

---

## Registro sem proposta

### R1 — a vitrine pública mostra a quantidade exata em estoque

A página de produto exibe `${product.availableQuantity} un.` — no teste,
**"100 un."**.

Medido em produção: média de **5 unidades**, máximo **128**, só 3 produtos acima
de 50. Não é exposição alarmante, mas é informação comercial pública: a
concorrência vê o estoque exato e o cliente pode inferir giro.

Não proponho porque a decisão é de produto — mostrar disponibilidade aumenta
confiança de compra. Uma saída intermediária seria faixas ("+10 disponíveis"),
mas isso muda a conversa com o cliente e é sua escolha.

---

## O que preservar

1. **`buildCatalogWhere` como fonte única** — o mesmo filtro na lista e na busca
   por ID. É o que garante que ninguém acesse por URL direta um produto que a
   vitrine esconderia.
2. **Exigir foto para aparecer na vitrine** — foi o que me fez ver "0 produtos"
   no banco de testes (que não tem fotos) e quase registrar um falso achado. A
   regra está certa: vitrine sem imagem não vende.
3. **`min-w-0` + `truncate` + `shrink-0` na barra de resultados** — o título
   encolhe e o seletor de ordenação não é espremido. Corretamente construído.
4. **Preço PIX destacado com "(bot usa este)"** — o rótulo diz ao operador que
   aquele campo tem consequência externa. Foi o que me fez investigar a validação.
