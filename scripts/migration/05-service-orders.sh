#!/bin/bash
# Fase 5: ordens_servico -> service_orders + items + history
# Usa SQL files para evitar bash escape de \r\n
set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
MYSQL="mysql arena_dev --batch --raw"

$PG > /dev/null <<EOF
DROP TABLE IF EXISTS _map_service_orders CASCADE;
CREATE TABLE _map_service_orders (old_id INT PRIMARY KEY, new_id UUID NOT NULL);
TRUNCATE TABLE service_orders CASCADE;
EOF

echo "=> Service orders..."

# Query MySQL em arquivo separado para preservar \r e \n literais
cat > /tmp/_os_query.sql <<'SQL'
SELECT id, numero_os, cliente_id,
       IFNULL(REPLACE(REPLACE(tipo_equipamento, '\r', ' '), '\n', ' '),'') AS dev_type,
       IFNULL(REPLACE(REPLACE(marca, '\r', ' '), '\n', ' '),'') AS marca,
       IFNULL(REPLACE(REPLACE(modelo, '\r', ' '), '\n', ' '),'') AS modelo,
       IFNULL(serie,'') AS serie, IFNULL(imei,'') AS imei,
       IFNULL(senha_equipamento,'') AS senha,
       IFNULL(REPLACE(REPLACE(acessorios, '\r', ' '), '\n', ' '),'') AS acessorios,
       eh_garantia, IFNULL(tipo_garantia,'') AS tg, IFNULL(os_original_id,0) AS orig,
       IFNULL(REPLACE(REPLACE(problema_relatado, '\r', ' '), '\n', ' '),'') AS rel,
       IFNULL(REPLACE(REPLACE(defeito_constatado, '\r', ' '), '\n', ' '),'') AS def,
       IFNULL(valor_servico,0) AS vs, IFNULL(valor_pecas,0) AS vp,
       IFNULL(custo_pecas,0) AS cp, IFNULL(custo,0) AS oc,
       IFNULL(desconto,0) AS desc_v, IFNULL(valor_total,0) AS vt,
       IFNULL(valor_pago,0) AS vpg, IFNULL(desconto_pagamento,0) AS dp,
       IFNULL(forma_pagamento,'') AS fp,
       IFNULL(prazo_garantia_meses,3) AS pgm,
       status, estornada,
       IFNULL(REPLACE(REPLACE(motivo_estorno, '\r', ' '), '\n', ' '),'') AS me,
       IFNULL(data_estorno,'') AS de,
       IFNULL(usuario_estorno_id,0) AS uei,
       IFNULL(REPLACE(REPLACE(observacoes_internas, '\r', ' '), '\n', ' '),'') AS oi,
       IFNULL(REPLACE(REPLACE(observacoes_cliente, '\r', ' '), '\n', ' '),'') AS oc2,
       IFNULL(documento_assinado_url,'') AS sig_url,
       IFNULL(link_publico, CONCAT('legacy-', id)) AS pub,
       IFNULL(autentique_document_id,'') AS aut,
       IFNULL(data_envio_assinatura,'') AS sig_sent,
       IFNULL(data_assinatura_entrada,'') AS sig_signed,
       assinatura_fisica,
       enviado_laboratorio, laboratorio_recebido,
       IFNULL(entregador_id,0) AS ent,
       IFNULL(tecnico_responsavel_usuario_id,0) AS tec,
       IFNULL(vendedor_intermediador_id,0) AS vend,
       IFNULL(usuario_criacao_id,5) AS criador,
       IFNULL(REPLACE(REPLACE(motivo_cancelamento, '\r', ' '), '\n', ' '),'') AS mc,
       IFNULL(data_entrada, NOW()) AS de2,
       IFNULL(data_previsao,'') AS dp2,
       IFNULL(data_conclusao,'') AS dc,
       IFNULL(data_entrega,'') AS denv,
       IFNULL(data_pagamento,'') AS dpg,
       nfse_emitida, IFNULL(nfse_numero,'') AS nfn,
       IFNULL(criado_em, NOW()) AS criado
