-- Módulo 5 (Financeiro), FIN-3 — a tela de contas imprimia o id da forma.
--
-- Terceira superfície do mesmo defeito: quando a loja cadastra a própria forma de
-- pagamento, o que trafega é o ID dela. O recibo (Módulo 2) e a tabela do
-- histórico de vendas (Módulo 2, frontend) já foram corrigidos; a coluna
-- "Forma Pgto" das contas a receber mostrava o UUID inteiro
-- ("a6b9e67e-9c9f-4e90-8eca-4aa3fc10397a") no lugar de "PIX".
--
-- Medido em produção (2026-07-29): 53 transações, todas da forma "PIX" do
-- arena-tech, entre 23/06 e 28/07.
--
-- Normaliza para o token canônico, igual ao que `writeCashMovement` passou a
-- fazer na escrita dos movimentos de caixa. Idempotente: só toca onde o valor
-- casa uma forma existente do mesmo tenant.
UPDATE financial_transactions ft
SET payment_method = COALESCE(
      NULLIF(TRIM(pm.code), ''),
      CASE pm.type
        WHEN 'CASH'          THEN 'dinheiro'
        WHEN 'PIX'           THEN 'pix'
        WHEN 'CREDIT_CARD'   THEN 'cartao_credito'
        WHEN 'DEBIT_CARD'    THEN 'cartao_debito'
        WHEN 'BANK_TRANSFER' THEN 'transferencia'
        WHEN 'STORE_CREDIT'  THEN 'crediario'
        ELSE 'outros'
      END
    )
FROM payment_methods pm
WHERE pm.id::text = ft.payment_method
  AND pm.tenant_id = ft.tenant_id;
