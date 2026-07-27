-- Uma nota ATIVA por origem (venda/OS).
--
-- Auditoria 2026-07-25: `createFromSale`/`createFromServiceOrder` criavam a
-- invoice sem checar nota preexistente, e o schema só tinha índice NÃO-único em
-- (tenant_id, reference_id). O CAS de `authorize` protege a MESMA invoice contra
-- duplo-clique, mas não impede DUAS invoices distintas da mesma venda — dois
-- cliques em "Emitir NF-e" geravam dois DRAFTs, ambos autorizáveis, e viravam
-- duas NF-e válidas na SEFAZ. Desfazer isso exige cancelamento na SEFAZ (janela
-- de 24h) e afeta a apuração.
--
-- O guard na procedure é read-then-write (janela de corrida). Este índice é a
-- rede no banco: fecha a janela mesmo sob concorrência real.
--
-- Parcial de propósito: CANCELLED/REJECTED ficam de fora, porque reemitir depois
-- de cancelar é o fluxo normal. reference_id NULL (nota avulsa) também.
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_active_per_reference_key"
  ON "invoices" ("tenant_id", "reference_type", "reference_id")
  WHERE "reference_id" IS NOT NULL
    AND "status" NOT IN ('CANCELLED', 'REJECTED');
