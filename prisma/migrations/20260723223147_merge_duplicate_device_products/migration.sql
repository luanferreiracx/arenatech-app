-- Consolida produtos-aparelho (isDevice) DUPLICADOS pelo mesmo modelo.
--
-- Contexto: o fluxo de aparelho-de-entrada (trade-in) criava um Product novo a
-- cada troca em vez de reusar o do catálogo — o nome vinha poluído ("Apple Apple
-- iPhone 16") e o dedup por nome exato nunca casava. O código já foi corrigido
-- (resolveTradeInProductName + brandId); esta migração limpa o passivo: para
-- cada modelo com duplicatas, elege 1 CANÔNICO e reaponta o histórico dos
-- demais para ele, depois soft-deleta os duplicados.
--
-- Canônico = por (tenant, nome normalizado): o que TEM variações primeiro, e
-- entre esses o mais ANTIGO (o do catálogo original). Os duplicados são produtos
-- "planos" (sem variações/fotos/atributos — verificado em prod: 0 dessas refs),
-- então o merge só reaponta 4 FKs: sale_items, stock_movements, stock_items,
-- device_purchases. Nenhuma linha de venda/estoque é apagada — só muda o
-- product_id para o canônico.
--
-- Segurança:
--  * Escopo restrito a is_device=true e nome ~ iphone (só o passivo relatado).
--  * IMEI/serial de stock_items são únicos por TENANT (não por produto), então
--    reapontar product_id não colide.
--  * Idempotente: após rodar, não há mais duplicatas (rn>1 fica vazio) → no-op.
--  * Cada statement é AUTOCONTIDO (a view do mapa é reconstruída inline via CTE)
--    — não depende de tabela temporária entre statements, então roda tanto no
--    `migrate deploy` (statement-a-statement) quanto num banco limpo (no-op).
--
-- A CTE `merge_map` (canônico↔duplicado) é repetida em cada UPDATE. Verboso, mas
-- garante correção sob qualquer forma de execução.

-- 1) Reaponta sale_items dos duplicados para o canônico.
WITH ranked AS (
  SELECT p.id, p.tenant_id, lower(unaccent(btrim(p.name))) AS norm,
    row_number() OVER (PARTITION BY p.tenant_id, lower(unaccent(btrim(p.name)))
      ORDER BY p.has_variations DESC, p.created_at ASC, p.id ASC) AS rn
  FROM products p
  WHERE p.is_device = true AND lower(unaccent(p.name)) LIKE '%iphone%' AND p.deleted_at IS NULL
),
dups AS (SELECT norm, tenant_id FROM ranked GROUP BY norm, tenant_id HAVING count(*) > 1),
canon AS (SELECT r.tenant_id, r.norm, r.id AS canonical_id FROM ranked r
          JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id WHERE r.rn = 1),
merge_map AS (
  SELECT r.id AS duplicate_id, c.canonical_id FROM ranked r
  JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id
  JOIN canon c ON c.norm = r.norm AND c.tenant_id = r.tenant_id
  WHERE r.rn > 1
)
UPDATE sale_items si SET product_id = m.canonical_id
FROM merge_map m WHERE si.product_id = m.duplicate_id;

-- 2) Reaponta stock_movements.
WITH ranked AS (
  SELECT p.id, p.tenant_id, lower(unaccent(btrim(p.name))) AS norm,
    row_number() OVER (PARTITION BY p.tenant_id, lower(unaccent(btrim(p.name)))
      ORDER BY p.has_variations DESC, p.created_at ASC, p.id ASC) AS rn
  FROM products p
  WHERE p.is_device = true AND lower(unaccent(p.name)) LIKE '%iphone%' AND p.deleted_at IS NULL
),
dups AS (SELECT norm, tenant_id FROM ranked GROUP BY norm, tenant_id HAVING count(*) > 1),
canon AS (SELECT r.tenant_id, r.norm, r.id AS canonical_id FROM ranked r
          JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id WHERE r.rn = 1),
merge_map AS (
  SELECT r.id AS duplicate_id, c.canonical_id FROM ranked r
  JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id
  JOIN canon c ON c.norm = r.norm AND c.tenant_id = r.tenant_id
  WHERE r.rn > 1
)
UPDATE stock_movements sm SET product_id = m.canonical_id
FROM merge_map m WHERE sm.product_id = m.duplicate_id;

