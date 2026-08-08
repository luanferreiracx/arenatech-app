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

---

# Adendo — três decisões do dono (2026-08-08, após a auditoria)

Depois de ler o relatório, o dono decidiu três mudanças. Duas delas **anulam
achados desta mesma auditoria** — registro porque é o caso mais claro do
programa em que a solução certa não era a que a auditoria propôs.

## CAT-3 — o catálogo passa a ter um preço só

> *"sobre preço pix / preço cartão. acho desnecessário. preço pix é suficiente."*

O CAT-1 (PR #885) tinha acabado de fechar a validação que impedia o PIX de ser
maior que o cartão — incluindo o buraco da edição parcial, que custou uma segunda
rodada. O dono cortou a raiz: **com um campo só, a comparação deixa de existir**.

A validação foi removida junto, nas três camadas. Guarda sem dois lados para
comparar é código morto que aparenta proteção — e o guardião que a defendia foi
apagado no mesmo commit.

**Migração antes de mexer na tela.** 15 dos 23 aparelhos tinham preço apenas em
`price`. Remover o campo os deixaria com o valor **preso no banco**: visível para
o bot (que lê `promotionalPrice ?? price`), ineditável pelo operador. Os 15 foram
copiados para `promotionalPrice` — **0 divergências, nenhum valor anunciado
mudou**. Backup em `~/Documents/arenatech-backups/`.

A coluna `price` continua na tabela e é **espelhada** a cada escrita, porque
ainda é lida em dois lugares: o fallback do bot e a ordenação
(`orderBy: [{ price: "asc" }]`). Deixá-la parada faria a lista do Talison ordenar
por preço antigo.

## CAT-2 — condição vira lista fechada

> *"no catálogo de aparelhos, condição deveria ter condições para seleção e não
> um texto livre."*

O dado de produção mostrava o custo do texto livre:

| condição | registros |
|---|---|
| `novo` | 18 |
| `Novo` | 2 |
| `Seminovo` | 2 |
| (vazio) | 1 |

**A mesma condição escrita de dois jeitos**, sem agrupar em filtro nenhum.

`DEVICE_CONDITIONS` = Novo, Seminovo, Usado, Vitrine — constante compartilhada
entre tela e schema, para não divergirem no primeiro valor novo. O schema
**normaliza a caixa** em vez de recusar o legado:

```
"novo"     -> 200, gravou "Novo"
"SEMINOVO" -> 200, gravou "Seminovo"
"Quebrado" -> 400, RECUSADO
```

Os 18 registros de produção foram normalizados: "novo"/"Novo" viraram um só
valor (20).

## CAT-4 — a vitrine não expõe mais o estoque exato

> *"na vitrine é melhor remover a quantidade e deixar apenas um alerta de últimas
> unidades (quando tiver 2 unidades ou menos)."*

Isto **atende o R1** que eu havia registrado sem proposta.

A quantidade exata aparecia em **três** lugares, não um: `"100 un."` na página de
produto, `"Restam N"` no card da listagem e num badge da própria página. Eu só
tinha visto o primeiro — corrigir apenas ele repetiria o padrão que esta auditoria
vem nomeando.

O limiar era **3** no serviço e passou a **2**, vivendo num lugar só
(`LOW_STOCK_THRESHOLD`) e chegando ao cliente já resolvido em `lowStock`. Antes
cada tela formatava o próprio texto a partir de `availableQuantity` — foi
exatamente assim que o número acabou exposto em três lugares diferentes.

Verificado no HTML servido:

```
estoque 2   -> "Últimas unidades"
estoque 100 -> "Em estoque"
"Restam N"          -> 0 ocorrências
availableQuantity   -> 0 ocorrências (não vaza no payload RSC)
```

## Dois defeitos que o screenshot pegou depois

Nenhum dos dois estava no diff — apareceram ao **olhar a tela** a 320px:

1. O subtítulo do diálogo ainda dizia *"Deixe em branco se não houver
   desconto"* — sobra do tempo em que havia cartão para descontar.
2. `flex gap-6` sem quebra cortava **"Disponível para venda"** no meio. Mesma
   classe do CMU-8 (M8).

## Guardião

`__tests__/unit/catalogo-preco-condicao-estoque.test.ts` — 18 asserções.
Visto falhar antes de aceito: **17 de 18 vermelhas**.

Uma delas falhou **contra o código já corrigido** na primeira escrita: ancorei a
busca no texto "Disponível para venda", cuja primeira ocorrência é o **comentário
que explica a correção**, não o rótulo. Ancorada no `<Label>`, passou.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2547 testes** verdes.
