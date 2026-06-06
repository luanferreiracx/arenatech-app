# Auditoria PDV/Estoque — DePix e integridade operacional

**Data:** 2026-06-06  
**Escopo:** PDV, DePix, vendas avulsas e relatórios de estoque.

## Resumo executivo

A falha principal do PDV DePix estava no handoff entre pagamento confirmado e venda finalizada: o QR era confirmado e fechado, mas a venda permanecia em `DRAFT` aguardando clique manual em `Confirmar Pagamento`. Isso fazia a operação parecer travada e levava o operador a refazer a venda marcando DePix como recebido manualmente.

A correção mantém `sale.finalize` como único ponto transacional de conclusão da venda, mas agora o frontend dispara esse finalize automaticamente assim que o DePix é confirmado via SSE/polling. Também foram adicionadas defesas no backend para impedir finalização DePix sem liquidação real na wallet.

## Correções aplicadas

### 1. PDV DePix auto-finaliza após confirmação

Arquivos:
- `src/app/(app)/pdv/_components/payment-dialog.tsx`
- `src/app/(app)/pdv/_components/depix-qr-dialog.tsx`
- `src/server/api/routers/sale.ts`
- `src/lib/validators/sale.ts`

Mudanças:
- `PaymentDialog` agora monta o leg DePix confirmado e chama `sale.finalize` automaticamente após `DepixQrDialog.onPaid`.
- A finalização usa a lista de pagamentos calculada no momento (`nextPayments`) para evitar stale state do React.
- Guard de idempotência impede dupla finalização caso SSE e polling confirmem em sequência.
- Durante a auto-finalização, o botão mostra `Finalizando venda...` e impede cancelamento.
- Se o finalize falhar após o DePix confirmado, o leg permanece na tela para retry manual sem refazer a venda.
- `DepixQrDialog` teve comentários atualizados para refletir SSE + polling de 30s.
- `finalizeSaleSchema` passou a aceitar `depixManual`, preservando o fluxo manual autorizado.

### 2. Backend valida DePix antes de finalizar

Arquivo:
- `src/server/api/routers/sale.ts`

Mudanças:
- `sale.finalize` valida pagamentos `method=depix` não manuais contra a wallet canonical (`checkTransactionStatus`).
- A transação precisa pertencer à própria venda (`sourceType=SALE`, `sourceId=sale.id`).
- Apenas `COMPLETED` e `COMPLETED_FEE_PENDING` permitem conclusão.
- `paymentDetails` agora persiste `walletTransactionId` além de `depixTransactionId`.

### 3. Venda avulsa DePix não pode virar paga sem liquidação

Arquivo:
- `src/server/api/routers/quick-sale.ts`

Mudanças:
- `markPaid` agora verifica a wallet quando há `walletTransactionId`.
- Se há ID PixPay legado sem wallet confirmada, a marcação manual é recusada.
- A transação precisa pertencer à quick sale e estar liquidada.

### 4. Estorno de item serializado ficou protegido contra corrupção silenciosa

Arquivo:
- `src/server/api/routers/sale.ts`

Mudanças:
- O refund de `StockItem` serializado agora atualiza apenas itens `SOLD`, vinculados à venda e não deletados.
- A contagem afetada precisa bater com a quantidade esperada.
- Divergência gera `CONFLICT` e rollback da transação.

### 5. Relatórios de estoque deixaram de retornar estoque fake zero

Arquivo:
- `src/server/api/routers/stock.ts`

Mudanças:
- Criado helper local para resolver estoque atual por produto:
  - serializado: `StockItem(status=AVAILABLE)`;
  - com variações: soma de `ProductVariation.currentStock`;
  - simples: `Product.currentStock`.
- Corrigidos `inventoryReport`, `lowStockAlerts`, `stats`, `reportPosicao` e `reportEstoqueMin`.
- Totais de quantidade, valor e alertas agora usam estoque real.

## Backlog recomendado

1. Consolidar a fonte da verdade de estoque em uma camada única de serviço/consulta.
2. Revisar todos os relatórios financeiros e de estoque com fixtures reais.
3. Criar suíte business para PDV com DePix, split payment, refund serializado e concorrência de estoque.
4. Avaliar arquitetura futura de finalização server-driven por webhook/worker com idempotency token.
5. Reduzir fallback de polling DePix ou expor status mais claro quando SSE falhar.

## Validação

- `pnpm prisma generate` executado com `DATABASE_URL` local temporária para atualizar tipos Prisma.
- `pnpm typecheck` completo foi executado, mas falhou em erros preexistentes e amplos fora do escopo desta alteração (integrações RLS, scripts e vários componentes com tipos `never`).
- Uma checagem focada com `tsc | rg` para arquivos alterados foi tentada após `prisma generate`, mas o harness bloqueou temporariamente novas chamadas Bash por indisponibilidade do classificador do modelo. Deve ser reexecutada antes do PR.
