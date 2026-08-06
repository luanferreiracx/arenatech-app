# Programa de comercialização — consolidado das 6 auditorias

> 2026-08-05. Seis etapas concluídas: fullstack, backend, segurança, infra,
> IA/Talison, frontend (delta).
>
> **Método:** protocolo de 4 rodadas de cada skill, com a regra das três provas —
> código, dado de produção e uso real. Achado sem medição entrou como hipótese,
> não como achado.

## Placar

| Etapa | Skill | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| 1 | `audit-fullstack` | 1 | 3 | 5 | 3 |
| 2 | `audit-backend` | 0 | 2 | 4 | 0 |
| 3 | `audit-security` | 1 | 2 | 3 | 1 |
| 4 | `audit-infra-platform` | 0 | 2 | 1 | 1 |
| 5 | `audit-ai-systems` | 0 | 2 | 3 | 0 |
| 6 | `audit-frontend` (delta) | 0 | 0 | 1 | 1 |
| **Total** | | **2** | **11** | **17** | **6** |

---

## Priorização global

Ordenada por **risco de comercialização** = consequência × probabilidade ×
custo de reverter. Não por etapa.

### Bloco A — Fazer antes de vender (P0) — ✅ CONCLUÍDO EM PRODUÇÃO

| # | Achado | Etapa | Status |
|---|---|---|---|
| **A1** | Carteira LWK sem backup automatizado | 3 | ✅ **PR #820**. `arenatech-backup-wallet.{sh,service,timer}`, 02:40 BRT, retenção 30. Validado pelo systemd; **3 guardas testadas** (falham sem gravar); **drill de restauração** feito — 7 carteiras, `descriptor.txt` legível, `idempotency.json` com 47 entradas, e as 3 carteiras que estavam sem cópia presentes |
| **A2** | Webhook de saque da Eulen nunca casou | 1 | ✅ **PR #820**. Casa pelas duas grafias do id. Verificado contra os dados reais: **87 eventos casam** com a lógica nova. 4 testes novos, **vistos falhar antes do fix** |

### Bloco B — Fazer antes do primeiro cliente pagante (P1)

| # | Achado | Etapa | Nota |
|---|---|---|---|
| ~~**B1**~~ | ~~3 CVEs críticas em `next-auth`/`@auth/core` + bypass de proxy no Next~~ | 4 | ✅ **PR #821**. `next` 16.2.11, `next-auth` beta.32, `@auth/prisma-adapter` 2.11.3 (esta era necessária: sozinha a beta.32 deixava um `@auth/core@0.41.2` entrando pelo adapter), `js-yaml` 4.3.1. **3 críticas → 0**. Verificado em produção: login, `/api/auth/session` e o gate do tRPC intactos |
| ~~**B2**~~ | ~~HSTS ausente em `pdvdepix.app` e no wildcard~~ | 3 | ✅ **PR #821**. A investigação achou algo maior: o PR #76 (12/06) **já tinha** versionado a config com HSTS — a produção divergiu depois e nada detectava (2 dos 3 vhosts divergiam). Além do header: wildcard versionado, repo sincronizado, `check-nginx-drift.sh` (verificado que **detecta** drift), e o redirect de `http://www.pdvdepix.app`, que respondia 404 |
| ~~**B3**~~ | ~~App sem healthcheck e `/api/health` que não existe~~ | 3 | ✅ **PR #823**. Rota criada tocando o banco (a dependência sem a qual nada funciona); `HEALTHCHECK` no container. Validado com o postgres PARADO: devolve **503 degraded** de verdade. Em produção: `200 {status:ok,db:up}` e container `healthy` |
| **B4** | `/api/storage` serve o bucket inteiro sem auth | 1 | Latente (0 NFS-e hoje); certificado A1 está cifrado. Allowlist de prefixos |
| **B5** | Tabela de incidente com CPF/chave PIX fora do RLS | 1 | 1 linha, legível por `app_user` sem filtro de tenant |
| ~~**B6**~~ | ~~Guarda anti-alucinação de dinheiro não pega o caso que a motivou~~ | 5 | ✅ **PR #827**. Detecta valor + palavra de diferença/troca. Validado contra **115 mensagens reais**: a regra antiga pegava **0**, a nova pega **6** — todas conta de diferença legítima, zero falso positivo. O bot **estava** fazendo conta em produção |
| ~~**B7**~~ | ~~Falha de entrega do bot nunca é marcada~~ | 5 | ✅ **PR #827**. Lê `content_attributes.external_error`, onde o erro vive de verdade. Acrescenta métrica `delivery_failed` — antes só o reenvio era logado, e reenvio só existe para mensagem do bot |
| **B8** | 54 FKs sem `tenant_id` composto | 2 | Provado: escrita cross-tenant passa no banco. App não expõe, mas `forceClose` depende só do RLS |
| **B9** | Corrida fechar-caixa × finalizar-venda | 1 | 0 ocorrências em 1.796 movimentos; sobe de risco com múltiplos caixas |
| **B10** | L-BTC **abaixo** do piso | 2 | **Pendência sua, ATIVA** — 9.992 contra piso de 10.000 (confirmado 05/08 18:00). O alerta subiu de `warn` para `error`: *"repasses/saques podem travar"*. Era 10.113 na Etapa 2 |
| **B11** | Esplora de terceiro falhou 172× | 4 | **Em andamento por você** — Esplora própria |

### Bloco C — Backlog datado (P2/P3)

