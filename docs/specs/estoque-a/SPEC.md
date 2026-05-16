# SPEC: Estoque-A (Catálogo de Produtos)

> **Status:** rascunho aguardando revisão
> **Base:** docs/legacy/estoque.md + leitura direta do código Laravel (Models, Controllers, Migrations, Views) + decisões registradas em PROMPT
> **Versão:** 1.0

---

## 1. Visão geral

Módulo de catálogo de produtos da assistência técnica. Gerencia o cadastro de itens vendáveis e rastreáveis (capas, cabos, películas, aparelhos), seus atributos e variações (cor, armazenamento), fotos, categorias e fornecedores. É consumido por PDV (carrinho), OS (peças), Fiscal (NCM), Estoque-B (StockItem) e Comunicação (Lia chatbot). **Não inclui** posição/movimentações de estoque (Estoque-B), compras de aparelhos (Estoque-C), importação de NF-e (Estoque-D) nem relatórios.

---

## 2. Glossário

| Termo | Definição |
|-------|-----------|
| **Product** (Produto) | Item cadastrado no catálogo. Pode ser simples (sem variações) ou composto (com variações de cor/armazenamento). |
| **ProductCategory** (Categoria) | Agrupamento de produtos. Multi-categoria via pivot com flag `principal`. |
| **ProductAttribute** (Atributo) | Dimensão de variação do produto (ex: Cor, Armazenamento, Capacidade). |
| **ProductAttributeValue** (Valor de Atributo) | Valor concreto de um atributo (ex: Preto, 128GB, 256GB). |
| **ProductVariation** (Variação) | Combinação específica de valores de atributos com SKU e preço próprios (ex: iPhone 15 Pro Preto 256GB). |
| **ProductPhoto** (Foto) | Imagem do produto armazenada em MinIO. Máximo 3 por produto. |
| **Supplier** (Fornecedor) | Pessoa Física ou Jurídica que fornece produtos para a loja. |
| **SKU** | Código único do produto ou variação para identificação interna. Campo `codigo_interno` no legacy. |
| **NCM** | Nomenclatura Comum do Mercosul — código fiscal de 8 dígitos obrigatório para emissão de NF-e. |
| **CEST** | Código Especificador da Substituição Tributária — complemento fiscal opcional. |
| **isSerialized** | Flag indicando que o produto exige rastreio individual (IMEI/número de série). Equivale a `eh_aparelho` + `controla_imei` no legacy. |
| **Computed field** | Campo não persistido no banco, calculado em tempo de consulta. |

---

## 3. Modelos de dados

### 3.1 Product

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem Laravel | Notas |
|-------|-------------|----------|---------|---------------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | RLS | FK → Tenant |
| categoryId | String? @db.Uuid | NO | — | z.string().uuid() | `produtos.categoria_id` | FK → ProductCategory (categoria principal legacy). Mantido para compatibilidade; M2M via pivot é a relação real. |
| sku | String? | YES | — | z.string().max(50).optional() | `produtos.codigo_interno` | Gerado automaticamente se não informado (método `gerarCodigoInterno` no legacy). |
| barcode | String? | YES | — | z.string().max(50).optional() | `produtos.codigo_barras` | EAN-8/EAN-13/Code128 |
| name | String | NO | — | z.string().min(2).max(200) | `produtos.nome` | Unique por tenant (entre não-excluídos) |
| description | String? @db.Text | YES | — | z.string().optional() | `produtos.descricao` | Texto livre |
| brand | String? | YES | — | z.string().max(100).optional() | `produtos.marca` | String livre (não é FK) |
| ncm | String? | YES | — | z.string().regex(/^\d{8}$/).optional() | `produtos.ncm` | 8 dígitos. Busca via BrasilAPI (M3). |
| cest | String? | YES | — | z.string().max(10).optional() | `produtos.cest` | Código ST complementar |
| isSerialized | Boolean | NO | false | z.boolean() | `produtos.eh_aparelho` + `produtos.controla_imei` | Produto rastreável individualmente (IMEI). Unifica 2 flags do legacy em 1 (ambos sempre ligados juntos no código real). |
| isPremium | Boolean | NO | false | z.boolean() | `produtos.eh_premium` | Flag para regras de comissão diferenciadas |
| hasVariations | Boolean | NO | false | z.boolean() | `produtos.usa_variacoes` | Se true, preços/estoque são por variação |
| icmsDifferentialRate | Decimal? @db.Decimal(5,2) | YES | — | z.number().min(0).max(100).optional() | `produtos.aliquota_icms_diferencial` | Alíquota ICMS diferencial (%) |
| costPrice | Decimal @db.Decimal(10,2) | NO | 0 | z.number().min(0) | `produtos.preco_custo` | Preço de custo (ignorado se hasVariations) |
| salePrice | Decimal @db.Decimal(10,2) | NO | 0 | z.number().min(0) | `produtos.preco_venda` | Preço de venda (ignorado se hasVariations) |
| promotionalPrice | Decimal? @db.Decimal(10,2) | YES | — | z.number().min(0).optional() | `produtos.preco_promocional` | Deve ser < salePrice |
| defaultMargin | Decimal? @db.Decimal(5,2) | YES | — | z.number().min(0).max(100).optional() | `produtos.margem_lucro_padrao` | Margem padrão para sugestão de preço |
| minStock | Int | NO | 0 | z.number().int().min(0) | `produtos.estoque_minimo` | Alerta de estoque mínimo |
| unit | String | NO | "un" | z.string().max(10) | — | Unidade de medida (un, cx, kg, etc.) |
| imageUrl | String? | YES | — | — | `produtos.imagem_url` | URL da foto principal (denormalizado da ProductPhoto para queries rápidas) |
| active | Boolean | NO | true | z.boolean() | `produtos.ativo` | |
| deletedAt | DateTime? | YES | — | — | — | Soft delete |
| createdAt | DateTime @default(now()) | NO | now() | — | `produtos.criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | — | `produtos.atualizado_em` | |

**Computed fields (não persistidos):**
- `availableQuantity: Int` — count de StockItem com status=AVAILABLE para este produto. **Stub retorna 0** até Estoque-B existir (M1).
- `effectivePrice: Decimal` — `promotionalPrice ?? salePrice` (replicando accessor `precoEfetivo` do legacy).
- `isLowStock: Boolean` — `availableQuantity <= minStock` (replicando scope `estoqueBaixo`).

**Relações:**
- `category: ProductCategory?` — BelongsTo via categoryId (compatibilidade)
- `categories: ProductCategory[]` — BelongsToMany via `ProductCategoryPivot` (multi-categoria, com flag `isPrimary`)
- `photos: ProductPhoto[]` — HasMany, ordenado por `order`
- `primaryPhoto: ProductPhoto?` — derivado (where isPrimary=true)
- `variations: ProductVariation[]` — HasMany
- `attributeConfigs: ProductAttribute[]` — BelongsToMany via `ProductAttributeConfig` (quais atributos este produto usa)

**Constraints:**
- `@@unique([tenantId, sku])` partial WHERE deletedAt IS NULL AND sku IS NOT NULL
- `@@unique([tenantId, name])` partial WHERE deletedAt IS NULL
- `@@index([tenantId, active])`
- `@@index([tenantId, barcode])`
- `@@index([tenantId, categoryId])`
- `@@index([tenantId, brand])`

---

### 3.2 ProductCategory

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem Laravel | Notas |
|-------|-------------|----------|---------|---------------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | RLS | FK → Tenant |
| name | String | NO | — | z.string().min(1).max(100) | `produto_categorias.nome` | |
| description | String? | YES | — | z.string().max(500).optional() | `produto_categorias.descricao` | |
| badgeColor | String | NO | "#6c757d" | z.string().regex(/^#[0-9a-fA-F]{6}$/) | `produto_categorias.cor_badge` | Cor para badge visual |
| active | Boolean | NO | true | z.boolean() | `produto_categorias.ativo` | |
| deletedAt | DateTime? | YES | — | — | — | Soft delete |
| createdAt | DateTime @default(now()) | NO | now() | — | `criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | — | `atualizado_em` | |

