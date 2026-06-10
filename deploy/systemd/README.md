# systemd — Talison waiting sweep

O fluxo de espera do Talison (alerta de abandono aos 10min, mensagens fixas de
espera a partir de 20min a cada 5min, e aviso de fora-de-horário) precisa de
granularidade de **1 minuto**. O GitHub Actions atrasa/pula schedules, então
esse job roda por **systemd timer no VPS**, batendo no endpoint do app.

## Instalação (no servidor, como root)

```sh
cp deploy/systemd/talison-waiting-sweep.service /etc/systemd/system/
cp deploy/systemd/talison-waiting-sweep.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now talison-waiting-sweep.timer
```

## Verificar

```sh
systemctl list-timers talison-waiting-sweep.timer
systemctl status talison-waiting-sweep.service        # último disparo
journalctl -u talison-waiting-sweep.service --no-pager -n 30
```

## Observações
- O `.service` lê `CRON_SECRET` de `/home/deployer/arenatech-app/.env.production`
  (mesmo segredo dos demais crons) e chama `http://127.0.0.1:3001/api/cron/talison-waiting-sweep`.
- O endpoint precisa existir na imagem deployada (mergear o PR antes de instalar).
- Para pausar: `systemctl disable --now talison-waiting-sweep.timer`.
