# systemd — crons no VPS

**TODOS os crons rodam por systemd timer no VPS** — não mais por schedule do GitHub
Actions. Dois motivos: (1) o **GitHub Actions atrasa/pula schedules** (inaceitável pra
jobs sensíveis a tempo e a **dinheiro**); (2) rodar `*/5`/`*/10` no runner self-hosted
**único** disputava a vez com build/deploy. Agora o self-hosted é **100% dedicado a
deploy**. Cada timer bate no endpoint do app (`127.0.0.1:3001`, `Bearer $CRON_SECRET`):

| Unit | Cadência | O quê |
|---|---|---|
| `talison-waiting-sweep` | 1 min | SLA de alerta do bot (10min) |
| `arenatech-process-deposit-repayments` | 5 min | reprocessa repasse PENDING da carteira de taxas (ADR 0052) |
| `arenatech-reconcile-depix` | 10 min | reconcilia DePix preso (static-QR ficou em PROCESSING quando o schedule do GH não rodou) |
| `arenatech-process-pending-talison` | 10 min | rede de captura de conversas Talison pendentes |
| `arenatech-release-stale-reservations` | 10 min | libera reservas de StockItem presas (carrinho PDV abandonado) |
| `arenatech-resolve-stale-conversations` | 1 h | resolve conversas Talison paradas 12h+ |
| `arenatech-reconcile-eulen-extract` | 1 h | rede de segurança por extrato da Eulen (crédito/estorno perdido) |
| `arenatech-mark-overdue` | diário 03:00 BRT | marca OS vencidas |
| `arenatech-close-abandoned-cash-sessions` | diário 03:00 BRT | fecha caixas abandonados |
| `arenatech-expire-rewards` | diário 03:00 BRT | expira recompensas |
| `arenatech-expire-subscriptions` | diário 04:00 BRT | vencimento de assinatura: ACTIVE→PAST_DUE, e SUSPENDED após a carência (`SUBSCRIPTION_GRACE_DAYS`, padrão 5) |

> Os jobs **continuam no `.github/workflows/cron.yml`**, mas só como **break-glass
> manual** (`workflow_dispatch`, em github-hosted) — nenhum roda mais no schedule.

## Instalação (no servidor, como root)

```sh
cp deploy/systemd/*.service /etc/systemd/system/
cp deploy/systemd/*.timer   /etc/systemd/system/
systemctl daemon-reload
# habilita + inicia todos os timers de uma vez
for t in /etc/systemd/system/arenatech-*.timer /etc/systemd/system/talison-*.timer; do
  systemctl enable --now "$(basename "$t")"
done
```

## Verificar

```sh
systemctl list-timers 'arenatech-*' talison-waiting-sweep.timer
journalctl -u arenatech-reconcile-depix.service --no-pager -n 30
# disparo manual pontual (idempotente):
systemctl start arenatech-reconcile-depix.service
```

## Observações
- Os `.service` leem `CRON_SECRET` de `/home/deployer/arenatech-app/.env.production`
  (mesmo segredo dos demais crons).
- O endpoint precisa existir na imagem deployada (mergear o PR antes de instalar).
- Para pausar um timer: `systemctl disable --now <unit>.timer`.
- Os timers usam `Persistent=true`: se o VPS ficou fora na hora, dispara ao voltar.