**Relações:**
- `products: Product[]` — via pivot `ProductCategoryPivot`

**Constraints:**
- `@@unique([tenantId, name])` partial WHERE deletedAt IS NULL

---

### 3.3 ProductCategoryPivot

| Campo | Tipo Prisma | Nullable | Default | Origem Laravel | Notas |
|-------|-------------|----------|---------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | padrão | PK |
| tenantId | String @db.Uuid | NO | — | RLS | Para RLS funcionar no pivot |
| productId | String @db.Uuid | NO | — | `produto_categorias_pivot.produto_id` | FK → Product |
| categoryId | String @db.Uuid | NO | — | `produto_categorias_pivot.categoria_id` | FK → ProductCategory |
| isPrimary | Boolean | NO | false | `produto_categorias_pivot.principal` | Apenas 1 principal por produto |

**Constraints:**
- `@@unique([productId, categoryId])`
- `@@index([categoryId])`

---

### 3.4 ProductAttribute

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem Laravel | Notas |
|-------|-------------|----------|---------|---------------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | RLS | FK → Tenant |
| name | String | NO | — | z.string().min(1).max(50) | `produto_atributos.nome` | Ex: "Cor", "Armazenamento" |
| slug | String | NO | — | — | `produto_atributos.slug` | Auto-gerado do nome |
| order | Int | NO | 0 | z.number().int().min(0) | `produto_atributos.ordem` | Ordenação na UI |
| active | Boolean | NO | true | z.boolean() | `produto_atributos.ativo` | |
| deletedAt | DateTime? | YES | — | — | — | Soft delete |
| createdAt | DateTime @default(now()) | NO | now() | — | `criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | — | `atualizado_em` | |

**Relações:**
- `values: ProductAttributeValue[]` — HasMany, ordenado por `order`

**Constraints:**
- `@@unique([tenantId, slug])` partial WHERE deletedAt IS NULL
- `@@index([tenantId, active])`

---

### 3.5 ProductAttributeValue

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem Laravel | Notas |
|-------|-------------|----------|---------|---------------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | RLS | FK → Tenant |
| attributeId | String @db.Uuid | NO | — | z.string().uuid() | `produto_atributo_valores.atributo_id` | FK → ProductAttribute |
| value | String | NO | — | z.string().min(1).max(100) | `produto_atributo_valores.valor` | Valor interno (ex: "preto") |
| displayValue | String? | YES | — | z.string().max(100).optional() | `produto_atributo_valores.valor_exibicao` | Valor de exibição (ex: "Preto Espacial"). Auto-preenche com `value` se vazio. |
| code | String? | YES | — | z.string().max(20).optional() | `produto_atributo_valores.codigo` | Código interno opcional |
| order | Int | NO | 0 | z.number().int().min(0) | `produto_atributo_valores.ordem` | |
| active | Boolean | NO | true | z.boolean() | `produto_atributo_valores.ativo` | |
| createdAt | DateTime @default(now()) | NO | now() | — | `criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | — | `atualizado_em` | |

**Relações:**
- `attribute: ProductAttribute` — BelongsTo
- `variations: ProductVariation[]` — BelongsToMany via `ProductVariationAttribute`

**Constraints:**
- `@@unique([attributeId, value])` — valor único dentro do atributo
- `@@index([tenantId, attributeId])`

---

### 3.6 ProductVariation

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem Laravel | Notas |
|-------|-------------|----------|---------|---------------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | RLS | FK → Tenant |
| productId | String @db.Uuid | NO | — | z.string().uuid() | `produto_variacoes.produto_id` | FK → Product |
| sku | String? | YES | — | z.string().max(50).optional() | `produto_variacoes.sku` | SKU próprio da variação |
| barcode | String? | YES | — | z.string().max(50).optional() | `produto_variacoes.codigo_barras` | |
| costPrice | Decimal? @db.Decimal(10,2) | YES | — | z.number().min(0).optional() | `produto_variacoes.preco_custo` | Se null, herda do produto |
| salePrice | Decimal? @db.Decimal(10,2) | YES | — | z.number().min(0).optional() | `produto_variacoes.preco_venda` | Se null, herda do produto |
| promotionalPrice | Decimal? @db.Decimal(10,2) | YES | — | z.number().min(0).optional() | `produto_variacoes.preco_promocional` | |
| minStock | Int | NO | 0 | z.number().int().min(0) | `produto_variacoes.estoque_minimo` | |
| imageUrl | String? | YES | — | — | `produto_variacoes.imagem_url` | Foto específica da variação |
| active | Boolean | NO | true | z.boolean() | `produto_variacoes.ativo` | |
| deletedAt | DateTime? | YES | — | — | — | Soft delete |
| createdAt | DateTime @default(now()) | NO | now() | — | `criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | — | `atualizado_em` | |

**Computed fields:**
- `effectiveCostPrice`: costPrice ?? product.costPrice
- `effectiveSalePrice`: salePrice ?? product.salePrice
- `availableQuantity`: count de StockItem vinculado a esta variação (stub = 0 até Estoque-B)
- `attributeDescription`: string formatada dos atributos (ex: "Preto / 128GB")

**Relações:**
- `product: Product` — BelongsTo
- `attributeValues: ProductAttributeValue[]` — BelongsToMany via `ProductVariationAttribute`

**Constraints:**
- `@@unique([tenantId, sku])` partial WHERE deletedAt IS NULL AND sku IS NOT NULL
- `@@index([tenantId, productId])`

---

### 3.7 ProductVariationAttribute (pivot)

| Campo | Tipo Prisma | Nullable | Default | Origem Laravel | Notas |
|-------|-------------|----------|---------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | padrão | PK |
| variationId | String @db.Uuid | NO | — | `produto_variacao_atributos.variacao_id` | FK → ProductVariation |
| attributeValueId | String @db.Uuid | NO | — | `produto_variacao_atributos.atributo_valor_id` | FK → ProductAttributeValue |

**Constraints:**
- `@@unique([variationId, attributeValueId])`

---

### 3.8 ProductAttributeConfig (pivot)

| Campo | Tipo Prisma | Nullable | Default | Origem Laravel | Notas |
|-------|-------------|----------|---------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | padrão | PK |
| productId | String @db.Uuid | NO | — | `produto_atributos_config.produto_id` | FK → Product |
| attributeId | String @db.Uuid | NO | — | `produto_atributos_config.atributo_id` | FK → ProductAttribute |
| order | Int | NO | 0 | `produto_atributos_config.ordem` | Ordem de exibição dos atributos no produto |

**Constraints:**
- `@@unique([productId, attributeId])`

---

### 3.9 ProductPhoto

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem Laravel | Notas |
|-------|-------------|----------|---------|---------------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | RLS | FK → Tenant |
| productId | String @db.Uuid | NO | — | z.string().uuid() | `produto_fotos.produto_id` | FK → Product |
| url | String | NO | — | — | `produto_fotos.imagem_url` | URL MinIO da versão original |
| thumbUrl | String? | YES | — | — | — | URL MinIO thumb 200x200 (M2) |
| mediumUrl | String? | YES | — | — | — | URL MinIO medium 600x600 (M2) |
| order | Int | NO | 0 | z.number().int().min(0) | `produto_fotos.ordem` | Ordenação |
| isPrimary | Boolean | NO | false | z.boolean() | `produto_fotos.eh_principal` | Apenas 1 por produto |
| createdAt | DateTime @default(now()) | NO | now() | — | `criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | — | `atualizado_em` | |

