# Checklist — passada de backend

> Aplicado igual em todo módulo. Existe para o rigor não cair entre o primeiro e
> o décimo quinto. Cada eixo tem o que verificar e o que já mordeu este sistema
> antes — os exemplos são achados reais, não hipóteses de manual.

## 1. RBAC

- Toda procedure destrutiva ou que mexe em dinheiro está em `tenantAdminProcedure` (`src/server/api/trpc.ts`)?
- Custo, margem e dado de fornecedor ficam fora da resposta para não-admin?
- A rota REST equivalente tem o mesmo gate que o tRPC? (`/api/financial/export` já furou isso.)
- O que o operador **pode** fazer é decisão de produto — na dúvida, pergunte ao dono em vez de gatear por conta própria (ADR 0053).

## 2. Gating de módulo

- `tenantProcedure` resolve o módulo pelo namespace do path (`src/lib/modules.ts`)? Namespace novo entra na tabela?
- Rota de página tem prefixo em `ROUTE_MODULE_PREFIXES` ou está em `SLUG_RESTRICTED_ROUTES`?
- Rota REST fora do tRPC repete a checagem? O gate central não a cobre.

## 3. Validação de entrada

- Todo input tem schema Zod?
- Todo texto livre tem `.max()` vindo de `src/lib/validators/limits.ts`? (o guardião `validators-have-size-caps` falha o build, mas campo novo em arquivo novo pode escapar)
- Valor monetário, data e enum são validados no formato certo, não como string solta?

## 4. Tenant e RLS

- Tudo passa por `withTenant` (`src/server/db.ts`: transação + `SET LOCAL` + `SET ROLE app_user`)?
- Nenhum `$queryRaw` sem escopo de tenant?
- Tabela nova tem RLS **ENABLE + FORCE** e policy de `SELECT` acompanhando as de `UPDATE`/`DELETE`?
- Coluna usada em policy está indexada?

## 5. Concorrência

- Transição de estado usa CAS (condição repetida no `where` do update), não read-then-write?
- Toda escrita de dinheiro em caixa passa por `lockOpenCashSessionOrThrow`?
- Webhook e finalização são idempotentes (nonce, chave estável, `ON CONFLICT`)?
- Limite/teto é reavaliado **depois** do row lock, não antes?
- Corrida se reproduz de forma determinística com uma 2ª conexão segurando `FOR UPDATE` — não confie em timing.

## 6. Dinheiro

- Sinal e arredondamento corretos; `Decimal` onde precisa.
- Todo pagamento passa pelo ledger (`installment-ledger.service.ts`)? Lançamento que **nasce** PAID é o que mais escapa.
- Estorno lança contrapartida, não apaga o original.
- Relatório e card da mesma métrica leem da mesma fonte.

## 7. Estoque

- O saldo respeita os 3 regimes (`resolveCurrentStockByProduct`): serializado = `COUNT(StockItem)`, com variações = soma das variações, simples = `currentStock`.
- Movimento é append-only.
- Reserva liberada em **todas** as portas de cancelamento, não só na principal.

## 8. Tempo

- Janela e agrupamento em BRT via `src/lib/utils/date-range.ts` (`startOfDayBrt`, `endOfDayBrt`, `brtDayKey`).
- Nada de `new Date()` cru definindo borda de dia/mês: 21h BRT é o dia seguinte em UTC.

## 9. Soft delete

- `deletedAt: null` em toda leitura **e** em toda agregação. Relatório que soma sem o filtro infla o número.

## 10. Performance

- Lista tem `take`.
- Coluna filtrada/ordenada tem índice.
- `include` não vira N+1.
- `EXPLAIN (ANALYZE, BUFFERS)` quando houver dúvida real.

## 11. Erro e observabilidade

- Nenhum `catch` que engole. Retorno de função de efeito (envio de e-mail, webhook) é conferido — descartar resultado já matou o reset de senha por semanas.
- `logger.error` nos caminhos críticos, chegando ao Sentry.
- Erro de negócio vira `TRPCError` com mensagem em português, não 500.

## 12. Transação

- HTTP externo **fora** da transação (não segure conexão do pool na latência da Eulen/LWK).
- `SET LOCAL`, nunca `SET` de sessão.

## 13. Superfície morta

- Procedure que a UI nunca chama.
- Tela sem procedure por trás.
- Enum/coluna no `schema.prisma` sem migration correspondente no banco — foi o que manteve "Peça na OS" quebrado desde sempre.
- Feature meia-implementada: **completar ou remover**, com decisão registrada.

## Fechamento

- [ ] Invariantes do módulo escritas antes da varredura
- [ ] Cada invariante conferida contra produção, com o número no doc do módulo
- [ ] Cada achado com teste de integração que **falha antes** do fix
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit`
- [ ] `pnpm test:integration` (em série: `--no-file-parallelism`)
- [ ] Decisões do dono registradas, nenhuma pendência escondida
