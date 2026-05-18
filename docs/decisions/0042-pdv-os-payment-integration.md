# ADR 0042 — Integração PDV ↔ OS (venda originada de OS)

## Status
Aceita.

## Contexto
No Laravel, o PDV permite pagar uma OS diretamente. `iniciarDaOS()` cria uma venda com itens da OS, `cancelarModoOs()` abandona o draft. A venda fica vinculada à OS e bloqueia edição de itens/cliente/preço.

## Decisão
Implementar no Next.js com:

1. **Schema**: `serviceOrderId` e `isOSPayment` na tabela `sales`
2. **`createFromOS` procedure**: Copia itens da OS para draft de venda, vincula via FK
3. **`cancelOSMode` procedure**: Abandona draft vinculado
4. **Guard em `updateItemPrice`**: Bloqueia override de preço quando `isOSPayment=true`

Adicionalmente implementados na mesma sessão:
- `updateItemPrice`: Override de preço unitário (para vendas normais)
- `sendReceipt`: Envio de recibo via WhatsApp
- `sendForSignature` / `checkSignatureStatus` / `confirmPhysicalSignature`: Assinatura Autentique
- Fix `searchProducts`: retorna `currentStock` real do Product model

## Consequências
- PDV pode pagar OS diretamente (fidelidade ao Laravel)
- Venda de OS é rastreável via `serviceOrderId`
- Preço protegido contra alteração indevida em pagamento de OS
- Stock real visível na busca do PDV (não mais hardcoded 0)