**Relações:**
- `product: Product` — BelongsTo

**Constraints:**
- `@@index([tenantId, productId, order])`
- `@@index([tenantId, productId, isPrimary])`

**Limites:**
- MAX_PHOTOS = 3 por produto (constante do legacy `ProdutoFoto::MAX_FOTOS`)

---

### 3.10 Supplier

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem Laravel | Notas |
|-------|-------------|----------|---------|---------------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | RLS | FK → Tenant |
| type | SupplierType (enum) | NO | PJ | z.enum(['PF','PJ']) | `fornecedores.tipo_pessoa` | Discriminador |
| name | String | NO | — | z.string().min(2).max(200) | `fornecedores.nome_razao_social` | Razão social (PJ) ou nome completo (PF) |
| tradeName | String? | YES | — | z.string().max(200).optional() | `fornecedores.nome_fantasia` | Apenas PJ |
| cpf | String? | YES | — | validateCPF | — | Obrigatório se type=PF. Extraído de `cpf_cnpj` (legacy armazena ambos no mesmo campo). |
| cnpj | String? | YES | — | validateCNPJ | — | Obrigatório se type=PJ. Extraído de `cpf_cnpj`. |
| phone | String? | YES | — | z.string().max(20).optional() | `fornecedores.telefone` | |
| email | String? | YES | — | z.string().email().max(150).optional() | `fornecedores.email` | |
| zipCode | String? | YES | — | z.string().max(9).optional() | `fornecedores.cep` | |
| street | String? | YES | — | z.string().max(255).optional() | `fornecedores.logradouro` | |
| streetNumber | String? | YES | — | z.string().max(20).optional() | `fornecedores.numero` | |
| complement | String? | YES | — | z.string().max(100).optional() | `fornecedores.complemento` | |
| neighborhood | String? | YES | — | z.string().max(100).optional() | `fornecedores.bairro` | |
| city | String? | YES | — | z.string().max(100).optional() | `fornecedores.cidade` | |
| state | String? | YES | — | z.string().length(2).optional() | `fornecedores.estado` | UF 2 chars |
| notes | String? @db.Text | YES | — | z.string().optional() | `fornecedores.observacoes` | |
| active | Boolean | NO | true | z.boolean() | `fornecedores.ativo` | |
| deletedAt | DateTime? | YES | — | — | — | Soft delete |
| createdAt | DateTime @default(now()) | NO | now() | — | `criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | — | `atualizado_em` | |

**Relações:**
- Consumido por StockItem (Estoque-B) como `fornecedorId`

**Constraints:**
- `@@index([tenantId, active])`
- `@@index([tenantId, cpf])` partial WHERE cpf IS NOT NULL
- `@@index([tenantId, cnpj])` partial WHERE cnpj IS NOT NULL
- `@@index([tenantId, name])`

---

### 3.11 Enums

```prisma
enum SupplierType {
  PF
  PJ
}
```

> Nota: `DeviceCondition` (NEW, USED, REFURBISHED, DEFECTIVE) já existe no schema atual e pertence a Estoque-C (CompraAparelho). Não duplicar aqui.

---

## 4. Telas

### 4.1 Listagem de Produtos — `/stock/products`

**Acesso:** todos os papéis autenticados (read)

**Filtros (extraídos de ProdutoController@index):**
- Busca textual: nome, SKU, código de barras, marca (scope `busca`)
- Categoria (select de ProductCategory ativas)
- É aparelho / É serializado (checkbox)
- Status: Ativo / Inativo / Todos
- Estoque baixo (boolean — filtro `estoqueBaixo`)

**Colunas da listagem (extraídas da view `index.blade.php`):**
- Foto principal (thumbnail 40x40)
- Nome do produto
- SKU (código interno)
- Marca
- Categoria principal
- Preço de venda (formatado R$)
- Quantidade disponível (computed, stub=0)
- Status (badge ativo/inativo)

**Ações por linha:**
- Ver detalhe
- Editar (Manager+Owner)
- Duplicar (Manager+Owner)
- Excluir (Manager+Owner, soft delete)

**Paginação:** server-side, 25 por página (padrão DataTable)

---

### 4.2 Detalhe do Produto — `/stock/products/[id]`

**Acesso:** todos (read)

**Layout:** Tabs

**Tab "Dados":**
- Card com foto principal + galeria (thumbnails)
- Campos: nome, SKU, código de barras, marca, NCM, CEST
- Flags: isSerialized, isPremium, hasVariations
- Preços: custo, venda, promocional, margem
- Categorias (badges coloridos)
- Descrição

**Tab "Variações"** (só se hasVariations=true):
- Tabela com: atributos combinados, SKU, preço venda, preço custo, ativo
- Botão "Nova variação" (Manager+Owner)
- Ações: editar, toggle ativo, excluir

**Tab "Fotos":**
- Galeria com upload drag-and-drop
- Reordenar (drag)
- Marcar como principal
- Excluir foto

**Tab "Histórico":**
- Placeholder "Movimentações estarão disponíveis após módulo Estoque-B" (M5)

---

### 4.3 Criar Produto — `/stock/products/new`

**Acesso:** Manager + Owner

**Seções do form (extraídas de `form.blade.php`):**

**Seção 1 — Informações Básicas:**
- nome* (input text, min 2, max 200)
- sku (input text, max 50, auto-gerado se vazio)
- código de barras (input text, max 50)
- marca (input text, max 100)
- categorias* (multi-select com badges coloridos, flag `principal` na primeira selecionada)
- descrição (textarea)

**Seção 2 — Classificação Fiscal:**
- NCM (input com botão "Buscar NCM" → modal BrasilAPI)
- CEST (input text)
- Alíquota ICMS diferencial (% input)

**Seção 3 — Características:**
- É serializado (switch) — tooltip: "Ativar para produtos com IMEI ou número de série"
- É premium (switch) — tooltip: "Afeta cálculo de comissões"
- Usa variações (switch) — quando ativo, esconde seção de preços e mostra seção de variações
- Estoque mínimo (input number)
- Unidade de medida (select: un, cx, kg, par, etc.)
- Ativo (switch, default true)

**Seção 4 — Preços** (SOMENTE se `usa_variacoes` = false):
- Preço de custo (MoneyInput)
- Preço de venda* (MoneyInput)
- Preço promocional (MoneyInput, validado < preço venda)
- Margem padrão (% input, read-only calculado ou editável)

**Seção 5 — Fotos:**
- Upload de até 3 imagens (arrastar ou clicar)
- Preview em tempo real
- Marcar foto principal
- Formatos: JPG, PNG, WebP (max 10MB por foto, processado para WebP via Sharp)

**Seção 6 — Atributos e Variações** (SOMENTE se `usa_variacoes` = true):
- Seleção de atributos configurados (checkboxes de ProductAttribute)
- Tabela de variações: SKU, preço custo, preço venda, preço promocional, foto, ativo
- Botão "Adicionar variação" → seleciona valores de cada atributo configurado
- Upload de imagem por variação

---

### 4.4 Editar Produto — `/stock/products/[id]/edit`

**Acesso:** Manager + Owner

Idêntico ao form de criar, pré-preenchido com dados existentes. Diferenças:
- Nome pode ser alterado (unique validado server-side)
- SKU pode ser alterado (unique validado server-side)
- Fotos existentes exibidas com opção de remover
- Variações existentes editáveis inline

---

### 4.5 Duplicar Produto

**Acesso:** Manager + Owner

**Fluxo (extraído de ProdutoController@duplicar):**
1. Usuário clica "Duplicar" na listagem ou detalhe
2. Sistema pré-preenche form de criação com TODOS os dados do produto origem
3. SKU é limpo (obrigatório gerar novo)
4. Fotos NÃO são copiadas (reiniciar do zero)
5. Variações SÃO copiadas (com SKUs limpos)
6. Usuário salva como novo produto

---

### 4.6 Gerenciar Variações — inline no form do produto

**Acesso:** Manager + Owner

Quando `hasVariations=true`:
- Seção "Atributos e Variações" aparece no form
- Usuário seleciona quais atributos o produto usa (via ProductAttributeConfig)
- Para cada variação: seleciona valores dos atributos, define SKU, preços, imagem
- API endpoint `variacoes` (JSON) do legacy é replicado como procedure tRPC

---

### 4.7 Upload de Foto de Variação

**Acesso:** Manager + Owner

- Modal com input file + preview
- Processamento Sharp: thumb (200x200) + medium (600x600) + original (max 2000x2000)
- Salvo em MinIO: `tenants/{tenantId}/products/{productId}/variations/{variationId}-{size}.webp`

---

### 4.8 Listagem de Categorias — `/stock/categories`

**Acesso:** read para todos, CRUD Manager+Owner

- DataTable simples
- Colunas: cor (badge), nome, descrição, qtd produtos, status
- Ações: editar (inline ou dialog), toggle ativo, excluir (soft)
- Criar: dialog/drawer com nome, descrição, cor, ativo

---

### 4.9 Listagem de Atributos — `/stock/attributes`

**Acesso:** read para todos, CRUD Manager+Owner

- DataTable com expansão (expand row mostra valores)
- Colunas: nome, slug, qtd valores, status
- Ações: editar, toggle ativo, excluir (soft), gerenciar valores
- Gerenciar valores: sub-tabela inline com CRUD (valor, valor exibição, código, ordem, ativo)

---

### 4.10 Listagem de Fornecedores — `/stock/suppliers`

**Acesso:** read para todos, CRUD Manager+Owner

**Filtros:**
- Busca: nome/razão social, nome fantasia, CPF/CNPJ (com/sem formatação)
- Status: Ativo / Inativo / Todos

**Colunas:**
- Tipo (badge PF/PJ)
- Nome/Razão Social
- CPF/CNPJ (formatado)
- Telefone
- Cidade/UF
- Status

**Ações:**
- Ver detalhe
- Editar
- Excluir (soft delete, com validação: não pode se tiver EstoqueItem vinculado — Estoque-B)

---

### 4.11 Criar/Editar Fornecedor — `/stock/suppliers/new` e `/stock/suppliers/[id]/edit`

**Acesso:** Manager + Owner

**Seções (extraídas de `form.blade.php` de fornecedores):**

**Seção 1 — Dados do Fornecedor:**
- tipo_pessoa* (radio: PF / PJ)
- CPF ou CNPJ* (conforme tipo, com validação de dígitos)
  - PJ: botão "Consultar CNPJ" (BrasilAPI ReceitaWS — ver integração existente)
- Nome / Razão Social*
- Nome Fantasia (apenas PJ)
- Telefone
- Email

**Seção 2 — Endereço:**
- CEP (CepInput com auto-preenchimento via ViaCEP — padrão PATTERNS.md)
- Logradouro
- Número
- Complemento
- Bairro
- Cidade
- Estado (UF select)

**Seção 3 — Observações:**
- Textarea livre

**Seção 4 — Status:**
- Ativo (switch)

---

### 4.12 Detalhe do Fornecedor — `/stock/suppliers/[id]`

**Acesso:** todos (read)

- Card com dados cadastrais
- Endereço formatado
- Lista de produtos fornecidos (via StockItem — placeholder até Estoque-B)

---

### 4.13 Busca NCM (modal/dialog)

**Acionado de:** form de produto, campo NCM

**Comportamento (extraído de ProdutoController@buscarNcm + buscarNcmApi):**
1. Usuário digita termo (mínimo 3 caracteres)
2. Sistema busca primeiro no mapa curado local (45+ categorias hardcoded no controller)
3. Se não encontrar match suficiente, chama BrasilAPI: `GET /api/ncm/v1?search={termo}`
4. Exibe resultados: código NCM + descrição
5. Usuário seleciona → preenche campo NCM
6. Cache Redis: resultado de busca por 24h, NCM individual por 30 dias

---

## 5. Regras de negócio

| # | Regra | Fonte |
|---|-------|-------|
| RN-01 | SKU é único por tenant entre produtos não-excluídos (deletedAt IS NULL). Se não informado, é gerado automaticamente a partir do nome (método `gerarCodigoInterno`). | legacy: Produto model boot + unique validation |
| RN-02 | Nome é único por tenant entre produtos não-excluídos. | legacy: validation `unique:produtos,nome` |
| RN-03 | Código de barras, se informado, é único por tenant entre produtos não-excluídos. | legacy: sem unique explícito mas index existe — manter como unique constraint |
| RN-04 | Se `hasVariations=true`, os campos `costPrice`/`salePrice`/`promotionalPrice` do Product são ignorados — preço vem da Variation. | legacy: view condicional, seção "Preços" só visível se `!usa_variacoes` |
| RN-05 | Se `hasVariations=true`, cada variação DEVE ter pelo menos 1 valor de atributo associado. | legacy: validação no store de variações |
| RN-06 | Preço promocional deve ser < preço de venda (quando ambos informados). | legacy: validation `lt:preco_venda` |
| RN-07 | Upload de foto limitado a 3 por produto (constante MAX_FOTOS). | legacy: `ProdutoFoto::MAX_FOTOS = 3` |
| RN-08 | Apenas 1 foto pode ser marcada como principal por produto. Ao marcar uma como principal, a anterior perde o flag. | legacy: `marcarFotoPrincipal` — UPDATE all to false, then SET one to true |
| RN-09 | Ao setar foto principal, `Product.imageUrl` é denormalizado com a URL da foto. | legacy: `Produto.imagem_url` + `imagem_public_id` são atualizados |
| RN-10 | Produto duplicado copia todos os campos exceto: id, sku (limpo), fotos (não copia), timestamps. Variações são copiadas com SKUs limpos. | legacy: ProdutoController@duplicar |
| RN-11 | Soft delete de produto preserva variações e fotos (acessíveis via admin). Hard delete cascateia. | arquitetura: soft delete padrão |
| RN-12 | Categoria soft-deletada: produtos vinculados mantêm FK mas categoria não aparece em selects. | legacy: scope `ativas()` no select |
| RN-13 | Atributo com `active=false` não aparece para seleção em novos produtos, mas variações existentes que o usam continuam funcionando. | legacy: scope `ativos()` |
| RN-14 | Slug do atributo é auto-gerado do nome (slugify) no momento da criação. | legacy: Produto Atributo boot |
| RN-15 | `displayValue` de ProductAttributeValue auto-preenche com `value` se não informado. | legacy: ProdutoAtributoValor boot |
| RN-16 | Busca de NCM: primeiro tenta mapa curado local, depois BrasilAPI. Resultado em cache Redis (24h para buscas, 30 dias para código individual). | legacy: buscarNcm + buscarNcmApi, M3 |
| RN-17 | `availableQuantity` é computed via count de StockItem(status=AVAILABLE). Até Estoque-B, retorna 0 (stub). | M1 |
| RN-18 | Fornecedor não pode ser excluído se tiver EstoqueItem vinculado (validação será implementada em Estoque-B). Até lá, soft delete é permitido livremente. | legacy: FornecedorController@destroy valida |
| RN-19 | Campo `isSerialized` unifica `eh_aparelho` + `controla_imei` do legacy. No código real, ambos são sempre setados juntos. | análise do controller: `$produto->controla_imei = $request->eh_aparelho` |
| RN-20 | Upload de foto gera 3 versões automaticamente: thumb (200x200, WebP q80), medium (600x600, WebP q85), original (max 2000x2000, WebP q90). | M2 |
| RN-21 | Geração automática de SKU: remove caracteres especiais do nome, pega primeiras 3 letras + timestamp parcial para unicidade. | legacy: `gerarCodigoInterno()` |
| RN-22 | MultiCategoria: produto pode pertencer a N categorias, mas exatamente 1 deve ser marcada como `isPrimary`. A primeira selecionada é a principal por default. | legacy: pivot com campo `principal` |
| RN-23 | Fornecedor PJ: CNPJ obrigatório. Fornecedor PF: ao menos telefone OU CPF obrigatório. | legacy: validation `required_if` + custom |
| RN-24 | Variação herda automaticamente todas as categorias do produto pai. Não tem categorias próprias. | legacy: sem categoria em variação |
| RN-25 | Na listagem, `effectivePrice` exibe `promotionalPrice` quando existir (com indicação visual de desconto). | legacy: accessor `precoEfetivo` |

---

## 6. Permissões (RBAC)

| Ação | Operator | Manager | Owner |
|------|----------|---------|-------|
| Listar produtos | ✓ | ✓ | ✓ |
| Ver detalhe produto | ✓ | ✓ | ✓ |
| Buscar produtos (autocomplete) | ✓ | ✓ | ✓ |
| Criar produto | ✗ | ✓ | ✓ |
| Editar produto | ✗ | ✓ | ✓ |
| Duplicar produto | ✗ | ✓ | ✓ |
| Excluir produto (soft) | ✗ | ✓ | ✓ |
| Restaurar produto | ✗ | ✗ | ✓ |
| Upload/remover foto | ✗ | ✓ | ✓ |
| CRUD variações | ✗ | ✓ | ✓ |
| Listar categorias | ✓ | ✓ | ✓ |
| CRUD categorias | ✗ | ✓ | ✓ |
| Listar atributos | ✓ | ✓ | ✓ |
| CRUD atributos + valores | ✗ | ✓ | ✓ |
| Listar fornecedores | ✓ | ✓ | ✓ |
| Ver detalhe fornecedor | ✓ | ✓ | ✓ |
| CRUD fornecedores | ✗ | ✓ | ✓ |
| Busca NCM (BrasilAPI) | ✓ | ✓ | ✓ |

---

## 7. Validações

### 7.1 Product

| Campo | Regra | Fonte |
|-------|-------|-------|
| nome | required, min 2, max 200, unique por tenant | legacy store validation |
| sku | optional, max 50, unique por tenant se informado | legacy `codigo_interno` unique |
| barcode | optional, max 50 | legacy validation |
| brand | optional, max 100 | legacy validation |
| ncm | optional, regex `^\d{8}$` (8 dígitos numéricos) | formato NCM padrão |
| cest | optional, max 10 | legacy sem validação especial |
| costPrice | numeric, >= 0 | legacy `min:0` |
| salePrice | required se !hasVariations, numeric, >= 0.01 | legacy `required_if:usa_variacoes,false` |
| promotionalPrice | optional, numeric, >= 0, < salePrice | legacy `lt:preco_venda` |
| icmsDifferentialRate | optional, numeric, 0-100 | legacy `min:0, max:100` |
| minStock | integer, >= 0 | legacy `min:0` |
| imagens | array, max 3 itens, cada max 10MB, formatos jpg/png/webp | legacy validation |
| categoryIds | array, min 1, cada exists em ProductCategory | legacy `exists:produto_categorias,id` |

### 7.2 ProductVariation

| Campo | Regra | Fonte |
|-------|-------|-------|
| sku | optional, max 50 | legacy validation |
| costPrice | optional, numeric, >= 0 | legacy |
| salePrice | optional, numeric, >= 0 | legacy |
| promotionalPrice | optional, numeric, >= 0, < salePrice da variação | legacy |
| attributeValueIds | required, array min 1 | legacy (cada variação tem ao menos 1 atributo) |

### 7.3 Supplier

| Campo | Regra | Fonte |
|-------|-------|-------|
| type | required, enum PF/PJ | legacy `in:fisica,juridica` |
| name | required, min 2, max 200 | legacy validation |
| tradeName | optional (PJ), max 200 | legacy |
| cpf | required se type=PF, 11 dígitos, dígitos verificadores | ADR 0007 padrão |
| cnpj | required se type=PJ, 14 dígitos, dígitos verificadores | ADR 0007 padrão |
| phone | optional, max 20 (legacy: required se sem CPF/CNPJ) | legacy `required_without:cpf_cnpj` |
| email | optional, email válido, max 150 | legacy validation |
| zipCode | optional, 8 dígitos | padrão PATTERNS.md |
| state | optional, exatamente 2 chars (UF) | padrão ADR 0007 |

### 7.4 ProductCategory

| Campo | Regra | Fonte |
|-------|-------|-------|
| name | required, min 1, max 100, unique por tenant | legacy |
| badgeColor | required, regex `^#[0-9a-fA-F]{6}$` | legacy `cor_badge` |

