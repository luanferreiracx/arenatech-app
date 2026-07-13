# Desfecho da Auditoria Geral — para o dono (ao acordar)

Auditoria profunda de TODO o sistema, conduzida durante a noite. Resumo do que foi
feito, o que corrigi, e o que precisa da SUA decisão.

## ✅ CORRIGIDO e no ar (4 PRs de fix + 2 de docs, todas mergeadas)

| PR | O que | Por quê importa |
|----|-------|-----------------|
| **#543** | **SEGURANÇA: RLS em product_brands** + guard-rail | Eu tinha introduzido um vazamento cross-tenant no #536 (criei a tabela de marcas SEM RLS). Um tenant podia ver/editar marcas de outro. A auditoria pegou. Corrigido + teste que impede recorrência. |
| **#544** | Rota `/api/fiscal/download` que não existia | Você emitia NF-e mas o download de PDF/XML dava 404 (a rota era referenciada mas nunca criada). Agora baixa de verdade, escopado ao seu tenant. |
| **#540** | Fuso BRT em stats de venda/financeiro/fiscal | "Faturamento de hoje/mês" contava vendas de 21h-24h no dia errado (calculava em UTC). Corrigido. |
| **#542** | Botões "Baixar PDF/XML" na NF-e | Faltava a ação na tela (o backend já existia). |
| #541, #545 | Documentação completa da auditoria | findings/ + relatório-mestre. |

## ⚠️ PRECISA DA SUA DECISÃO (não mexi — é produto ou dinheiro)

1. **Módulo `reward` (fidelidade) inteiro SEM UI** — 15 procedures + um cron ativo,
   zero tela. **Completar a UI ou remover** o módulo? (Está gastando cron à toa.)
2. **`chatbot.*`** (11 procedures, 35 mil linhas em `chatbot_messages`) SEM UI — o
   chat vive no Chatwoot. Completar ou remover essa API paralela?
3. **Despesas operacionais** (`operation.*Expense*`) SEM UI — completar ou remover?
4. **Fornecedor (`financial.supplier`) é texto livre** — mesmo problema da marca que
   você achou. Vira lixo no DRE por fornecedor. Quer que eu aplique o mesmo playbook
   (entidade + dedup)? Mexe em relatório financeiro, por isso não fiz sem OK.
5. **G1 (dinheiro):** estorno parcial repetido pode sobre-sacar a gaveta em venda
   mista (lê o valor original a cada estorno). Cenário raro mas real. Fix documentado.
6. **I1:** a reconciliação de depósitos DePix por extrato está quebrada em prod (a
   Eulen mudou o contrato do `GET /deposits`). É rede de segurança (o fluxo normal
   usa webhook), mas vale consertar.
7. **Retenção de logs:** `webhook_events` (15k) e `chatbot_messages` (35k) crescem
   sem limpeza. Definir uma janela.

## Não auditado a fundo (próxima rodada)
Acessibilidade (teclado/ARIA/contraste). Os agentes de fan-out foram cortados por
limite de sessão no meio; re-disparar quando quiser cobrir isso.

## Nota honesta
A auditoria achou itens reais e valiosos — incluindo um bug de segurança que eu mesmo
tinha causado. Segurança de RLS/auth está madura (0 outro P0). O núcleo de dinheiro
(DePix/caixa) está bem-endurecido de auditorias anteriores. Tudo documentado em
`docs/AUDITORIA_GERAL_2026-07-13/`.
