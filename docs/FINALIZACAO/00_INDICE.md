# Finalização do sistema — placar

> Varredura módulo a módulo, em duas passadas (backend e frontend), até não
> sobrar nada aberto. Começou em 2026-07-29.
>
> **Por que este programa existe.** As auditorias anteriores fecharam dezenas de
> achados e terminaram com "backlog zerado" — e o dono seguiu encontrando bug
> **usando** o sistema. A razão está escrita na última delas
> ([AUDITORIA_GERAL_2026-07-25.md](../AUDITORIA_GERAL_2026-07-25.md), seção
> "Áreas de baixa confiança"): os achados de frontend saíram de **leitura de
> código**, não de sessão real no navegador. Bug de uso não aparece lendo código.

## Regra: todo achado precisa de três provas

1. **Prova de código** — leitura contra o [CHECKLIST_BACKEND](./CHECKLIST_BACKEND.md), igual para todo módulo.
2. **Prova de dados** — SELECT read-only em produção medindo a incidência real. Separa "bug latente" de "está sangrando agora".
3. **Prova de uso** — navegador real com dados reais, admin **e** operador, desktop **e** mobile ([CHECKLIST_FRONTEND](./CHECKLIST_FRONTEND.md)).

Achado só é dado por fechado com **teste que falha antes do fix**.

## Placar

| # | Módulo | Backend | Frontend | E2E | Doc |
|---|--------|---------|----------|-----|-----|
| 0 | Preparo (infra, cópia de produção, harness) | ✅ | — | — | este arquivo |
| 1 | Caixa | ✅ | ✅ | tem +1 | [01-caixa.md](./01-caixa.md) |
| 2 | PDV / Vendas | ✅ | ✅ | tem +1 | [02-pdv.md](./02-pdv.md) |
| 3 | Estoque / Compras / Fornecedores | ✅ | ✅ | tem +1 | [03-estoque.md](./03-estoque.md) |
| 4 | Ordens de Serviço / Serviços / Operação | ✅ | ✅ | tem +1 | [04-ordens-de-servico.md](./04-ordens-de-servico.md) |
| 5 | Financeiro | ✅ | ✅ | tem | [05-financeiro.md](./05-financeiro.md) |
| 6 | DePix Wallet / Vendas Avulsas | ✅ | ✅ | **novo** | [06-depix.md](./06-depix.md) |
| 7 | Fiscal / NF-e | ⏸ adiado | ⏸ | **não** | ver nota abaixo |
| 8 | Comissões | ✅ | ✅ | **novo** | [08-comissoes.md](./08-comissoes.md) |
| 9 | Clientes / Interesses | ✅ | ✅ | tem +4 | [09-clientes-interesses.md](./09-clientes-interesses.md) |
| 10 | Configurações / Equipe / Auth | ✅ | ✅ | tem +4 | [10-config-auth.md](./10-config-auth.md) |
| 11 | Comunicação / Talison | ✅ | ✅ | **não** | [11-comunicacao-talison.md](./11-comunicacao-talison.md) |
| 12 | Fidelidade | ✅ | ✅ | **novo** | [12-fidelidade.md](./12-fidelidade.md) |
| 13 | Catálogo / Ferramentas | ✅ | ✅ | **novo** | [13-catalogo-ferramentas.md](./13-catalogo-ferramentas.md) |
| 14 | Painel / Relatórios | ✅ | ✅ | **novo** | [14-painel-relatorios.md](./14-painel-relatorios.md) |
| 15 | Admin / Superadmin / onboarding NO-KYC | ✅ | ✅ | **não** | [15-admin-superadmin.md](./15-admin-superadmin.md) |

Legenda: ✅ fechado · ⏳ em andamento · ⏸ adiado · — não começou.

## Programa concluído — 2026-07-31

**14 módulos auditados nos dois lados. 1 adiado por decisão do dono** (Fiscal/NF-e,
à espera da definição de qual API usar; medido e registrado, 0 notas emitidas).