-- 3) Reaponta stock_items (IMEI/serial únicos por tenant → sem colisão).
WITH ranked AS (
  SELECT p.id, p.tenant_id, lower(unaccent(btrim(p.name))) AS norm,
    row_number() OVER (PARTITION BY p.tenant_id, lower(unaccent(btrim(p.name)))
      ORDER BY p.has_variations DESC, p.created_at ASC, p.id ASC) AS rn
  FROM products p
  WHERE p.is_device = true AND lower(unaccent(p.name)) LIKE '%iphone%' AND p.deleted_at IS NULL
),
dups AS (SELECT norm, tenant_id FROM ranked GROUP BY norm, tenant_id HAVING count(*) > 1),
canon AS (SELECT r.tenant_id, r.norm, r.id AS canonical_id FROM ranked r
          JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id WHERE r.rn = 1),
merge_map AS (
  SELECT r.id AS duplicate_id, c.canonical_id FROM ranked r
  JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id
  JOIN canon c ON c.norm = r.norm AND c.tenant_id = r.tenant_id
  WHERE r.rn > 1
)
UPDATE stock_items st SET product_id = m.canonical_id
FROM merge_map m WHERE st.product_id = m.duplicate_id;

-- 4) Reaponta device_purchases.
WITH ranked AS (
  SELECT p.id, p.tenant_id, lower(unaccent(btrim(p.name))) AS norm,
    row_number() OVER (PARTITION BY p.tenant_id, lower(unaccent(btrim(p.name)))
      ORDER BY p.has_variations DESC, p.created_at ASC, p.id ASC) AS rn
  FROM products p
  WHERE p.is_device = true AND lower(unaccent(p.name)) LIKE '%iphone%' AND p.deleted_at IS NULL
),
dups AS (SELECT norm, tenant_id FROM ranked GROUP BY norm, tenant_id HAVING count(*) > 1),
canon AS (SELECT r.tenant_id, r.norm, r.id AS canonical_id FROM ranked r
          JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id WHERE r.rn = 1),
merge_map AS (
  SELECT r.id AS duplicate_id, c.canonical_id FROM ranked r
  JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id
  JOIN canon c ON c.norm = r.norm AND c.tenant_id = r.tenant_id
  WHERE r.rn > 1
)
UPDATE device_purchases dp SET product_id = m.canonical_id
FROM merge_map m WHERE dp.product_id = m.duplicate_id;

-- 5) Soft-delete dos produtos duplicados (histórico já migrado).
WITH ranked AS (
  SELECT p.id, p.tenant_id, lower(unaccent(btrim(p.name))) AS norm,
    row_number() OVER (PARTITION BY p.tenant_id, lower(unaccent(btrim(p.name)))
      ORDER BY p.has_variations DESC, p.created_at ASC, p.id ASC) AS rn
  FROM products p
  WHERE p.is_device = true AND lower(unaccent(p.name)) LIKE '%iphone%' AND p.deleted_at IS NULL
),
dups AS (SELECT norm, tenant_id FROM ranked GROUP BY norm, tenant_id HAVING count(*) > 1),
duplicated AS (
  SELECT r.id FROM ranked r
  JOIN dups d ON d.norm = r.norm AND d.tenant_id = r.tenant_id
  WHERE r.rn > 1
)
UPDATE products p SET deleted_at = now(), active = false
FROM duplicated x WHERE p.id = x.id AND p.deleted_at IS NULL;

-- 6) Higieniza o modelo poluído nos aparelhos-de-entrada já gravados
-- ("Apple Apple ... iPhone 16" → "iPhone 16"). Mesmo padrão da migração de nome
-- de produto (20260721070852).
UPDATE sale_upgrades
SET model = regexp_replace(model, '^(Apple )(Apple )+', 'Apple ', 'i')
WHERE model ~* '^(Apple ){2,}';

UPDATE sale_upgrades
SET model = regexp_replace(model, '^Apple (\y(iPhone|iPad|MacBook|iMac|AirPods|Mac|Magic)\y)', '\1', 'i')
WHERE model ~* '^Apple \y(iPhone|iPad|MacBook|iMac|AirPods|Mac|Magic)\y';
