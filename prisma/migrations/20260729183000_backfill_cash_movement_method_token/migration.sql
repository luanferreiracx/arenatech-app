-- Módulo 1 (Caixa), CX-1 — normaliza o histórico de `payment_method`.
--
-- O PDV manda `PaymentMethod.code ?? PaymentMethod.id`, e a forma nasce sem
-- `code` no cadastro padrão. Por isso há movimentos com o UUID cru gravado na
-- coluna que o sistema usa para decidir "isto é dinheiro?" e como rótulo da
-- forma na tela de fechamento e no relatório impresso.
--
-- Medido em produção (2026-07-29): 50 movimentos, todos PIX ou transferência —
-- por sorte nenhum era dinheiro, senão a conferência de caixa já estaria errada.
-- O escritor (`writeCashMovement`) passou a canonizar na escrita; esta migration
-- acerta o que já estava gravado.
UPDATE cash_movements m
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
    ),
    -- O vínculo com a forma cadastrada é o que liga o movimento à taxa da
    -- adquirente nos relatórios; não pode se perder ao trocar o rótulo.
    payment_method_id = COALESCE(m.payment_method_id, pm.id)
FROM payment_methods pm
WHERE pm.id::text = m.payment_method
  AND pm.tenant_id = m.tenant_id;
