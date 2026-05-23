-- Adiciona SEMI_NEW e DISPLAY ao enum DeviceCondition. Paridade Laravel
-- compras_aparelhos.condicao = {novo, seminovo, usado, vitrine}. Os valores
-- antigos REFURBISHED e DEFECTIVE permanecem por compatibilidade.

ALTER TYPE "DeviceCondition" ADD VALUE IF NOT EXISTS 'SEMI_NEW';
ALTER TYPE "DeviceCondition" ADD VALUE IF NOT EXISTS 'DISPLAY';