FROM ordens_servico ORDER BY id;
SQL

$MYSQL < /tmp/_os_query.sql 2>/dev/null | tail -n +2 > /tmp/_os.tsv

count=$(wc -l < /tmp/_os.tsv)
echo "   -> $count OS lidas"

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
function ts(s) { return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; numero=$2; cliente=$3;
  dev_type=$4; marca=$5; modelo=$6;
  serie=$7; imei=$8; senha=$9; acessorios=$10;
  eh_garantia=$11; tg=$12; orig=$13;
  rel=$14; def=$15;
  vs=$16; vp=$17; cp=$18; oc=$19; desc_v=$20; vt=$21; vpg=$22; dp=$23;
  fp=$24; pgm=$25;
  status=$26; estornada=$27; me=$28; de=$29; uei=$30;
  oi=$31; oc2=$32; sig_url=$33; pub=$34; aut=$35; sig_sent=$36; sig_signed=$37; assinatura_fisica=$38;
  enviado_lab=$39; lab_rec=$40; ent=$41; tec=$42; vend=$43; criador=$44;
  mc=$45; de2=$46; dp2=$47; dc=$48; denv=$49; dpg=$50;
  nfse_emit=$51; nfn=$52; criado=$53;

  pg_status = "OPEN";
  if (status == "iniciada") pg_status = "OPEN";
  else if (status == "em_diagnostico") pg_status = "IN_DIAGNOSIS";
  else if (status == "aprovada") pg_status = "APPROVED";
  else if (status == "aguardando_aprovacao") pg_status = "WAITING_APPROVAL";
  else if (status == "aguardando_pecas") pg_status = "WAITING_PARTS";
  else if (status == "em_execucao") pg_status = "IN_PROGRESS";
  else if (status == "concluida") pg_status = "COMPLETED";
  else if (status == "paga") pg_status = "PAID";
  else if (status == "aguardando_retirada") pg_status = "READY_FOR_PICKUP";
  else if (status == "entregue") pg_status = "DELIVERED";
  else if (status == "em_garantia") pg_status = "IN_WARRANTY";
  else if (status == "cancelada") pg_status = "CANCELLED";
  else if (status == "estornada") pg_status = "REFUNDED";

  cust_sql = "(SELECT new_id FROM _map_customers WHERE old_id = " cliente ")";
  tec_sql = (tec != "0") ? "(SELECT new_id FROM _map_users WHERE old_id = " tec ")" : "NULL";
  vend_sql = (vend != "0") ? "(SELECT new_id FROM _map_users WHERE old_id = " vend ")" : "NULL";
  criador_sql = "COALESCE((SELECT new_id FROM _map_users WHERE old_id = " criador "), '\''64472a4d-3063-495e-94ea-294e419e1e2d'\'')";
  refunded_by_sql = (uei != "0") ? "(SELECT new_id FROM _map_users WHERE old_id = " uei ")" : "NULL";
  orig_sql = (orig != "0") ? "(SELECT new_id FROM _map_service_orders WHERE old_id = " orig ")" : "NULL";

  is_warranty = (eh_garantia == "1") ? "true" : "false";
  sent_to_lab = (enviado_lab == "1") ? "true" : "false";
  lab_rec_bool = (lab_rec == "1") ? "true" : "false";
  nfse_bool = (nfse_emit == "1") ? "true" : "false";
  physical_sig = (assinatura_fisica == "1") ? "true" : "false";

  if (de2 == "" || de2 == "0000-00-00 00:00:00") de2 = criado;

  print "WITH no AS (";
  print "  INSERT INTO service_orders (id, tenant_id, number, customer_id, technician_id, vendor_id, created_by_id, status,";
  print "    public_link, device_type, device_brand, device_model, serial_number, imei, device_password, accessories,";
  print "    reported_problem, diagnosed_problem, internal_notes, customer_notes,";
  print "    service_amount, parts_amount, parts_cost, other_cost, discount, total_amount, paid_amount, payment_discount,";
  print "    payment_method, payment_date,";
  print "    is_warranty, warranty_type, warranty_months, original_order_id,";
  print "    entry_date, estimated_date, completed_date, delivered_date,";
  print "    cancellation_reason, refund_reason, refunded_at, refunded_by_id,";
  print "    sent_to_lab, lab_received, physical_signature,";
  print "    signature_document_id, signature_url, signature_sent_at, signature_signed_at,";
  print "    nfse_issued, nfse_number, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', " q(numero) ", " cust_sql ", " tec_sql ", " vend_sql ", " criador_sql ", '\''" pg_status "'\''::\"ServiceOrderStatus\",";
  print "    " q(pub) ", " q(dev_type) ", " q(marca) ", " q(modelo) ", " q(serie) ", " q(imei) ", " q(senha) ", " q(acessorios) ",";
  print "    " q(rel) ", " q(def) ", " q(oi) ", " q(oc2) ",";
  print "    " vs ", " vp ", " cp ", " oc ", " desc_v ", " vt ", " vpg ", " dp ",";
  print "    " q(fp) ", " ts(dpg) ",";
  print "    " is_warranty ", " q(tg) ", " pgm ", " orig_sql ",";
  print "    '\''" de2 "'\'', " ts(dp2) ", " ts(dc) ", " ts(denv) ",";
  print "    " q(mc) ", " q(me) ", " ts(de) ", " refunded_by_sql ",";
  print "    " sent_to_lab ", " lab_rec_bool ", " physical_sig ",";
  print "    " q(aut) ", " q(sig_url) ", " ts(sig_sent) ", " ts(sig_signed) ",";
  print "    " nfse_bool ", " q(nfn) ", '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_service_orders (old_id, new_id) SELECT " id ", id FROM no;";
}
END { print "COMMIT;" }
' /tmp/_os.tsv > /tmp/_os.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_os.sql > /tmp/_os_err.log 2>&1 || { echo "FALHA service_orders"; tail -25 /tmp/_os_err.log; exit 1; }

