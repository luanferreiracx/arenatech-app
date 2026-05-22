-- Paridade Laravel pdv_vendas.valor_devolvido_cliente — downgrade quando
-- upgrade (trade-in) excede valor da venda.
ALTER TABLE "sales" ADD COLUMN "refund_due_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "refund_due_method" VARCHAR(20);