27 PRs, do #739 ao #765, todos com CI verde e mergeados.

### O que o programa mudou de fato

O ponto de partida era: *"apesar de você sempre dizer que está tudo ok,
continuamos encontrando bugs e gaps."* A resposta foi trocar leitura de código por
**três provas** — código, dado de produção e navegador real — e exigir que todo
achado tivesse um teste que **falha antes da correção**.

Alguns achados que só a medição encontrou:

- **Ajuda de custo zerando o mês por um dia de falta** (M8). Os dias do mês vinham
  de `getDate()`, que lê no fuso do processo: no container de produção, UTC,
  devolvia 1 em vez de 31. Com zero dias descobertos a conta errada dava o
  resultado certo — por isso ninguém via.
- **A conversão de lead nunca casou um telefone** (M9). Comparação exata contra uma
  coluna gravada em três formatos; **nenhum** dos 75 interesses tinha o formato dos
  clientes. 6 leads já haviam comprado e o funil marcava 0%.
- **Cadastrar o primeiro prestador dava 500** (M8). Sentinela `"__none__"` num
  filtro de coluna UUID: a porta de entrada do módulo quebrava exatamente para
  quem ainda não tinha entrado — invisível no arena-tech, certeiro nos outros 6
  tenants.
- **O custo do bot era invisível** (M11). 42.384 mensagens, `usage` devolvido pelo
  provedor e lido por ninguém.
- **O disparo em massa furava o opt-out de LGPD** (M9), aplicado só no envio
  um-a-um.

### O padrão que apareceu sete vezes

**Duas implementações do mesmo recurso, o endurecimento numa e os usuários na
outra.** Relatório de caixa (M1), recibo público (M2), guarda de mês fechado
(M8), gating REST (M10), opt-out de LGPD (M9), CTA gêmeo sem gate (M12),
rate-limit de leitura pública (M15).

Quando dá para corrigir extraindo a regra para **um** lugar em vez de copiá-la, é
o que foi feito — `module-gate.ts`, `phoneMatchKey`, `assertApuracaoAberta`,
`isAdminOnlySettingsPath`.

### Correções de primitivo pagaram juros

`PageHeader`, breadcrumb, `TabsList`, `QueryErrorState`, política de retry e
`min-w-0` foram corrigidos nos primeiros módulos. Do M9 em diante, o crawler
passou a voltar limpo com frequência — os módulos seguintes chegaram melhores
porque a base melhorou.

### Método: o que aprendi apanhando

Três achados foram **descartados** por não sobreviverem à verificação, e estão
documentados como tal em vez de escondidos:

1. **Build velho no `.next/dev`** produziu achado fantasma três vezes (M2, M11,
   M13) — sempre com a mesma assinatura: 404 devolvendo HTML numa rota tRPC.
   Regra: **achado de crawler é hipótese até reproduzir em build limpo.**
2. **Sonda mal escrita** virou "defeito" quatro vezes: checkbox do Radix sem
   texto, `main` que não existe, parâmetro de URL que a página não lê,
   `networkidle` resolvendo antes da mutation sair.
3. **Grep de assinatura** não substitui leitura do corpo: quase escrevi "7 writes
   de dinheiro sem gate de admin" (M8) sobre procedures que checam admin inline.

### Cobertura de teste

E2E por módulo passou de **9 de 15 para 14 de 15**. Novos: DePix Wallet,
Comissões, Interesses, Fidelidade, Catálogo público, Painel. Suíte unitária de
~1.900 para **2.040**; integração de ~280 para **304**.

### Verificação final

```bash
pnpm typecheck && pnpm lint && pnpm test:unit   # 2040 verdes
pnpm test:integration                            # 304 verdes
pnpm test:e2e --grep @smoke                      # 27 verdes
```