Registrados nos relatórios de cada etapa, sem urgência de comercialização:
`decimalToCents` em 15 cópias, status DePix divergente no `quick-sale`, 204
vendas antigas sem recebível (já estancado), código morto que discorda da fonte
única, 24.631 webhooks do Chatwoot mascarando sinal, IDOR em
`subscriptionChargeStatus` (0 dados hoje), PII sem DPA (0 opt-outs hoje), sem
rate limit no bot, navegação truncada sob WCAG 1.4.12, disco em 81% com 13 GB de
lixo.

---

## O padrão que atravessou as seis etapas

**A correção fecha a instância, não a classe.** Apareceu em todas:

| etapa | forma |
|---|---|
| 1 | HSTS em 3 vhosts, faltando no principal |
| 2 | `lockOpenCashSessionOrThrow` em `payInstallment`, ausente no `finalize` |
| 3 | Backup resolvido para o banco, não propagado para a carteira |
| 5 | ADR 0055 delimitou o texto do admin, não o do cliente nem o do banco |
| 5 | `sanitizeContactName` sanitizou o nome, não a mensagem |
| 5 | Guardas de preço mediram a presença da tool, não o valor |

É a mesma família do "duas implementações da mesma regra" que o programa de
finalização nomeou 7 vezes. **A recomendação estrutural desta consolidação é:
ao corrigir qualquer item acima, perguntar "onde mais essa regra deveria valer?"
antes de fechar.**

---

## O que está sólido (contraponto honesto)

Não é preenchimento — é o que 6 auditorias não conseguiram derrubar:

- **Integridade financeira:** 0 divergências em 2.222 parcelas e 1.766 pagamentos
- **Concorrência:** 0 deadlocks, 0 conflitos de RLS, 0,03% de rollback em 2,6
  milhões de transações
- **Isolamento:** RLS em 111/113 tabelas, todas com índice em `tenant_id`;
  testado com dois tenants reais
- **Auth:** red team não achou escalação a superadmin, fuga de tenant nem bypass
  de 2FA. Anti-replay de TOTP por compare-and-set no banco
- **Fronteiras em produção:** enumeração de usuário indistinguível (0,509s vs
  0,502s), rate limit bloqueia na 3ª tentativa, Redis/MinIO/LWK inacessíveis de
  fora
- **DR:** drill executado — backup restaura com 0 erros e integridade preservada
- **Banco:** query mais cara soma 5s acumulados; 1 query acima de 50ms
- **Bot:** nenhuma tool escreve em dinheiro, estoque ou venda — limita o dano de
  toda injeção
- **A11y:** 1 `h1`, 5 landmarks, 0 img sem alt em todas as rotas; zoom 200% limpo
- **CI/CD:** repo público, mas PR de fork não alcança o runner nem os secrets

## Achados que descartei

Registro porque o método importa mais que o placar:

1. **Índices ociosos** (etapa 2) — 451 índices com `idx_scan=0` incluindo primary
   keys: estatísticas zeradas pela restauração, não índices inúteis
2. **Corrida do `talison-waiting-sweep`** (etapa 2) — a mensagem de espera nunca
   foi enviada em produção; o caminho nunca disparou
3. **127 webhooks do Autentique** (etapa 1) — 237 OS assinadas contra 151
   documentos: a maioria assina por outro caminho
4. **`docs/operations/backup.md` inexistente** (etapa 3) — meu shell estava em
   `/tmp`; o doc existe e é bom
5. **`minioadmin` ativo em produção** (etapa 3) — as variáveis estão definidas
6. **Sentry desligado** (etapa 3) — DSN é versionado por decisão documentada
7. **"Sem política de retenção de imagens"** (etapa 4) — existe em `ci.yml:694`
8. **"Chatwoot não envia `message_updated`"** (etapa 5) — envia; 107 em 7 dias
9. **130 arquivos com `isLoading`** (etapa 6) — contagem de grep não é defeito

---

## Fora de escopo (decisão do dono)

- **Fiscal / NF-e** — declarado não suportado até a escolha da API. 0 notas
  emitidas, 2 P0 latentes documentados
- **iphone-hunter** — ferramenta interna
- **Partner API** — sem parceiro ativo, gateada por `apiAccessEnabled`

## Estado da implementação (2026-08-05)

**Entregue e em produção:** os 2 P0 (PR #820) e 5 P1 (PRs #821, #823, #827).

**Restam 6 P1** do Bloco B — dos quais 2 são pendências suas (L-BTC, Esplora).
Os 4 técnicos, em ordem sugerida:

1. **B4** — `/api/storage` sem allowlist de prefixo
2. **B5** — tabela de incidente com CPF fora do RLS
3. **B9** — corrida fechar-caixa × finalizar-venda (precisa do teste primeiro)
4. **B8** — 54 FKs sem `tenant_id` composto (priorizar as ~4 de dinheiro)

## Pendências suas (não dependem de código)

1. **Abastecer L-BTC da central** — **CRUZOU o piso em 05/08** (9.992 contra
   10.000). O alerta subiu de `warn` para `error`: *"repasses/saques podem
   travar"*. Era 10.113 quando a Etapa 2 mediu
2. **Backup off-site** — a cópia na própria VPS não protege contra perda do
   servidor (pendente desde 29/07)
3. **Esplora própria** — em andamento
4. **`MONITOR_ENABLED=false`** no LWK — deliberado ou resíduo?

## O que monitorar quando os clientes entrarem

Números que hoje têm folga e mudam de conversa com escala:

- **Conexões ativas vs. pool de 25** — toda procedure segura uma conexão por
  causa do RLS; `finalize` pode segurar por até 20s
- **Custo do bot** — US$ 12/mês hoje; ~US$ 250/mês com 20 lojas, e o cache de
  prompt não é medido
- **Disco** — 81%, com ~13 GB recuperáveis identificados
- **Renderização de relatórios** — 2.546 linhas no pior caso atual