### 7.5 ProductAttribute

| Campo | Regra | Fonte |
|-------|-------|-------|
| name | required, min 1, max 50, unique slug por tenant | legacy |

### 7.6 ProductAttributeValue

| Campo | Regra | Fonte |
|-------|-------|-------|
| value | required, min 1, max 100, unique dentro do atributo | legacy unique constraint |
| displayValue | optional, max 100 | legacy |
| code | optional, max 20 | legacy |

---

## 8. Integrações

### 8.1 BrasilAPI — NCM (M3)

**Propósito:** Busca de códigos NCM por termo textual.

**Endpoints:**
- Busca: `GET https://brasilapi.com.br/api/ncm/v1?search={termo}`
- Detalhe: `GET https://brasilapi.com.br/api/ncm/v1/{codigo}`

**Implementação:**
- Timeout: 5s
- Cache Redis:
  - Chave busca: `ncm:search:{termo_normalizado}` — TTL 24h
  - Chave detalhe: `ncm:code:{codigo}` — TTL 30 dias (NCM raramente muda)
- Degradação graciosa: se BrasilAPI offline, campo NCM permanece editável manualmente (input text livre)
- Antes de chamar API, consultar mapa curado local (45+ categorias do ProdutoController@buscarNcm)

**Resposta esperada da API:**
```json
[
  { "codigo": "85171200", "descricao": "Telefones celulares...", "data_inicio": "...", "data_fim": "...", "tipo_ato": "...", "numero_ato": "..." }
]
```

