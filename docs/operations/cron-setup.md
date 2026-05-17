# Cron Jobs — Setup e Operação

## Jobs do sistema

| Job | Endpoint | Frequência | Propósito | Idempotente | ADR |
|-----|----------|-----------|-----------|-------------|-----|
| Auto-fechar caixas abandonados | POST /api/cron/close-abandoned-cash-sessions | A cada 1h | Fecha CashSessions abertas há mais de 18h | ✓ | ADR 0029 |

---

## Autenticação

Todos os endpoints de cron usam header `Authorization: Bearer <CRON_SECRET>`.

- `CRON_SECRET` é definido em `.env.local` (dev) e variáveis de ambiente do container (prod)
- Gerar secret: `openssl rand -hex 32`
- Sem o header correto: resposta 401

---

## Opção 1: systemd timer (recomendada para VPS)

### Service

```ini
# /etc/systemd/system/arenatech-cron-cash-close.service
[Unit]
Description=Arena Tech - Auto-close abandoned cash sessions
After=network.target

[Service]
Type=oneshot
EnvironmentFile=/opt/arenatech/.env.cron
ExecStart=/usr/bin/curl -s -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  http://127.0.0.1:3001/api/cron/close-abandoned-cash-sessions
TimeoutSec=30
```

### Timer

```ini
# /etc/systemd/system/arenatech-cron-cash-close.timer
[Unit]
Description=Run Arena Tech cash close every hour

[Timer]
OnCalendar=*:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

### Env file

```bash
# /opt/arenatech/.env.cron
CRON_SECRET=<valor gerado com openssl rand -hex 32>
```

### Comandos

```bash
# Instalar e ativar
sudo systemctl daemon-reload
sudo systemctl enable arenatech-cron-cash-close.timer
sudo systemctl start arenatech-cron-cash-close.timer

# Verificar status
systemctl status arenatech-cron-cash-close.timer
systemctl list-timers | grep arenatech

# Executar manualmente (teste)
sudo systemctl start arenatech-cron-cash-close.service
journalctl -u arenatech-cron-cash-close.service -n 20
```

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