# ----- OS items -----
echo "=> OS items..."
cat > /tmp/_os_items_q.sql <<'SQL'
SELECT id, ordem_servico_id, IFNULL(servico_id,0), IFNULL(produto_id,0),
       IFNULL(tipo_item,'servico'),
       IFNULL(REPLACE(REPLACE(descricao, '\r', ' '), '\n', ' '),''),
       quantidade,
       IFNULL(valor,0), IFNULL(subtotal,0), IFNULL(custo_unitario,0),
       IFNULL(criado_em, NOW())
FROM ordens_servico_itens ORDER BY id;
SQL
$MYSQL < /tmp/_os_items_q.sql 2>/dev/null | tail -n +2 > /tmp/_os_items.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; os_id=$2; serv=$3; prod=$4; tipo=$5; descricao=$6; qty=$7; valor=$8; subtotal=$9; cost=$10; criado=$11;
  # Laravel tem enum (servico|produto|misto). Next.js so tem SERVICE|PRODUCT.
  # Mapeamento: produto -> PRODUCT; servico/misto -> SERVICE (misto e tratado
  # como servico no recalculo Laravel `recalcularValoresOS`, soma em valor_servico).
  pg_type = (tipo == "produto" || tipo == "PRODUCT") ? "PRODUCT" : "SERVICE";
  if (descricao == "") descricao = "Item migrado do Laravel";
  serv_sql = (serv != "0") ? "(SELECT new_id FROM _map_services WHERE old_id = " serv ")" : "NULL";
  prod_sql = (prod != "0") ? "(SELECT new_id FROM _map_products WHERE old_id = " prod ")" : "NULL";
  print "INSERT INTO service_order_items (id, tenant_id, order_id, type, service_id, product_id, description, quantity, unit_price, cost_price, total, created_at) VALUES (gen_random_uuid(), '\''" TENANT "'\'', (SELECT new_id FROM _map_service_orders WHERE old_id = " os_id "), '\''" pg_type "'\''::\"ServiceOrderItemType\", " serv_sql ", " prod_sql ", " q(descricao) ", " qty ", " valor ", " cost ", " subtotal ", '\''" criado "'\'');";
}
END { print "COMMIT;" }
' /tmp/_os_items.tsv > /tmp/_os_items.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_os_items.sql > /tmp/_os_items_err.log 2>&1 || { echo "FALHA os items"; tail -15 /tmp/_os_items_err.log; exit 1; }

