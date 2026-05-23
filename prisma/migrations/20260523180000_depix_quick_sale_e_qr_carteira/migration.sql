-- QuickSale: add DePix integration fields
ALTER TABLE "quick_sales"
  ADD COLUMN "depix_transaction_id" TEXT,
  ADD COLUMN "depix_status" TEXT,
  ADD COLUMN "depix_qr_code" TEXT,
  ADD COLUMN "depix_qr_code_base64" TEXT,
  ADD COLUMN "depix_expires_at" TIMESTAMP(3);

CREATE INDEX "quick_sales_depix_transaction_id_idx" ON "quick_sales"("depix_transaction_id");

-- DepixWithdraw: add QR code base64 for deposit address
ALTER TABLE "depix_withdrawals"
  ADD COLUMN "deposit_address_qr" TEXT;
