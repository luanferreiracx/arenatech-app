# ADR 0060 — Busca de produto sem acento por coluna derivada (`search_name`)

**Status:** IMPLEMENTADA
**Data:** 2026-08-01
**Contexto relacionado:** ADR do catálogo/marca (migração `20260713120000_product_brand_entity`),
sinônimos de busca (`src/lib/search/synonyms.ts`), relato do dono em 2026-08-01.

---

## Contexto

O dono relatou: *"a busca continua sendo muito rigorosa; ao buscar um produto que
possui acentuação sem acentuação o mesmo não é encontrado."*

A causa é uma armadilha do Prisma: `contains` com `mode: "insensitive"` vira
`ILIKE`, que ignora **caixa** mas não **acento**. Num catálogo de acessórios de
celular — Película, Câmera, Cerâmica, Genérica — isso derruba boa parte das
buscas, porque ninguém digita acento no balcão.

O sistema tinha **nove** superfícies de busca de produto (estoque, PDV, ⌘K,
peças da OS, import de NF-e, sugestão de NF-e, catálogo público, bot Talison,
itens de estoque). Só o PDV resolvia — com um `$queryRaw` local usando
`unaccent()`. As outras oito não tinham nada, e cada uma repetia seu próprio
bloco `OR` de `contains`.

Três caminhos possíveis:

1. **Repetir o `$queryRaw` do PDV nas outras oito.** SQL cru espalhado, sem
   type-safety, e a paginação/contagem de cada tela teria que ser reescrita à mão.
2. **Coluna gerada (`GENERATED ALWAYS AS`).** `unaccent()` é `STABLE`, e coluna
   gerada exige expressão `IMMUTABLE`. O caminho conhecido é criar um wrapper
   marcado `IMMUTABLE` mentindo sobre o dicionário — e o Prisma não modela
   coluna gerada (tentaria escrever nela).
3. **Coluna derivada mantida por trigger.** O banco garante o valor em qualquer
   caminho de escrita; o Prisma enxerga um `String?` comum e filtra com
   `contains` normal.

## Decisão

**(3)** — `products.search_name` e `product_brands.search_name`, preenchidas pelo
trigger `*_search_name_sync` com `search_normalize()` (minúsculo, sem acento,
espaços colapsados). `products.search_name` guarda **nome + marca**, que é o que
as telas de fato procuram.

O par TypeScript é `normalizeSearchTerm()` (`src/lib/search/normalize.ts`): o
termo digitado passa por ele antes de virar filtro. As duas funções precisam
produzir a mesma saída — está escrito nas duas.

Toda busca de produto passa a chamar `productSearchFilter()`
(`src/server/services/product-search.ts`), que devolve o `where` do Prisma
casando `search_name` + `sku` + `barcode`. O `$queryRaw` do PDV foi apagado.

Índices: `GIN (search_name gin_trgm_ops)` em products (serve o `%termo%`) e
btree `(tenant_id, search_name)` em product_brands (serve o find-or-create de
marca por igualdade). O `products_brand_trgm_idx` foi derrubado — perdeu o
último leitor e índice GIN sem leitor só custa escrita.

### Por que trigger e não normalizar na aplicação

Produto nasce por cinco caminhos (cadastro, edição, import CSV, trade-in, cópia)
e vai nascer por outros. Normalizar em cada um é uma dívida que só cobra juros
quando alguém esquece — e o sintoma seria "esse produto não aparece na busca",
que ninguém liga à causa. O trigger fecha isso no banco.

## Consequências

**Boas**
- Uma única regra de busca de produto, testável e igual em todas as telas.
- Nada de SQL cru: paginação, contagem e composição de filtros seguem em Prisma.
- Marca duplicada por acento/caixa ("Asus"/"ASUS"/"Ásus") vira consulta indexada
  em vez de `$queryRaw` com `unaccent` no find-or-create.

**Custos**
- `search_name` é invisível no TypeScript: quem ler só o schema Prisma não sabe
  que existe um trigger por trás. Mitigado por comentário no schema, na coluna
  (`COMMENT ON COLUMN`) e neste ADR.
- Duas normalizações (SQL e TS) que precisam andar juntas. O teste de integração
  `product-search-accent-insensitive` quebra se divergirem.
- Escrita de produto ficou com um trigger no caminho. Custo desprezível para o
  volume atual (milhares de produtos por tenant).

**Fora do escopo**
- `catalog_devices` (catálogo de aparelhos) continua com busca sensível a acento.
  Nome de aparelho quase não tem acento (iPhone, Galaxy, Redmi); se virar
  problema, o mesmo padrão se aplica em uma migração.
- Clientes, fornecedores e serviços seguem com `contains insensitive`. Mesmo
  padrão disponível quando alguém reclamar.
