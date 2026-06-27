-- Origem STATIC_QR: pagamento no QR PIX estatico (chave fixa da intermediadora),
-- exclusivo do tenant central (arena-tech). Webhook deposit com qrId vazio.
ALTER TYPE "DepixTransactionSourceType" ADD VALUE 'STATIC_QR';
