-- I3 (auditoria estoque 2026-07-10): unique parcial de serial_number por tenant
-- em stock_items, espelhando o unique de imei (migration 20260525150000).
-- Sem isto, dois itens serializados podiam coexistir com o mesmo numero de serie
-- (o imei ja tinha unique; o serial nao) — e um dup real existia em prod
-- (resolvido por soft-delete do orfao antes desta migration).
--
-- Partial: ignora NULL e '' (multiplos itens sem serial coexistem) e deleted_at
-- IS NULL (permite recadastro apos soft-delete / arquivamento na recompra).
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_tenant_serial_unique
  ON stock_items (tenant_id, serial_number)
  WHERE serial_number IS NOT NULL AND serial_number <> '' AND deleted_at IS NULL;