**Interface no Next.js:**
```typescript
interface NcmSearchResult {
  code: string       // 8 dígitos
  description: string
}

interface NcmService {
  search(term: string): Promise<NcmSearchResult[]>
  getByCode(code: string): Promise<NcmSearchResult | null>
}
```

---

### 8.2 MinIO + Sharp — Storage de Imagens (M2)

**Propósito:** Upload, processamento e armazenamento de fotos de produtos.

**Processamento (Sharp):**

| Versão | Dimensão | Formato | Qualidade | Uso |
|--------|----------|---------|-----------|-----|
| thumb | 200x200 (fit cover) | WebP | 80 | Listagens, cards |
| medium | 600x600 (fit inside) | WebP | 85 | Detalhe, galeria |
| original | max 2000x2000 (fit inside) | WebP | 90 | Zoom, full-screen |

**Paths MinIO:**
```
tenants/{tenantId}/products/{productId}/{photoId}-thumb.webp
tenants/{tenantId}/products/{productId}/{photoId}-medium.webp
tenants/{tenantId}/products/{productId}/{photoId}-original.webp
tenants/{tenantId}/products/{productId}/variations/{variationId}-thumb.webp
tenants/{tenantId}/products/{productId}/variations/{variationId}-medium.webp
tenants/{tenantId}/products/{productId}/variations/{variationId}-original.webp
```

