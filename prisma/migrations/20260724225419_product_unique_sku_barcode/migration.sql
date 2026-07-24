-- Unicidade de SKU e código de barras por tenant (produtos ativos).
--
-- O código já valida no create/update/duplicate (assertSkuBarcodeAvailable); este
-- índice único parcial é a rede de segurança no banco (fecha corridas e caminhos
-- não cobertos, ex.: importação). Segue o padrão de stock_items_tenant_imei_unique:
-- parcial, só quando o campo NÃO é nulo/vazio e o produto NÃO está deletado.
--
-- Pré-limpeza (medida em prod): products.sku não tem duplicatas; products.barcode
-- tem 4 códigos repetidos em produtos DIFERENTES (erro de digitação/leitura). Não
-- são o mesmo produto (não mesclar) — mantemos 1 por código (o com mais vendas,
-- desempate pelo mais antigo) e limpamos o barcode dos demais (NULL). Nenhum
-- produto é apagado; o barcode é trivialmente re-lido depois.
--
-- Idempotente: os UPDATEs só casam duplicatas remanescentes; os índices usam
-- IF NOT EXISTS. Em banco limpo, tudo é no-op.

-- Passo 1: limpar barcode conflitante (mantém 1 por barcode/tenant, zera o resto).
WITH ranked AS (
  SELECT p.id,
    row_number() OVER (
      PARTITION BY p.tenant_id, p.barcode
      ORDER BY (SELECT count(*) FROM sale_items si WHERE si.product_id = p.id) DESC,
               p.created_at ASC, p.id ASC
    ) AS rn
  FROM products p
  WHERE p.barcode IS NOT NULL AND btrim(p.barcode) <> '' AND p.deleted_at IS NULL
),
losers AS (SELECT id FROM ranked WHERE rn > 1)
UPDATE products p SET barcode = NULL
FROM losers l WHERE p.id = l.id;

-- Passo 2: mesmo tratamento defensivo para sku (0 em prod, mas garante o índice).
WITH ranked AS (
  SELECT p.id,
    row_number() OVER (
      PARTITION BY p.tenant_id, p.sku
      ORDER BY (SELECT count(*) FROM sale_items si WHERE si.product_id = p.id) DESC,
               p.created_at ASC, p.id ASC
    ) AS rn
  FROM products p
  WHERE p.sku IS NOT NULL AND btrim(p.sku) <> '' AND p.deleted_at IS NULL
),
losers AS (SELECT id FROM ranked WHERE rn > 1)
UPDATE products p SET sku = NULL
FROM losers l WHERE p.id = l.id;

-- Passo 3: índices únicos parciais por tenant (produtos ativos, campo preenchido).
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_unique
  ON products (tenant_id, sku)
  WHERE sku IS NOT NULL AND btrim(sku) <> '' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_barcode_unique
  ON products (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '' AND deleted_at IS NULL;
