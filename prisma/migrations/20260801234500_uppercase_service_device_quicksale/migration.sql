-- Caixa alta em SERVIÇO, APARELHO COMPRADO e VENDA RÁPIDA.
--
-- Decisão do dono (2026-08-01), fechando o que a padronização do produto abriu:
-- só o catálogo de produtos e o item de venda estavam em caixa alta, e as listas
-- vizinhas continuavam em caixa mista ao lado deles.
--
-- Medido em produção antes deste backfill:
--   service_types.name .................. 17 de 17 em caixa mista
--   services.device_model .............. 114 de 115
--   services.name / service_type ....... 115 de 115
--   device_purchases.brand/model ....... 119 de 119
--   quick_sales.product_description ..... 19 de 21
--
-- `services.name` é DERIVADO ("<tipo> - <modelo>"): os dois pedaços sobem junto,
-- senão o nome sairia metade-metade. O slug do tipo de serviço NÃO muda — ele é
-- minúsculo por definição e é a chave de dedup ("Troca de Tela" = "TROCA DE
-- TELA"); mexer nele quebraria a unique (tenant_id, slug).
--
-- FORA daqui, de propósito: `service_order_items.description`. Aquilo é frase
-- livre digitada por OS ("Troca de tela do iPhone 13 Pro Max sem E-prom, cliente
-- trouxe a tela"), não nome de item — subir a caixa de um parágrafo atrapalha a
-- leitura em vez de ajudar.
--
-- Idempotente: rodar de novo não muda nada.

UPDATE service_types
   SET name = upper(regexp_replace(btrim(name), '\s+', ' ', 'g'))
 WHERE name IS DISTINCT FROM upper(regexp_replace(btrim(name), '\s+', ' ', 'g'));

UPDATE services
   SET service_type = upper(regexp_replace(btrim(service_type), '\s+', ' ', 'g'))
 WHERE service_type IS NOT NULL
   AND service_type IS DISTINCT FROM upper(regexp_replace(btrim(service_type), '\s+', ' ', 'g'));

UPDATE services
   SET device_model = upper(regexp_replace(btrim(device_model), '\s+', ' ', 'g'))
 WHERE device_model IS NOT NULL
   AND device_model IS DISTINCT FROM upper(regexp_replace(btrim(device_model), '\s+', ' ', 'g'));

UPDATE services
   SET name = upper(regexp_replace(btrim(name), '\s+', ' ', 'g'))
 WHERE name IS DISTINCT FROM upper(regexp_replace(btrim(name), '\s+', ' ', 'g'));

UPDATE device_purchases
   SET brand = upper(regexp_replace(btrim(brand), '\s+', ' ', 'g'))
 WHERE brand IS NOT NULL
   AND brand IS DISTINCT FROM upper(regexp_replace(btrim(brand), '\s+', ' ', 'g'));

UPDATE device_purchases
   SET model = upper(regexp_replace(btrim(model), '\s+', ' ', 'g'))
 WHERE model IS NOT NULL
   AND model IS DISTINCT FROM upper(regexp_replace(btrim(model), '\s+', ' ', 'g'));

UPDATE quick_sales
   SET product_description = upper(regexp_replace(btrim(product_description), '\s+', ' ', 'g'))
 WHERE product_description IS DISTINCT FROM upper(regexp_replace(btrim(product_description), '\s+', ' ', 'g'));
