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
| 6 | DePix Wallet / Vendas Avulsas | — | — | **não** | — |
| 7 | Fiscal / NF-e | — | — | **não** | — |
| 8 | Comissões | — | — | **não** | — |
| 9 | Clientes / Interesses | — | — | tem | — |
| 10 | Configurações / Equipe / Auth | — | — | tem | — |
| 11 | Comunicação / Talison | — | — | **não** | — |
| 12 | Fidelidade | — | — | **não** | — |
| 13 | Catálogo / Ferramentas | — | — | **não** | — (módulo `/checklist` removido no M4) |
| 14 | Painel / Relatórios | — | — | **não** | — |
| 15 | Admin / Superadmin / onboarding NO-KYC | — | — | **não** | — |

Legenda: ✅ fechado · ⏳ em andamento · — não começou.

**Fora de escopo** (decisão do dono em 2026-07-29), com o estado declarado para
ninguém supor que são suportados:

- **NF-e import** — parado, aguardando a decisão de qual API usar. Há achados levantados na auditoria de 25/07 que só valem revisitar depois dessa escolha.
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
