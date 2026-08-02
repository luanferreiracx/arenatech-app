# Cron Jobs — Setup e Operação

## Jobs INSTALADOS na VPS (verificado 2026-07-28)

Todos como **systemd timer** (`/etc/systemd/system/arenatech-<job>.{service,timer}`),
`enabled` (sobrevivem a reboot). Confirmar com `systemctl list-timers | grep arenatech`.

| Unit (`arenatech-…`) | Endpoint (`/api/cron/…`) | OnCalendar | Propósito |
|---|---|---|---|
| `close-abandoned-cash-sessions` | idem | 03:00 | Fecha CashSessions abertas há +18h |
| `expire-rewards` | idem | 03:00 | Expira recompensas de fidelidade vencidas |
| `mark-overdue` | idem | 03:00 | Marca contas/parcelas vencidas |
| `expire-subscriptions` | idem | 04:00 | ACTIVE→PAST_DUE→SUSPENDED (pós-carência) |
| `purge-webhook-events` | idem | 04:30 | Apaga eventos de webhook com +90 dias (retenção) — `-m 300` no curl |
| `generate-recurring-expenses` | idem | 05:00 | Gera as contas do mês dos templates recorrentes |
| `process-deposit-repayments` | idem | a cada 5min | Quitação de adiantamentos DePix |
| `process-pending-talison` | idem | a cada 10min | Fila do bot Talison |
| `reconcile-depix` | `reconcile-depix-transactions` | a cada 10min | Reconcilia tx DePix |
| `release-stale-reservations` | idem | a cada 10min | Libera StockItem RESERVED preso |
| `reconcile-eulen-extract` | idem | hora:07 | Reconcilia extrato Eulen |
| `resolve-stale-conversations` | idem | hora cheia | Encerra conversas paradas |
| `backup-db` | — (roda `pg_dump`, não HTTP) | 02:30 | Backup do banco + retenção de 14 — ver [backup.md](./backup.md) |

**Ordem 03:00 → 05:00 é intencional:** `mark-overdue` roda antes de
`generate-recurring-expenses` (a conta nova nasce PENDING, não é marcada vencida no
mesmo dia).

### Timer que não é `arenatech-*`: `depix-cache-autorepair`

Roda a cada 20min e **não** chama endpoint HTTP — executa
`/opt/depix-cache-autorepair.sh` direto na VPS. Fonte de verdade versionada:
[`ops/depix-cache-autorepair.sh`](../../ops/depix-cache-autorepair.sh); a cópia
na VPS precisa ser atualizada à mão (o LWK não está no pipeline de deploy — ver a
memória `lwk-prod-rebuild`).

| Item | Valor |
|---|---|
| Log | `/var/log/depix-cache-autorepair.log` |
| Alertas | `logger -t depix-cache-autorepair -p daemon.err` (journal/syslog) |
| Cursor de rotação | `/var/lib/depix-cache-autorepair/cursor` |
| Carteiras por rodada | `MAX_WALLETS_PER_RUN` (default 3) |

**Ao atualizar a cópia da VPS (2026-08-02):** o script deixou de tratar só a
carteira central e passou a varrer todas as carteiras do volume do LWK, em anel.
Crie o diretório do cursor antes de rodar — sem ele a rotação começa do zero toda
vez e as últimas carteiras nunca são reparadas:

```bash
mkdir -p /var/lib/depix-cache-autorepair
```

O teto por rodada existe porque cada carteira custa **duas** passadas de
`full_scan` contra Esplora pública, e Esplora sobrecarregada é justamente o que
corrompe o cache que o script conserta.

> **Esta tabela não se verifica sozinha.** Em 2026-07-28 o
> `purge-webhook-events` estava listado aqui como instalado e **não existia na
> VPS** — a rota foi criada no #721, o unit nunca. Foram 3 dias com a retenção
> em papel e a tabela crescendo. Antes de confiar na linha, rode:
>
> ```bash
> systemctl list-timers --all | grep arenatech   # devem ser 13
> ```
>
> `purge-webhook-events` usa `-m 300` em vez dos 60s dos demais: a purga apaga
> em lotes de 5000 e a primeira execução limpa o acumulado histórico.

