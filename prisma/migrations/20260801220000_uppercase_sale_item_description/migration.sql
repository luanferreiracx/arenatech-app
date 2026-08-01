-- Caixa alta também no NOME DO PRODUTO GRAVADO NA VENDA (`sale_items.description`).
--
-- A migração 20260801120000 subiu o catálogo (`products.name`) para caixa alta,
-- mas o item de venda guarda um SNAPSHOT do nome feito na hora da venda. Os
-- relatórios que agregam venda ("Vendas por produto", "Curva ABC"), o cupom e o
-- detalhe da venda leem esse snapshot — então continuavam mostrando
-- "Película Cerâmica Clear" em caixa mista. Medido em produção antes deste
-- backfill: 2.311 dos 2.677 itens.
--
-- Toda linha de `sale_items` é produto (`product_id` é NOT NULL) — não há
-- serviço nem texto livre aqui, então subir a caixa da coluna inteira não
-- atropela descrição de outra natureza. O valor, a quantidade e o vínculo com o
-- produto não mudam: isto é só a grafia do rótulo.
--
-- Idempotente: rodar de novo não muda nada.

UPDATE sale_items
   SET description = upper(regexp_replace(btrim(description), '\s+', ' ', 'g'))
 WHERE description IS DISTINCT FROM upper(regexp_replace(btrim(description), '\s+', ' ', 'g'));