# ----- OS history -----
echo "=> OS history..."
cat > /tmp/_os_hist_q.sql <<'SQL'
SELECT id, ordem_servico_id, IFNULL(status_anterior,''), IFNULL(status_novo,''),
       IFNULL(REPLACE(REPLACE(observacao, '\r', ' '), '\n', ' '),''),
       IFNULL(usuario_id, 5),
       IFNULL(criado_em, NOW())
FROM ordens_servico_historico ORDER BY id;
SQL
$MYSQL < /tmp/_os_hist_q.sql 2>/dev/null | tail -n +2 > /tmp/_os_hist.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
function mapstatus(s) {
  if (s == "iniciada") return "OPEN";
  if (s == "em_diagnostico") return "IN_DIAGNOSIS";
  if (s == "aprovada") return "APPROVED";
  if (s == "aguardando_aprovacao") return "WAITING_APPROVAL";
  if (s == "aguardando_pecas") return "WAITING_PARTS";
  if (s == "em_execucao") return "IN_PROGRESS";
  if (s == "concluida") return "COMPLETED";
  if (s == "paga") return "PAID";
  if (s == "aguardando_retirada") return "READY_FOR_PICKUP";
  if (s == "entregue") return "DELIVERED";
  if (s == "em_garantia") return "IN_WARRANTY";
  if (s == "cancelada") return "CANCELLED";
  if (s == "estornada") return "REFUNDED";
  return "";
}
BEGIN { print "BEGIN;" }
{
  id=$1; os_id=$2; ant=$3; novo=$4; obs=$5; user=$6; criado=$7;
  prev_status = mapstatus(ant);
  new_status = mapstatus(novo);
  prev_sql = (prev_status == "") ? "NULL" : "'\''" prev_status "'\''::\"ServiceOrderStatus\"";
  new_sql = (new_status == "") ? "'\''OPEN'\''::\"ServiceOrderStatus\"" : "'\''" new_status "'\''::\"ServiceOrderStatus\"";
  user_sql = "COALESCE((SELECT new_id FROM _map_users WHERE old_id = " user "), '\''64472a4d-3063-495e-94ea-294e419e1e2d'\'')";
  print "INSERT INTO service_order_history (id, tenant_id, order_id, user_id, previous_status, new_status, notes, created_at) VALUES (gen_random_uuid(), '\''" TENANT "'\'', (SELECT new_id FROM _map_service_orders WHERE old_id = " os_id "), " user_sql ", " prev_sql ", " new_sql ", " q(obs) ", '\''" criado "'\'');";
}
END { print "COMMIT;" }
' /tmp/_os_hist.tsv > /tmp/_os_hist.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_os_hist.sql > /tmp/_os_hist_err.log 2>&1 || { echo "FALHA os history"; tail -15 /tmp/_os_hist_err.log; exit 1; }

echo "=> Resumo Fase 5:"
$PG -c "
  SELECT 'service_orders' tbl, COUNT(*) FROM service_orders
  UNION ALL SELECT 'service_order_items', COUNT(*) FROM service_order_items
  UNION ALL SELECT 'service_order_history', COUNT(*) FROM service_order_history
  ORDER BY tbl;
"
