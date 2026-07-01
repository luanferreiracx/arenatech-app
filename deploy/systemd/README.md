# systemd — crons críticos no VPS

O **GitHub Actions atrasa/pula schedules** — inaceitável para jobs sensíveis a
tempo e, principalmente, para **fluxos de dinheiro**. Estes rodam por **systemd
timer no VPS**, batendo no endpoint do app (`127.0.0.1:3001`, `Bearer $CRON_SECRET`):

| Unit | Cadência | Por quê no systemd |
|---|---|---|
| `talison-waiting-sweep` | 1 min | granularidade do SLA de alerta (10min) |
| `arenatech-reconcile-depix` | 10 min | reconcilia DePix preso (depósito static-QR ficou em PROCESSING quando o schedule do GH não rodou) |
| `arenatech-reconcile-eulen-extract` | 1 h | rede de segurança por extrato da Eulen (crédito/estorno perdido) |

> Os jobs `reconcile-*` **continuam no `.github/workflows/cron.yml`**, mas só como
> **break-glass manual** (`workflow_dispatch`) — não no schedule.

## Instalação (no servidor, como root)

```sh
cp deploy/systemd/*.service /etc/systemd/system/
cp deploy/systemd/*.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now talison-waiting-sweep.timer
systemctl enable --now arenatech-reconcile-depix.timer
systemctl enable --now arenatech-reconcile-eulen-extract.timer
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
