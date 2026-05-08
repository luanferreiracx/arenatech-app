-- RLS policies for Fase 7 tables: service_orders, service_order_items, service_order_history, service_order_documents

-- ── Service Orders ──────────────────────────────────────────────────────────
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_orders
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── Service Order Items ─────────────────────────────────────────────────────
ALTER TABLE service_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_order_items
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── Service Order History ───────────────────────────────────────────────────
ALTER TABLE service_order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_order_history
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── Service Order Documents ─────────────────────────────────────────────────
ALTER TABLE service_order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_order_documents
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
