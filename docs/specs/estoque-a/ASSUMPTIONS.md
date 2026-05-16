# ASSUMPTIONS — Estoque-A (Catálogo de Produtos)

> Premissas adotadas na SPEC. Se alguma estiver incorreta, a SPEC precisa ser revisada.

---

### A1. `eh_aparelho` e `controla_imei` são sempre ligados juntos

**Base:** Análise do ProdutoController@store: `$produto->controla_imei = $request->eh_aparelho`. Nunca se seta um sem o outro.

**Decisão:** Unificar em campo único `isSerialized` (mais expressivo). Se o dono confirmar que há cenário onde `eh_aparelho=true` mas `controla_imei=false`, precisaremos reverter para 2 campos.

---

### A2. Multi-categoria é feature ativa e usada em produção

**Base:** Migration `2026_03_25_100000_create_produto_categorias_pivot` existe e o model `Produto` tem relação `categorias()` via pivot. A view `form.blade.php` usa multi-select de categorias.

**Decisão:** Implementar multi-categoria com pivot `ProductCategoryPivot` e flag `isPrimary`.

---

### A3. Fornecedor não tem campo `inscricao_estadual`

**Base:** Model `Fornecedor.php` lista fillable sem IE. Migration não tem campo IE.

**Decisão:** Não adicionar IE ao Supplier. Se necessário para NF-e de entrada (Estoque-D), será adicionado naquela SPEC.

---

### A4. MAX_FOTOS = 3 é limite de negócio (não técnico)

**Base:** Constante `ProdutoFoto::MAX_FOTOS = 3` e validação `max:3` no controller.

**Decisão:** Manter limite 3. Pode ser configurável futuramente via TenantSettings mas não nesta SPEC.

---

### A5. Produto com variações NÃO tem preço próprio relevante

**Base:** View `form.blade.php` esconde seção "Preços e Estoque" quando `usa_variacoes=true`. O preço do Product só serve como fallback se variação não definir preço.

**Decisão:** Campos `costPrice`/`salePrice` no Product persistem com default 0 quando `hasVariations=true`. O preço efetivo vem da variação. UI não exibe preço do produto nesse caso.

---

### A6. Slug de atributo é imutável após criação

**Base:** O boot do model gera slug apenas no `creating`. Não há re-geração no update.

**Decisão:** Slug gerado uma vez. Se o nome do atributo mudar, slug permanece inalterado (evita quebra de referências).

---

### A7. Supplier.address migra de JSON para campos separados

**Base:** Schema atual do Next.js usa `address: Json?` no Supplier. O legacy usa campos separados (cep, logradouro, numero, etc.). ADR 0007 decidiu campos separados para Customer.

**Decisão:** Migrar Supplier de `address: Json?` para campos separados (mesmo padrão de Customer). Consistência com ADR 0007.

---

### A8. ProductPhoto não tem soft delete

**Base:** No legacy, `produto_fotos` não tem campo `deleted_at` ou `ativo`. Fotos são hard-deleted quando removidas.

**Decisão:** ProductPhoto sem soft delete. Hard delete com remoção do arquivo no MinIO. Se o Product for soft-deleted, fotos persistem (podem ser acessadas se produto for restaurado).

---

### A9. Atributos e Valores são globais por tenant (não por produto)

**Base:** Tabela `produto_atributos` não tem FK para produto. É uma tabela independente. A relação com produto é via `produto_atributos_config` (quais atributos um produto usa).

**Decisão:** Atributos são definidos globalmente (por tenant) e associados a produtos individuais via pivot. Ex: "Cor" existe uma vez, mas cada produto pode ou não usar "Cor" como eixo de variação.

---

### A10. Não existe relação direta Product → Supplier no legacy

**Base:** O model `Produto` NÃO tem `fornecedor_id`. A relação fornecedor é via `EstoqueItem.fornecedor_id` (cada item individual vem de um fornecedor).

**Decisão:** Product NÃO tem FK para Supplier. A relação será estabelecida em Estoque-B (StockItem → Supplier). Na SPEC atual, Supplier é entidade independente sem FK direta para Product.