**Ordem alterada em 2026-07-29 (decisão do dono):** o Módulo 10
(Configurações/Equipe/Auth) foi **antecipado** para a frente de Comissões. Três
achados transversais foram caindo nele ao longo das passadas — o `ErrorBoundary`
que esconde crash de componente, rotas REST sem gate de módulo e o lockout de
login por IP — e todos afetam os módulos que ainda faltam. Corrigir na raiz já
pagou uma vez: as correções de primitivo dos Módulos 2–4 fizeram os Módulos 4, 5
e 6 chegarem quase limpos na varredura de frontend.

**Fora de escopo** (decisão do dono em 2026-07-29), com o estado declarado para
ninguém supor que são suportados:

- **Fiscal / NF-e (módulo 7) e NF-e import** — **adiados em 2026-07-29 por decisão do dono**: a escolha da API fiscal ainda está aberta, e auditar código que vai ser substituído é trabalho jogado fora. Medição que sustenta a decisão: **0 notas emitidas** (`invoices` vazia), **0 importações** (`nfe_imports` vazia) e apenas **1 tenant** com linha de configuração fiscal — o módulo nunca foi usado em produção. Isso também recalibra os dois P0 da auditoria de 2026-07-14 (payload de emissão sem o emitente; certificado digital nunca registrado na emissão): são **latentes, não ativos**, porque nenhuma nota foi emitida. Revisitar quando a API for escolhida.
- **iphone-hunter** — ferramenta interna, restrita ao tenant `arena-tech`.
- **Partner API** — sem parceiro ativo. A superfície está de pé e gateada por `apiAccessEnabled`.

## Como rodar a auditoria

```bash
# 1. Infra local
open -a OrbStack && docker compose up -d

# 2. Cópia local do banco de produção + usuários de auditoria
bash scripts/audit/restore-prod-copy.sh

# 3. App contra a cópia (ver o comando completo impresso pelo script acima)
DATABASE_URL=... pnpm dev

# 4. Varredura de um módulo no navegador (admin+operador, desktop+mobile)
DATABASE_URL=... pnpm tsx scripts/audit/crawl-module.ts caixa
```

O crawler grava `/tmp/audit/<modulo>/report.json` + screenshots e classifica cada
rota em `ok` / `warn` (4xx de negócio, erro de console — merece olho humano) /
`broken` (erro de JS, 5xx, tela vazia) / `redirect` (gating ou RBAC agiu).

⚠️ A cópia local tem **PII de clientes reais**. Fica em `/tmp/arena-audit`, nunca
no repo.

## Achados fora de módulo

### P0-INFRA-1 — Produção não tinha backup de banco (2026-07-29) — ✅ metade 1 resolvida

O [RUNBOOK](../RUNBOOK.md) documenta um `pg_dump` noturno em cron
(`0 3 * * *` → `/home/deployer/backups`). **Esse cron não existe.** Verificado na
VPS: `crontab -l` do root só tem a linha desligada do Talison, `crontab -u
deployer` está vazio, não há unit nem timer systemd de backup, `/etc/cron.d` e
`/etc/cron.daily` não têm nada de banco, e `/home/deployer/backups` tem apenas um
tar de carteira LWK de 15/06 e uma pasta de pré-migração de 21/05.

Ou seja: o Postgres de produção — caixa, financeiro, fiscal, saldos DePix — está
**sem nenhum ponto de restauração**. É a mesma classe do timer de
`purge-webhook-events`, que a auditoria de 27/07 achou listado como instalado e
inexistente na VPS: **doc de operação não se verifica sozinho.**

**Corrigido no mesmo dia**, com decisão do dono: `arenatech-backup-db.timer`
instalado e validado na VPS (02:30 BRT, retenção de 14, piso de tamanho +
`gzip -t` para não gravar dump truncado). Primeira execução manual: 12 MB, OK.
Ver [docs/operations/backup.md](../operations/backup.md).

**Pendente do dono (metade 2):** o cron de *pull* no PC com WSL2 — a cópia na
própria VPS protege contra perda de dados, não contra perda do servidor. O
script e o passo a passo estão no doc de backup; é copiar e colar naquela
máquina.