---

## Autenticação

Todos os endpoints usam `Authorization: Bearer <CRON_SECRET>`.

- Em prod o secret vem de **`/home/deployer/arenatech-app/.env.production`**
  (carregado via `EnvironmentFile` no unit) — **não** de `/opt/arenatech/.env.cron`
  (esse caminho nunca existiu; o doc antigo estava errado).
- Dev: `.env.local`. Gerar: `openssl rand -hex 32`. Sem header: **401**.

---

## Padrão do unit (copiar ao adicionar um cron novo)

```ini
# /etc/systemd/system/arenatech-<job>.service
[Unit]
Description=<o que o job faz>
After=network.target

[Service]
Type=oneshot
EnvironmentFile=/home/deployer/arenatech-app/.env.production
ExecStart=/bin/bash -c 'curl -fsS -m 60 -X POST http://127.0.0.1:3001/api/cron/<job> -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json"'
```

```ini
# /etc/systemd/system/arenatech-<job>.timer
[Unit]
Description=Dispara <job> diariamente as HH:MM BRT

[Timer]
OnCalendar=05:00
AccuracySec=1m
# Persistent: se o VPS ficou fora no horario, roda assim que voltar (exige job
# IDEMPOTENTE — todos os nossos são).
Persistent=true

[Install]
WantedBy=timers.target
```

`/bin/bash -c` é necessário para o `$CRON_SECRET` ser expandido (o `ExecStart` do
systemd não expande `${VAR}` de EnvironmentFile dentro de argumentos aspeados).

### Instalar e VALIDAR (não confie no enable — teste de verdade)

```bash
systemctl daemon-reload
systemctl enable --now arenatech-<job>.timer

# 1) roda o service na mão e confirma o corpo da resposta
systemctl start arenatech-<job>.service
journalctl -u arenatech-<job>.service -n 12 --no-pager

# 2) confirma que ficou agendado + enabled
systemctl list-timers --all | grep <job>
systemctl is-enabled arenatech-<job>.timer
```

Sinal de sucesso no journal: a linha do `bash[...]` com o JSON de resposta (ex.:
`{"generated":0}`) e `Deactivated successfully` — sem `curl (22)` nem `401`.

---

## Opção 2: GitHub Actions schedule

```yaml
# .github/workflows/cron-cash-close.yml
name: Auto-close abandoned cash sessions

on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:  # Manual trigger

jobs:
  close-sessions:
    runs-on: ubuntu-latest
    steps:
      - name: Call cron endpoint
        run: |
          response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://app.arenatechpi.com.br/api/cron/close-abandoned-cash-sessions)

          http_code=$(echo "$response" | tail -1)
          body=$(echo "$response" | head -n -1)

          echo "Status: $http_code"
          echo "Response: $body"

          if [ "$http_code" != "200" ]; then
            echo "::error::Cron failed with status $http_code"
            exit 1
          fi
```

---

## Teste local

```bash
# Com o server rodando (pnpm dev)
curl -s -X POST \
  -H "Authorization: Bearer dev_cron_secret_not_for_production" \
  http://localhost:3000/api/cron/close-abandoned-cash-sessions | jq .
```

Resposta esperada:
```json
{
  "closedCount": 0,
  "sessions": []
}
```

---

## Monitoramento

- Logs com prefixo `[cron]` no stdout do container
- Em caso de falha: status 500 com mensagem de erro no body
- Idempotência: chamar 2x na mesma hora não duplica fechamentos (query filtra `closedAt: null`)
- Se nenhuma sessão precisar fechar: retorna `closedCount: 0` (success, não erro)