**Upload flow:**
1. Client envia imagem via form multipart (API route Next.js, não tRPC)
2. Server valida: formato (jpg/png/webp), tamanho (max 10MB)
3. Sharp processa 3 versões
4. Upload para MinIO (3 PUTs)
5. Retorna URLs das 3 versões
6. Procedure tRPC persiste ProductPhoto com URLs

**Presigned URLs:**
- Não usar nesta fase (Nginx serve MinIO com cache)
- Dívida técnica: migrar para presigned URLs + CDN no futuro

---

### 8.3 ViaCEP — Endereço de Fornecedor

Padrão já documentado em ADR 0009 e PATTERNS.md. CepInput com debounce 500ms, auto-preenchimento de logradouro/bairro/cidade/estado. Sem repetir detalhes aqui.

---

### 8.4 Consulta CNPJ de Fornecedor

**Extraído de FornecedorController@consultarCnpj:**
- Endpoint: BrasilAPI `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`
- Preenche: razão social, nome fantasia, telefone, email, endereço completo
- Timeout: 5s
- Degradação graciosa: se API offline, formulário manual continua funcional
- Sem cache (consultas esporádicas)

---

## 9. Fluxos completos

### Fluxo 1: Cadastrar produto simples (sem variações)

1. Manager/Owner navega para `/stock/products` → clica "Novo produto"
2. Form de criação abre (`/stock/products/new`)
3. Preenche nome, seleciona categoria(s), informa marca
4. Campo NCM: digita parcial ou clica "Buscar" → modal abre
5. No modal: digita termo (ex: "celular") → sistema busca mapa curado + BrasilAPI
6. Seleciona NCM da lista → modal fecha, campo preenchido
7. Desmarca "Usa variações" (default false)
8. Preenche preço de venda (obrigatório), custo, promocional
9. Define estoque mínimo
10. Faz upload de 1-3 fotos → Sharp gera 3 versões em MinIO
11. Marca 1 foto como principal
12. Salva → `createProduct` tRPC procedure
13. Server valida, cria Product, ProductCategoryPivot(s), ProductPhoto(s)
14. Denormaliza imageUrl do produto com foto principal
15. Redireciona para listagem com toast "Produto criado com sucesso"
16. Produto aparece com badge "0 disponíveis" (stub Estoque-B)

### Fluxo 2: Cadastrar produto com variações (ex: iPhone)

1. Manager/Owner navega para criação
2. Preenche dados básicos: "iPhone 15 Pro", marca "Apple", NCM "85171200"
3. Marca "Usa variações" = true → seção de preços some, seção de variações aparece
4. Marca "É serializado" = true (aparelhos têm IMEI)
5. Seleciona atributos: "Cor" e "Armazenamento" (checkboxes de ProductAttribute)
6. Clica "Adicionar variação":
   - Seleciona Cor = "Preto Espacial", Armazenamento = "256GB"
   - Define SKU = "IP15P-BLK-256"
   - Define preço venda = R$ 6.499, custo = R$ 5.200
