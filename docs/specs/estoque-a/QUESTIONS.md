# QUESTIONS — Estoque-A (Catálogo de Produtos)

> ✓ Todas respondidas em 2026-05-16. Decisão: aceitar recomendações (exceto Q5 = max 3).

---

### Q1. Geração automática de SKU — manter ou simplificar?

**Contexto:** O legacy tem método `gerarCodigoInterno()` que cria SKU a partir das 3 primeiras letras do nome + timestamp parcial. Resultado: SKUs como "CEL1710234567" (pouco legíveis).

**Opções:**
- A) Replicar exatamente o algoritmo (fidelidade ao legacy)
- B) Gerar SKU mais legível (ex: "PROD-0001" sequencial por tenant)
- C) SKU sempre manual (sem auto-geração, campo obrigatório)

**Decisão do dono:** Opção A (replicar algoritmo legacy).

---

### Q2. Consulta CNPJ de fornecedor — qual API?

**Contexto:** O legacy usa uma API não identificada claramente (método `consultarCnpj` com `$response->razao_social`). Pode ser ReceitaWS, BrasilAPI/CNPJ, ou MinhaReceita.

**Opções:**
- A) BrasilAPI `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` (gratuita, sem auth, mesma que NCM)
- B) ReceitaWS `https://receitaws.com.br/v1/cnpj/{cnpj}` (gratuita com limite 3/minuto)

**Decisão do dono:** Opção A (BrasilAPI).

---

### Q3. Código de barras — unique constraint ou index simples?

**Contexto:** O legacy tem index em `codigo_barras` mas sem constraint `unique` explícita. Na prática, dois produtos diferentes poderiam ter o mesmo código de barras (ex: produto com variações compartilha EAN).

**Opções:**
- A) Unique constraint (impede duplicação, mais seguro)
- B) Index simples (permite duplicação, mais flexível para cenários edge)

**Decisão do dono:** Opção B (index simples, sem unique).

---

### Q4. Produto.name unique — absoluto ou com soft delete?

**Contexto:** SPEC define `@@unique([tenantId, name]) WHERE deletedAt IS NULL`. Isso permite recriar um produto com mesmo nome após soft delete. Mas pode causar confusão se usuário excluir e recriar acidentalmente.

**Pergunta:** Manter o unique parcial (permite reuso após delete) ou absoluto (nome nunca repete mesmo excluído)?

**Decisão do dono:** Parcial (manter SPEC atual).

---

### Q5. Categorias multi-select — limite de categorias por produto?

**Contexto:** O legacy não tem limite explícito de quantas categorias um produto pode ter. Na prática, produtos têm 1-3 categorias.

**Pergunta:** Definir limite máximo (ex: 5) ou ilimitado?

**Decisão do dono:** Máximo 3 categorias por produto. Quantidade razoável para o negócio.

---

### Q6. Campo `eh_premium` — afeta algo além de comissões?

**Contexto:** No legacy, `eh_premium` existe mas a documentação do ComissaoController referencia regras por "aparelho/não-aparelho" e "com custo/sem custo". Não encontrei uso direto de `eh_premium` no cálculo de comissões.

**Pergunta:** O campo é realmente usado em produção? Se sim, em que contexto exato? Se não, remover do schema?

**Decisão do dono:** Manter o campo.

---

### Q7. Upload de imagem de variação — mesmo limite de 3 ou diferente?

**Contexto:** No legacy, variações têm apenas 1 imagem (campo `imagem_url` único, não tabela de fotos). Produtos têm máximo 3 fotos (tabela `produto_fotos`).

**Pergunta:** Variações mantêm 1 imagem apenas (como legacy) ou ganham galeria (como produtos)?

**Decisão do dono:** 1 imagem por variação (fidelidade ao legacy).

---

### Q8. Rotas — `/stock/products` ou `/products`?

**Contexto:** O schema atual usa rotas em `/stock` (ex: `/stock` para listagem de produtos). Mas o legacy usa `/estoque/produtos` como prefixo.

**Opções:**
- A) `/stock/products`, `/stock/categories`, `/stock/attributes`, `/stock/suppliers`
- B) `/products`, `/categories`, `/attributes`, `/suppliers` (top-level)

**Decisão do dono:** Opção A (`/stock/products`, `/stock/categories`, etc.).

---

### Q9. Margem padrão — calculada ou editável?

**Contexto:** No legacy, `margem_lucro_padrao` é um campo persistido e o accessor `margemLucroCalculada` calcula `((preco_venda - preco_custo) / preco_custo) * 100`. Há dois conceitos misturados: margem definida pelo dono (padrão) e margem real (calculada).

**Pergunta:** O campo `defaultMargin` serve para:
- A) Definir uma margem desejada e sugerir preço de venda a partir do custo?
- B) Apenas exibição (sempre calculada a partir de custo/venda reais)?

**Decisão do dono:** Opção A (input editável que sugere preço de venda).
