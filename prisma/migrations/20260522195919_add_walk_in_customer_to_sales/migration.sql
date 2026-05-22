-- Paridade Laravel pdv_vendas.cliente_nome/cliente_telefone (cliente avulso).
ALTER TABLE "sales" ADD COLUMN "customer_name" VARCHAR(255);
ALTER TABLE "sales" ADD COLUMN "customer_phone" VARCHAR(30);