7. Repete para outras combinações (Preto/512GB, Branco/256GB, etc.)
8. Upload de foto por variação (opcional)
9. Salva → cria Product + ProductAttributeConfig + ProductVariation(s) + ProductVariationAttribute(s)
10. Redireciona com sucesso

### Fluxo 3: Editar produto

1. Manager/Owner clica "Editar" na listagem ou detalhe
2. Form abre pré-preenchido (`/stock/products/[id]/edit`)
3. Altera campos desejados (nome, preço, etc.)
4. Se alterar nome ou SKU: validação unique server-side
5. Se adicionar/remover fotos: processamento Sharp + MinIO
6. Salva → `updateProduct` tRPC procedure
7. Server valida, atualiza Product, sincroniza categorias/fotos
8. Redireciona para detalhe com toast "Produto atualizado"

### Fluxo 4: Duplicar produto

1. Manager/Owner clica "Duplicar" em produto existente
2. Sistema redireciona para `/stock/products/new?duplicate={id}`
3. Form abre pré-preenchido com dados do produto origem
4. SKU limpo (campo vazio, obrigatório informar novo ou deixar auto-gerar)
5. Fotos NÃO são copiadas (galeria vazia)
6. Variações são copiadas com SKUs limpos
7. Usuário ajusta o necessário e salva como novo produto

### Fluxo 5: Soft delete + restore

**Delete:**
1. Manager/Owner clica "Excluir" → ConfirmDialog
2. Confirma → `deleteProduct` tRPC (seta deletedAt)
3. Produto some da listagem padrão
4. Toast "Produto excluído" com botão "Desfazer" (3s)

**Restore:**
1. Owner acessa filtro "Incluir excluídos" (ou rota admin)
2. Vê produto com badge "Excluído"
3. Clica "Restaurar" → `restoreProduct` (limpa deletedAt)
4. Produto volta à listagem ativa

### Fluxo 6: CRUD Categoria

1. Acessa `/stock/categories`
2. Vê DataTable com categorias
3. Criar: clica "Nova categoria" → Dialog com nome, descrição, cor (color picker), ativo
4. Salva → aparece na lista
5. Editar: clica ícone editar → mesma Dialog pré-preenchida
6. Excluir: soft delete com confirmação. Produtos vinculados mantêm FK mas categoria some dos selects.

### Fluxo 7: CRUD Atributo + Valores

1. Acessa `/stock/attributes`
2. Vê DataTable com atributos (Cor, Armazenamento, etc.)
3. Criar atributo: Dialog com nome → slug auto-gerado
4. Expandir atributo: vê sub-tabela de valores
5. Criar valor: inline form (valor, valor exibição, código, ordem)
6. Editar/excluir valor: inline
7. Reordenar: drag & drop ou input de ordem numérica

### Fluxo 8: CRUD Fornecedor com endereço

1. Acessa `/stock/suppliers` → DataTable
2. Criar: clica "Novo fornecedor" → `/stock/suppliers/new`
3. Seleciona tipo PJ → campo CNPJ aparece + botão "Consultar CNPJ"
4. Digita CNPJ → clica consultar → BrasilAPI preenche razão social, fantasia, endereço
5. Preenche CEP → ViaCEP preenche logradouro, bairro, cidade, estado
6. Completa telefone, email, observações
7. Salva → `createSupplier` tRPC
8. Editar: `/stock/suppliers/[id]/edit` com form pré-preenchido
9. Excluir: soft delete (validação de FK só em Estoque-B)

### Fluxo 9: Operator tentando criar produto

1. Operator (role=operator) acessa `/stock/products`
2. Vê listagem normalmente (read permitido)
3. Botão "Novo produto" NÃO aparece na UI (role check client-side)
4. Se tentar acessar `/stock/products/new` diretamente: redirect para listagem ou mensagem "Sem permissão"
5. Se tentar chamar procedure `createProduct` via manipulação: server retorna FORBIDDEN

---

## 10. Casos de erro

| Cenário | Comportamento | Mensagem |
|---------|---------------|----------|
| Nome duplicado | Salvar falha, campo nome com erro inline | "Já existe um produto com este nome" |
| SKU duplicado | Salvar falha, campo SKU com erro inline | "Já existe um produto com este código interno" |
| Preço promocional >= preço venda | Validação client-side impede submit | "Preço promocional deve ser menor que preço de venda" |
| Upload > 10MB | Rejeitado antes do upload | "Imagem excede o limite de 10MB" |
| Upload formato inválido | Rejeitado | "Formato não suportado. Use JPG, PNG ou WebP" |
| Upload > 3 fotos | Botão de upload desabilitado | "Máximo de 3 fotos por produto" |
| BrasilAPI NCM offline | Modal mostra aviso, campo NCM editável manualmente | "Serviço de busca indisponível. Digite o NCM manualmente." |
| BrasilAPI CNPJ offline | Botão consultar mostra erro, form continua manual | "Não foi possível consultar o CNPJ. Preencha manualmente." |
| MinIO offline | Upload falha com retry | "Erro ao fazer upload da imagem. Tente novamente." |
| Excluir categoria com produtos | Soft delete OK, produtos mantêm FK | — (sem erro, categoria some dos selects) |
| Excluir fornecedor com EstoqueItem | Bloqueado (após Estoque-B) | "Fornecedor possui itens de estoque vinculados" |
| Criar variação sem atributos | Validação server | "Selecione ao menos 1 valor de atributo" |
| CNPJ/CPF inválido (dígitos verificadores) | Validação client-side + server | "CPF/CNPJ inválido" |
| Tentativa de criar por Operator | FORBIDDEN no server, UI não exibe botão | "Você não tem permissão para esta ação" |
| Variação com SKU duplicado | Salvar falha | "Já existe uma variação com este SKU" |

---

## 11. Testes E2E obrigatórios

| # | Cenário | Validação |
|---|---------|-----------|
| T-01 | CRUD produto simples (criar, listar, editar, ver detalhe) | Produto aparece na listagem com dados corretos |
| T-02 | CRUD produto com variações (criar com 2 variações, editar variação) | Variações listadas com atributos corretos |
| T-03 | Busca de NCM via BrasilAPI (mock) | Modal retorna resultados, seleção preenche campo |
| T-04 | Upload de foto com Sharp gerando 3 versões | 3 URLs retornadas (thumb, medium, original) |
| T-05 | Duplicar produto | Novo produto criado com mesmo nome (exige novo SKU) |
| T-06 | Soft delete + restore de produto | Produto some da listagem, restaura com botão |
| T-07 | RBAC: Operator não cria produto | Botão ausente na UI, procedure retorna FORBIDDEN |
| T-08 | RLS: produto tenant A não aparece em tenant B | Listagem vazia para tenant B |
| T-09 | Busca por nome, SKU, código de barras | Resultados filtrados corretamente |
| T-10 | CRUD categoria (criar, editar, soft delete) | Categoria funcional, produtos mantidos |
| T-11 | CRUD atributo + valores | Atributo com valores, slug auto-gerado |
| T-12 | CRUD fornecedor PJ com consulta CNPJ (mock) | Dados preenchidos automaticamente |
| T-13 | CRUD fornecedor PF com CPF válido | Validação aceita CPF correto, rejeita inválido |
| T-14 | Fornecedor com endereço via ViaCEP (mock) | CEP preenche campos de endereço |
| T-15 | Preço promocional >= preço venda rejeitado | Erro inline exibido |
| T-16 | Upload > 3 fotos bloqueado | Botão desabilitado ou erro |
| T-17 | Marcar foto como principal | Apenas 1 principal, imageUrl denormalizado |
| T-18 | MultiCategoria: produto com 2+ categorias | Pivot criado, principal marcado |
| T-19 | Validação unique de nome e SKU | Erro inline para duplicados |

