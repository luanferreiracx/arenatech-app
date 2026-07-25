# Cron Jobs — Setup e Operação

## Jobs INSTALADOS na VPS (verificado 2026-07-25)

Todos como **systemd timer** (`/etc/systemd/system/arenatech-<job>.{service,timer}`),
`enabled` (sobrevivem a reboot). Confirmar com `systemctl list-timers | grep arenatech`.

| Unit (`arenatech-…`) | Endpoint (`/api/cron/…`) | OnCalendar | Propósito |
|---|---|---|---|
| `close-abandoned-cash-sessions` | idem | 03:00 | Fecha CashSessions abertas há +18h |
| `expire-rewards` | idem | 03:00 | Expira recompensas de fidelidade vencidas |
| `mark-overdue` | idem | 03:00 | Marca contas/parcelas vencidas |
| `expire-subscriptions` | idem | 04:00 | ACTIVE→PAST_DUE→SUSPENDED (pós-carência) |
| `generate-recurring-expenses` | idem | 05:00 | Gera as contas do mês dos templates recorrentes |
| `process-deposit-repayments` | idem | a cada 5min | Quitação de adiantamentos DePix |
| `process-pending-talison` | idem | a cada 10min | Fila do bot Talison |
| `reconcile-depix` | `reconcile-depix-transactions` | a cada 10min | Reconcilia tx DePix |
| `release-stale-reservations` | idem | a cada 10min | Libera StockItem RESERVED preso |
| `reconcile-eulen-extract` | idem | hora:07 | Reconcilia extrato Eulen |
| `resolve-stale-conversations` | idem | hora cheia | Encerra conversas paradas |

**Ordem 03:00 → 05:00 é intencional:** `mark-overdue` roda antes de
`generate-recurring-expenses` (a conta nova nasce PENDING, não é marcada vencida no
mesmo dia).

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
