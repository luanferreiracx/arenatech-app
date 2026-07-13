# Relatório-Mestre — Auditoria Geral 2026-07-13

> Consolidação dos findings/. Conduzida manualmente (os agentes de fan-out foram
> cortados por limite de sessão antes de salvar). Cobertura de sinal alto em 6
> domínios; algumas áreas ficaram marcadas "a auditar" por falta de tempo/sessão.
> Cada achado tem evidência (arquivo:linha) e confiança. Ver findings/ para detalhe.

## Top achados priorizados (severidade × impacto × probabilidade)

| # | Achado | Sev | Domínio | Ação |
|---|--------|-----|---------|------|
| 1 | **Bug de FUSO em stats de dinheiro/relatório** (dashboard/sale/financial/fiscal/stock usam `new Date(y,m,d)` = UTC, não BRT) | **P1** | E | **Corrigir** (baixo risco, só leitura de período) |
| 2 | **`financial.supplier` texto livre** (devia ser entidade, como a marca) — duplica fornecedor no DRE | **P1** | D | Corrigir (playbook da marca) — mexe em relatório: documentar |
| 3 | **Módulo `reward` inteiro sem UI** (15 procedures + cron ativo, 0 callers) | **P1** | F | Decidir: completar UI ou remover módulo+cron+schema |
| 4 | **Cluster `chatbot.*` sem UI** (11 procedures, 35k linhas em chatbot_messages) | **P2** | F | Decidir: completar ou remover (o chat vive no Chatwoot) |
| 5 | **`operation.*Expense*` sem UI** (6 procedures) — despesas operacionais pela metade | **P2** | F | Completar UI ou remover |
| 6 | **`admin.deleteTenant` sem botão** no admin (backend endurecido, sem UI) | **P2** | F | Adicionar botão OU remover procedure |
| 7 | **`fiscal.downloadPdf/downloadXml` sem UI** — não dá pra baixar NF-e | **P2** | F | Adicionar ação de download na tela fiscal |
| 8 | **`two-factor.regenerateBackupCodes` sem UI** — não regenera códigos 2FA | **P2** | F | Adicionar na tela de segurança |
| 9 | **Tabelas de evento sem retenção** (webhook_events 15k, chatbot_messages 35k crescem sem limpeza) | **P2** | B | Cron de retenção |
| 10 | **`condition` texto livre** (novo/seminovo/usado) devia ser enum | **P2** | D | Enum (trivial, alto valor) |
| 11 | **Frame-integrity drift**: text-[10/11px] 116×, #2ec4b6 hardcoded 10×, larguras fixas | **P3** | D | Trocar por tokens/escala |
| 12 | **`withAdmin` em routers tenant** — verificar filtro tenantId 1-a-1 | **P2** | C | Revisar (hardening) |

## Segurança: SEM P0/P1 NOVO
Postura madura (muitas auditorias anteriores). SQL injection limpo (bind params),
secrets não logados, RLS scoping correto. Só hardening pendente (C1/C2).

## Correções que EU vou implementar nesta sessão (seguras, não-dinheiro, alto valor)
1. **#1 Bug de fuso** — é leitura de período (não move saldo/escrita). Fix mecânico com
   helpers BRT + teste TZ-independente. É o maior valor e baixo risco. ⚠️ Mexe em
   números que o dono vê — vou implementar mas deixar claro no PR pra ele conferir.
2. **#10 `condition` enum** — se couber no tempo (trivial).
3. **#11 Frame-integrity** dos casos mais gritantes (text-[10/11px]→text-xs,
   #2ec4b6→bg-primary) — se couber.

## Correções que DEIXO DOCUMENTADAS para aprovação do dono (dono dormindo)
- **#2 supplier entidade** — mexe em DRE/relatório financeiro (dinheiro). Playbook pronto
  (igual marca: entidade + backfill dedup + select). Não mergeio sem OK.
- **#3/#4/#5 reward/chatbot/expense** — DECISÃO DE PRODUTO (completar vs remover). Não
  posso decidir sozinho. Documentado.
- **#6/#7/#8 botões faltando** — implementáveis, mas alguns tocam fiscal/2FA (sensível).
  Documentados; os simples (fiscal download, 2FA regen) posso fazer com CI verde.
- **#9 retenção** — precisa decidir a janela (produto). Documentado.

## Áreas NÃO auditadas a fundo (para próxima rodada / quando os agentes voltarem)
- Concorrência fina em sale.ts (4306 linhas) e financial.ts.
- RLS policy-by-policy (pg_policies em prod).
- pg_stat_user_indexes (índices não usados / seq scans).
- Acessibilidade (teclado/ARIA/contraste) a fundo.
- Integrações externas (Nuvem Fiscal, WhatsApp Cloud, Chatwoot) — domínio H não coberto.
- Estornos multi-efeito (E2) e reconciliação de billing (E3).

## Nota honesta
Esta auditoria cobriu BREADTH com sinal alto e achou itens reais e valiosos, mas NÃO
é a varredura exaustiva linha-a-linha de 142k linhas que os 8 agentes fariam — eles
foram cortados pelo limite de sessão. Quando o limite resetar (00:50 Fortaleza),
vale re-disparar os agentes para as áreas "não auditadas a fundo" acima.