---

## 12. Performance e limites

| Cenário | Requisito |
|---------|-----------|
| Listagem com 5.000 produtos | Paginação server-side, resposta < 500ms |
| Busca textual | Index GIN ou ILIKE com index parcial, < 200ms |
| Upload de foto | Feedback imediato (progress bar), processamento Sharp síncrono < 3s por foto |
| Busca NCM (cache hit) | < 50ms (Redis) |
| Busca NCM (cache miss) | < 5s (timeout BrasilAPI) |
| Consulta CNPJ | < 5s (timeout BrasilAPI) |
| Autocomplete de produtos | < 300ms, máximo 20 resultados (para EntitySelector no PDV/OS) |

---

## 13. Anti-escopo (NÃO replicar nesta SPEC)

| Item | Destino |
|------|---------|
| EstoqueItem (rastreio individual, IMEI, status) | Estoque-B |
| EstoqueMovimentacao (entradas, saídas, ajustes) | Estoque-B |
| Produto.quantidade_estoque (campo counter) | Removido (M1) — vira computed via StockItem |
| CompraAparelho (compra de usados com termos) | Estoque-C |
| NfeImportacao (parse XML de NF-e de entrada) | Estoque-D |
| Relatórios (ABC, posição, mínimo, vendas por período) | Módulo Relatórios |
| Dashboard de Estoque (cards resumo) | Módulo Dashboard |
| Migração Cloudinary → MinIO (imagens existentes) | Tarefa separada de migração de dados |
| Comandos Artisan (PopularNcm, PopularApple, Migrar, Limpar) | Não replicar (M6) |
| ImportarVendasCsvCommand | Pertence ao PDV (M7) |
| Catálogo público (catalogo.arenatechpi.com.br) | Decisão pendente (ver PROGRESS.md) |
| Simulador / Tabela de Preços (Avaliações) | Módulo separado já implementado |
| Campo `eh_aparelho` como nome | Renomeado para `isSerialized` (mais expressivo) |
| Campo `quantidade_estoque` persistido | Removido (M1 — computed) |

---

## 14. Dependências cruzadas

### Esta SPEC consome:
- **Tenant** (RLS) — já existe
- **User** (createdBy, RBAC via role) — já existe
- **ProductCategory** (definido nesta SPEC)
- **Redis** (cache NCM) — já configurado

### Outros módulos consumirão esta SPEC:
- **Estoque-B:** Product/ProductVariation como FK do StockItem. Supplier como FK do StockItem.
- **PDV (já implementado):** Product no carrinho de venda (via SaleItem.productId). Adapter: PDV hoje usa `currentStock` — precisará migrar para computed field.
- **OS (já implementado):** Product como peça em ServiceOrderItem.
- **Fiscal:** Product.ncm + Product.cest para emissão de NF-e.
- **Comunicação (Lia chatbot):** Lia consulta Product para responder sobre disponibilidade e preços.
- **Comissões:** Product.isPremium afeta cálculo de comissão.

### Impacto no schema atual:
O schema `stock.prisma` atual (simplificado) será **substituído** por esta SPEC. Campos `currentStock` serão removidos (M1). Relações de `StockMovement` e `DevicePurchase` serão mantidas e movidas para schemas de Estoque-B/C.

---

## 15. Stubs/contratos para módulos dependentes

```typescript
// Contrato que Estoque-B, PDV, OS e Fiscal consumirão
interface ProductService {
  getById(tenantId: string, productId: string): Promise<Product | null>
  search(tenantId: string, query: string, opts?: { limit?: number }): Promise<Product[]>
  getAvailableQuantity(tenantId: string, productId: string): Promise<number>  // stub retorna 0 até Estoque-B
  getVariationAvailableQuantity(tenantId: string, variationId: string): Promise<number>  // stub retorna 0
}

interface SupplierService {
  getById(tenantId: string, supplierId: string): Promise<Supplier | null>
  search(tenantId: string, query: string): Promise<Supplier[]>
}

interface NcmService {
  search(term: string): Promise<NcmSearchResult[]>         // mapa curado + BrasilAPI
  getByCode(code: string): Promise<NcmSearchResult | null>  // BrasilAPI com cache 30d
}

interface ProductImageService {
  upload(tenantId: string, productId: string, file: Buffer, mimeType: string): Promise<ProductPhotoUrls>
  uploadVariationImage(tenantId: string, productId: string, variationId: string, file: Buffer, mimeType: string): Promise<VariationImageUrls>
  delete(tenantId: string, photoId: string): Promise<void>
}

interface ProductPhotoUrls {
  id: string
  url: string        // original
  thumbUrl: string   // 200x200
  mediumUrl: string  // 600x600
}
```

---

## 16. Mapa NCM curado (extraído do legacy)

O ProdutoController@buscarNcm contém um mapa hardcoded de ~45 categorias comuns de assistência técnica para sugestão rápida. Este mapa será mantido como constante no Next.js para busca local antes de chamar BrasilAPI:

```typescript
// Categorias extraídas de ProdutoController@buscarNcm
const NCM_CURATED_MAP: Record<string, { code: string; description: string }[]> = {
  "celular": [{ code: "85171200", description: "Telefones celulares e smartphones" }],
  "tablet": [{ code: "84713019", description: "Tablets e dispositivos portáteis" }],
  "notebook": [{ code: "84713012", description: "Notebooks e laptops" }],
  "fone": [{ code: "85183000", description: "Fones de ouvido" }],
  "carregador": [{ code: "85044010", description: "Carregadores para dispositivos" }],
  "cabo": [{ code: "85444200", description: "Cabos e conectores" }],
  "pelicula": [{ code: "39199090", description: "Películas protetoras" }],
  "capa": [{ code: "42029200", description: "Capas e estojos protetores" }],
  "bateria": [{ code: "85076000", description: "Baterias de íon-lítio" }],
  "tela": [{ code: "90138900", description: "Telas e displays" }],
  // ... (completo será extraído do controller na implementação)
}
```

> Nota: O mapa completo tem ~45 entradas no legacy. Será transcrito integralmente na fase IMPLEMENT.
