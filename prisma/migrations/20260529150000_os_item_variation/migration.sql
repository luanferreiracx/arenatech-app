-- Variacao do produto no item da OS. Quando informada, a reserva/baixa de
-- estoque ocorre na ProductVariation.currentStock (paridade com o PDV), evitando
-- contar no estoque base de produtos que tem variacoes.
ALTER TABLE "service_order_items" ADD COLUMN "variation_id" UUID;
